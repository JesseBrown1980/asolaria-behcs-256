// packages/orchestrator-guardrails-acer/src/audit.ts — M-acer-audit
//
// Records every gate decision (variantGate/checkQuota/watchdog) emitted
// by the M-acer death-spiral guardrail so operators can reconstruct
// WHY a claim was blocked and measure gate pressure over time.
//
// Pure NDJSON append + snapshot counter fold. Zero external deps.

import type { VariantGateDecision } from "./death-spiral.ts";

export interface GuardrailGateEvent {
  ts: string;
  gate: "variant" | "quota" | "watchdog";
  claim_name: string;
  parent_name?: string;
  parent_status?: string;
  allowed: boolean;
  reason: string;
  matched_pattern?: string | null;
  quota_used?: number;
  quota_limit?: number;
  context_tokens?: number;
  context_budget?: number;
  glyph_sentence: string;
}

export interface GuardrailCounters {
  total: number;
  allowed: number;
  blocked: number;
  by_gate: Record<string, { total: number; blocked: number }>;
  by_pattern: Record<string, number>;
  by_claim: Record<string, number>;
}

export function emptyGuardrailCounters(): GuardrailCounters {
  return { total: 0, allowed: 0, blocked: 0, by_gate: {}, by_pattern: {}, by_claim: {} };
}

export function foldGuardrail(base: GuardrailCounters, e: GuardrailGateEvent): GuardrailCounters {
  const next: GuardrailCounters = {
    total: base.total + 1,
    allowed: base.allowed + (e.allowed ? 1 : 0),
    blocked: base.blocked + (e.allowed ? 0 : 1),
    by_gate: { ...base.by_gate },
    by_pattern: { ...base.by_pattern },
    by_claim: { ...base.by_claim },
  };
  const g = next.by_gate[e.gate] ?? { total: 0, blocked: 0 };
  next.by_gate[e.gate] = { total: g.total + 1, blocked: g.blocked + (e.allowed ? 0 : 1) };
  if (e.matched_pattern) next.by_pattern[e.matched_pattern] = (next.by_pattern[e.matched_pattern] ?? 0) + 1;
  next.by_claim[e.claim_name] = (next.by_claim[e.claim_name] ?? 0) + 1;
  return next;
}

export function recordVariantGate(input: { claim_name: string; parent_name?: string; parent_status?: string; at?: string }, decision: VariantGateDecision): GuardrailGateEvent {
  return {
    ts: input.at ?? new Date().toISOString(),
    gate: "variant",
    claim_name: input.claim_name,
    parent_name: input.parent_name,
    parent_status: input.parent_status,
    allowed: decision.allow,
    reason: decision.reason,
    matched_pattern: decision.matched_pattern,
    glyph_sentence: decision.glyph_sentence,
  };
}

export function recordQuota(input: { actor: string; claim_name: string; used: number; limit: number; allowed: boolean; reason: string; at?: string; glyph: string }): GuardrailGateEvent {
  return {
    ts: input.at ?? new Date().toISOString(),
    gate: "quota",
    claim_name: input.claim_name,
    allowed: input.allowed,
    reason: input.reason,
    quota_used: input.used,
    quota_limit: input.limit,
    glyph_sentence: input.glyph,
  };
}

export function recordWatchdog(input: { claim_name: string; tokens: number; budget: number; allowed: boolean; reason: string; at?: string; glyph: string }): GuardrailGateEvent {
  return {
    ts: input.at ?? new Date().toISOString(),
    gate: "watchdog",
    claim_name: input.claim_name,
    allowed: input.allowed,
    reason: input.reason,
    context_tokens: input.tokens,
    context_budget: input.budget,
    glyph_sentence: input.glyph,
  };
}

export function summaryGlyph(c: GuardrailCounters): string {
  return `EVT-GUARDRAIL-AUDIT-SUMMARY · total=${c.total} · allowed=${c.allowed} · blocked=${c.blocked} · gates=${Object.keys(c.by_gate).length} @ M-INDICATIVE .`;
}

// Why-explanation helper — takes a claim_name and finds the most recent
// block entry that matches. Operators use this to explain to a frustrated
// parallel-agent why its claim was refused.
export interface WhyBlocked {
  found: boolean;
  last_block?: GuardrailGateEvent;
  human_explanation: string;
}

export function explainWhyBlocked(events: GuardrailGateEvent[], claim_name: string): WhyBlocked {
  const recent = events.filter(e => e.claim_name === claim_name && !e.allowed).sort((a, b) => b.ts.localeCompare(a.ts));
  if (recent.length === 0) {
    return { found: false, human_explanation: `no block event recorded for claim=${claim_name}` };
  }
  const last = recent[0];
  let explanation: string;
  switch (last.gate) {
    case "variant":
      explanation = `claim ${claim_name} matched death-spiral pattern ${last.matched_pattern ?? "?"} and parent ${last.parent_name ?? "?"} is ${last.parent_status ?? "?"}. To unblock: mark parent FAILED or DEFERRED, or rename to avoid the pattern.`;
      break;
    case "quota":
      explanation = `claim ${claim_name} exceeded concurrent-claim quota (${last.quota_used}/${last.quota_limit}). To unblock: finish an earlier claim or wait for the quota period to reset.`;
      break;
    case "watchdog":
      explanation = `claim ${claim_name} blocked by context watchdog (${last.context_tokens}/${last.context_budget} tokens). To unblock: reduce payload size or flush context.`;
      break;
    default:
      explanation = `claim ${claim_name} blocked: ${last.reason}`;
  }
  return { found: true, last_block: last, human_explanation: explanation };
}
