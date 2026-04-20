import { makeLedger, checkClaim, snapshotLedger, sweepLedger } from "../src/governance.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== M-governance per-actor quota tests ===\n");

const HOUR = 3600 * 1000;
const NOW = "2026-04-19T05:00:00Z";

// T1: empty ledger
console.log("T1: empty ledger");
const l1 = makeLedger(HOUR, 5, 10);
assert(l1.version === "m-governance-v1", "version");
assert(l1.soft_cap_per_actor === 5, "soft cap");
assert(l1.hard_cap_per_actor === 10, "hard cap");
assert(Object.keys(l1.actors).length === 0, "no actors");

// T2: first claim allowed
console.log("\nT2: first claim");
const d1 = checkClaim(l1, { actor: "a1", claim_name: "c1", at: NOW });
assert(d1.decision === "allow", "allow");
assert(d1.claims_in_window === 1, "1");
assert(d1.ledger.actors.a1.claim_log.length === 1, "1 logged");

// T3: up to soft cap
console.log("\nT3: up to soft cap");
let ledger = l1;
for (let i = 0; i < 5; i++) {
  const d = checkClaim(ledger, { actor: "a1", claim_name: `c${i}`, at: NOW });
  ledger = d.ledger;
  assert(d.decision === "allow", `claim ${i + 1} allow`);
}
assert(ledger.actors.a1.claims_in_window === 5, "5 claims");

// T4: soft cap breach → throttle
console.log("\nT4: throttle");
const d4 = checkClaim(ledger, { actor: "a1", claim_name: "c6", at: NOW });
assert(d4.decision === "throttle", "throttle");
assert(d4.claims_in_window === 6, "claim recorded");
assert(d4.glyph_sentence.includes("throttle"), "glyph throttle");
ledger = d4.ledger;

// T5: hard cap breach → refuse
console.log("\nT5: refuse at hard cap");
for (let i = 0; i < 4; i++) {
  const d = checkClaim(ledger, { actor: "a1", claim_name: `burst-${i}`, at: NOW });
  ledger = d.ledger;
}
// Now a1 should be at 10 (soft=5, hard=10). Next claim: projected=11 > hard=10 → refuse
const d5 = checkClaim(ledger, { actor: "a1", claim_name: "over", at: NOW });
assert(d5.decision === "refuse", "refuse");
assert(d5.claims_in_window === 10, "claims_in_window unchanged (refuse doesn't consume quota)");
assert(d5.glyph_sentence.includes("refuse"), "glyph refuse");

// T6: per-actor isolation
console.log("\nT6: per-actor isolation");
const d6 = checkClaim(ledger, { actor: "a2", claim_name: "fresh", at: NOW });
assert(d6.decision === "allow", "a2 still allowed");
ledger = d6.ledger;

// T7: cost parameter
console.log("\nT7: cost");
const l7 = makeLedger(HOUR, 10, 20);
const d7a = checkClaim(l7, { actor: "b", claim_name: "big", cost: 5, at: NOW });
assert(d7a.decision === "allow", "big claim allowed");
assert(d7a.claims_in_window === 5, "cost=5");
const d7b = checkClaim(d7a.ledger, { actor: "b", claim_name: "bigger", cost: 7, at: NOW });
assert(d7b.decision === "throttle", "over soft cap = throttle");
assert(d7b.claims_in_window === 12, "cost accrued");

// T8: window expiry
console.log("\nT8: window expiry");
let l8 = makeLedger(HOUR, 5, 10);
for (let i = 0; i < 5; i++) {
  const d = checkClaim(l8, { actor: "c", claim_name: `c${i}`, at: NOW });
  l8 = d.ledger;
}
// Advance past window
const futureTs = new Date(Date.parse(NOW) + 2 * HOUR).toISOString();
const dFuture = checkClaim(l8, { actor: "c", claim_name: "after-window", at: futureTs });
assert(dFuture.decision === "allow", "allowed after window");
assert(dFuture.claims_in_window === 1, "old claims expired");

// T9: partial window expiry
console.log("\nT9: partial expiry");
let l9 = makeLedger(HOUR, 5, 10);
// 3 claims at NOW
for (let i = 0; i < 3; i++) {
  const d = checkClaim(l9, { actor: "d", claim_name: `old-${i}`, at: NOW });
  l9 = d.ledger;
}
// 2 claims 30min later
const midTs = new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString();
for (let i = 0; i < 2; i++) {
  const d = checkClaim(l9, { actor: "d", claim_name: `mid-${i}`, at: midTs });
  l9 = d.ledger;
}
// Now 75min in — older 3 should have expired but later 2 still in window
const lateTs = new Date(Date.parse(NOW) + 75 * 60 * 1000).toISOString();
const dLate = checkClaim(l9, { actor: "d", claim_name: "late", at: lateTs });
assert(dLate.decision === "allow", "still allow");
assert(dLate.claims_in_window === 3, "3 claims in rolling window (2 mid + 1 new)");

// T10: snapshot
console.log("\nT10: snapshot");
const snap = snapshotLedger(ledger);
assert(snap.total_actors === 2, "a1 + a2");
assert(snap.over_soft.includes("a1"), "a1 over soft (10 > soft=5)");
assert(!snap.over_soft.includes("a2"), "a2 not over soft");

// T11: top users sort
console.log("\nT11: top users");
assert(snap.top_users[0].actor === "a1", "a1 is top");
assert(snap.top_users[0].claims_in_window >= snap.top_users[1].claims_in_window, "sorted desc");

// T12: sweepLedger
console.log("\nT12: sweepLedger");
const swept = sweepLedger(ledger, futureTs);
assert(swept.actors.a1.claims_in_window === 0, "a1 swept");
assert(swept.actors.a2.claims_in_window === 0, "a2 swept");

// T13: ledger purity
console.log("\nT13: purity");
const lPure = makeLedger(HOUR, 5, 10);
const d13 = checkClaim(lPure, { actor: "x", claim_name: "c", at: NOW });
assert(Object.keys(lPure.actors).length === 0, "original untouched");
assert(Object.keys(d13.ledger.actors).length === 1, "new ledger has actor");

// T14: glyph content
console.log("\nT14: glyph");
assert(d4.glyph_sentence.includes("actor=a1"), "actor in glyph");
assert(snap.glyph_sentence.includes("actors=2"), "count in glyph");

// T15: large workload
console.log("\nT15: 100-claim workload");
let l15 = makeLedger(HOUR, 50, 100);
let refusedCount = 0;
for (let i = 0; i < 150; i++) {
  const d = checkClaim(l15, { actor: "hammer", claim_name: `h${i}`, at: NOW });
  l15 = d.ledger;
  if (d.decision === "refuse") refusedCount++;
}
assert(refusedCount === 50, "last 50 refused (hard_cap=100)");
assert(l15.actors.hammer.claims_in_window === 100, "claims stuck at hard cap");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-M-GOVERNANCE-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
