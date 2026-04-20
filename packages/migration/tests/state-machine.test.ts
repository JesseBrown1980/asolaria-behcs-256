// packages/migration/tests/state-machine.test.ts — D-059 tests

import { preflight, createMigrationSession, step, run, readSessionLog, type MigrationHooks } from "../src/state-machine.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== D-059 migration state-machine tests ===\n");

const validInput = {
  subject: "AGT-ROSE",
  source: "DEV-AMY-MAC",
  target: "DEV-AMY-LINUX",
  colony: "COL-AMY",
  operator_witness: "amy",
};

// T1: preflight happy path
console.log("T1: preflight happy path");
const pre1 = preflight(validInput);
assert(pre1.ok === true, "valid input passes preflight", pre1.violations.join(","));

// T2: preflight rejects non-AGT subject
console.log("\nT2: preflight rejects non-AGT subject");
const pre2 = preflight({ ...validInput, subject: "DEV-SOMETHING" });
assert(pre2.ok === false, "DEV-* as subject rejected");
assert(pre2.violations.some(v => v.includes("not an AGT-*")), "violation names it");

// T3: preflight rejects same source+target
console.log("\nT3: preflight rejects same src/dst");
const pre3 = preflight({ ...validInput, target: "DEV-AMY-MAC" });
assert(pre3.ok === false, "same src/dst rejected");

// T4: preflight rejects unauthorized operator
console.log("\nT4: preflight rejects outside-window operator");
const pre4 = preflight({ ...validInput, operator_witness: "stranger" });
assert(pre4.ok === false, "unauthorized operator rejected");

// T5: preflight accepts each 2W-authorized operator
console.log("\nT5: all 5 operators accepted");
for (const op of ["jesse", "rayssa", "amy", "felipe", "dan"]) {
  const r = preflight({ ...validInput, operator_witness: op });
  assert(r.ok === true, `operator=${op} accepted`);
}

// T6: createMigrationSession flags failed preflight
console.log("\nT6: session creation with bad preflight → FAILED");
const bad = createMigrationSession({ ...validInput, subject: "DEV-BOGUS" });
assert(bad.phase === "FAILED", "bad preflight session in FAILED phase");
assert(bad.error !== null && bad.error.includes("preflight_failed"), "error references preflight_failed");

// T7: createMigrationSession with good preflight → INIT
console.log("\nT7: session creation with good preflight → INIT");
const good = createMigrationSession(validInput);
assert(good.phase === "INIT", "good preflight session in INIT phase");
assert(good.session_id.length > 0, "session_id generated");

// T8: run happy path with all hooks returning ok
async function main() {
console.log("\nT8: run happy path");
const hooks: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: true, new_key_id: "test-key-123" }),
  drain: async () => ({ ok: true }),
  cutover: async () => ({ ok: true }),
  verify: async () => ({ ok: true }),
  rollback: async () => ({ ok: true }),
};
const done = await run(createMigrationSession(validInput), hooks);
assert(done.phase === "COMPLETE", "happy-path ends COMPLETE", done.phase);
assert(done.stage_result?.new_key_id === "test-key-123", "stage_result.new_key_id captured");
assert(done.ended_at !== null, "ended_at set");

// T9: session log recorded each phase
console.log("\nT9: session log captures phases");
const logEntries = readSessionLog(done.session_id);
assert(logEntries.length >= 6, `at least 6 log entries (got ${logEntries.length})`);
const events = logEntries.map(e => e.event);
assert(events.includes("SESSION_CREATED"), "SESSION_CREATED present");
assert(events.includes("SESSION_COMPLETE"), "SESSION_COMPLETE present");

// T10: failure in stage triggers rollback
console.log("\nT10: stage failure triggers rollback");
const badStageHooks: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: false, error: "simulated stage failure" }),
  rollback: async () => ({ ok: true }),
};
const rb = await run(createMigrationSession(validInput), badStageHooks);
assert(rb.phase === "ROLLED_BACK", "ended in ROLLED_BACK", rb.phase);
assert(rb.error !== null && rb.error.includes("simulated"), "error captured");

// T11: rollback itself failing yields FAILED
console.log("\nT11: rollback-failure yields FAILED");
const brokenRollbackHooks: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => ({ ok: false, error: "fail" }),
  rollback: async () => ({ ok: false, error: "rollback-broken" }),
};
const f = await run(createMigrationSession(validInput), brokenRollbackHooks);
assert(f.phase === "FAILED", "ended in FAILED");
assert(f.error?.includes("rollback_failed") || f.error?.includes("rollback-broken"), "rollback-failure reason captured");

// T12: hook throwing exception also triggers rollback
console.log("\nT12: thrown hook exception → rollback");
const throwingHooks: MigrationHooks = {
  announce: async () => ({ ok: true }),
  stage: async () => { throw new Error("boom"); },
  rollback: async () => ({ ok: true }),
};
const t = await run(createMigrationSession(validInput), throwingHooks);
assert(t.phase === "ROLLED_BACK", "throw → rollback");
assert(t.error?.includes("boom"), "throw message captured");

// T13: safety loop limit
console.log("\nT13: safety loop limit");
const state = createMigrationSession(validInput);
// Use a hook set that advances but never terminates (we force it by not matching any clean phase transition after VERIFYING)
// Actually our run() always terminates via VERIFYING → COMPLETE, so use a very small safety to force guard trip
const sa = await run(state, hooks, 2);
assert(sa.phase === "FAILED", "safety limit triggers FAILED");
assert(sa.error?.includes("safety_loop_limit_exceeded"), "safety-limit reason");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-D-059-STATE-MACHINE-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
