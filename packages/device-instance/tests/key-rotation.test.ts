import { buildRotationIntent, buildBatchFromPlan, validateIntent } from "../src/key-rotation.ts";
import type { KeyRotationCandidate, RotationPlan } from "../../kernel/src/key-rotation-scheduler.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== E-rotation device-key lifecycle tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkCand(overrides: Partial<KeyRotationCandidate> = {}): KeyRotationCandidate {
  return {
    key_id: "dev-acer-xyz",
    owner_glyph: "DEV-ACER",
    host_device: "DEV-ACER",
    verdict: "rotate-now",
    age_days: 400,
    days_to_rotation: null,
    reason: "age 400d exceeds max_age 365d",
    ...overrides,
  };
}

// T1: build intent from rotate-now candidate
console.log("T1: build intent");
const i1 = buildRotationIntent({ candidate: mkCand(), planned_at: NOW });
assert(i1.candidate_key_id === "dev-acer-xyz", "key_id");
assert(i1.strategy === "side-by-side", "default side-by-side");
assert(i1.d11_target === "WITNESSED_TWICE", "default d11");
assert(i1.requires_owner_ack === true, "owner ack required");
assert(i1.witness_profiles_accepted[0] === "owner", "owner-only witness");
assert(i1.evidence.age_days === 400, "evidence age");
assert(i1.glyph_sentence.includes("KEY-ROTATION-INTENT"), "glyph prefix");

// T2: custom strategy + grace
console.log("\nT2: custom strategy");
const i2 = buildRotationIntent({ candidate: mkCand(), strategy: "escrow-rotate", grace_days: 14, planned_at: NOW });
assert(i2.strategy === "escrow-rotate", "strategy override");
const delta = Date.parse(i2.target_rotation_by) - Date.parse(i2.planned_at);
assert(delta === 14 * 86400_000, "14-day grace");

// T3: intent id deterministic with override
console.log("\nT3: intent_id override");
const i3 = buildRotationIntent({ candidate: mkCand(), planned_at: NOW, intent_id: "fixed-id" });
assert(i3.intent_id === "fixed-id", "override honored");

// T4: validate valid intent
console.log("\nT4: validate valid");
const v1 = validateIntent(i1, NOW);
assert(v1.valid === true, "valid");
assert(v1.issues.length === 0, "no issues");

// T5: missing host_device invalid
console.log("\nT5: missing host_device");
const badIntent = { ...i1, host_device: "" };
const v2 = validateIntent(badIntent, NOW);
assert(v2.valid === false, "invalid");
assert(v2.issues.some(i => i.includes("host_device")), "issue cites host_device");

// T6: target before planned → invalid
console.log("\nT6: target before planned");
const badIntent2 = { ...i1, target_rotation_by: "2026-01-01T00:00:00Z" };
const v3 = validateIntent(badIntent2, NOW);
assert(v3.valid === false, "invalid");
assert(v3.issues.some(i => i.includes("target_rotation_by")), "issue cites target");

// T7: unknown d11_target invalid
console.log("\nT7: bad d11");
const badIntent3 = { ...i1, d11_target: "MYSTERY" };
const v4 = validateIntent(badIntent3, NOW);
assert(v4.valid === false, "invalid");
assert(v4.issues.some(i => i.includes("d11_target")), "issue cites d11");

// T8: planned_at future invalid
console.log("\nT8: future planned_at");
const futureI = buildRotationIntent({ candidate: mkCand(), planned_at: "2099-01-01T00:00:00Z" });
const v5 = validateIntent(futureI, NOW);
assert(v5.valid === false, "future invalid");

// T9: removing owner from witness_profiles invalid
console.log("\nT9: no owner witness");
const noOwner = { ...i1, witness_profiles_accepted: ["autonomous"] as ("owner" | "autonomous" | "friend")[] };
const v6 = validateIntent(noOwner, NOW);
assert(v6.valid === false, "invalid");
assert(v6.issues.some(i => i.includes("owner profile")), "issue cites owner profile");

// T10: buildBatchFromPlan — only rotate-now becomes intent
console.log("\nT10: batch from plan");
const plan: RotationPlan = {
  checked_at: NOW,
  policy: { max_age_days: 365, warn_days_before: 30, force_rotate_if_bootstrap: false },
  total_keys: 4,
  candidates_fresh: 1, candidates_warn: 1, candidates_rotate_now: 2, candidates_rotated_recent: 0,
  candidates: [
    mkCand({ key_id: "k-fresh", verdict: "fresh", reason: "fresh" }),
    mkCand({ key_id: "k-warn", verdict: "warn", reason: "in warn window" }),
    mkCand({ key_id: "k-old1", verdict: "rotate-now" }),
    mkCand({ key_id: "k-old2", verdict: "rotate-now" }),
  ],
  glyph_sentence: "EVT-KEY-ROTATION-PLAN · total=4 · fresh=1 · warn=1 · rotate-now=2 · recent=0 @ M-INDICATIVE .",
};
const batch = buildBatchFromPlan(plan, { planned_at: NOW });
assert(batch.intents_built === 2, "2 intents");
assert(batch.skipped_candidates.length === 2, "2 skipped");
assert(batch.intents[0].candidate_key_id === "k-old1", "k-old1 intent");
assert(batch.intents[1].candidate_key_id === "k-old2", "k-old2 intent");
assert(batch.skipped_candidates.some(s => s.key_id === "k-fresh"), "k-fresh skipped");

// T11: empty batch when no rotate-now
console.log("\nT11: all fresh");
const freshPlan: RotationPlan = {
  ...plan,
  candidates: [mkCand({ verdict: "fresh" })],
  candidates_rotate_now: 0, candidates_fresh: 1,
};
const freshBatch = buildBatchFromPlan(freshPlan);
assert(freshBatch.intents_built === 0, "no intents");
assert(freshBatch.skipped_candidates.length === 1, "1 skipped");

// T12: batch glyph
console.log("\nT12: batch glyph");
assert(batch.glyph_sentence.includes("candidates=4"), "candidates count");
assert(batch.glyph_sentence.includes("intents=2"), "intents count");

// T13: strategy propagates through batch
console.log("\nT13: batch strategy override");
const escrow = buildBatchFromPlan(plan, { strategy: "escrow-rotate", planned_at: NOW });
assert(escrow.intents.every(i => i.strategy === "escrow-rotate"), "all escrow");

// T14: evidence preserved
console.log("\nT14: evidence preserved");
assert(batch.intents[0].evidence.verdict === "rotate-now", "evidence verdict");
assert(batch.intents[0].evidence.age_days === 400, "evidence age");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-E-ROTATION-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
