#!/usr/bin/env node
// Extended SLOGate tests — P0 + P1 audit fixes
// Covers: whitelist OP-HALT, reset API, U-007 thresholds, U-009/U-011/U-012/U-013/U-014.

import { SLOGate } from "../src/slo-gate.mjs";

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label); }
}

// ============================================================
// P0 — OP-HALT whitelist (no longer self-trips on arbitrary payload)
// ============================================================
console.log("\n=== P0: OP-HALT whitelist ===");
{
  const slo = new SLOGate();
  slo.observeVerb("EVT-PLAN-DESCRIBES-HALT");  // contains "-HALT" but is NOT a halt op
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-008-op-halt"),
    "payload mentioning -HALT does NOT trip U-008");
}
{
  const slo = new SLOGate();
  slo.observeVerb("EVT-DAILY-SUMMARY-HALT-COUNT");  // descriptive, not emit
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-008-op-halt"),
    "descriptive -HALT verb does NOT trip U-008");
}
{
  const slo = new SLOGate();
  slo.observeVerb("OP-HALT");
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-008-op-halt"),
    "exact OP-HALT DOES trip U-008");
}
{
  const slo = new SLOGate();
  slo.observeVerb("EVT-HALT");
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-008-op-halt"),
    "exact EVT-HALT DOES trip U-008");
}
{
  const slo = new SLOGate();
  slo.observeVerb("EVT-PEER-SENTINEL-HALT-EMIT");
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-008-op-halt"),
    "regex match EVT-*-HALT-EMIT DOES trip U-008");
}

// ============================================================
// P0 — reset API
// ============================================================
console.log("\n=== P0: reset API ===");
{
  const slo = new SLOGate({ mem_threshold_mb: 100, mem_duration_ms: 10 });
  slo.observeMem(50);
  await new Promise(r => setTimeout(r, 30));
  slo.observeMem(50);
  slo.observeVerb("OP-HALT");
  slo.observeSchemaDrift(true);
  const e_before = slo.evaluate();
  assert(e_before.any_fired, "before reset: predicates fired");

  const r1 = slo.reset("U-008-op-halt");
  assert(r1.ok, "reset('U-008-op-halt') returns ok");
  const e_mid = slo.evaluate();
  assert(!e_mid.tripped_predicates.includes("U-008-op-halt"),
    "after reset('U-008'): U-008 cleared");
  assert(e_mid.tripped_predicates.includes("U-010-schema-drift"),
    "schema-drift still fires post single-reset");

  slo.clearAll();
  const e_after = slo.evaluate();
  assert(!e_after.any_fired, "clearAll() clears EVERYTHING");

  const snap = slo.snapshot();
  assert(snap.mem_low_since_ms === null, "clearAll zeros _low_mem_since_ms");
  assert(snap.err_window_samples === 0, "clearAll zeros _err_events");
  assert(snap.op_halt_seen === false, "clearAll zeros _op_halt_seen");
  assert(snap.schema_drift_seen === false, "clearAll zeros _schema_drift_seen");

  const bad = slo.reset("U-999-fake");
  assert(bad.ok === false, "reset on unknown predicate returns ok:false");

  // reset() with no arg == clearAll
  slo.observeVerb("OP-HALT");
  const r2 = slo.reset();
  assert(r2.ok && r2.reset === "ALL", "reset() w/o arg behaves as clearAll");
}

// ============================================================
// P1 — U-007 lowered to 5 samples + full-saturation shortcut
// ============================================================
console.log("\n=== P1: U-007 window thresholds ===");
{
  const slo = new SLOGate({ err_window_ms: 60_000 });
  // 3 samples, all errors: should fire via saturation shortcut
  for (let i = 0; i < 3; i++) slo.observeEvent({ is_error: true });
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-007-err-10pct"),
    "3/3 errors (full saturation, count>=3) trips U-007");
}
{
  const slo = new SLOGate({ err_window_ms: 60_000 });
  // 2 errors only: below saturation min, should NOT fire
  for (let i = 0; i < 2; i++) slo.observeEvent({ is_error: true });
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-007-err-10pct"),
    "2/2 errors (below saturation min) does NOT trip");
}
{
  const slo = new SLOGate({ err_window_ms: 60_000 });
  // 5 samples, 1 error → 20%, above 10% threshold → fires (proves >=5 min works)
  slo.observeEvent({ is_error: true });
  for (let i = 0; i < 4; i++) slo.observeEvent({ is_error: false });
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-007-err-10pct"),
    "5 samples at 20% err ratio trips U-007 (min lowered from 10 to 5)");
}
{
  const slo = new SLOGate({ err_window_ms: 60_000 });
  // 4 samples, all errors: min=5 but saturation=3 → saturation wins
  for (let i = 0; i < 4; i++) slo.observeEvent({ is_error: true });
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-007-err-10pct"),
    "4/4 errors trips via saturation shortcut");
}

// ============================================================
// P1 — U-009 law-violation (3 in 60s)
// ============================================================
console.log("\n=== P1: U-009 law-violation ===");
{
  const slo = new SLOGate();
  slo.observeLawViolation("auth");
  slo.observeLawViolation("quorum");
  const e1 = slo.evaluate();
  assert(!e1.tripped_predicates.includes("U-009-law-violation"),
    "2 law violations: below threshold");
  slo.observeLawViolation("schema");
  const e2 = slo.evaluate();
  assert(e2.tripped_predicates.includes("U-009-law-violation"),
    "3 law violations: trips U-009");
}
{
  const slo = new SLOGate({ law_window_ms: 20, law_threshold: 2 });
  slo.observeLawViolation("a");
  slo.observeLawViolation("b");
  await new Promise(r => setTimeout(r, 40));
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-009-law-violation"),
    "law violations expire from window");
}

// ============================================================
// P1 — U-011 peer-flap (5 flaps/30s for one peer)
// ============================================================
console.log("\n=== P1: U-011 peer-flap ===");
{
  const slo = new SLOGate();
  for (let i = 0; i < 4; i++) slo.observePeerFlap("liris", i % 2 ? "ALIVE" : "DARK");
  const e1 = slo.evaluate();
  assert(!e1.tripped_predicates.includes("U-011-peer-flap"),
    "4 flaps: below threshold");
  slo.observePeerFlap("liris", "ALIVE");
  const e2 = slo.evaluate();
  assert(e2.tripped_predicates.includes("U-011-peer-flap"),
    "5 flaps single peer: trips U-011");
}
{
  const slo = new SLOGate();
  // flaps spread across peers do not individually hit threshold
  for (let i = 0; i < 4; i++) slo.observePeerFlap("liris", "X");
  for (let i = 0; i < 4; i++) slo.observePeerFlap("falcon", "X");
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-011-peer-flap"),
    "flaps distributed across peers do NOT aggregate to trip");
}

// ============================================================
// P1 — U-012 quorum-split
// ============================================================
console.log("\n=== P1: U-012 quorum-split ===");
{
  const slo = new SLOGate();
  const e0 = slo.evaluate();
  assert(!e0.tripped_predicates.includes("U-012-quorum-split"),
    "no quorum-split by default");
  slo.observeQuorumSplit("acer-liris:artifact.json");
  const e1 = slo.evaluate();
  assert(e1.tripped_predicates.includes("U-012-quorum-split"),
    "observeQuorumSplit trips U-012");
  assert(slo.snapshot().split_artifact === "acer-liris:artifact.json",
    "artifact recorded in snapshot");
  slo.reset("U-012-quorum-split");
  const e2 = slo.evaluate();
  assert(!e2.tripped_predicates.includes("U-012-quorum-split"),
    "reset('U-012') clears quorum-split");
}

// ============================================================
// P1 — U-013 cadence-floor
// ============================================================
console.log("\n=== P1: U-013 cadence-floor ===");
{
  const slo = new SLOGate({ cadence_floor_ms: 5_000, cadence_floor_duration_ms: 30 });
  slo.observeCadenceFloor(3_000);
  await new Promise(r => setTimeout(r, 50));
  slo.observeCadenceFloor(3_000);  // still below floor, sustained
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-013-cadence-floor"),
    "cadence below 5s sustained past duration: trips U-013");
}
{
  const slo = new SLOGate({ cadence_floor_ms: 5_000, cadence_floor_duration_ms: 30 });
  slo.observeCadenceFloor(3_000);
  slo.observeCadenceFloor(8_000);  // recovered → timer resets
  await new Promise(r => setTimeout(r, 50));
  slo.observeCadenceFloor(8_000);
  const e = slo.evaluate();
  assert(!e.tripped_predicates.includes("U-013-cadence-floor"),
    "cadence recovered above floor: does not trip");
}

// ============================================================
// P1 — U-014 state-file-staleness
// ============================================================
console.log("\n=== P1: U-014 state-file-staleness ===");
{
  const slo = new SLOGate();
  slo.observeStateFileAge(60_000);
  const e1 = slo.evaluate();
  assert(!e1.tripped_predicates.includes("U-014-state-file-staleness"),
    "60s age: below 120s threshold");
  slo.observeStateFileAge(200_000);
  const e2 = slo.evaluate();
  assert(e2.tripped_predicates.includes("U-014-state-file-staleness"),
    "200s age: over 120s threshold → trips U-014");
  slo.reset("U-014-state-file-staleness");
  const e3 = slo.evaluate();
  assert(!e3.tripped_predicates.includes("U-014-state-file-staleness"),
    "reset('U-014') clears staleness");
}

// ============================================================
// Backward compatibility sanity
// ============================================================
console.log("\n=== backward-compat ===");
{
  const slo = new SLOGate({ mem_threshold_mb: 100, mem_duration_ms: 30, err_window_ms: 1000 });
  slo.observeMem(50);
  await new Promise(r => setTimeout(r, 50));
  slo.observeMem(50);
  const e = slo.evaluate();
  assert(e.tripped_predicates.includes("U-006-mem"),
    "U-006 memory predicate still works (backward compat)");
}

console.log(`\n=== RESULTS ===`);
console.log(`pass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
