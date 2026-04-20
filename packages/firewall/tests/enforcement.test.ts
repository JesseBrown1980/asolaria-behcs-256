import { inspect, gcExpired } from "../src/enforcement.ts";
import { evaluate, applyDecisions } from "../src/rules.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== L-002 firewall enforcement tests ===\n");

// Build some real blocks via L-001
const decisions = evaluate({
  source_kind: "drift-quorum",
  drift_quorum: { instance_sha256: "sha-BAD", distinct_signers: ["A", "B", "C"], distinct_key_ids: ["1", "2", "3"], verified_count: 3, first_observed_at: "t" },
});
const blocks = applyDecisions(decisions, "2026-04-19T00:00:00Z");

// T1: envelope targeting blocked subject → deny
console.log("T1: blocked subject → deny");
const r1 = inspect({
  envelope: { actor: "falcon", verb: "some-verb", body: { subject_permanent_name: "sha-BAD" } },
  active_blocks: blocks,
  subject_extractor: (e) => e.body?.subject_permanent_name,
  now: "2026-04-19T00:30:00Z",
});
assert(r1.allowed === false, "denied");
assert(r1.blocking_rule_id?.includes("R0") === true, "rule id present");
assert(r1.scope_hit === "subject", "scope=subject");

// T2: clean envelope → allow
console.log("\nT2: clean envelope → allow");
const r2 = inspect({
  envelope: { actor: "liris", verb: "hello", body: {} },
  active_blocks: blocks,
  now: "2026-04-19T00:30:00Z",
});
assert(r2.allowed === true, "allowed");
assert(r2.scope_hit === null, "no scope hit");
assert(r2.glyph_sentence.startsWith("EVT-FIREWALL-ALLOW"), "allow glyph");

// T3: actor-block overrides subject miss
console.log("\nT3: actor-scoped block");
const actorBlock = [{ rule_id: "TEST-actor", scope: "actor" as const, subject: "bad-actor", blocked_at: "2026-04-19T00:00:00Z", expires_at: "2026-04-19T02:00:00Z", reason: "test" }];
const r3 = inspect({
  envelope: { actor: "bad-actor", verb: "any", body: {} },
  active_blocks: actorBlock,
  now: "2026-04-19T00:30:00Z",
});
assert(r3.allowed === false, "actor denied");
assert(r3.scope_hit === "actor", "scope=actor");

// T4: expired block doesn't deny
console.log("\nT4: expired block skipped");
const r4 = inspect({
  envelope: { actor: "bad-actor", verb: "any", body: {} },
  active_blocks: actorBlock,
  now: "2026-04-19T03:00:00Z",  // 1h past expiry
});
assert(r4.allowed === true, "expired → allow");

// T5: gcExpired separates live from expired
console.log("\nT5: gcExpired");
const mixed = [
  { rule_id: "r1", scope: "subject" as const, subject: "x", blocked_at: "t", expires_at: "2026-04-18T00:00:00Z", reason: "old" },
  { rule_id: "r2", scope: "subject" as const, subject: "y", blocked_at: "t", expires_at: null, reason: "permanent" },
  { rule_id: "r3", scope: "subject" as const, subject: "z", blocked_at: "t", expires_at: "2099-01-01T00:00:00Z", reason: "future" },
];
const g = gcExpired(mixed, "2026-04-19T00:00:00Z");
assert(g.expired.length === 1, "1 expired");
assert(g.live.length === 2, "2 live (permanent + future)");
assert(g.live.some(b => b.expires_at === null), "permanent preserved");

// T6: default subject extractor reads common fields
console.log("\nT6: default extractor");
const r6 = inspect({
  envelope: { actor: "x", verb: "y", body: { instance_sha256: "sha-BAD" } },
  active_blocks: blocks,
  now: "2026-04-19T00:30:00Z",
});
assert(r6.allowed === false, "default extractor picks instance_sha256");

// T7: glyph sentences
console.log("\nT7: glyph shapes");
assert(r1.glyph_sentence.startsWith("EVT-FIREWALL-DENY"), "deny glyph");
assert(r1.glyph_sentence.includes("scope="), "scope=");
assert(r1.glyph_sentence.includes("rule="), "rule=");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L-002-ENFORCEMENT-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
