#!/usr/bin/env node
// tests/unison-runners.test.mjs — verify deterministic UNISON runners.
//
// Contract: each of the 5 UNISON tests is called 3 times. For runners
// that claim deterministic_today=true, all 3 invocations MUST return
// byte-identical canonical_bytes AND identical sha256. For runners that
// declare deterministic_today=false, the flag + reason must appear
// consistently (3 times) and sha256 must be null.
//
// Also verifies:
//   · UnisonTestDriver.runOne fails closed with "runner not deterministic"
//     when the scriptRunner reports deterministic_today=false.
//   · UnisonTestDriver.runOne produces a valid sha for deterministic runners.

import { runUnisonTest, __internal } from "../src/unison-script-runners.mjs";
import { UnisonTestDriver, UNISON_TESTS } from "../src/unison-test-driver.mjs";
import { BilateralFingerprintTracker } from "../src/bilateral-fingerprint-tracker.mjs";

let pass = 0, fail = 0;
function assert(cond, label, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? "  (" + detail + ")" : ""}`); }
}

// ──────────────────────────────────────────────────────────────────────
// Part 1 — each runner × 3 invocations
// ──────────────────────────────────────────────────────────────────────

console.log("\n=== UNISON runners — 3x determinism check ===");

const TEST_IDS = [
  "UNISON-TEST-001",
  "UNISON-TEST-002",
  "UNISON-TEST-003",
  "UNISON-TEST-004",
  "UNISON-TEST-005",
];

const summary = {
  built: 0,
  deterministic: 0,
  not_ready: [],
};

for (const test_id of TEST_IDS) {
  const r1 = await runUnisonTest(test_id);
  const r2 = await runUnisonTest(test_id);
  const r3 = await runUnisonTest(test_id);
  summary.built++;

  // Every result MUST carry the flag
  assert(typeof r1.deterministic_today === "boolean", `${test_id} result has deterministic_today boolean`);

  if (r1.deterministic_today === true) {
    summary.deterministic++;
    // bytes + sha identical across all 3
    assert(r1.canonical_bytes === r2.canonical_bytes && r2.canonical_bytes === r3.canonical_bytes,
      `${test_id} canonical_bytes byte-identical across 3 invocations`);
    assert(r1.sha256 === r2.sha256 && r2.sha256 === r3.sha256,
      `${test_id} sha256 identical across 3 invocations`,
      `r1=${r1.sha256?.slice(0, 16)} r2=${r2.sha256?.slice(0, 16)} r3=${r3.sha256?.slice(0, 16)}`);
    // sha is a valid sha256 hex
    assert(typeof r1.sha256 === "string" && /^[0-9a-f]{64}$/.test(r1.sha256),
      `${test_id} sha256 is valid 64-char hex`);
    // canonical_bytes not empty
    assert(typeof r1.canonical_bytes === "string" && r1.canonical_bytes.length > 0,
      `${test_id} canonical_bytes non-empty`);
    // no raw timestamp patterns that would drift across runs
    assert(!/ts"?:\s*"20(2[6-9]|[3-9]\d)/.test(r1.canonical_bytes) || r1.canonical_bytes.includes("2026-04-19T00:00:00.000Z"),
      `${test_id} canonical_bytes contain only baked-in fixed timestamps`);
  } else {
    // Non-deterministic today: must be consistent across invocations;
    // sha256 must be null; reason must be present.
    assert(r1.deterministic_today === false && r2.deterministic_today === false && r3.deterministic_today === false,
      `${test_id} deterministic_today=false consistent across 3 invocations`);
    assert(r1.sha256 === null && r2.sha256 === null && r3.sha256 === null,
      `${test_id} sha256=null (fail-closed) across 3 invocations`);
    assert(typeof r1.meta?.reason === "string" && r1.meta.reason.length > 0,
      `${test_id} carries non-empty reason`);
    summary.not_ready.push({ test_id, reason: r1.meta.reason });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Part 2 — cross-test: TEST-001 hash equals sha of its canonical_bytes
// (sanity — the seal() is honest, not tampering with the output bytes)
// ──────────────────────────────────────────────────────────────────────

console.log("\n=== seal() honesty ===");
const r001 = await runUnisonTest("UNISON-TEST-001");
const expectedSha = __internal.hashBytes(r001.canonical_bytes);
assert(r001.sha256 === expectedSha, "TEST-001 sha256 equals sha256 of its canonical_bytes");

// ──────────────────────────────────────────────────────────────────────
// Part 3 — UnisonTestDriver fail-closed on non-deterministic runners
// ──────────────────────────────────────────────────────────────────────

console.log("\n=== UnisonTestDriver fail-closed guard ===");
{
  const fpt = new BilateralFingerprintTracker();
  const utd = new UnisonTestDriver({
    fingerprintTracker: fpt,
    stateMachines: {},
    busPost: async () => 200,
    scriptRunner: runUnisonTest,
  });
  // TEST-004 is declared non-deterministic today → driver must refuse.
  const r = await utd.runOne("UNISON-TEST-004");
  assert(r.ok === false, "driver.runOne returns ok=false for non-deterministic runner");
  assert(typeof r.error === "string" && r.error.startsWith("runner not deterministic:"),
    "driver.runOne error is 'runner not deterministic: <reason>'",
    `got: ${r.error}`);
}

// ──────────────────────────────────────────────────────────────────────
// Part 4 — UnisonTestDriver accepts deterministic runners
// ──────────────────────────────────────────────────────────────────────

console.log("\n=== UnisonTestDriver accepts deterministic runners ===");
{
  const fpt = new BilateralFingerprintTracker();
  let posted = 0;
  const utd = new UnisonTestDriver({
    fingerprintTracker: fpt,
    stateMachines: {},
    busPost: async () => { posted++; return 200; },
    scriptRunner: runUnisonTest,
  });
  for (const test_id of ["UNISON-TEST-001", "UNISON-TEST-002", "UNISON-TEST-003", "UNISON-TEST-005"]) {
    const r = await utd.runOne(test_id);
    assert(r.ok === true, `driver.runOne(${test_id}) ok=true`);
    assert(typeof r.acer_sha256 === "string" && /^[0-9a-f]{64}$/.test(r.acer_sha256),
      `driver.runOne(${test_id}) produced valid sha256`);
  }
  assert(posted === 4, "busPost called once per deterministic runner", `got ${posted}`);
}

// ──────────────────────────────────────────────────────────────────────
// Part 5 — bilateral match simulation: acer + "liris" rerun give same sha
// (confirming the runner really is a deterministic function of its
// input across process invocations — here same-process, but bytes are
// a pure function of the source so any process will agree).
// ──────────────────────────────────────────────────────────────────────

console.log("\n=== bilateral simulation — acer result equals liris rerun ===");
{
  const acerRun = await runUnisonTest("UNISON-TEST-001");
  const lirisRerun = await runUnisonTest("UNISON-TEST-001");
  assert(acerRun.sha256 === lirisRerun.sha256, "acer-side sha equals peer rerun sha for TEST-001");
  assert(acerRun.canonical_bytes === lirisRerun.canonical_bytes, "canonical_bytes byte-identical for TEST-001");
}

// ──────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────

console.log(`\n=== RESULTS ===`);
console.log(`pass=${pass} fail=${fail}`);
console.log(`\nsummary: built=${summary.built} deterministic=${summary.deterministic}`);
for (const nr of summary.not_ready) console.log(`  not-ready: ${nr.test_id} — ${nr.reason.slice(0, 100)}…`);
process.exit(fail === 0 ? 0 : 1);
