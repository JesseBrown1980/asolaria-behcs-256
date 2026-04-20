// packages/drift-broadcast/src/quarantine-escalator.ts — F-083 drift
// severity → quarantine action escalator
//
// F-082 assigns a severity band. F-083 translates the band + history +
// federation consensus into a concrete quarantine action with TTL. This
// is still advisory — operators execute the action; we produce the
// plan with evidence so the witness record is complete.
//
// Pure state machine.

import type { SeverityScore, SeverityBand } from "./severity.ts";
import type { DriftDetection } from "./broadcaster.ts";

export type QuarantineAction =
  | "none"
  | "observe"
  | "refuse-new-envelopes"
  | "quarantine-subject"
  | "federation-wide-isolate";

export interface EscalationInput {
  subject: string;                    // the permanent_name or hilbert_pid
  score: SeverityScore;
  prior_actions: EscalationRecord[];  // history for this subject
  federation_peers_alerting?: number;
  now?: string;
}

export interface EscalationRecord {
  at: string;
  subject: string;
  band: SeverityBand;
  action: QuarantineAction;
  ttl_minutes: number;
  reason: string;
  federation_peers_count: number;
}

export interface EscalationDecision {
  subject: string;
  action: QuarantineAction;
  ttl_minutes: number;
  expires_at: string;
  band: SeverityBand;
  escalated_from: QuarantineAction | null;
  rationale: string[];
  record: EscalationRecord;
  glyph_sentence: string;
}

function baseActionForBand(band: SeverityBand): { action: QuarantineAction; ttl_minutes: number } {
  switch (band) {
    case "CRITICAL": return { action: "federation-wide-isolate", ttl_minutes: 1440 };  // 24h
    case "HIGH":     return { action: "quarantine-subject", ttl_minutes: 720 };        // 12h
    case "MEDIUM":   return { action: "refuse-new-envelopes", ttl_minutes: 240 };      // 4h
    case "LOW":      return { action: "observe", ttl_minutes: 60 };                    // 1h
    default:         return { action: "none", ttl_minutes: 0 };
  }
}

function priorityOf(action: QuarantineAction): number {
  return ["none", "observe", "refuse-new-envelopes", "quarantine-subject", "federation-wide-isolate"].indexOf(action);
}

export function decideEscalation(input: EscalationInput): EscalationDecision {
  const now = input.now ?? new Date().toISOString();
  const { action: baseAction, ttl_minutes: baseTTL } = baseActionForBand(input.score.band);

  const rationale: string[] = [`band=${input.score.band} → base ${baseAction}`];
  let action = baseAction;
  let ttl = baseTTL;

  // Escalate on repeated incidents
  const recent = input.prior_actions.filter(r => r.subject === input.subject &&
    (Date.parse(now) - Date.parse(r.at)) <= 24 * 3600 * 1000);
  if (recent.length >= 3 && priorityOf(action) < priorityOf("quarantine-subject")) {
    action = "quarantine-subject";
    ttl = Math.max(ttl, 720);
    rationale.push(`≥3 incidents in 24h → bump to quarantine-subject`);
  }
  if (recent.length >= 5 && priorityOf(action) < priorityOf("federation-wide-isolate")) {
    action = "federation-wide-isolate";
    ttl = Math.max(ttl, 1440);
    rationale.push(`≥5 incidents in 24h → bump to federation-wide-isolate`);
  }

  // Federation consensus
  const peers = input.federation_peers_alerting ?? 0;
  if (peers >= 3 && priorityOf(action) < priorityOf("federation-wide-isolate")) {
    action = "federation-wide-isolate";
    ttl = Math.max(ttl, 1440);
    rationale.push(`federation consensus ${peers} peers → isolate`);
  }

  // Find prior action (most recent) to note escalation source
  const priorSameSubject = [...input.prior_actions].reverse().find(r => r.subject === input.subject);
  const escalated_from = priorSameSubject?.action ?? null;
  if (priorSameSubject && priorityOf(action) > priorityOf(priorSameSubject.action)) {
    rationale.push(`escalated from ${priorSameSubject.action} (at ${priorSameSubject.at})`);
  }

  const expires_at = new Date(Date.parse(now) + ttl * 60 * 1000).toISOString();
  const record: EscalationRecord = {
    at: now, subject: input.subject, band: input.score.band,
    action, ttl_minutes: ttl, federation_peers_count: peers,
    reason: rationale.join("; "),
  };

  return {
    subject: input.subject,
    action,
    ttl_minutes: ttl,
    expires_at,
    band: input.score.band,
    escalated_from,
    rationale,
    record,
    glyph_sentence: `EVT-DRIFT-ESCALATE · subject=${input.subject} · band=${input.score.band} · action=${action} · ttl=${ttl}m @ M-EYEWITNESS .`,
  };
}

// Expire old records — returns a new filtered list
export function sweepExpiredRecords(records: EscalationRecord[], now: string = new Date().toISOString()): EscalationRecord[] {
  const nowMs = Date.parse(now);
  return records.filter(r => nowMs - Date.parse(r.at) < r.ttl_minutes * 60 * 1000);
}

export interface EscalationSummary {
  active_subjects: number;
  by_action: Record<QuarantineAction, number>;
  by_band: Record<SeverityBand, number>;
  federation_wide_count: number;
  oldest_active: string | null;
  glyph_sentence: string;
}

export function summarizeActive(records: EscalationRecord[], now: string = new Date().toISOString()): EscalationSummary {
  const active = sweepExpiredRecords(records, now);
  const byAction: Record<QuarantineAction, number> = {
    "none": 0, "observe": 0, "refuse-new-envelopes": 0,
    "quarantine-subject": 0, "federation-wide-isolate": 0,
  };
  const byBand: Record<SeverityBand, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  let oldest: string | null = null;
  for (const r of active) {
    byAction[r.action]++;
    byBand[r.band]++;
    if (!oldest || r.at < oldest) oldest = r.at;
  }
  return {
    active_subjects: new Set(active.map(r => r.subject)).size,
    by_action: byAction,
    by_band: byBand,
    federation_wide_count: byAction["federation-wide-isolate"],
    oldest_active: oldest,
    glyph_sentence: `EVT-ESCALATION-SUMMARY · active-subjects=${new Set(active.map(r => r.subject)).size} · fed-wide=${byAction["federation-wide-isolate"]} @ M-INDICATIVE .`,
  };
}
