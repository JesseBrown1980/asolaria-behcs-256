import { variantGate, checkQuota, watchdog, DEATH_SPIRAL_PATTERNS } from "../src/death-spiral.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== M-acer death-spiral guardrails tests ===\n");

// T1: clean claim passes variant-gate
console.log("T1: clean claim allowed");
const v1 = variantGate({ claim_name: "L-001", parent_name: "L-section" });
assert(v1.allow === true, "clean allowed");
assert(v1.matched_pattern === null, "no pattern");

// T2: *V2 blocked without FAILED parent
console.log("\nT2: *V2 blocked w/o FAILED parent");
const v2 = variantGate({ claim_name: "G-087V2", parent_name: "G-087", parent_status: "COMPLETE" });
assert(v2.allow === false, "V2 blocked");
assert(v2.glyph_sentence.includes("EVT-VARIANT-GATE-BLOCK"), "block glyph");

// T3: *V2 allowed when parent FAILED
console.log("\nT3: *V2 allowed after FAILED parent");
const v3 = variantGate({ claim_name: "G-087V2", parent_name: "G-087", parent_status: "FAILED" });
assert(v3.allow === true, "V2 allowed post-FAIL");
assert(v3.glyph_sentence.includes("POST-FAILED"), "post-failed glyph");

// T4: *Recovery blocked without DEFERRED
console.log("\nT4: *Recovery blocked");
const v4 = variantGate({ claim_name: "G-087Recovery", parent_name: "G-087", parent_status: "OPEN" });
assert(v4.allow === false, "Recovery blocked");

// T5: *Recovery allowed with DEFERRED
console.log("\nT5: *Recovery allowed after DEFERRED");
const v5 = variantGate({ claim_name: "G-087Recovery", parent_name: "G-087", parent_status: "DEFERRED" });
assert(v5.allow === true, "Recovery allowed post-DEFER");

// T6: *.livecopy + -slice + -retry all pattern-matched
console.log("\nT6: multiple death-spiral patterns");
assert(variantGate({ claim_name: "foo.livecopy", parent_status: "OPEN" }).allow === false, ".livecopy blocked");
assert(variantGate({ claim_name: "bar-slice", parent_status: "OPEN" }).allow === false, "-slice blocked");
assert(variantGate({ claim_name: "baz-retry", parent_status: "OPEN" }).allow === false, "-retry blocked");

// T7: Alt suffix
console.log("\nT7: Alt suffix");
assert(variantGate({ claim_name: "PaymentAlt", parent_status: "OPEN" }).allow === false, "Alt blocked");
assert(variantGate({ claim_name: "alt-nothing-to-see" }).allow === true, "Alt prefix OK");

// T8: quota allows under limit
console.log("\nT8: quota allows under 5");
const q1 = checkQuota({
  actor: "acer",
  active_claims: [
    { actor: "acer", claimed_at: new Date().toISOString(), status: "CLAIMED" },
    { actor: "acer", claimed_at: new Date().toISOString(), status: "OPEN" },
  ],
});
assert(q1.allow === true, "2/5 allowed");
assert(q1.active_count === 2, "active=2");

// T9: quota blocks at limit
console.log("\nT9: quota blocks at 5");
const claims = [1,2,3,4,5].map(() => ({ actor: "acer", claimed_at: new Date().toISOString(), status: "CLAIMED" as const }));
const q2 = checkQuota({ actor: "acer", active_claims: claims });
assert(q2.allow === false, "5/5 blocks");

// T10: quota ignores completed/failed claims
console.log("\nT10: quota ignores COMPLETE/FAILED");
const mixed = [
  { actor: "acer", claimed_at: new Date().toISOString(), status: "COMPLETE" as const },
  { actor: "acer", claimed_at: new Date().toISOString(), status: "COMPLETE" as const },
  { actor: "acer", claimed_at: new Date().toISOString(), status: "OPEN" as const },
];
const q3 = checkQuota({ actor: "acer", active_claims: mixed });
assert(q3.active_count === 1, "only 1 active (OPEN)");
assert(q3.allow === true, "allowed");

// T11: quota scoped to actor
console.log("\nT11: quota per-actor");
const multi = [
  { actor: "acer", claimed_at: new Date().toISOString(), status: "OPEN" as const },
  { actor: "liris", claimed_at: new Date().toISOString(), status: "OPEN" as const },
  { actor: "liris", claimed_at: new Date().toISOString(), status: "OPEN" as const },
];
const q4 = checkQuota({ actor: "acer", active_claims: multi });
assert(q4.active_count === 1, "only acer-claimed counted");

// T12: watchdog healthy when claims spread
console.log("\nT12: watchdog healthy");
const now = new Date().toISOString();
const w1 = watchdog({
  actor: "acer",
  claim_history: [
    { claim_name: "L-001", claimed_at: now, status: "CLAIMED" },
    { claim_name: "I-001", claimed_at: now, status: "CLAIMED" },
    { claim_name: "N-001", claimed_at: now, status: "CLAIMED" },
  ],
});
assert(w1.healthy === true, "spread = healthy");
assert(w1.alerts.length === 0, "no alerts");

// T13: watchdog alerts on same-parent churn
console.log("\nT13: watchdog churn alert");
const w2 = watchdog({
  actor: "acer",
  claim_history: [
    { claim_name: "G-087", claimed_at: now, status: "FAILED" },
    { claim_name: "G-087V2", claimed_at: now, status: "FAILED" },
    { claim_name: "G-087V3", claimed_at: now, status: "FAILED" },
    { claim_name: "G-087V4", claimed_at: now, status: "OPEN" },
  ],
});
assert(w2.healthy === false, "churn flagged");
assert(w2.alerts.length >= 1, "alert present");
assert(w2.same_parent_churn["G-087"] === 4, "4 on G-087 parent");

// T14: DEATH_SPIRAL_PATTERNS array exported non-empty
console.log("\nT14: patterns exported");
assert(DEATH_SPIRAL_PATTERNS.length >= 5, "at least 5 patterns");
assert(DEATH_SPIRAL_PATTERNS.every(p => p instanceof RegExp), "all regexes");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-M-ACER-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
