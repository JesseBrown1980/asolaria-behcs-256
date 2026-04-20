import { emptyGuardrailCounters, foldGuardrail, recordVariantGate, recordQuota, recordWatchdog, summaryGlyph, explainWhyBlocked, type GuardrailGateEvent } from "../src/audit.ts";
import { variantGate } from "../src/death-spiral.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== M-acer-audit death-spiral audit tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

// T1: record variant gate ALLOW event
console.log("T1: record variant gate allow");
const cleanDecision = variantGate({ claim_name: "L-003" });
const allowEv = recordVariantGate({ claim_name: "L-003", at: NOW }, cleanDecision);
assert(allowEv.gate === "variant", "gate=variant");
assert(allowEv.allowed === true, "allowed");
assert(allowEv.claim_name === "L-003", "claim name preserved");
assert(allowEv.ts === NOW, "ts stamped");

// T2: record variant gate BLOCK event
console.log("\nT2: record variant gate block");
const blockDecision = variantGate({ claim_name: "L-001-Recovery", parent_name: "L-001", parent_status: "CLAIMED" });
const blockEv = recordVariantGate({ claim_name: "L-001-Recovery", parent_name: "L-001", parent_status: "CLAIMED", at: NOW }, blockDecision);
assert(blockEv.allowed === false, "blocked");
assert(blockEv.matched_pattern !== null, "pattern captured");
assert(blockEv.parent_name === "L-001", "parent name");

// T3: record quota event
console.log("\nT3: record quota");
const qEv = recordQuota({
  actor: "acer", claim_name: "N-099", used: 6, limit: 5,
  allowed: false, reason: "over quota",
  at: NOW, glyph: "EVT-QUOTA-BLOCK · claim=N-099 @ M-EYEWITNESS .",
});
assert(qEv.gate === "quota", "gate=quota");
assert(qEv.quota_used === 6 && qEv.quota_limit === 5, "quota numbers");
assert(qEv.allowed === false, "blocked");

// T4: record watchdog event
console.log("\nT4: record watchdog");
const wEv = recordWatchdog({
  claim_name: "big-merge", tokens: 50000, budget: 40000,
  allowed: false, reason: "context over budget",
  at: NOW, glyph: "EVT-WATCHDOG-BLOCK · claim=big-merge @ M-EYEWITNESS .",
});
assert(wEv.gate === "watchdog", "gate=watchdog");
assert(wEv.context_tokens === 50000, "tokens captured");
assert(wEv.context_budget === 40000, "budget captured");

// T5: counter fold across events
console.log("\nT5: counter fold");
let c = emptyGuardrailCounters();
c = foldGuardrail(c, allowEv);
c = foldGuardrail(c, blockEv);
c = foldGuardrail(c, blockEv);
c = foldGuardrail(c, qEv);
c = foldGuardrail(c, wEv);
assert(c.total === 5, "total=5");
assert(c.allowed === 1, "allowed=1");
assert(c.blocked === 4, "blocked=4");
assert(c.by_gate.variant.total === 3, "variant gate total");
assert(c.by_gate.variant.blocked === 2, "variant blocks");
assert(c.by_gate.quota.total === 1, "quota total");
assert(c.by_gate.watchdog.total === 1, "watchdog total");
assert(c.by_claim["L-001-Recovery"] === 2, "compat claim counted twice");

// T6: summary glyph
console.log("\nT6: summary glyph");
const glyph = summaryGlyph(c);
assert(glyph.startsWith("EVT-GUARDRAIL-AUDIT-SUMMARY"), "glyph prefix");
assert(glyph.includes("total=5"), "total in glyph");
assert(glyph.includes("blocked=4"), "blocked in glyph");
assert(glyph.includes("gates=3"), "3 distinct gates");

// T7: explainWhyBlocked for variant pattern
console.log("\nT7: explain variant block");
const events: GuardrailGateEvent[] = [allowEv, blockEv, qEv, wEv];
const why1 = explainWhyBlocked(events, "L-001-Recovery");
assert(why1.found === true, "found block");
assert(why1.human_explanation.includes("death-spiral"), "mentions death-spiral");
assert(why1.human_explanation.includes("FAILED or DEFERRED"), "gives unblock hint");

// T8: explainWhyBlocked for quota
console.log("\nT8: explain quota block");
const why2 = explainWhyBlocked(events, "N-099");
assert(why2.found === true, "found quota block");
assert(why2.human_explanation.includes("quota"), "mentions quota");
assert(why2.human_explanation.includes("6/5"), "mentions exact numbers");

// T9: explainWhyBlocked for watchdog
console.log("\nT9: explain watchdog block");
const why3 = explainWhyBlocked(events, "big-merge");
assert(why3.found === true, "found watchdog block");
assert(why3.human_explanation.includes("context watchdog"), "mentions watchdog");
assert(why3.human_explanation.includes("50000/40000"), "mentions numbers");

// T10: explainWhyBlocked when no block record
console.log("\nT10: no block found");
const why4 = explainWhyBlocked(events, "never-attempted");
assert(why4.found === false, "not found");
assert(why4.human_explanation.includes("no block event"), "explanation mentions absence");

// T11: explain returns most recent block if multiple
console.log("\nT11: most recent block wins");
const ev1 = recordVariantGate({ claim_name: "X-001", at: "2026-04-19T01:00:00Z" }, variantGate({ claim_name: "X-001-Alt", parent_name: "X-001", parent_status: "CLAIMED" }));
ev1.claim_name = "X-001";
const ev2 = recordVariantGate({ claim_name: "X-001", at: "2026-04-19T04:00:00Z" }, variantGate({ claim_name: "X-001-V2", parent_name: "X-001", parent_status: "CLAIMED" }));
ev2.claim_name = "X-001";
const why5 = explainWhyBlocked([ev1, ev2], "X-001");
assert(why5.last_block?.ts === "2026-04-19T04:00:00Z", "newer block wins");

// T12: pattern tallying across many events
console.log("\nT12: pattern counts");
const patCtr = [blockEv, blockEv, blockEv].reduce(foldGuardrail, emptyGuardrailCounters());
const patKey = Object.keys(patCtr.by_pattern)[0];
assert(patCtr.by_pattern[patKey] === 3, "pattern counter=3");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-M-AUDIT-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
