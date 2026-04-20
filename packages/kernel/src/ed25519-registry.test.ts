// packages/kernel/src/ed25519-registry.test.ts — D-055 unit tests
// Run: npx tsx packages/kernel/src/ed25519-registry.test.ts

import {
  loadRegistry, saveRegistry, mintKey, registerKey, getKey, rotateKey,
  signPayload, verifyEnvelope, bootstrapLocalKey, type Ed25519Registry,
} from "./ed25519-registry.ts";
import { rmSync, existsSync } from "node:fs";

const TEST_REG = "C:/tmp/ed25519-registry-test.json";
if (existsSync(TEST_REG)) rmSync(TEST_REG);

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== D-055 ed25519-registry tests ===\n");

// Test 1: empty registry loads clean
console.log("T1: empty registry");
const reg0 = loadRegistry(TEST_REG);
assert(reg0.keys.length === 0, "loads empty with 0 keys");
assert(reg0.version === "0.1.0", "version set");

// Test 2: mint + register a key
console.log("\nT2: mint + register");
const minted = mintKey({ owner_glyph: "DEV-ACER", host_device: "DEV-ACER", usage: ["test"] });
assert(minted.entry.key_id.startsWith("dev-acer-"), "key_id formed from owner");
assert(minted.entry.binding_class === "device-bound", "binding_class set");
assert(Buffer.from(minted.entry.public_key_b64, "base64").length === 32, "public key is 32 raw bytes");
assert(Buffer.from(minted.private_key_b64, "base64").length === 32, "private key is 32 raw bytes");

const reg1 = registerKey(reg0, minted.entry);
saveRegistry(reg1, TEST_REG);
assert(reg1.keys.length === 1, "registered key count=1");

// Test 3: re-register same key_id replaces, doesn't duplicate
console.log("\nT3: re-register is idempotent");
const reg2 = registerKey(reg1, minted.entry);
assert(reg2.keys.length === 1, "still 1 entry after re-register");

// Test 4: getKey returns the right entry
console.log("\nT4: getKey lookup");
const got = getKey(reg2, minted.entry.key_id);
assert(got !== null, "found by key_id");
assert(got?.owner_glyph === "DEV-ACER", "owner matches");

// Test 5: sign + verify roundtrip OK
console.log("\nT5: sign + verify roundtrip");
const payload = { actor: "acer", verb: "test-sign", n: 42, ts: "2026-04-18T22:30:00Z" };
const signed = signPayload(payload, minted.private_key_b64, minted.entry.key_id);
assert(signed.signature.alg === "ed25519", "alg=ed25519");
assert(signed.signature.sig_b64.length > 0, "sig present");

const verified = verifyEnvelope(signed, reg2);
assert(verified.ok === true, "verification succeeds", verified.reason);
assert(verified.owner_glyph === "DEV-ACER", "owner glyph returned");
assert(verified.host_device === "DEV-ACER", "host device returned");

// Test 6: verification fails on tampered payload
console.log("\nT6: tamper detection");
const tampered = { ...signed, payload: { ...signed.payload, n: 43 } };
const vtam = verifyEnvelope(tampered, reg2);
assert(vtam.ok === false, "tampered payload rejected");
assert(vtam.reason === "signature_mismatch", "reason=signature_mismatch");

// Test 7: verification fails on unknown key_id
console.log("\nT7: unknown key_id rejected");
const unknown = { ...signed, signature: { ...signed.signature, key_id: "bogus-key" } };
const vunk = verifyEnvelope(unknown, reg2);
assert(vunk.ok === false, "unknown key_id rejected");
assert(vunk.reason === "key_not_in_registry", "reason=key_not_in_registry");

// Test 8: rotated key is rejected for new envelopes
console.log("\nT8: rotated key rejected");
const reg3 = rotateKey(reg2, minted.entry.key_id);
const vrot = verifyEnvelope(signed, reg3);
assert(vrot.ok === false, "rotated key rejected");
assert(vrot.reason === "key_rotated_out", "reason=key_rotated_out");

// Test 9: wrong-alg envelope rejected
console.log("\nT9: wrong-alg rejected");
const wrongAlg = { ...signed, signature: { ...signed.signature, alg: "hmac-sha256" as any } };
const valg = verifyEnvelope(wrongAlg, reg2);
assert(valg.ok === false, "wrong alg rejected");
assert(valg.reason === "wrong_alg", "reason=wrong_alg");

// Test 10: two distinct keys produce distinct sigs
console.log("\nT10: independent keys");
const kA = mintKey({ owner_glyph: "COL-LIRIS", host_device: "DEV-LIRIS" });
const kB = mintKey({ owner_glyph: "AGT-ROSE",  host_device: "DEV-AMY-MAC" });
assert(kA.entry.public_key_b64 !== kB.entry.public_key_b64, "different pub keys");
const reg4 = registerKey(registerKey(reg2, kA.entry), kB.entry);
assert(reg4.keys.length === 3, "3 keys in registry");

// Test 11: each key verifies only its own sigs
console.log("\nT11: cross-verify rejection");
const sigA = signPayload({ x: 1 }, kA.private_key_b64, kA.entry.key_id);
const crossed = { ...sigA, signature: { ...sigA.signature, key_id: kB.entry.key_id } };
const vcross = verifyEnvelope(crossed, reg4);
assert(vcross.ok === false, "A-signed envelope with B key_id rejected");

// Test 12: host_device check encoded in entry (binding enforcement is at mint time)
console.log("\nT12: binding_class enforced");
assert(minted.entry.binding_class === "device-bound", "binding_class present");
assert(typeof minted.entry.host_device === "string" && minted.entry.host_device.startsWith("DEV-"), "host_device is a DEV-*");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-D-055-ED25519-REGISTRY-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
