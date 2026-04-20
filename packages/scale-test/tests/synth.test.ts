import { makeKeyPool, synthEnvelope, signEnvelope, verifyEnvelope, runBatch } from "../src/synth.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== J-100k scale-test tests ===\n");

// T1: makeKeyPool produces n distinct keys
console.log("T1: key pool");
const keys = makeKeyPool(3);
assert(keys.length === 3, "3 keys");
assert(keys[0].pub_raw.length === 32, "pub 32b");
assert(keys[0].priv_seed.length === 32, "priv 32b");
assert(new Set(keys.map(k => k.key_id)).size === 3, "distinct key_ids");

// T2: synthEnvelope shapes each kind
console.log("\nT2: synth shapes");
const d = synthEnvelope("shannon-scan-dispatch", 1);
assert(d.verb === "shannon-scan-dispatch", "dispatch verb");
assert(d.body.scan_id === "scan-j100k-1", "scan_id threaded");
const r = synthEnvelope("shannon-scan-result", 2);
assert(r.verb === "shannon-scan-result", "result verb");
assert(r.body.acer_verdict === "promote", "verdict=promote");
const drift = synthEnvelope("drift-detected", 3);
assert(drift.verb === "drift-detected", "drift verb");
assert(drift.detection.permanent_name === "subject-3", "drift subject");

// T3: sign + verify round-trip
console.log("\nT3: sign + verify");
const signed = signEnvelope(d, keys[0]);
assert(signed.entry_sig?.alg === "ed25519", "entry_sig alg");
assert(signed.verb === "shannon-scan-dispatch", "verb preserved at top");
const ok = verifyEnvelope(signed, keys);
assert(ok === true, "valid sig verifies");

// T4: tampered fails verify
console.log("\nT4: tampered fails");
const tamp = JSON.parse(JSON.stringify(signed));
tamp.body.scan_id = "TAMPERED";
assert(verifyEnvelope(tamp, keys) === false, "tampered rejected");

// T5: unknown key_id fails
console.log("\nT5: unknown key_id");
const wrongKey = { ...signed, entry_sig: { ...signed.entry_sig, key_id: "nope" } };
assert(verifyEnvelope(wrongKey, keys) === false, "unknown key rejected");

// T6: small batch all green
console.log("\nT6: batch n=100");
const b100 = runBatch({ n: 100, kinds: ["shannon-scan-dispatch"], key_pool_size: 5, sign: true, validate_schema: true, verify_sigs: true });
assert(b100.n === 100, "n=100");
assert(b100.schema_invalid === 0, "0 schema fails");
assert(b100.sig_failed === 0, "0 sig fails");
assert(b100.throughput_synth_per_s > 0, "throughput nonzero");

// T7: all 3 kinds in rotation
console.log("\nT7: mixed kinds");
const bMixed = runBatch({ n: 30, kinds: ["shannon-scan-dispatch", "shannon-scan-result", "drift-detected"], key_pool_size: 3, sign: true, validate_schema: true, verify_sigs: true });
assert(bMixed.schema_invalid === 0, "all 3 kinds validate");
assert(bMixed.sig_failed === 0, "all 3 kinds verify");

// T8: large batch — 10k envelopes sanity (sub-full-100k for test speed)
console.log("\nT8: n=10000 sanity");
const b10k = runBatch({ n: 10000, kinds: ["shannon-scan-dispatch"], key_pool_size: 10, sign: true, validate_schema: true, verify_sigs: true });
assert(b10k.n === 10000, "n=10k");
assert(b10k.schema_invalid === 0, "0 schema fails on 10k");
assert(b10k.sig_failed === 0, "0 sig fails on 10k");
assert(b10k.throughput_synth_per_s >= 1000 || b10k.throughput_synth_per_s === 0, "synth ≥1k/s or fast path");

// T9: no-sign path bypasses signing
console.log("\nT9: no-sign");
const bNo = runBatch({ n: 50, kinds: ["shannon-scan-dispatch"], key_pool_size: 1, sign: false, validate_schema: true, verify_sigs: false });
assert(bNo.schema_invalid === 0, "no-sign still schema-validates");
assert(bNo.sig_failed === 0, "no verify attempted");

// T10: glyph sentence
console.log("\nT10: glyph");
assert(b100.glyph_sentence.startsWith("EVT-J100K-BATCH"), "glyph starts");
assert(b100.glyph_sentence.includes("n=100"), "n in glyph");
assert(b100.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "mood ending");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-J-100K-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
