import { DEFAULT_RULES, evaluate, applyDecisions, isBlocked } from "../src/rules.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== L-001 firewall rule-engine tests ===\n");

// T1: cosign RED with 1 reason → R01 fires
console.log("T1: RED 1 reason → R01");
const d1 = evaluate({
  source_kind: "cosign-audit",
  cosign_audit: { verdict: "RED", red_reasons: ["rolling-chain break at seq=5"], yellow_reasons: [], chain_source: "liris:9999" },
});
assert(d1.length >= 1, "at least 1 decision");
assert(d1.some(d => d.rule_id.includes("R01")), "R01 present");
assert(d1[0].glyph_sentence.startsWith("EVT-FIREWALL-BLOCK"), "glyph EVT-FIREWALL-BLOCK");

// T2: cosign RED with 3+ reasons → R01 + R02 fire
console.log("\nT2: RED 3+ reasons → R01 + R02");
const d2 = evaluate({
  source_kind: "cosign-audit",
  cosign_audit: { verdict: "RED", red_reasons: ["a", "b", "c"], yellow_reasons: [], chain_source: "src" },
});
const ruleIds = d2.map(d => d.rule_id);
assert(ruleIds.some(r => r.includes("R01")), "R01 fires");
assert(ruleIds.some(r => r.includes("R02")), "R02 fires");

// T3: cosign YELLOW → no rule fires
console.log("\nT3: YELLOW → no block");
const d3 = evaluate({
  source_kind: "cosign-audit",
  cosign_audit: { verdict: "YELLOW", red_reasons: [], yellow_reasons: ["unsigned-majority"], chain_source: "src" },
});
assert(d3.length === 0, "no decisions on YELLOW");

// T4: drift 2-signer quorum → R03
console.log("\nT4: 2-signer quorum → R03");
const d4 = evaluate({
  source_kind: "drift-quorum",
  drift_quorum: { instance_sha256: "sha-XYZ", distinct_signers: ["DEV-ACER", "DEV-LIRIS"], distinct_key_ids: ["k1", "k2"], verified_count: 2, first_observed_at: "t" },
});
assert(d4.some(d => d.rule_id.includes("R03")), "R03 fires");
assert(d4[0].subject === "sha-XYZ", "subject is instance_sha256");

// T5: drift 3-signer quorum → R03 + R04 (permanent)
console.log("\nT5: 3-signer quorum → R03 + R04 permanent");
const d5 = evaluate({
  source_kind: "drift-quorum",
  drift_quorum: { instance_sha256: "sha-HARD", distinct_signers: ["A", "B", "C"], distinct_key_ids: ["1","2","3"], verified_count: 3, first_observed_at: "t" },
});
const r04 = d5.find(d => d.rule_id.includes("R04"));
assert(r04 !== undefined, "R04 present");
assert(r04?.duration_s === 0, "R04 duration_s=0 permanent");

// T6: drift 1-signer → no R03 or R04
console.log("\nT6: 1-signer → no drift-quorum rule");
const d6 = evaluate({
  source_kind: "drift-quorum",
  drift_quorum: { instance_sha256: "sha-LONE", distinct_signers: ["A"], distinct_key_ids: ["1"], verified_count: 1, first_observed_at: null },
});
assert(d6.length === 0, "single-signer not quorum");

// T7: applyDecisions → ActiveBlock with correct expiry
console.log("\nT7: applyDecisions expiry");
const blocks = applyDecisions(d5, "2026-04-19T00:00:00Z");
assert(blocks.length === 2, "2 active blocks (R03 + R04)");
const permanent = blocks.find(b => b.expires_at === null);
const timed = blocks.find(b => b.expires_at !== null);
assert(permanent !== undefined, "permanent block present");
assert(timed !== undefined, "timed block present");
assert(timed?.expires_at === "2026-04-19T01:00:00.000Z", "timed expires 1h later (R03 3600s)");

// T8: isBlocked matches subject
console.log("\nT8: isBlocked by subject");
const match = isBlocked(blocks, { subject: "sha-HARD", now: "2026-04-19T00:30:00Z" });
assert(match !== null, "subject matched");
assert(match?.rule_id.includes("R03") || match?.rule_id.includes("R04"), "matched rule");

// T9: isBlocked skips expired
console.log("\nT9: expired block skipped");
const skipped = isBlocked(blocks.filter(b => b.rule_id.includes("R03")), { subject: "sha-HARD", now: "2026-04-19T03:00:00Z" });
assert(skipped === null, "R03 expired at 3h mark");

// T10: manual block fires
console.log("\nT10: manual rule requires matching rule — no default manual, so 0");
const d10 = evaluate({
  source_kind: "manual",
  manual: { reason: "operator decision", subject: "AGT-X" },
});
assert(d10.length === 0, "no default manual rule; operator must add custom");

// T11: custom manual rule wired in
console.log("\nT11: custom manual rule");
const customRules = [...DEFAULT_RULES, {
  id: "CUSTOM-manual",
  when: { source_kind: "manual" as const },
  block: { scope: "subject" as const, duration_s: 600, reason_prefix: "operator-manual" },
}];
const d11 = evaluate({
  source_kind: "manual",
  manual: { reason: "operator decision", subject: "AGT-X" },
}, customRules);
assert(d11.length === 1, "custom manual rule fires");
assert(d11[0].subject === "AGT-X", "subject threaded");

// T12: glyph_sentence shape
console.log("\nT12: glyph_sentence shape");
assert(d1[0].glyph_sentence.includes("rule="), "has rule=");
assert(d1[0].glyph_sentence.includes("scope="), "has scope=");
assert(d1[0].glyph_sentence.includes("subject="), "has subject=");
assert(d1[0].glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends mood");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L-001-FIREWALL-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
