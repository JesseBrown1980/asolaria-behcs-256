// packages/shannon-civ/src/acer-dispatch.ts — G-087 L3-L5 receiver
//
// Receives `verb=shannon-scan-dispatch` envelopes from liris (G-085 scan
// dispatcher) and runs the acer-civ half of the shannon pipeline:
//   L3  profile-classification  — check profile lives on DEV-ACER, halts
//                                  satisfied, never_performs respected
//   L4  synthesis                — fold L0-L2 verdicts + L3 against phase
//                                  expectations into evidence grade
//   L5  verdict                  — promote / halt / pending-acer-civ-return
//
// Result shipped back to liris via signed BEHCS envelope
// `verb=shannon-scan-result`.

import { CANONICAL_PROFILES, type ShannonAgentName, type SpawnRequest } from "./profile-schema.ts";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type L3Verdict = "PROFILE_ACER_RESIDENT" | "PROFILE_LIRIS_RESIDENT" | "PROFILE_UNKNOWN" | "PROFILE_HALT";
export type L4Evidence = "STRONG" | "WEAK" | "INSUFFICIENT" | "CONTRADICTORY";
export type L5Verdict = "promote" | "halt" | "pending-acer-civ-return";

export interface ShannonScanDispatchEnvelope {
  verb: "shannon-scan-dispatch";
  actor: string;
  target: string;
  d1?: string;
  body: {
    scan_id: string;
    spawn_request: SpawnRequest;
    // G-089 schema-alignment: accept both liris G-085 wire shape
    // { layer, decision, reason } AND test-harness shape { level, ok }.
    // synthesize() normalizes both via isItemOk + itemLevel helpers.
    l0_l2_verdicts: Array<
      | { level: "L0" | "L1" | "L2"; ok: boolean; reason?: string }
      | { layer: "L0" | "L1" | "L2"; decision: string; reason?: string }
    >;
  };
  glyph_sentence?: string;
}

export interface L3Result {
  scan_id: string;
  profile_name: string;
  verdict: L3Verdict;
  resident_device: "DEV-ACER" | "DEV-LIRIS" | "UNKNOWN";
  halts_observed: string[];
  never_performs_observed: string[];
  reasons: string[];
}

export interface L4Result {
  scan_id: string;
  evidence: L4Evidence;
  phase_expectation_met: boolean;
  l0_l2_all_ok: boolean;
  l3_accepted: boolean;
  notes: string[];
}

export interface L5Result {
  scan_id: string;
  verdict: L5Verdict;
  reason: string;
  l3: L3Result;
  l4: L4Result;
  glyph_sentence: string;
}

// ──────────────────────────────────────────────────────────────────────
// L3 profile classification
// ──────────────────────────────────────────────────────────────────────

export function classifyProfile(envelope: ShannonScanDispatchEnvelope): L3Result {
  const { scan_id, spawn_request } = envelope.body;
  const profile_name = spawn_request.profile_name;
  const reasons: string[] = [];

  const canonical = (CANONICAL_PROFILES as any)[profile_name];
  if (!canonical) {
    return {
      scan_id, profile_name,
      verdict: "PROFILE_UNKNOWN",
      resident_device: "UNKNOWN",
      halts_observed: [],
      never_performs_observed: [],
      reasons: [`profile '${profile_name}' not in CANONICAL_PROFILES`],
    };
  }

  const resident = canonical.lives_on_device as "DEV-ACER" | "DEV-LIRIS";
  if (resident !== "DEV-ACER") {
    reasons.push(`profile lives_on_device=${resident}; acer-side dispatch rejects (this receiver only handles DEV-ACER-resident profiles)`);
    return {
      scan_id, profile_name,
      verdict: "PROFILE_LIRIS_RESIDENT",
      resident_device: resident,
      halts_observed: [],
      never_performs_observed: [],
      reasons,
    };
  }

  // Check scope vs halts_on
  const halts: string[] = [];
  const allowedHosts = spawn_request.scope?.allowed_hosts ?? [];
  const allowedPaths = spawn_request.scope?.allowed_paths ?? [];
  if (allowedHosts.length === 0) halts.push("scope.allowed_hosts is empty (matches halts_on: 'out-of-scope target')");
  if (allowedPaths.length === 0) halts.push("scope.allowed_paths is empty");

  // Check witness
  if (!spawn_request.operator_witness?.gate) halts.push("halts_on: 'missing operator_witness'");

  if (halts.length > 0) {
    reasons.push(...halts.map(h => `halt: ${h}`));
    return {
      scan_id, profile_name,
      verdict: "PROFILE_HALT",
      resident_device: "DEV-ACER",
      halts_observed: halts,
      never_performs_observed: [],
      reasons,
    };
  }

  reasons.push(`profile=${profile_name} resident=DEV-ACER scope-valid witness=${spawn_request.operator_witness.gate}`);
  return {
    scan_id, profile_name,
    verdict: "PROFILE_ACER_RESIDENT",
    resident_device: "DEV-ACER",
    halts_observed: [],
    never_performs_observed: [],
    reasons,
  };
}

// ──────────────────────────────────────────────────────────────────────
// L4 synthesis
// ──────────────────────────────────────────────────────────────────────

export function synthesize(envelope: ShannonScanDispatchEnvelope, l3: L3Result): L4Result {
  const { scan_id, spawn_request, l0_l2_verdicts } = envelope.body;
  const notes: string[] = [];

  // G-089 schema-alignment helpers — accept both { level, ok } and
  // { layer, decision } shapes
  const isItemOk = (v: any): boolean => {
    if (typeof v.ok === "boolean") return v.ok;
    if (typeof v.decision === "string") return v.decision === "pass" || v.decision === "ok";
    return false;
  };
  const itemLevel = (v: any): string => String(v.level ?? v.layer ?? "");

  const l0l2_all_ok = l0_l2_verdicts.every((v: any) => isItemOk(v));
  const l3_accepted = l3.verdict === "PROFILE_ACER_RESIDENT";

  const canonical = (CANONICAL_PROFILES as any)[spawn_request.profile_name];
  const phase_expected = canonical?.phase;
  const hasAllLevels = ["L0", "L1", "L2"].every(lvl => l0_l2_verdicts.some((v: any) => itemLevel(v) === lvl));
  const phase_expectation_met = hasAllLevels;
  if (!hasAllLevels) notes.push("L0/L1/L2 coverage incomplete");
  if (typeof phase_expected === "number") notes.push(`profile phase=${phase_expected}`);

  let evidence: L4Evidence;
  if (l0l2_all_ok && l3_accepted && phase_expectation_met) evidence = "STRONG";
  else if (!l0l2_all_ok && l3_accepted) evidence = "CONTRADICTORY";
  else if (!l3_accepted) evidence = "INSUFFICIENT";
  else evidence = "WEAK";
  notes.push(`evidence=${evidence} (l0l2_all_ok=${l0l2_all_ok} l3_accepted=${l3_accepted} phase_met=${phase_expectation_met})`);

  return {
    scan_id,
    evidence,
    phase_expectation_met,
    l0_l2_all_ok: l0l2_all_ok,
    l3_accepted,
    notes,
  };
}

// ──────────────────────────────────────────────────────────────────────
// L5 verdict
// ──────────────────────────────────────────────────────────────────────

export function decide(envelope: ShannonScanDispatchEnvelope, l3: L3Result, l4: L4Result): L5Result {
  let verdict: L5Verdict;
  let reason: string;

  if (l3.verdict === "PROFILE_HALT") {
    verdict = "halt";
    reason = `L3 halt triggered: ${l3.halts_observed.join("; ")}`;
  } else if (l3.verdict === "PROFILE_UNKNOWN") {
    verdict = "halt";
    reason = `L3 unknown profile: ${l3.profile_name}`;
  } else if (l3.verdict === "PROFILE_LIRIS_RESIDENT") {
    verdict = "pending-acer-civ-return";
    reason = `profile lives on ${l3.resident_device}; not acer's to run — returning to liris for re-routing`;
  } else if (l4.evidence === "STRONG") {
    verdict = "promote";
    reason = "L0-L2 all-ok + L3 accepted + phase expectation met";
  } else if (l4.evidence === "CONTRADICTORY") {
    verdict = "halt";
    reason = "L0-L2 found issues despite L3 acceptance — operator review required";
  } else {
    verdict = "pending-acer-civ-return";
    reason = `evidence=${l4.evidence}; returning to liris for L6 synthesis + operator review`;
  }

  const glyph = `EVT-SHANNON-ACER-VERDICT · scan=${envelope.body.scan_id} · profile=${envelope.body.spawn_request.profile_name} · verdict=${verdict} · evidence=${l4.evidence} · L3=${l3.verdict} · @ M-EYEWITNESS .`;

  return {
    scan_id: envelope.body.scan_id,
    verdict,
    reason,
    l3,
    l4,
    glyph_sentence: glyph,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Full pipeline
// ──────────────────────────────────────────────────────────────────────

export function runAcerDispatch(envelope: ShannonScanDispatchEnvelope): L5Result {
  const l3 = classifyProfile(envelope);
  const l4 = synthesize(envelope, l3);
  return decide(envelope, l3, l4);
}

// ──────────────────────────────────────────────────────────────────────
// Result envelope builder (shipped back to liris)
// ──────────────────────────────────────────────────────────────────────

export function buildResultEnvelope(result: L5Result) {
  return {
    verb: "shannon-scan-result",
    actor: "acer",
    target: "liris",
    d1: "IDENTITY",
    body: {
      scan_id: result.scan_id,
      acer_verdict: result.verdict,
      reason: result.reason,
      l3: result.l3,
      l4: result.l4,
    },
    glyph_sentence: result.glyph_sentence,
  };
}
