// packages/migration/src/operator-ui.ts — D-061 operator approval flow
//
// Closes D-057's third next-hook: signed operator-witness approval for
// migration sessions. D-059 state-machine's Phase A (Announce) expects
// operator ack before advancing; this module provides the primitive for
// building + verifying those acks.
//
// Applies:
//   2W quintuple authorization (expires 2026-05-02): jesse, rayssa, amy, felipe, dan
//   D-055 ed25519 signPayload / verifyEnvelope for signed acks
//   D-056 binding-class invariants — operator-witness keys must be device-bound
//
// NOT a graphical UI — this is the programmatic contract.
// A text/terminal/web UI can compose over this.

import { signPayload, verifyEnvelope, type Ed25519Registry, type SignedEnvelope } from "../../kernel/src/ed25519-registry.ts";

// ──────────────────────────────────────────────────────────────────────
// 2W quintuple-authorized operator set
// ──────────────────────────────────────────────────────────────────────

export const OPERATORS_2W = ["jesse", "rayssa", "amy", "felipe", "dan"] as const;
export type Operator2W = (typeof OPERATORS_2W)[number];

// Expiration of the 2W extended window. After this, baseline authority
// (jesse+rayssa only) reasserts unless another extension is recorded.
export const OP_2W_WINDOW_EXPIRES = "2026-05-02T23:59:59Z";

// ──────────────────────────────────────────────────────────────────────
// Plan shape
// ──────────────────────────────────────────────────────────────────────

export interface MigrationPlanSummary {
  session_id: string;
  subject: string;   // AGT-*
  source: string;    // DEV-*
  target: string;    // DEV-*
  colony: string;    // COL-*
  rationale: string;
  planned_at: string;
  risks: string[];
  rollback_available: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Ack envelope (what an operator signs)
// ──────────────────────────────────────────────────────────────────────

export interface OperatorAckPayload {
  verb: "migration-intent-ack";
  operator: Operator2W;
  plan: MigrationPlanSummary;
  ack_ts: string;          // when the operator ack'd
  window_expires_at: string;
}

// ──────────────────────────────────────────────────────────────────────
// Presentation + request
// ──────────────────────────────────────────────────────────────────────

/** Serialize a plan for display (signable canonical form). */
export function presentMigrationPlan(plan: MigrationPlanSummary): string {
  return [
    `=== MIGRATION INTENT ===`,
    `session_id : ${plan.session_id}`,
    `subject    : ${plan.subject}`,
    `source     : ${plan.source}`,
    `target     : ${plan.target}`,
    `colony     : ${plan.colony}`,
    `rationale  : ${plan.rationale}`,
    `planned_at : ${plan.planned_at}`,
    `risks      : ${plan.risks.length === 0 ? "(none declared)" : plan.risks.join("; ")}`,
    `rollback   : ${plan.rollback_available ? "available" : "NOT AVAILABLE — IRREVERSIBLE"}`,
    `window     : 2W quintuple authorization · expires ${OP_2W_WINDOW_EXPIRES}`,
    `operators  : ${OPERATORS_2W.join(", ")}`,
    `ACK REQUIRED from one authorized operator to proceed.`,
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────
// Build + sign an ack (operator side)
// ──────────────────────────────────────────────────────────────────────

export interface SignOperatorAckInput {
  operator: Operator2W;
  plan: MigrationPlanSummary;
  signing_key_id: string;
  signing_private_key_b64: string;
  now?: string; // test override
}

export function signOperatorAck(input: SignOperatorAckInput): SignedEnvelope<OperatorAckPayload> {
  if (!OPERATORS_2W.includes(input.operator)) {
    throw new Error(`signOperatorAck: operator '${input.operator}' not in 2W authorized set {${OPERATORS_2W.join(",")}}`);
  }
  const ack_ts = input.now ?? new Date().toISOString();
  if (ack_ts > OP_2W_WINDOW_EXPIRES) {
    throw new Error(`signOperatorAck: 2W window already expired (${OP_2W_WINDOW_EXPIRES}); cannot sign`);
  }
  const payload: OperatorAckPayload = {
    verb: "migration-intent-ack",
    operator: input.operator,
    plan: input.plan,
    ack_ts,
    window_expires_at: OP_2W_WINDOW_EXPIRES,
  };
  return signPayload(payload, input.signing_private_key_b64, input.signing_key_id);
}

// ──────────────────────────────────────────────────────────────────────
// Verify an ack (state-machine-Phase-A side)
// ──────────────────────────────────────────────────────────────────────

export interface VerifyOperatorAckResult {
  ok: boolean;
  operator: string;
  signer_key_id: string;
  signer_host_device: string | null;
  window_valid: boolean;
  plan_session_matches: boolean;
  reason?: string;
}

export function verifyOperatorAck(
  envelope: SignedEnvelope<OperatorAckPayload>,
  expected_session_id: string,
  registry: Ed25519Registry,
  now?: string,
): VerifyOperatorAckResult {
  // Signature check first
  const sig = verifyEnvelope(envelope, registry);
  const op = envelope.payload.operator ?? "(unknown)";
  const kid = envelope.signature.key_id;
  const host = sig.host_device;
  if (!sig.ok) {
    return { ok: false, operator: op, signer_key_id: kid, signer_host_device: host, window_valid: false, plan_session_matches: false, reason: `signature: ${sig.reason || "invalid"}` };
  }
  // Operator membership
  if (!OPERATORS_2W.includes(op as Operator2W)) {
    return { ok: false, operator: op, signer_key_id: kid, signer_host_device: host, window_valid: false, plan_session_matches: false, reason: `operator '${op}' not in 2W authorized set` };
  }
  // Window
  const nowTs = now ?? new Date().toISOString();
  const windowValid = nowTs <= OP_2W_WINDOW_EXPIRES;
  if (!windowValid) {
    return { ok: false, operator: op, signer_key_id: kid, signer_host_device: host, window_valid: false, plan_session_matches: false, reason: `2W window expired (${OP_2W_WINDOW_EXPIRES})` };
  }
  // Plan-session match
  const sessionMatches = envelope.payload.plan?.session_id === expected_session_id;
  if (!sessionMatches) {
    return { ok: false, operator: op, signer_key_id: kid, signer_host_device: host, window_valid: true, plan_session_matches: false, reason: `ack is for session ${envelope.payload.plan?.session_id}, expected ${expected_session_id}` };
  }
  return { ok: true, operator: op, signer_key_id: kid, signer_host_device: host, window_valid: true, plan_session_matches: true };
}

// ──────────────────────────────────────────────────────────────────────
// Count how many distinct authorized operators have ack'd
// ──────────────────────────────────────────────────────────────────────

export interface QuorumResult {
  distinct_valid_operators: Operator2W[];
  total_acks: number;
  invalid_count: number;
  first_valid_at: string | null;
  reasons_invalid: string[];
}

export function countOperatorQuorum(
  envelopes: SignedEnvelope<OperatorAckPayload>[],
  expected_session_id: string,
  registry: Ed25519Registry,
  now?: string,
): QuorumResult {
  const seen = new Set<Operator2W>();
  const reasons: string[] = [];
  let firstValid: string | null = null;
  let invalid = 0;
  for (const env of envelopes) {
    const r = verifyOperatorAck(env, expected_session_id, registry, now);
    if (r.ok) {
      seen.add(r.operator as Operator2W);
      if (!firstValid || env.payload.ack_ts < firstValid) firstValid = env.payload.ack_ts;
    } else {
      invalid++;
      reasons.push(r.reason ?? "unknown");
    }
  }
  return {
    distinct_valid_operators: [...seen],
    total_acks: envelopes.length,
    invalid_count: invalid,
    first_valid_at: firstValid,
    reasons_invalid: reasons,
  };
}
