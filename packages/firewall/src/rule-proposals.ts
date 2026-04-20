// packages/firewall/src/rule-proposals.ts — L-004 rule-proposal synthesizer
//
// Given an L-003 audit log, detect recurring deny patterns and suggest
// new firewall rules that would consolidate those denies into a single
// policy rule (instead of ad-hoc case-by-case). Output is advisory —
// operators decide what to promote.
//
// Patterns detected:
//   1. High-volume actor: actor X was denied N+ times in window → propose actor-scoped block
//   2. High-volume verb:  verb Y was denied N+ times across actors → propose verb-scoped block
//   3. Bursty subject:    subject Z seen denied M+ times in T ms → propose subject-scoped block
//
// Pure — caller decides whether to persist / apply / notify.

import type { AuditEntry } from "./audit.ts";

export interface ProposalInput {
  audit_log: AuditEntry[];
  window_ms?: number;              // only consider entries within this window from 'now'
  now?: string;
  actor_threshold?: number;        // N+ denials → propose actor block (default 20)
  verb_threshold?: number;         // N+ denials across actors → verb block (default 30)
  subject_burst_threshold?: number; // M+ denials of same subject in burst (default 10)
  burst_window_ms?: number;         // T for subject burst (default 60s)
}

export type ProposalKind = "actor-block" | "verb-block" | "subject-block";

export interface RuleProposal {
  kind: ProposalKind;
  subject: string;                 // the actor/verb/subject string
  rationale: string;
  seen_count: number;              // how many denies supported this proposal
  first_seen: string;
  last_seen: string;
  suggested_rule_id: string;       // suggested rule_id for the proposed ActiveBlock
  suggested_reason: string;
}

export interface ProposalReport {
  analyzed_at: string;
  entries_analyzed: number;
  entries_denied: number;
  proposals: RuleProposal[];
  glyph_sentence: string;
}

export function synthesizeProposals(input: ProposalInput): ProposalReport {
  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const windowMs = input.window_ms ?? Number.POSITIVE_INFINITY;
  const actorThresh = input.actor_threshold ?? 20;
  const verbThresh = input.verb_threshold ?? 30;
  const subjThresh = input.subject_burst_threshold ?? 10;
  const burstWin = input.burst_window_ms ?? 60_000;

  const recent = input.audit_log.filter(e => (nowMs - Date.parse(e.ts)) <= windowMs);
  const denies = recent.filter(e => !e.allowed);

  // 1. Actor tallies
  const byActor: Record<string, { count: number; first: string; last: string }> = {};
  for (const e of denies) {
    if (!e.actor) continue;
    const a = byActor[e.actor] ?? { count: 0, first: e.ts, last: e.ts };
    a.count++;
    if (e.ts < a.first) a.first = e.ts;
    if (e.ts > a.last) a.last = e.ts;
    byActor[e.actor] = a;
  }
  const proposals: RuleProposal[] = [];
  for (const [actor, s] of Object.entries(byActor)) {
    if (s.count >= actorThresh) {
      proposals.push({
        kind: "actor-block",
        subject: actor,
        rationale: `actor ${actor} accumulated ${s.count} denials (≥ ${actorThresh})`,
        seen_count: s.count,
        first_seen: s.first,
        last_seen: s.last,
        suggested_rule_id: `R-ACTOR-${actor.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}-AUTO`,
        suggested_reason: `auto-synthesized: actor ${actor} had ${s.count} denials`,
      });
    }
  }

  // 2. Verb tallies
  const byVerb: Record<string, { count: number; actors: Set<string>; first: string; last: string }> = {};
  for (const e of denies) {
    if (!e.verb) continue;
    const v = byVerb[e.verb] ?? { count: 0, actors: new Set<string>(), first: e.ts, last: e.ts };
    v.count++;
    if (e.actor) v.actors.add(e.actor);
    if (e.ts < v.first) v.first = e.ts;
    if (e.ts > v.last) v.last = e.ts;
    byVerb[e.verb] = v;
  }
  for (const [verb, s] of Object.entries(byVerb)) {
    if (s.count >= verbThresh && s.actors.size >= 2) {  // cross-actor
      proposals.push({
        kind: "verb-block",
        subject: verb,
        rationale: `verb ${verb} denied ${s.count} times across ${s.actors.size} actors (≥ ${verbThresh})`,
        seen_count: s.count,
        first_seen: s.first,
        last_seen: s.last,
        suggested_rule_id: `R-VERB-${verb.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}-AUTO`,
        suggested_reason: `auto-synthesized: verb ${verb} had ${s.count} denials across ${s.actors.size} actors`,
      });
    }
  }

  // 3. Subject bursts
  const bySubject: Record<string, Array<string>> = {};
  for (const e of denies) {
    const subj = e.subject_snapshot;
    if (!subj) continue;
    (bySubject[subj] ??= []).push(e.ts);
  }
  for (const [subj, tsList] of Object.entries(bySubject)) {
    const sorted = tsList.slice().sort();
    // sliding window: find max cluster within burstWin
    let maxCluster = 0;
    let clusterFirst = sorted[0];
    let clusterLast = sorted[0];
    for (let i = 0; i < sorted.length; i++) {
      let j = i;
      while (j < sorted.length && Date.parse(sorted[j]) - Date.parse(sorted[i]) <= burstWin) j++;
      const size = j - i;
      if (size > maxCluster) { maxCluster = size; clusterFirst = sorted[i]; clusterLast = sorted[j - 1]; }
    }
    if (maxCluster >= subjThresh) {
      proposals.push({
        kind: "subject-block",
        subject: subj,
        rationale: `subject ${subj} had burst of ${maxCluster} denials within ${burstWin}ms`,
        seen_count: maxCluster,
        first_seen: clusterFirst,
        last_seen: clusterLast,
        suggested_rule_id: `R-SUBJ-${subj.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase().slice(0, 40)}-AUTO`,
        suggested_reason: `auto-synthesized: subject ${subj} had ${maxCluster} denials in ${burstWin}ms burst`,
      });
    }
  }

  return {
    analyzed_at: now,
    entries_analyzed: recent.length,
    entries_denied: denies.length,
    proposals,
    glyph_sentence: `EVT-FIREWALL-RULE-PROPOSAL · analyzed=${recent.length} · denies=${denies.length} · proposals=${proposals.length} @ M-INDICATIVE .`,
  };
}

export function renderProposals(r: ProposalReport): string {
  const lines: string[] = [];
  lines.push(`FIREWALL RULE PROPOSALS · ${r.analyzed_at}`);
  lines.push(`analyzed=${r.entries_analyzed} · denies=${r.entries_denied} · proposals=${r.proposals.length}`);
  lines.push("");
  for (const p of r.proposals) {
    lines.push(`  [${p.kind}] ${p.subject}`);
    lines.push(`    → rule_id: ${p.suggested_rule_id}`);
    lines.push(`    → reason: ${p.suggested_reason}`);
    lines.push(`    → evidence: ${p.seen_count} denials from ${p.first_seen} to ${p.last_seen}`);
    lines.push("");
  }
  lines.push(r.glyph_sentence);
  return lines.join("\n");
}
