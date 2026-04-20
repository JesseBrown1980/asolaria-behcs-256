// packages/orchestrator-guardrails-acer/src/death-spiral.ts — M-acer
//
// Mirrors liris M.7 orchestrator-death-spiral-prevention pattern on acer:
//   delegation-quota + context-watchdog + variant-gate
//
// Applied to acer-side track claims to prevent runaway variant
// multiplication (Compat*+*V2+*V3+*Alt+*Recovery+*.livecopy+*-slice+*-retry)
// unless parent FAILED or DEFERRED.

export type VariantSuffix = "Compat" | "V2" | "V3" | "V4" | "Alt" | "Recovery" | "livecopy" | "slice" | "retry" | "backup";

export const DEATH_SPIRAL_PATTERNS: RegExp[] = [
  /Compat[^a-z]/i,
  /V[2-9]\b/,
  /Alt$/i,
  /Recovery$/i,
  /\.livecopy$/,
  /-slice$/,
  /-retry$/,
  /-backup$/,
  /\.bak$/,
];

export type ParentStatus = "OPEN" | "CLAIMED" | "COMPLETE" | "FAILED" | "DEFERRED";

export interface DelegationQuotaEntry {
  actor: string;
  period_start: string;
  tasks_claimed: number;
}

export interface QuotaConfig {
  max_concurrent_claims_per_actor: number;
  quota_period_ms: number;
}

export const DEFAULT_QUOTA: QuotaConfig = {
  max_concurrent_claims_per_actor: 5,
  quota_period_ms: 3600 * 1000,  // 1 hour
};

// ──────────────────────────────────────────────────────────────────────
// Variant gate
// ──────────────────────────────────────────────────────────────────────

export interface VariantGateInput {
  claim_name: string;       // e.g. "L-001-R01-Compat" or "G-087V3"
  parent_name?: string;     // e.g. "L-001" or "G-087"
  parent_status?: ParentStatus;
}

export interface VariantGateDecision {
  allow: boolean;
  matched_pattern: string | null;
  reason: string;
  glyph_sentence: string;
}

export function variantGate(input: VariantGateInput): VariantGateDecision {
  const matched = DEATH_SPIRAL_PATTERNS.find(p => p.test(input.claim_name));
  if (!matched) {
    return {
      allow: true, matched_pattern: null,
      reason: "no death-spiral pattern detected",
      glyph_sentence: `EVT-VARIANT-GATE-ALLOW · claim=${input.claim_name} @ M-INDICATIVE .`,
    };
  }
  const parent = input.parent_status;
  if (parent === "FAILED" || parent === "DEFERRED") {
    return {
      allow: true, matched_pattern: matched.source,
      reason: `variant allowed — parent ${input.parent_name} is ${parent}`,
      glyph_sentence: `EVT-VARIANT-GATE-ALLOW-POST-${parent} · claim=${input.claim_name} · parent=${input.parent_name} @ M-EYEWITNESS .`,
    };
  }
  return {
    allow: false, matched_pattern: matched.source,
    reason: `death-spiral variant blocked: parent ${input.parent_name ?? "(unknown)"} status=${parent ?? "(not provided)"}; claim must wait for FAILED or DEFERRED`,
    glyph_sentence: `EVT-VARIANT-GATE-BLOCK · claim=${input.claim_name} · pattern=${matched.source} · parent-status=${parent ?? "unknown"} @ M-EYEWITNESS .`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Delegation quota
// ──────────────────────────────────────────────────────────────────────

export interface QuotaCheckInput {
  actor: string;
  now?: string;
  active_claims: Array<{ actor: string; claimed_at: string; status: ParentStatus }>;
  config?: QuotaConfig;
}

export interface QuotaDecision {
  allow: boolean;
  actor: string;
  active_count: number;
  max_allowed: number;
  reason: string;
  glyph_sentence: string;
}

export function checkQuota(input: QuotaCheckInput): QuotaDecision {
  const cfg = input.config ?? DEFAULT_QUOTA;
  const nowTs = input.now ? new Date(input.now).getTime() : Date.now();
  const periodStart = nowTs - cfg.quota_period_ms;
  const activeForActor = input.active_claims.filter(c =>
    c.actor === input.actor &&
    (c.status === "OPEN" || c.status === "CLAIMED") &&
    new Date(c.claimed_at).getTime() >= periodStart
  );
  const count = activeForActor.length;
  const allow = count < cfg.max_concurrent_claims_per_actor;
  const reason = allow
    ? `actor ${input.actor} has ${count}/${cfg.max_concurrent_claims_per_actor} active — within quota`
    : `actor ${input.actor} at ${count}/${cfg.max_concurrent_claims_per_actor} — quota exceeded, must complete/fail before new claim`;
  return {
    allow,
    actor: input.actor,
    active_count: count,
    max_allowed: cfg.max_concurrent_claims_per_actor,
    reason,
    glyph_sentence: `EVT-QUOTA-${allow ? "ALLOW" : "BLOCK"} · actor=${input.actor} · active=${count}/${cfg.max_concurrent_claims_per_actor} @ M-EYEWITNESS .`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Context watchdog — detects claim churn that signals drift
// ──────────────────────────────────────────────────────────────────────

export interface WatchdogInput {
  actor: string;
  claim_history: Array<{ claim_name: string; claimed_at: string; status: ParentStatus }>;
  window_ms?: number;
  max_same_parent_churn?: number;
}

export interface WatchdogDecision {
  healthy: boolean;
  actor: string;
  recent_claims: number;
  same_parent_churn: Record<string, number>;
  alerts: string[];
  glyph_sentence: string;
}

function extractParent(claim_name: string): string {
  // "L-001-R01-Compat" → "L-001"; "G-087V3" → "G-087"
  const m = claim_name.match(/^([A-Z]+-\d+)/);
  return m ? m[1] : claim_name;
}

export function watchdog(input: WatchdogInput): WatchdogDecision {
  const windowMs = input.window_ms ?? 3600 * 1000;
  const maxChurn = input.max_same_parent_churn ?? 3;
  const cutoff = Date.now() - windowMs;
  const recent = input.claim_history.filter(c => new Date(c.claimed_at).getTime() >= cutoff);
  const byParent: Record<string, number> = {};
  for (const c of recent) {
    const p = extractParent(c.claim_name);
    byParent[p] = (byParent[p] || 0) + 1;
  }
  const alerts: string[] = [];
  for (const [parent, n] of Object.entries(byParent)) {
    if (n > maxChurn) alerts.push(`parent ${parent} claimed ${n} times in window — possible death spiral`);
  }
  const healthy = alerts.length === 0;
  return {
    healthy,
    actor: input.actor,
    recent_claims: recent.length,
    same_parent_churn: byParent,
    alerts,
    glyph_sentence: `EVT-WATCHDOG-${healthy ? "HEALTHY" : "ALERT"} · actor=${input.actor} · recent=${recent.length} · alerts=${alerts.length} @ M-EYEWITNESS .`,
  };
}
