// packages/firewall/src/audit.ts — L-003 firewall audit trail + replay
//
// Every inspect() decision made at ingress deserves a durable trail so
// operators can: (a) explain why a peer was denied, (b) replay a
// stream of past decisions against a new rule set to check whether
// a rule change would invalidate previously-blocked traffic,
// (c) export counters to the metrics surface.
//
// Pure functions — serialization-only. Caller wires to NDJSON + emit
// to metrics channel.

import type { IngressInspection, InspectInput } from "./enforcement.ts";
import { inspect } from "./enforcement.ts";
import type { ActiveBlock } from "./rules.ts";

export interface AuditEntry {
  ts: string;
  actor: string | null;
  verb: string | null;
  target: string | null;
  allowed: boolean;
  blocking_rule_id: string | null;
  blocking_reason: string | null;
  scope_hit: IngressInspection["scope_hit"];
  subject_snapshot: string | null;
  glyph_sentence: string;
}

export function buildAuditEntry(input: InspectInput, verdict: IngressInspection): AuditEntry {
  const env = input.envelope;
  return {
    ts: input.now ?? new Date().toISOString(),
    actor: env.actor ?? null,
    verb: env.verb ?? null,
    target: env.target ?? null,
    allowed: verdict.allowed,
    blocking_rule_id: verdict.blocking_rule_id,
    blocking_reason: verdict.blocking_reason,
    scope_hit: verdict.scope_hit,
    subject_snapshot: env.body?.scan_id ?? env.body?.subject_hilbert_pid ?? env.body?.subject_permanent_name ?? null,
    glyph_sentence: verdict.glyph_sentence,
  };
}

export interface AuditCounters {
  total: number;
  allowed: number;
  denied: number;
  by_rule: Record<string, number>;
  by_scope: Record<string, number>;
  by_actor: Record<string, number>;
}

export function emptyCounters(): AuditCounters {
  return { total: 0, allowed: 0, denied: 0, by_rule: {}, by_scope: {}, by_actor: {} };
}

export function foldCounters(base: AuditCounters, entry: AuditEntry): AuditCounters {
  const next = {
    total: base.total + 1,
    allowed: base.allowed + (entry.allowed ? 1 : 0),
    denied: base.denied + (entry.allowed ? 0 : 1),
    by_rule: { ...base.by_rule },
    by_scope: { ...base.by_scope },
    by_actor: { ...base.by_actor },
  };
  if (entry.blocking_rule_id) next.by_rule[entry.blocking_rule_id] = (next.by_rule[entry.blocking_rule_id] ?? 0) + 1;
  if (entry.scope_hit) next.by_scope[entry.scope_hit] = (next.by_scope[entry.scope_hit] ?? 0) + 1;
  if (entry.actor) next.by_actor[entry.actor] = (next.by_actor[entry.actor] ?? 0) + 1;
  return next;
}

export function summarizeCounters(c: AuditCounters): AuditCounters { return c; }

// ────────────────────────────────────────────────────────────────────
// Replay: run a historical audit log through a new ruleset and return
// the diff — which entries would flip verdict under the new rules.
// ────────────────────────────────────────────────────────────────────

export interface ReplayInput {
  audit_log: AuditEntry[];
  new_rules: ActiveBlock[];
  now?: string;
}

export interface ReplayDiff {
  total_replayed: number;
  flipped_allow_to_deny: number;
  flipped_deny_to_allow: number;
  changes: Array<{
    ts: string;
    actor: string | null;
    verb: string | null;
    was_allowed: boolean;
    now_allowed: boolean;
    old_rule: string | null;
    new_rule: string | null;
  }>;
  glyph_sentence: string;
}

export function replayAudit(input: ReplayInput): ReplayDiff {
  const now = input.now ?? new Date().toISOString();
  let flipA2D = 0;
  let flipD2A = 0;
  const changes: ReplayDiff["changes"] = [];

  for (const e of input.audit_log) {
    const synth = inspect({
      envelope: { actor: e.actor ?? undefined, verb: e.verb ?? undefined, target: e.target ?? undefined, body: e.subject_snapshot ? { scan_id: e.subject_snapshot } : {} },
      active_blocks: input.new_rules,
      now,
    });
    if (synth.allowed !== e.allowed) {
      if (e.allowed && !synth.allowed) flipA2D++;
      else if (!e.allowed && synth.allowed) flipD2A++;
      changes.push({
        ts: e.ts,
        actor: e.actor,
        verb: e.verb,
        was_allowed: e.allowed,
        now_allowed: synth.allowed,
        old_rule: e.blocking_rule_id,
        new_rule: synth.blocking_rule_id,
      });
    }
  }
  return {
    total_replayed: input.audit_log.length,
    flipped_allow_to_deny: flipA2D,
    flipped_deny_to_allow: flipD2A,
    changes,
    glyph_sentence: `EVT-FIREWALL-REPLAY · replayed=${input.audit_log.length} · a2d=${flipA2D} · d2a=${flipD2A} @ M-EYEWITNESS .`,
  };
}
