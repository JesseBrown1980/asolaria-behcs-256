import {
  validateEnvelope, findContract,
  SHANNON_SCAN_DISPATCH, SHANNON_SCAN_RESULT, DRIFT_DETECTED,
  SIGNED_ENVELOPE_SIBLING, COSIGN_ENTRY, MIGRATION_INTENT_ACK,
  ALL_CONTRACTS,
} from "../src/contracts.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Q-001 schema-contracts tests ===\n");

// T1: shannon-scan-dispatch happy
console.log("T1: shannon-scan-dispatch happy");
const r1 = validateEnvelope({
  verb: "shannon-scan-dispatch",
  actor: "liris-shannon-civ",
  target: "acer",
  body: {
    scan_id: "s1",
    spawn_request: { profile_name: "shannon-recon" },
    l0_l2_verdicts: [{ layer: "L0", decision: "pass" }],
  },
  glyph_sentence: "EVT-... @ M-E .",
}, SHANNON_SCAN_DISPATCH);
assert(r1.ok === true, "valid passes", r1.violations.map(v => v.field).join(","));

// T2: shannon-scan-dispatch missing body.scan_id → violation
console.log("\nT2: missing body.scan_id");
const r2 = validateEnvelope({
  verb: "shannon-scan-dispatch", actor: "x", target: "acer",
  body: { spawn_request: {}, l0_l2_verdicts: [] },
}, SHANNON_SCAN_DISPATCH);
assert(r2.ok === false, "missing scan_id flagged");
assert(r2.violations.some(v => v.field.includes("scan_id")), "violation names scan_id");

// T3: wrong target rejected
console.log("\nT3: target=liris rejected for shannon-scan-dispatch");
const r3 = validateEnvelope({
  verb: "shannon-scan-dispatch", actor: "x", target: "liris",
  body: { scan_id: "s", spawn_request: {}, l0_l2_verdicts: [] },
}, SHANNON_SCAN_DISPATCH);
assert(r3.ok === false, "wrong target rejected");
assert(r3.violations.some(v => v.kind === "bad_enum" && v.field === "target"), "bad_enum on target");

// T4: shannon-scan-result happy
console.log("\nT4: shannon-scan-result happy");
const r4 = validateEnvelope({
  verb: "shannon-scan-result",
  actor: "acer",
  target: "liris",
  body: {
    scan_id: "s1", acer_verdict: "promote", reason: "all good", l3: {}, l4: {},
  },
}, SHANNON_SCAN_RESULT);
assert(r4.ok === true, "valid result passes");

// T5: shannon-scan-result bad verdict
console.log("\nT5: bad acer_verdict");
const r5 = validateEnvelope({
  verb: "shannon-scan-result", actor: "acer", target: "liris",
  body: { scan_id: "s", acer_verdict: "maybe", reason: "r", l3: {}, l4: {} },
}, SHANNON_SCAN_RESULT);
assert(r5.ok === false, "bad verdict rejected");
assert(r5.violations.some(v => v.kind === "bad_enum"), "bad_enum on acer_verdict");

// T6: drift-detected happy
console.log("\nT6: drift-detected happy");
const r6 = validateEnvelope({
  actor: "acer", verb: "drift-detected", target: "federation",
  detection: {
    permanent_name: "subj", hilbert_pid: "PID-X",
    instance_sha256: "a".repeat(64),
    drift_kind: "verify_failed",
  },
}, DRIFT_DETECTED);
assert(r6.ok === true, "valid drift");

// T7: drift-detected bad drift_kind
console.log("\nT7: bad drift_kind");
const r7 = validateEnvelope({
  actor: "acer", verb: "drift-detected", target: "federation",
  detection: { permanent_name: "s", hilbert_pid: "p", instance_sha256: "a".repeat(64), drift_kind: "bogus" },
}, DRIFT_DETECTED);
assert(r7.ok === false, "bad drift_kind");

// T8: signed-envelope-sibling — verb AT TOP LEVEL + entry_sig SIBLING
console.log("\nT8: signed-envelope-sibling happy");
const r8 = validateEnvelope({
  verb: "anything",
  entry_sig: { key_id: "k1", sig_b64: "YWJj", alg: "ed25519", signed_at: "2026-04-19T00:00:00Z" },
}, SIGNED_ENVELOPE_SIBLING);
assert(r8.ok === true, "sibling shape passes");

// T9: signed-envelope wrapper shape FAILS contract (this is the G-088 anti-pattern)
console.log("\nT9: wrapper shape fails (G-088 anti-pattern)");
const r9 = validateEnvelope({
  payload: { verb: "buried" },
  signature: { key_id: "k", sig_b64: "abc", alg: "ed25519", signed_at: "t" },
}, SIGNED_ENVELOPE_SIBLING);
assert(r9.ok === false, "wrapper shape fails — verb not at top");
assert(r9.violations.some(v => v.field === "verb" && v.kind === "missing"), "missing verb flagged");
assert(r9.violations.some(v => v.field === "entry_sig" && v.kind === "missing"), "missing entry_sig flagged");

// T10: entry_sig strict — allow_extra_fields=false catches extra
console.log("\nT10: entry_sig strict");
const r10 = validateEnvelope({
  verb: "x",
  entry_sig: { key_id: "k", sig_b64: "abc", alg: "ed25519", signed_at: "t", bonus: "extra" },
}, SIGNED_ENVELOPE_SIBLING);
assert(r10.ok === false, "extra field on entry_sig rejected");
assert(r10.violations.some(v => v.kind === "unknown_field" && v.field.includes("bonus")), "bonus flagged");

// T11: cosign-entry happy
console.log("\nT11: cosign-entry happy");
const r11 = validateEnvelope({
  seq: 1, ts: "2026-04-19T00:00:00Z",
  event: "COSIGN-TEST",
  authority: "COSIGN-MERGED-034", apex: "COL-ASOLARIA", operator_witness: "jesse",
  prev_sha: null, glyph_sentence: "META-... @ M-I .",
}, COSIGN_ENTRY);
assert(r11.ok === true, "genesis entry passes");

// T12: cosign-entry bad event pattern
console.log("\nT12: cosign-entry bad event");
const r12 = validateEnvelope({
  seq: 2, ts: "t", event: "BADNAME", authority: "a", apex: "x", operator_witness: "j",
  prev_sha: "abc", glyph_sentence: "g",
}, COSIGN_ENTRY);
assert(r12.ok === false, "bad event prefix rejected");
assert(r12.violations.some(v => v.kind === "bad_pattern" && v.field === "event"), "pattern violation");

// T13: migration-intent-ack happy
console.log("\nT13: migration-intent-ack happy");
const r13 = validateEnvelope({
  verb: "migration-intent-ack",
  operator: "amy",
  plan: { session_id: "s" },
  ack_ts: "2026-04-19T00:00:00Z",
  window_expires_at: "2026-05-02T23:59:59Z",
}, MIGRATION_INTENT_ACK);
assert(r13.ok === true, "amy ack passes");

// T14: migration-intent-ack unauthorized operator
console.log("\nT14: unauthorized operator");
const r14 = validateEnvelope({
  verb: "migration-intent-ack", operator: "stranger", plan: {}, ack_ts: "t", window_expires_at: "t",
}, MIGRATION_INTENT_ACK);
assert(r14.ok === false, "stranger rejected");

// T15: findContract
console.log("\nT15: findContract lookup");
assert(findContract("shannon-scan-dispatch")?.name === "shannon-scan-dispatch", "lookup");
assert(findContract("nonexistent") === null, "not-found returns null");

// T16: ALL_CONTRACTS populated
console.log("\nT16: ALL_CONTRACTS count");
assert(ALL_CONTRACTS.length === 6, `6 contracts (got ${ALL_CONTRACTS.length})`);

// T17: violation shape
console.log("\nT17: violation shape");
assert(r9.violations.every(v => typeof v.kind === "string" && typeof v.field === "string" && typeof v.detail === "string"), "all violations have kind/field/detail");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-Q-001-SCHEMA-CONTRACTS-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
