import { scoreDrift, scoreWitnessedDrift, aggregateSeverity, type SeverityScore } from "../src/severity.ts";
import { attachWitness, type OperatorWitness } from "../src/witness.ts";
import type { DriftDetection } from "../src/broadcaster.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== F-082 drift severity tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkDetection(overrides: Partial<DriftDetection> = {}): DriftDetection {
  return {
    instance_path: "/fake", permanent_name: "subject-x", hilbert_pid: "pid",
    instance_sha256: "abc", drift_kind: "verify_failed",
    verify_result: { ok: false, violations: ["field missing"] },
    drift_log_entries: [], observed_at: NOW, observer_pid: "acer",
    ...overrides,
  };
}

// T1: minimal drift → LOW/MEDIUM
console.log("T1: minimal");
const s1 = scoreDrift({ detection: mkDetection({ drift_log_entries: [], verify_result: { ok: false, violations: [] } }) });
assert(s1.numeric_score <= 40, "score ≤ 40");
assert(["LOW", "MEDIUM", "INFO"].includes(s1.band), `band ${s1.band}`);

// T2: sig violation → high contribution
console.log("\nT2: sig violation");
const s2 = scoreDrift({ detection: mkDetection({ verify_result: { ok: false, violations: ["signature tampered"] } }), witness_mode: "owner" });
assert(s2.numeric_score >= 45, "higher score");
assert(s2.drivers.some(d => d.includes("sig-related")), "driver mentions sig");

// T3: drift_kind=both → +40
console.log("\nT3: both");
const s3 = scoreDrift({ detection: mkDetection({ drift_kind: "both", verify_result: { ok: false, violations: ["manifest drift"] } }) });
assert(s3.drivers.some(d => d.includes("drift_kind=both (+40)")), "both driver");
assert(s3.numeric_score >= 55, "high score");

// T4: new_drift_log_entry → +15
console.log("\nT4: new_drift_log_entry");
const s4 = scoreDrift({ detection: mkDetection({ drift_kind: "new_drift_log_entry", verify_result: null, drift_log_entries: [{ at: NOW, kind: "file-change" as any, detail: "x" } as any] }) });
assert(s4.drivers.some(d => d.includes("new_drift_log_entry")), "new_drift driver");

// T5: many log entries → bonus
console.log("\nT5: many log entries");
const logs = Array.from({ length: 6 }, (_, i) => ({ at: NOW, kind: "x" as any, detail: `e${i}` } as any));
const s5 = scoreDrift({ detection: mkDetection({ drift_log_entries: logs }) });
assert(s5.drivers.some(d => d.includes("log entries ≥5")), "log-entries driver");

// T6: federation consensus
console.log("\nT6: federation consensus");
const s6 = scoreDrift({ detection: mkDetection(), federation_peers_detected: 4 });
assert(s6.drivers.some(d => d.includes("federation consensus 4 peers")), "federation driver");

// T7: owner witness damps score
console.log("\nT7: owner damps");
const baseInput = { detection: mkDetection({ verify_result: { ok: false, violations: ["signature broken"] } }) };
const sOwner = scoreDrift({ ...baseInput, witness_mode: "owner" });
const sUnattended = scoreDrift({ ...baseInput, witness_mode: "unattended" });
assert(sUnattended.numeric_score > sOwner.numeric_score, "unattended > owner");
assert(sOwner.drivers.some(d => d.includes("owner witness")), "owner driver");

// T8: unattended bumps score
console.log("\nT8: unattended");
assert(sUnattended.drivers.some(d => d.includes("unattended witness")), "unattended driver");

// T9: band threshold mapping
console.log("\nT9: bands");
const sCrit = scoreDrift({
  detection: mkDetection({
    drift_kind: "both",
    verify_result: { ok: false, violations: ["signature tampered", "manifest drift", "identity broken", "another sig"] },
    drift_log_entries: Array.from({ length: 5 }, () => ({ at: NOW, kind: "x" as any, detail: "d" } as any)),
  }),
  federation_peers_detected: 3,
  witness_mode: "unattended",
});
assert(sCrit.band === "CRITICAL", "critical band");
assert(sCrit.numeric_score >= 80, "score ≥ 80");

// T10: score clamped to 100
console.log("\nT10: clamp 100");
assert(sCrit.numeric_score <= 100, "clamp");

// T11: recommended_action per band
console.log("\nT11: recommended_action");
assert(sCrit.recommended_action.includes("quarantine"), "critical → quarantine");
const sLow = scoreDrift({ detection: mkDetection({ drift_kind: "new_drift_log_entry", verify_result: null }), witness_mode: "owner" });
assert(sLow.recommended_action.length > 0, "has action");

// T12: scoreWitnessedDrift delegates correctly
console.log("\nT12: scoreWitnessedDrift");
const w: OperatorWitness = { gate: "jesse", profile: "owner", attested_at: NOW };
const witnessed = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: w });
const sW = scoreWitnessedDrift(witnessed, 0);
assert(sW.drivers.some(d => d.includes("owner witness")), "owner extracted from payload");

// T13: aggregate
console.log("\nT13: aggregate");
const scores: SeverityScore[] = [s1, s2, s3, s4, s5, s6, sOwner, sUnattended, sCrit, sLow];
const agg = aggregateSeverity(scores);
assert(agg.total === 10, "10 total");
assert(agg.by_band.CRITICAL === 1, "1 critical");
assert(agg.avg_score > 0, "nonzero avg");
assert(agg.top_drivers.length <= 10, "≤10 drivers");

// T14: glyph
console.log("\nT14: glyph");
assert(sCrit.glyph_sentence.includes("band=CRITICAL"), "band in glyph");
assert(sCrit.glyph_sentence.includes("subject=subject-x"), "subject in glyph");

// T15: empty scores aggregate
console.log("\nT15: empty aggregate");
const emptyAgg = aggregateSeverity([]);
assert(emptyAgg.total === 0, "0 total");
assert(emptyAgg.avg_score === 0, "0 avg");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-F-082-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
