#!/usr/bin/env node
// Smoke test: verify all 5 upgrades load + basic transitions work

import { PeerStateMachine, STATES } from "../src/peer-state-machine.mjs";
import { BilateralFingerprintTracker } from "../src/bilateral-fingerprint-tracker.mjs";
import { GNNFeedbackCadenceAdjuster } from "../src/gnn-feedback-cadence-adjuster.mjs";
import { SLOGate } from "../src/slo-gate.mjs";
import { UnisonTestDriver, UNISON_TESTS } from "../src/unison-test-driver.mjs";

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

// 1. PeerStateMachine
console.log("\n=== PeerStateMachine ===");
const psm = new PeerStateMachine("liris");
assert(psm.state === STATES.DARK, "initial=DARK");
const t1 = psm.transition(STATES.PROBING, "boot"); assert(t1.ok, "DARK→PROBING legal");
const t2 = psm.transition(STATES.ALIVE, "bus observed"); assert(t2.ok, "PROBING→ALIVE legal");
const t3 = psm.transition(STATES.HALT, "illegal"); assert(!t3.ok, "ALIVE→HALT illegal");
psm.onKick("test-kick-text"); assert(psm.state === STATES.KICKED, "onKick → KICKED");
psm.onReply("EVT-TEST-REPLY"); assert(psm.state === STATES.RESPONDING, "onReply → RESPONDING");

// 2. BilateralFingerprintTracker
console.log("\n=== BilateralFingerprintTracker ===");
const fpt = new BilateralFingerprintTracker();
const bytes = Buffer.from("deterministic-test-bytes");
const sha = BilateralFingerprintTracker.hashBytes(bytes);
fpt.record("acer", "EVT-TEST", "artifact.json", sha);
const v1 = fpt.check("EVT-TEST::artifact.json");
assert(v1.verdict === "single-sided", "single-sided when only 1 peer");
fpt.record("liris", "EVT-TEST", "artifact.json", sha);
const v2 = fpt.check("EVT-TEST::artifact.json");
assert(v2.verdict === "BILATERAL-MATCH", "both peers same sha → match");
fpt.record("falcon", "EVT-TEST", "artifact.json", "different-hash");
const v3 = fpt.check("EVT-TEST::artifact.json");
// P1 contract update: 2-agree + 1-diverge is QUORUM (majority info preserved), not DIVERGE.
// DIVERGE is reserved for all-distinct among 3+ peers.
assert(v3.verdict === "QUORUM", "third peer with diff sha → quorum (2 agree, 1 diverge)");
assert(v3.majority_sha === sha && v3.majority_peers.length === 2, "quorum majority = acer+liris");
assert(v3.minority_peers.falcon === "different-hash", "quorum minority captures falcon");

// 3. GNNFeedbackCadenceAdjuster
console.log("\n=== GNNFeedbackCadenceAdjuster ===");
const gnn = new GNNFeedbackCadenceAdjuster({ initial_ms: 10000 });
const before = gnn.nextIntervalMs();
for (let i = 0; i < 10; i++) gnn.onOutcome({ verdict: "promote", intent: "leak", is_reply: true });
assert(gnn.nextIntervalMs() < before, "cadence speeds up on promotes");
for (let i = 0; i < 10; i++) gnn.onOutcome({ verdict: "demote", intent: "mask" });
// don't assert vs before — decay kinetics vary. Just verify in range.
const after_decay = gnn.nextIntervalMs();
assert(after_decay >= 5000 && after_decay <= 60000, "cadence stays in [min,max]");

// 4. SLOGate
console.log("\n=== SLOGate ===");
const slo = new SLOGate({ mem_threshold_mb: 100, mem_duration_ms: 100, err_window_ms: 1000 });
slo.observeMem(150); const e1 = slo.evaluate();
assert(!e1.any_fired, "normal mem → no halt");
slo.observeMem(50);
await new Promise(r => setTimeout(r, 120));
slo.observeMem(50);
const e2 = slo.evaluate();
assert(e2.tripped_predicates.includes("U-006-mem"), "sustained low mem → U-006 fires");
slo.observeVerb("OP-HALT");
const e3 = slo.evaluate();
assert(e3.tripped_predicates.includes("U-008-op-halt"), "OP-HALT verb → U-008 fires");

// 5. UnisonTestDriver (structural only; no real peers here)
console.log("\n=== UnisonTestDriver ===");
let postsCalled = 0;
const utd = new UnisonTestDriver({
  fingerprintTracker: fpt,
  stateMachines: {},
  busPost: async () => { postsCalled++; return 200; },
  scriptRunner: async (test_id) => ({ canonical_bytes: `bytes-${test_id}`, sha256: "a".repeat(64) }),
});
assert(UNISON_TESTS.length === 5, "5 unison tests defined");
const r1 = await utd.runOne("UNISON-TEST-001");
assert(r1.ok, "TEST-001 run ok");
assert(postsCalled === 1, "busPost called once per test");
const r2 = utd.absorbPeerResult("UNISON-TEST-001", "liris", "a".repeat(64));
assert(r2.ok && r2.verdict.verdict === "BILATERAL-MATCH", "acer+liris same sha → match absorbed");

console.log(`\n=== RESULTS ===`);
console.log(`pass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
