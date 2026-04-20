import { ingressCheck } from "../src/ingress.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Q-002 ingress schema-check tests ===\n");

// T1: valid envelope accepted in reject mode
console.log("T1: valid accepted in reject mode");
const r1 = ingressCheck({
  envelope: {
    verb: "shannon-scan-dispatch", actor: "liris", target: "acer",
    body: { scan_id: "s1", spawn_request: {}, l0_l2_verdicts: [] },
  },
  enforce_mode: "reject",
});
assert(r1.action === "accept", "accepted");
assert(r1.matched_contract === "shannon-scan-dispatch", "contract matched");
assert(r1.http_response.status === 200, "HTTP 200");

// T2: drift rejected in reject mode
console.log("\nT2: drift → HTTP 400 in reject mode");
const r2 = ingressCheck({
  envelope: { verb: "shannon-scan-dispatch", actor: "x", target: "liris", body: {} }, // target wrong, body incomplete
  enforce_mode: "reject",
});
assert(r2.action === "reject", "rejected");
assert(r2.http_response.status === 400, "HTTP 400");
assert(r2.validation?.violations.length && r2.validation.violations.length > 0, "violations listed");

// T3: same drift passes in observe mode
console.log("\nT3: drift observed in observe mode");
const r3 = ingressCheck({
  envelope: { verb: "shannon-scan-dispatch", actor: "x", target: "liris", body: {} },
  enforce_mode: "observe",
});
assert(r3.action === "accept", "observed accept");
assert(r3.http_response.status === 200, "HTTP 200");
assert(r3.glyph_sentence.includes("OBSERVED"), "glyph says OBSERVED");

// T4: same drift warns in warn mode
console.log("\nT4: drift warned in warn mode");
const r4 = ingressCheck({
  envelope: { verb: "shannon-scan-dispatch", actor: "x", target: "liris", body: {} },
  enforce_mode: "warn",
});
assert(r4.action === "warn", "warn");
assert(r4.http_response.status === 200, "HTTP 200 (warn doesn't block)");
assert(r4.glyph_sentence.includes("WARNED"), "glyph says WARNED");

// T5: unknown verb passes with "no contract" accept
console.log("\nT5: unknown verb accepted");
const r5 = ingressCheck({
  envelope: { verb: "custom-new-verb", actor: "x", target: "y" },
  enforce_mode: "reject",
});
assert(r5.action === "accept", "unknown verb accepted");
assert(r5.matched_contract === null, "no contract matched");

// T6: missing verb accepted
console.log("\nT6: missing verb accepted");
const r6 = ingressCheck({
  envelope: { actor: "x", target: "y" },
  enforce_mode: "reject",
});
assert(r6.action === "accept", "no verb accepted");

// T7: shannon-scan-result valid accepted
console.log("\nT7: scan-result valid");
const r7 = ingressCheck({
  envelope: {
    verb: "shannon-scan-result", actor: "acer", target: "liris",
    body: { scan_id: "s", acer_verdict: "promote", reason: "r", l3: {}, l4: {} },
  },
  enforce_mode: "reject",
});
assert(r7.action === "accept", "scan-result accepted");

// T8: scan-result bad verdict rejected
console.log("\nT8: scan-result bad verdict rejected");
const r8 = ingressCheck({
  envelope: {
    verb: "shannon-scan-result", actor: "acer", target: "liris",
    body: { scan_id: "s", acer_verdict: "bogus", reason: "r", l3: {}, l4: {} },
  },
  enforce_mode: "reject",
});
assert(r8.action === "reject", "bogus verdict rejected");

// T9: glyph shape
console.log("\nT9: glyph shape");
assert(r1.glyph_sentence.startsWith("EVT-INGRESS-SCHEMA"), "starts EVT-INGRESS-SCHEMA");
assert(r1.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends mood");

// T10: custom verb_to_contract mapping
console.log("\nT10: custom verb mapping");
const r10 = ingressCheck({
  envelope: { verb: "my-aliased-verb", actor: "x", target: "acer", body: { scan_id: "s", spawn_request: {}, l0_l2_verdicts: [] } },
  enforce_mode: "reject",
  verb_to_contract: { "my-aliased-verb": "shannon-scan-dispatch" },
});
assert(r10.matched_contract === "shannon-scan-dispatch", "aliased to dispatch contract");

// T11: migration-intent-ack accepted
console.log("\nT11: migration-intent-ack valid");
const r11 = ingressCheck({
  envelope: {
    verb: "migration-intent-ack", operator: "amy", plan: {}, ack_ts: "t", window_expires_at: "t",
  },
  enforce_mode: "reject",
});
assert(r11.action === "accept", "amy ack accepted");

// T12: migration-intent-ack stranger rejected
console.log("\nT12: stranger operator rejected");
const r12 = ingressCheck({
  envelope: { verb: "migration-intent-ack", operator: "stranger", plan: {}, ack_ts: "t", window_expires_at: "t" },
  enforce_mode: "reject",
});
assert(r12.action === "reject", "stranger rejected");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-Q-002-INGRESS-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
