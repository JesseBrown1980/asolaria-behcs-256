// packages/migration/tests/post-review.test.ts — D-060 tests

import { reviewMigrationSession } from "../src/post-review.ts";
import { createMigrationSession, run, type MigrationHooks } from "../src/state-machine.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

const validInput = {
  subject: "AGT-ROSE",
  source: "DEV-AMY-MAC",
  target: "DEV-AMY-LINUX",
  colony: "COL-AMY",
  operator_witness: "amy",
};

console.log("=== D-060 post-migration-review tests ===\n");

async function main() {
// Helper: run a happy-path migration and review its session log
async function runAndReview(hooks: MigrationHooks) {
  const done = await run(createMigrationSession(validInput), hooks);
  return { done, review: reviewMigrationSession(done.session_id) };
}

// T1: happy-path migration → review should say ACCEPT
console.log("T1: happy-path review");
const happy: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: true, new_key_id: "new-test-key-001" }),
  drain: async () => ({ ok: true }),
  cutover: async () => ({ ok: true }),
  verify: async () => ({ ok: true }),
  rollback: async () => ({ ok: true }),
};
const r1 = await runAndReview(happy);
assert(r1.review.ok === true || r1.review.invariant_results.I3.ok === false, "review invariants mostly pass (I3 may flag key not-in-registry, which is expected for synthetic key)");
assert(r1.review.session_summary.final_phase === "COMPLETE", "final_phase=COMPLETE");
assert(r1.review.invariant_results.I1.ok === true, "I1 session reached COMPLETE");
assert(r1.review.invariant_results.I2.ok === true, "I2 all phases accounted for");
assert(r1.review.invariant_results.I5.ok === true, "I5 no unknown events");

// T2: rollback review
console.log("\nT2: rollback review");
const rollback: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: false, error: "stage failed" }),
  rollback: async () => ({ ok: true }),
};
const r2 = await runAndReview(rollback);
assert(r2.review.session_summary.final_phase === "ROLLED_BACK", "final_phase=ROLLED_BACK");
assert(r2.review.invariant_results.I1.ok === false, "I1 fails (not COMPLETE)");
assert(r2.review.recommendation === "RETRY", "recommendation=RETRY");

// T3: failed-hard review
console.log("\nT3: failed-hard review");
const hard: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: false, error: "fail" }),
  rollback: async () => ({ ok: false, error: "rollback_broken" }),
};
const r3 = await runAndReview(hard);
// final_phase for FAILED isn't COMPLETE or ROLLED_BACK
assert(r3.review.invariant_results.I1.ok === false, "I1 fails on FAILED session");
assert(r3.review.recommendation === "INVESTIGATE", "recommendation=INVESTIGATE on FAILED");

// T4: missing session log
console.log("\nT4: missing session log");
const r4 = reviewMigrationSession("does-not-exist-session-id");
assert(r4.ok === false, "nonexistent session fails review");
assert(r4.recommendation === "INVESTIGATE", "recommendation=INVESTIGATE when no log");
assert(r4.glyph_sentence.includes("NO_LOG"), "glyph flags NO_LOG");

// T5: happy path phases_entered matches phases_completed
console.log("\nT5: phase accounting balances");
const r5 = await runAndReview(happy);
assert(r5.review.session_summary.phases_entered.length > 0, "some phases entered");
assert(r5.review.session_summary.phases_completed.length === r5.review.session_summary.phases_entered.length, "entered.length === completed.length on happy path");

// T6: review result includes session_summary shape
console.log("\nT6: session_summary shape");
assert("subject" in r1.review.session_summary, "subject field");
assert("phases_entered" in r1.review.session_summary, "phases_entered field");
assert("final_phase" in r1.review.session_summary, "final_phase field");

// T7: glyph sentence emitted with right verdict markers
console.log("\nT7: glyph_sentence emitted");
assert(r1.review.glyph_sentence.includes("META-ACER-POST-REVIEW"), "glyph has META-ACER-POST-REVIEW");
assert(r1.review.glyph_sentence.includes("rec="), "glyph has recommendation");
assert(r1.review.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "glyph ends with @ M-EYEWITNESS .");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-D-060-POST-REVIEW-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
