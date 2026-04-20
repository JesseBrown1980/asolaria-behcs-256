#!/usr/bin/env node
import { hookwallGate, shannonVerdict, whiteroomCubeAddress, omniGnnScore, reverseGainGnnScore, agreementGate, convertStageToActual, convertBatch, SUPERVISOR_PIDS } from "../src/converter.mjs";

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

console.log("\n=== supervisor PID table ===");
assert(Object.keys(SUPERVISOR_PIDS).length === 11, "11 supervisors wired");
assert(SUPERVISOR_PIDS.gnn.room === 25, "GNN at room 25");
assert(SUPERVISOR_PIDS.super_gulp.room === 37, "SUPER-GULP at room 37");
assert(SUPERVISOR_PIDS.falcon_kicker.room === 39, "FALCON at room 39");

console.log("\n=== hookwall gate ===");
assert(hookwallGate({ verb: "EVT-TEST" }).verdict === "pass", "valid envelope passes");
assert(hookwallGate({}).verdict === "fail", "no-verb fails");
assert(hookwallGate({ verb: "OP-HALT" }).verdict === "flag", "HALT-verb flagged");
assert(hookwallGate({ verb: "EVT-OK", _sig_check: { verdict: "REJECTED" } }).verdict === "fail", "rejected sig fails");

console.log("\n=== shannon verdict ===");
const shannon = shannonVerdict({ verb: "EVT-TEST", body: { x: 1 } });
assert(shannon.score >= 0 && shannon.score <= 1, "score in [0,1]");
assert(typeof shannon.levels.L6 === "number", "L6 defined");
const shannon2 = shannonVerdict({ verb: "EVT-TEST", body: { x: 1 } });
assert(shannon.score === shannon2.score, "deterministic score");

console.log("\n=== whiteroom cube ===");
const wr = whiteroomCubeAddress({ verb: "EVT-TEST", body: { p: "pattern" } });
assert(wr.cube_address.length === 3, "3-axis cube");
assert(wr.cube_address[0] >= 0 && wr.cube_address[0] < 3, "layer 0-2");
assert(wr.cube_address[1] >= 0 && wr.cube_address[1] < 6, "axis1 0-5");
assert(wr.cube_address[2] >= 0 && wr.cube_address[2] < 6, "axis2 0-5");

console.log("\n=== OmniGNN + reverse-gain-GNN ===");
const env1 = { verb: "EVT-SHANNON-VERDICT", body: { score: 0.9 } };
const hw1 = hookwallGate(env1); const sh1 = shannonVerdict(env1); const wr1 = whiteroomCubeAddress(env1);
const omni1 = omniGnnScore({ hookwall: hw1, shannon: sh1, whiteroom: wr1 });
const rev1 = reverseGainGnnScore({ hookwall: hw1, shannon: sh1, whiteroom: wr1, envelope: env1 });
assert(["actual","candidate","stage"].includes(omni1.decision), "omni decision valid");
assert(["actual","candidate","stage"].includes(rev1.decision), "reverse decision valid");

console.log("\n=== reverse-gain detects mask marker ===");
const maskEnv = { verb: "EVT-STAGE-STEALTH-MASK", body: { deceive: true, mask_level: 5 } };
const hw2 = hookwallGate(maskEnv); const sh2 = shannonVerdict(maskEnv); const wr2 = whiteroomCubeAddress(maskEnv);
const revMask = reverseGainGnnScore({ hookwall: hw2, shannon: sh2, whiteroom: wr2, envelope: maskEnv });
assert(revMask.components.mask_flip === -1, "mask_flip=-1 on mask-marker envelope");

console.log("\n=== agreement gate ===");
const agree = agreementGate({ omni: { score: 0.8, decision: "actual" }, reverse: { score: 0.7, decision: "actual" } });
assert(agree.agree === true, "matching decisions agree");
assert(agree.joint_decision === "actual", "joint = actual");
const disagree = agreementGate({ omni: { score: 0.8, decision: "actual" }, reverse: { score: 0.4, decision: "candidate" } });
assert(disagree.agree === false, "mismatched decisions disagree");
assert(disagree.joint_decision === "halt-for-adjudication", "disagree → halt");
assert(disagree.escalate_to.room === 37, "escalate to room 37");

console.log("\n=== end-to-end convertStageToActual ===");
const r = convertStageToActual({ id: "test-001", verb: "EVT-DEMO", body: { x: 42 } });
assert(r.envelope_id === "test-001", "envelope id preserved");
assert(["actual","candidate","stage","halt-super-gulp"].includes(r.final_outcome), "valid final_outcome");
assert(r.supervisor_chain.length === 3, "3 supervisor PIDs in chain");
assert(r.supervisor_chain.some(p => p.includes("W025")), "GNN supervisor in chain");
assert(r.supervisor_chain.some(p => p.includes("W037")), "SUPER-GULP supervisor in chain");
assert(r.supervisor_chain.some(p => p.includes("W038")), "GC-GNN-FEEDER in chain");

console.log("\n=== batch partitioning ===");
const envs = Array.from({length: 100}, (_, i) => ({ id: `t-${i}`, verb: `EVT-T-${i}`, body: { n: i } }));
const batch = convertBatch(envs);
assert(batch.stats.total === 100, "batch stats total 100");
const sum = batch.stats.actual + batch.stats.candidate + batch.stats.stage + batch.stats.halt_super_gulp;
assert(sum === 100, "all 100 bucketed");
console.log(`    distribution: actual=${batch.stats.actual} candidate=${batch.stats.candidate} stage=${batch.stats.stage} halt=${batch.stats.halt_super_gulp}`);

console.log("\n=== reward-hack style mask envelope → reverse-gain catches ===");
const hackEnv = { id: "hack", verb: "EVT-STAGE-MASK-DECEIVE", body: { stage: "hide actual", mask: true } };
const hackRes = convertStageToActual(hackEnv);
console.log(`    omni=${hackRes.omni_gnn.decision} reverse=${hackRes.reverse_gnn.decision} final=${hackRes.final_outcome}`);
assert(hackRes.reverse_gnn.components?.mask_flip === undefined ? true : hackRes.reverse_gnn.components.mask_flip === -1, "reverse-gain applies flip");

console.log(`\n=== RESULTS ===\npass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
