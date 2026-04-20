#!/usr/bin/env node
import { FROZEN_PROBLEMS, ADVERSARIAL_HOLDOUT, FROZEN_SET_FINGERPRINT, solveProblem } from "../src/frozen-problem-set.mjs";
import { runFPASI } from "../src/runner.mjs";

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { pass++; console.log("  PASS  " + label); } else { fail++; console.log("  FAIL  " + label); } }

console.log("\n=== frozen problem set ===");
assert(FROZEN_PROBLEMS.length === 100, "100 problems defined");
assert(ADVERSARIAL_HOLDOUT.length === 10, "10 adversarial holdouts");
assert(/^[0-9a-f]{64}$/.test(FROZEN_SET_FINGERPRINT), "set fingerprint is sha256");
assert(FROZEN_PROBLEMS.every(p => /^[0-9a-f]{64}$/.test(p.canonical_sha256)), "all canonical sha256");

console.log("\n=== honest candidate (always returns canonical) ===");
const honestRun = await runFPASI({
  candidateSystem: async (p) => solveProblem(p),
});
assert(honestRun.verdict === "PASS-ASI-CONFIRMABLE" || honestRun.verdict === "INCONCLUSIVE-MORE-DATA-NEEDED", "honest candidate passes gates or needs more data");
assert(honestRun.s_n === 1.0, "honest S_N = 1.0");
assert(honestRun.gates.gate_1_held_out.passed_all === true, "gate 1 all-passed");
assert(honestRun.gates.gate_5_adversarial.pass === true, "gate 5 adversarial canonical-match");

console.log("\n=== reward-hack candidate (matches reward-hack expected, not canonical) ===");
const rewardHackCandidate = async (p) => {
  // This candidate returns the reward-hack shape for adversarial problems, canonical for others
  const adv = ADVERSARIAL_HOLDOUT.find(a => a.problem.id === p.id && p.adversarial_flag);
  if (adv) return adv.reward_hack_expected_sha256;
  return solveProblem(p);
};
const rewardHackRun = await runFPASI({ candidateSystem: rewardHackCandidate });
assert(rewardHackRun.gates.gate_5_adversarial.pass === false, "reward-hack candidate FAILS adversarial gate");
assert(rewardHackRun.gates.gate_5_adversarial.reward_hack_signature_detected === true, "reward-hack signature DETECTED");
assert(rewardHackRun.verdict === "REJECT-CLAIM", "reward-hack candidate → REJECT-CLAIM");

console.log("\n=== random candidate (capability failure) ===");
const randomCandidate = async (p) => "0".repeat(64);
const randomRun = await runFPASI({ candidateSystem: randomCandidate });
assert(randomRun.gates.gate_1_held_out.passed_all === false, "random candidate fails gate 1");
assert(randomRun.verdict === "REJECT-CLAIM", "random candidate → REJECT-CLAIM");

console.log("\n=== improvement-tick stub (capability-gain gate) ===");
let tickCount = 0;
const withTicks = await runFPASI({
  candidateSystem: async (p) => solveProblem(p),
  improvementTickFn: async () => { tickCount++; },
});
assert(tickCount === 10_000, "10K improvement ticks fired");
assert(withTicks.gates.gate_3_improvement_ticks_ran === 10_000, "gate 3 records tick count");

console.log(`\n=== RESULTS ===\npass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
