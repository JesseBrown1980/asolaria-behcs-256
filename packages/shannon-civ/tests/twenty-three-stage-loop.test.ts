import { initLoop, step, runFullLoop, summarize, STAGES } from "../src/twenty-three-stage-loop.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Shannon 23-stage loop tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

// T1: 23 stages exactly
console.log("T1: stage count");
assert(STAGES.length === 23, `23 stages (got ${STAGES.length})`);

// T2: stages unique
console.log("\nT2: unique");
const uniq = new Set(STAGES);
assert(uniq.size === 23, "all unique");

// T3: init state
console.log("\nT3: init");
const s0 = initLoop(NOW);
assert(s0.current_stage === 0, "start at 0");
assert(s0.completed.length === 0, "no completed");
assert(s0.terminated === false, "not terminated");

// T4: single step forward
console.log("\nT4: step");
const r1 = step({ state: s0, ok: true, detail: "ingress ok", at: NOW });
assert(r1.stage_advanced === true, "advanced");
assert(r1.state.current_stage === 1, "at stage 1");
assert(r1.state.completed.length === 1, "1 completed");
assert(r1.state.completed[0].stage === "S00_ingress", "S00 logged");

// T5: consecutive steps
console.log("\nT5: consecutive");
let st = s0;
for (let i = 0; i < 5; i++) {
  st = step({ state: st, ok: true, at: NOW }).state;
}
assert(st.current_stage === 5, "at 5");
assert(st.completed.length === 5, "5 completed");
assert(st.completed[4].stage === "S04_L0_rate_scope", "S04 last");

// T6: fail terminates
console.log("\nT6: fail terminates");
const failed = step({ state: s0, ok: false, detail: "sig bad", at: NOW });
assert(failed.state.terminated === true, "terminated");
assert(failed.state.terminal_reason?.includes("stage-failed"), "reason");
assert(failed.glyph_sentence.includes("TERMINATED"), "glyph terminated");

// T7: cannot advance after terminate
console.log("\nT7: post-terminate");
const afterTerm = step({ state: failed.state, ok: true, at: NOW });
assert(afterTerm.stage_advanced === false, "not advanced");
assert(afterTerm.state.completed.length === failed.state.completed.length, "no new completed");

// T8: run full loop all-pass
console.log("\nT8: full loop pass");
const allOk = runFullLoop(() => ({ ok: true }), NOW);
assert(allOk.completed.length === 23, "23 completed");
assert(allOk.terminated === false || allOk.current_stage === 23, "ended cleanly");

// T9: summarize all-pass
console.log("\nT9: summary all-pass");
const sumOk = summarize(allOk);
assert(sumOk.all_passed === true, "all-pass");
assert(sumOk.completed_count === 23, "23 complete");
assert(sumOk.by_stage.S00_ingress !== null, "S00 in by_stage");
assert(sumOk.by_stage.S22_outcome_commit !== null, "S22 in by_stage");
assert(sumOk.glyph_sentence.includes("all-pass=true"), "glyph all-pass");

// T10: mid-loop failure
console.log("\nT10: mid failure");
const midFail = runFullLoop((stage, i) => ({ ok: i !== 10, detail: i === 10 ? "L4 insufficient" : "" }), NOW);
assert(midFail.terminated === true, "terminated");
assert(midFail.completed.length === 11, "11 completed (through failing stage)");
const sumFail = summarize(midFail);
assert(sumFail.all_passed === false, "not all pass");
assert(sumFail.by_stage.S10_L4_evidence?.ok === false, "S10 logged as failed");
assert(sumFail.by_stage.S11_L4_5_gnn_score === null, "S11 not reached");

// T11: explicit terminate flag
console.log("\nT11: explicit terminate");
const explicitTerm = step({ state: s0, ok: true, terminate: true, terminate_reason: "owner abort", at: NOW });
assert(explicitTerm.state.terminated === true, "terminated");
assert(explicitTerm.state.terminal_reason === "owner abort", "reason captured");

// T12: stage ordering integrity
console.log("\nT12: ordering");
assert(STAGES[0] === "S00_ingress", "first is ingress");
assert(STAGES[22] === "S22_outcome_commit", "last is outcome_commit");
assert(STAGES[8] === "S08_L3_profile_classify", "S08 is L3 classify");
assert(STAGES[12] === "S12_L5_verdict", "S12 is L5 verdict");

// T13: acer-added stages present
console.log("\nT13: acer additions");
assert(STAGES.includes("S07_L2_5_cross_check"), "cross-check");
assert(STAGES.includes("S09_L3_5_registry_salt"), "registry salt");
assert(STAGES.includes("S11_L4_5_gnn_score"), "gnn score");

// T14: summary after partial
console.log("\nT14: partial summary");
const partial = { ...s0 };
let stP = partial;
for (let i = 0; i < 7; i++) stP = step({ state: stP, ok: true, at: NOW }).state;
const sumP = summarize(stP);
assert(sumP.completed_count === 7, "7 completed");
assert(sumP.all_passed === false, "not full pass");
assert(sumP.by_stage.S06_L2_self_patterns?.ok === true, "S06 ok");
assert(sumP.by_stage.S07_L2_5_cross_check === null, "S07 not run");

// T15: cycle from fail state doesn't mutate
console.log("\nT15: immutability");
const origCompleted = failed.state.completed.length;
step({ state: failed.state, ok: true, at: NOW });
assert(failed.state.completed.length === origCompleted, "original untouched");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-SHANNON-23-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
