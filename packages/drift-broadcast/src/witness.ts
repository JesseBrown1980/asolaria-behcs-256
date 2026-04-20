// packages/drift-broadcast/src/witness.ts — F-081 drift-broadcast witness attachment
//
// Every drift-detected broadcast should carry operator_witness provenance
// so federation peers can distinguish drifts observed under owner mode vs
// autonomous vs friend-of-owner. F-081 is a pure composer — takes the
// F-077 drift detection and any active witness and returns an enriched
// envelope with signed provenance ready for signing.
//
// No network I/O. Caller (broadcaster) calls attachWitness then signs.

import type { DriftDetection, DriftBroadcastPayload } from "./broadcaster.ts";

export type WitnessMode = "owner" | "autonomous" | "friend" | "unattended";

export interface OperatorWitness {
  gate: string;           // e.g. "rayssa", "jesse", "autonomous"
  profile: WitnessMode;
  attested_at: string;
  session_id?: string;
}

export interface WitnessedDriftPayload extends DriftBroadcastPayload {
  operator_witness: OperatorWitness | { mode: "unattended"; reason: string; attested_at: string };
  witness_policy: {
    drift_visible_to_federation: boolean;
    requires_owner_ack: boolean;
  };
}

export interface AttachWitnessInput {
  actor: string;
  detection: DriftDetection;
  ts: string;
  witness?: OperatorWitness;
  policy_override?: Partial<WitnessedDriftPayload["witness_policy"]>;
}

// Drifts under unattended mode are still broadcast (safety > silence) but
// require owner ack before federation peers treat them as authoritative.
const DEFAULT_POLICY: WitnessedDriftPayload["witness_policy"] = {
  drift_visible_to_federation: true,
  requires_owner_ack: false,
};

export function attachWitness(input: AttachWitnessInput): WitnessedDriftPayload {
  const witness = input.witness ?? {
    mode: "unattended" as const,
    reason: "no operator witness present at observation",
    attested_at: input.ts,
  };
  const policy = { ...DEFAULT_POLICY, ...(input.policy_override ?? {}) };
  if (!input.witness) policy.requires_owner_ack = true;

  return {
    actor: input.actor,
    verb: "drift-detected",
    target: "federation",
    detection: input.detection,
    ts: input.ts,
    operator_witness: witness,
    witness_policy: policy,
  };
}

export interface WitnessValidation {
  valid: boolean;
  mode: WitnessMode | "unattended";
  issues: string[];
  requires_owner_ack: boolean;
  glyph_sentence: string;
}

export function validateWitness(payload: WitnessedDriftPayload, now: string = new Date().toISOString()): WitnessValidation {
  const issues: string[] = [];
  const w = payload.operator_witness as any;
  let mode: WitnessMode | "unattended";

  if ("mode" in w && w.mode === "unattended") {
    mode = "unattended";
  } else if ("gate" in w && typeof w.gate === "string" && typeof w.profile === "string") {
    if (!["owner", "autonomous", "friend"].includes(w.profile)) {
      issues.push(`unknown profile: ${w.profile}`);
    }
    mode = w.profile as WitnessMode;
  } else {
    issues.push("malformed witness — neither unattended nor gate+profile");
    mode = "unattended";
  }

  if (w.attested_at && Date.parse(w.attested_at) > Date.parse(now) + 60_000) {
    issues.push("attested_at in the future");
  }

  return {
    valid: issues.length === 0,
    mode,
    issues,
    requires_owner_ack: payload.witness_policy.requires_owner_ack,
    glyph_sentence: issues.length === 0
      ? `EVT-DRIFT-WITNESS-OK · mode=${mode} · ack=${payload.witness_policy.requires_owner_ack} @ M-EYEWITNESS .`
      : `EVT-DRIFT-WITNESS-INVALID · mode=${mode} · issues=${issues.length} · ${issues.join("; ")} @ M-EYEWITNESS .`,
  };
}

// Aggregate: given a stream of witnessed payloads, split by mode for ops dashboards
export interface WitnessModeCounts {
  total: number;
  by_mode: Record<string, number>;
  needing_owner_ack: number;
  invalid: number;
}

export function aggregateByMode(payloads: WitnessedDriftPayload[], now?: string): WitnessModeCounts {
  const c: WitnessModeCounts = { total: 0, by_mode: {}, needing_owner_ack: 0, invalid: 0 };
  for (const p of payloads) {
    c.total++;
    const v = validateWitness(p, now);
    if (!v.valid) c.invalid++;
    if (v.requires_owner_ack) c.needing_owner_ack++;
    c.by_mode[v.mode] = (c.by_mode[v.mode] ?? 0) + 1;
  }
  return c;
}
