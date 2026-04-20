// packages/device-instance/src/key-rotation.ts — E-rotation device key lifecycle
//
// Consumes K-002 RotationPlan candidates and emits rotation events that
// the operator-witnessed rotation daemon (out-of-scope here, cosign-gated)
// can execute. This layer is the PLAN → EXECUTION-INTENT bridge.
//
// Each rotation intent captures:
//   - candidate key_id being retired
//   - replacement strategy (new-key-side-by-side, then retire)
//   - evidence of policy violation (from K-002)
//   - expected cosign gates (owner_ack, witness_profile, d11_target)
//
// Pure — caller signs + broadcasts to federation.

import type { KeyRotationCandidate, RotationPlan } from "../../kernel/src/key-rotation-scheduler.ts";

export type RotationStrategy = "side-by-side" | "in-place" | "escrow-rotate";

export interface RotationIntent {
  intent_id: string;
  candidate_key_id: string;
  owner_glyph: string;
  host_device: string;
  strategy: RotationStrategy;
  planned_at: string;
  target_rotation_by: string;     // deadline ISO
  d11_target: string;             // target proof level after rotation (e.g. WITNESSED_TWICE)
  requires_owner_ack: boolean;
  witness_profiles_accepted: Array<"owner" | "autonomous" | "friend">;
  evidence: {
    verdict: string;
    reason: string;
    age_days: number;
  };
  glyph_sentence: string;
}

export interface RotationIntentBuildInput {
  candidate: KeyRotationCandidate;
  strategy?: RotationStrategy;           // default side-by-side (safest)
  grace_days?: number;                   // how many days from planned_at until target_rotation_by (default 7)
  d11_target?: string;                    // default "WITNESSED_TWICE"
  planned_at?: string;
  intent_id?: string;                    // override for deterministic tests
}

export function buildRotationIntent(input: RotationIntentBuildInput): RotationIntent {
  const planned_at = input.planned_at ?? new Date().toISOString();
  const strategy = input.strategy ?? "side-by-side";
  const grace = input.grace_days ?? 7;
  const target = new Date(Date.parse(planned_at) + grace * 86400_000).toISOString();
  const d11 = input.d11_target ?? "WITNESSED_TWICE";
  const id = input.intent_id ?? `rot-${input.candidate.key_id}-${Date.parse(planned_at)}`;

  return {
    intent_id: id,
    candidate_key_id: input.candidate.key_id,
    owner_glyph: input.candidate.owner_glyph,
    host_device: input.candidate.host_device,
    strategy,
    planned_at,
    target_rotation_by: target,
    d11_target: d11,
    requires_owner_ack: true,
    witness_profiles_accepted: ["owner"],   // rotation is sovereign — owner only
    evidence: {
      verdict: input.candidate.verdict,
      reason: input.candidate.reason,
      age_days: input.candidate.age_days,
    },
    glyph_sentence: `EVT-KEY-ROTATION-INTENT · key_id=${input.candidate.key_id} · strategy=${strategy} · d11_target=${d11} · deadline=${target} @ M-EYEWITNESS .`,
  };
}

export interface RotationIntentBatch {
  plan_analyzed_at: string;
  total_candidates: number;
  intents_built: number;
  intents: RotationIntent[];
  skipped_candidates: Array<{ key_id: string; reason: string }>;
  glyph_sentence: string;
}

// Build intents only for candidates in rotate-now verdict; skip fresh/warn/rotated-recent
export function buildBatchFromPlan(plan: RotationPlan, opts: { strategy?: RotationStrategy; grace_days?: number; d11_target?: string; planned_at?: string } = {}): RotationIntentBatch {
  const intents: RotationIntent[] = [];
  const skipped: Array<{ key_id: string; reason: string }> = [];

  for (const c of plan.candidates) {
    if (c.verdict !== "rotate-now") {
      skipped.push({ key_id: c.key_id, reason: `verdict=${c.verdict}, no rotation needed` });
      continue;
    }
    intents.push(buildRotationIntent({
      candidate: c,
      strategy: opts.strategy,
      grace_days: opts.grace_days,
      d11_target: opts.d11_target,
      planned_at: opts.planned_at,
    }));
  }

  return {
    plan_analyzed_at: plan.checked_at,
    total_candidates: plan.candidates.length,
    intents_built: intents.length,
    intents,
    skipped_candidates: skipped,
    glyph_sentence: `EVT-KEY-ROTATION-BATCH · candidates=${plan.candidates.length} · intents=${intents.length} · skipped=${skipped.length} @ M-EYEWITNESS .`,
  };
}

// Validation of an intent before the witness signs it off
export interface IntentValidation {
  valid: boolean;
  issues: string[];
  glyph_sentence: string;
}

export function validateIntent(intent: RotationIntent, now: string = new Date().toISOString()): IntentValidation {
  const issues: string[] = [];
  if (!intent.candidate_key_id) issues.push("missing candidate_key_id");
  if (!intent.host_device) issues.push("missing host_device");
  if (Date.parse(intent.target_rotation_by) <= Date.parse(intent.planned_at)) {
    issues.push("target_rotation_by not after planned_at");
  }
  if (Date.parse(intent.planned_at) > Date.parse(now) + 60_000) issues.push("planned_at in the future");
  if (!["WITNESSED_TWICE", "WITNESSED", "ASSUMED", "ATTESTED"].includes(intent.d11_target)) {
    issues.push(`unknown d11_target: ${intent.d11_target}`);
  }
  if (!intent.witness_profiles_accepted.includes("owner")) {
    issues.push("owner profile must be in witness_profiles_accepted");
  }
  return {
    valid: issues.length === 0,
    issues,
    glyph_sentence: issues.length === 0
      ? `EVT-ROTATION-INTENT-VALID · ${intent.intent_id} @ M-EYEWITNESS .`
      : `EVT-ROTATION-INTENT-INVALID · ${intent.intent_id} · issues=${issues.length} · ${issues.join("; ")} @ M-EYEWITNESS .`,
  };
}
