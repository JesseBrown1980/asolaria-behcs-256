// packages/firewall/src/rules.ts — L-001 firewall rule engine
//
// Consumes:
//   - K-001 cosign-audit AuditReport (RED verdict triggers rule)
//   - F-078 drift-history quorum result (cross-peer attested drift triggers rule)
//
// Emits FIREWALL-BLOCK glyphs + structured decisions for downstream
// enforcement (which actor, which surface, for how long).

export type BlockScope = "envelope" | "actor" | "target-host" | "subject";

export interface FirewallRule {
  id: string;
  when: {
    source_kind?: "cosign-audit" | "drift-quorum" | "manual";
    min_red_reasons?: number;             // cosign-audit: N or more red reasons
    min_distinct_signers?: number;        // drift-quorum: N or more signers on same sha
    verdict?: "RED" | "YELLOW" | "GREEN"; // cosign-audit verdict match
  };
  block: {
    scope: BlockScope;
    duration_s: number;                    // 0 = until manual clear
    reason_prefix: string;                 // human-readable tag prepended to glyph
  };
}

export interface RuleInput {
  source_kind: "cosign-audit" | "drift-quorum" | "manual";
  cosign_audit?: {
    verdict: "RED" | "YELLOW" | "GREEN";
    red_reasons: string[];
    yellow_reasons: string[];
    chain_source: string;
  };
  drift_quorum?: {
    instance_sha256: string;
    distinct_signers: string[];
    distinct_key_ids: string[];
    verified_count: number;
    first_observed_at: string | null;
  };
  manual?: { reason: string; subject: string };
}

export interface FirewallDecision {
  rule_id: string;
  block: boolean;
  scope: BlockScope | null;
  subject: string;
  duration_s: number;
  reason: string;
  glyph_sentence: string;
}

export const DEFAULT_RULES: FirewallRule[] = [
  {
    id: "L-001-R01-any-cosign-RED",
    when: { source_kind: "cosign-audit", verdict: "RED", min_red_reasons: 1 },
    block: { scope: "envelope", duration_s: 3600, reason_prefix: "cosign-audit-RED" },
  },
  {
    id: "L-001-R02-cosign-multiple-red",
    when: { source_kind: "cosign-audit", verdict: "RED", min_red_reasons: 3 },
    block: { scope: "actor", duration_s: 86400, reason_prefix: "cosign-audit-3-plus-red" },
  },
  {
    id: "L-001-R03-drift-2-peer-quorum",
    when: { source_kind: "drift-quorum", min_distinct_signers: 2 },
    block: { scope: "subject", duration_s: 3600, reason_prefix: "drift-2-peer-attested" },
  },
  {
    id: "L-001-R04-drift-3-peer-quorum-hard",
    when: { source_kind: "drift-quorum", min_distinct_signers: 3 },
    block: { scope: "subject", duration_s: 0, reason_prefix: "drift-3-peer-attested-permanent" },
  },
];

// ──────────────────────────────────────────────────────────────────────
// Evaluator
// ──────────────────────────────────────────────────────────────────────

function matchCosignRule(rule: FirewallRule, audit: RuleInput["cosign_audit"]): boolean {
  if (!audit) return false;
  if (rule.when.source_kind && rule.when.source_kind !== "cosign-audit") return false;
  if (rule.when.verdict && audit.verdict !== rule.when.verdict) return false;
  if (typeof rule.when.min_red_reasons === "number" && audit.red_reasons.length < rule.when.min_red_reasons) return false;
  return true;
}

function matchDriftRule(rule: FirewallRule, dq: RuleInput["drift_quorum"]): boolean {
  if (!dq) return false;
  if (rule.when.source_kind && rule.when.source_kind !== "drift-quorum") return false;
  if (typeof rule.when.min_distinct_signers === "number" && dq.distinct_signers.length < rule.when.min_distinct_signers) return false;
  return true;
}

export function evaluate(input: RuleInput, rules: FirewallRule[] = DEFAULT_RULES): FirewallDecision[] {
  const decisions: FirewallDecision[] = [];
  for (const rule of rules) {
    let matches = false;
    let subject = "";
    let reason = "";

    if (input.source_kind === "cosign-audit" && matchCosignRule(rule, input.cosign_audit)) {
      matches = true;
      subject = input.cosign_audit!.chain_source;
      reason = `${rule.block.reason_prefix}: ${input.cosign_audit!.red_reasons.slice(0, 3).join("; ")}`;
    } else if (input.source_kind === "drift-quorum" && matchDriftRule(rule, input.drift_quorum)) {
      matches = true;
      subject = input.drift_quorum!.instance_sha256;
      reason = `${rule.block.reason_prefix}: ${input.drift_quorum!.distinct_signers.join(",")} (${input.drift_quorum!.distinct_signers.length} signers)`;
    } else if (input.source_kind === "manual" && rule.when.source_kind === "manual" && input.manual) {
      matches = true;
      subject = input.manual.subject;
      reason = `${rule.block.reason_prefix}: ${input.manual.reason}`;
    }

    if (matches) {
      decisions.push({
        rule_id: rule.id,
        block: true,
        scope: rule.block.scope,
        subject,
        duration_s: rule.block.duration_s,
        reason,
        glyph_sentence: `EVT-FIREWALL-BLOCK · rule=${rule.id} · scope=${rule.block.scope} · subject=${subject.slice(0, 40)} · duration_s=${rule.block.duration_s} · @ M-EYEWITNESS .`,
      });
    }
  }
  return decisions;
}

// ──────────────────────────────────────────────────────────────────────
// Active-block registry (in-memory; callers persist if needed)
// ──────────────────────────────────────────────────────────────────────

export interface ActiveBlock {
  rule_id: string;
  scope: BlockScope;
  subject: string;
  blocked_at: string;
  expires_at: string | null;  // null = permanent
  reason: string;
}

export function applyDecisions(decisions: FirewallDecision[], now: string = new Date().toISOString()): ActiveBlock[] {
  return decisions.filter(d => d.block).map(d => ({
    rule_id: d.rule_id,
    scope: d.scope!,
    subject: d.subject,
    blocked_at: now,
    expires_at: d.duration_s === 0 ? null : new Date(new Date(now).getTime() + d.duration_s * 1000).toISOString(),
    reason: d.reason,
  }));
}

export function isBlocked(
  blocks: ActiveBlock[],
  query: { subject?: string; actor?: string; now?: string },
): ActiveBlock | null {
  const nowTs = query.now ?? new Date().toISOString();
  for (const b of blocks) {
    if (b.expires_at && nowTs > b.expires_at) continue;
    if (query.subject && b.subject === query.subject) return b;
    if (query.actor && b.scope === "actor" && b.subject === query.actor) return b;
  }
  return null;
}
