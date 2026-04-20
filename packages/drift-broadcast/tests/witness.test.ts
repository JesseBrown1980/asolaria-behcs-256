import { attachWitness, validateWitness, aggregateByMode, type WitnessedDriftPayload, type OperatorWitness } from "../src/witness.ts";
import type { DriftDetection } from "../src/broadcaster.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== F-081 drift-broadcast witness tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkDetection(overrides: Partial<DriftDetection> = {}): DriftDetection {
  return {
    instance_path: "/fake",
    permanent_name: "s1",
    hilbert_pid: "pid",
    instance_sha256: "abc",
    drift_kind: "verify_failed",
    verify_result: { ok: false, violations: ["test"] },
    drift_log_entries: [],
    observed_at: NOW,
    observer_pid: "acer",
    ...overrides,
  };
}

// T1: attach owner witness
console.log("T1: owner witness");
const w1: OperatorWitness = { gate: "jesse", profile: "owner", attested_at: NOW };
const p1 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: w1 });
assert(p1.verb === "drift-detected", "verb set");
assert(p1.operator_witness === w1, "witness attached");
assert(p1.witness_policy.requires_owner_ack === false, "owner ack not required");
assert(p1.witness_policy.drift_visible_to_federation === true, "visible to federation");

// T2: no witness → unattended with ack required
console.log("\nT2: no witness → unattended");
const p2 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW });
assert((p2.operator_witness as any).mode === "unattended", "mode=unattended");
assert(p2.witness_policy.requires_owner_ack === true, "ack required for unattended");

// T3: validate owner
console.log("\nT3: validate owner");
const v1 = validateWitness(p1, NOW);
assert(v1.valid === true, "valid");
assert(v1.mode === "owner", "mode owner");
assert(v1.issues.length === 0, "no issues");
assert(v1.glyph_sentence.includes("OK"), "ok glyph");

// T4: validate autonomous
console.log("\nT4: autonomous");
const w2: OperatorWitness = { gate: "cron", profile: "autonomous", attested_at: NOW };
const p3 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: w2 });
const v2 = validateWitness(p3, NOW);
assert(v2.valid === true, "autonomous valid");
assert(v2.mode === "autonomous", "mode autonomous");

// T5: validate friend
console.log("\nT5: friend");
const w3: OperatorWitness = { gate: "rayssa", profile: "friend", attested_at: NOW };
const p4 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: w3 });
const v3 = validateWitness(p4, NOW);
assert(v3.valid === true, "friend valid");
assert(v3.mode === "friend", "mode friend");

// T6: validate unattended
console.log("\nT6: unattended");
const v4 = validateWitness(p2, NOW);
assert(v4.valid === true, "unattended still valid");
assert(v4.mode === "unattended", "mode unattended");
assert(v4.requires_owner_ack === true, "ack required");

// T7: unknown profile → invalid
console.log("\nT7: unknown profile");
const badWitness = { gate: "x", profile: "intruder" as any, attested_at: NOW };
const p5 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: badWitness });
const v5 = validateWitness(p5, NOW);
assert(v5.valid === false, "invalid");
assert(v5.issues.some(i => i.includes("unknown profile")), "issue mentions unknown profile");

// T8: future-stamped witness → invalid
console.log("\nT8: future-stamped");
const futureW: OperatorWitness = { gate: "jesse", profile: "owner", attested_at: "2099-01-01T00:00:00Z" };
const p6 = attachWitness({ actor: "acer", detection: mkDetection(), ts: NOW, witness: futureW });
const v6 = validateWitness(p6, NOW);
assert(v6.valid === false, "future-stamped invalid");
assert(v6.issues.some(i => i.includes("future")), "issue cites future");

// T9: policy override
console.log("\nT9: policy override");
const p7 = attachWitness({
  actor: "acer", detection: mkDetection(), ts: NOW, witness: w1,
  policy_override: { drift_visible_to_federation: false },
});
assert(p7.witness_policy.drift_visible_to_federation === false, "policy overridden");
assert(p7.witness_policy.requires_owner_ack === false, "other policy preserved");

// T10: aggregate by mode
console.log("\nT10: aggregate");
const payloads = [p1, p2, p3, p4, p5];
const agg = aggregateByMode(payloads, NOW);
assert(agg.total === 5, "5 total");
assert(agg.by_mode.owner === 1, "1 owner");
assert(agg.by_mode.autonomous === 1, "1 autonomous");
assert(agg.by_mode.friend === 1, "1 friend");
assert(agg.by_mode.unattended === 1, "1 unattended");
// p5 has bad profile → its mode falls to the string "intruder"
assert((agg.by_mode.intruder ?? 0) === 1, "1 invalid mode counted");
assert(agg.invalid === 1, "1 invalid");
assert(agg.needing_owner_ack === 1, "1 needs ack (unattended)");

// T11: attested_at preserved in witness
console.log("\nT11: attested_at preserved");
assert((p1.operator_witness as any).attested_at === NOW, "attested_at");
assert((p3.operator_witness as any).gate === "cron", "gate preserved");

// T12: detection preserved
console.log("\nT12: detection preserved");
assert(p1.detection.permanent_name === "s1", "permanent_name");
assert(p1.detection.drift_kind === "verify_failed", "drift_kind");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-F-081-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
