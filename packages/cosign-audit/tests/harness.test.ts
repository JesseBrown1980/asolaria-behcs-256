// packages/cosign-audit/tests/harness.test.ts — K-001 tests

import { auditCosignChain, appendAuditHistory, loadAuditHistory, type AuditReport } from "../src/harness.ts";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== K-001 cosign audit harness tests ===\n");

const TESTDIR = join(tmpdir(), "asolaria-k001-" + Date.now());
mkdirSync(TESTDIR, { recursive: true });
const CHAIN = join(TESTDIR, "chain.ndjson");
const REG   = join(TESTDIR, "registry.json");
const HISTORY = join(TESTDIR, "audit-history.ndjson");

function rollingSha(lines: string[], upTo: number): string {
  const joined = lines.slice(0, upTo).join("\n") + "\n";
  return createHash("sha256").update(joined, "utf-8").digest("hex");
}

function canonicalEntryMaterial(entry: any): Buffer {
  const { entry_sig: _s, ...rest } = entry;
  const sortedKeys = Object.keys(rest).sort();
  const sorted: any = {};
  for (const k of sortedKeys) sorted[k] = rest[k];
  return Buffer.from(JSON.stringify(sorted), "utf-8");
}

function rawPrivFromDer(privateKey: any) {
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  return Buffer.from(der.slice(-32));
}
function rawPubFromDer(publicKey: any) {
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der.slice(-32));
}

function seedToPkcs8Der(seed: Buffer) {
  const header = Buffer.from("302e020100300506032b657004220420", "hex");
  return Buffer.concat([header, seed]);
}

function signEntryAsLiris(entry: any, privSeed: Buffer): string {
  const { createPrivateKey, sign } = require("node:crypto");
  const priv = createPrivateKey({ key: seedToPkcs8Der(privSeed), format: "der", type: "pkcs8" });
  const sig = sign(null, canonicalEntryMaterial(entry), priv);
  return sig.toString("base64");
}

// Build a 3-entry chain with registry + one signed entry
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const privSeed = rawPrivFromDer(privateKey);
const pubRaw   = rawPubFromDer(publicKey);

const reg = {
  version: "0.1.0",
  updated_at: new Date().toISOString(),
  keys: [
    { key_id: "test-key-1", owner_glyph: "DEV-TEST", public_key_b64: pubRaw.toString("base64"), binding_class: "device-bound", host_device: "DEV-TEST", d11_level: "ASSUMED", created_at: "2026-04-01", rotated_at: null, usage: [], notes: "" },
  ],
  notes: [],
};
writeFileSync(REG, JSON.stringify(reg));

// Build chain — 3 entries, only last signed
const lines: string[] = [];
const entries: any[] = [
  { seq: 1, ts: "2026-04-18T00:00:00Z", event: "COSIGN-TEST-GENESIS",   authority: "T", apex: "X", operator_witness: "jesse", prev_sha: null,              glyph_sentence: "g1 @ M-E ." },
  { seq: 2, ts: "2026-04-18T00:01:00Z", event: "COSIGN-TEST-ENTRY-2",   authority: "T", apex: "X", operator_witness: "jesse", prev_sha: "",                glyph_sentence: "g2 @ M-E ." },
  { seq: 3, ts: "2026-04-18T00:02:00Z", event: "COSIGN-TEST-ENTRY-3",   authority: "T", apex: "X", operator_witness: "jesse", prev_sha: "",                glyph_sentence: "g3 @ M-E ." },
];
// Fill prev_sha properly
entries[1].prev_sha = rollingSha([JSON.stringify(entries[0])], 1);
entries[2].prev_sha = rollingSha([JSON.stringify(entries[0]), JSON.stringify(entries[1])], 2);
// Sign entry 3
entries[2].entry_sig = { key_id: "test-key-1", alg: "ed25519", signed_at: entries[2].ts, sig_b64: signEntryAsLiris(entries[2], privSeed) };

for (const e of entries) lines.push(JSON.stringify(e));
writeFileSync(CHAIN, lines.join("\n") + "\n");

// T1: audit 1-of-3-signed chain → YELLOW (majority unsigned triggers yellow,
// no red because rolling+seq+known-sig all ok)
console.log("T1: 1-of-3-signed chain → YELLOW");
const r1 = auditCosignChain({ chain_path: CHAIN, registry_path: REG });
assert(r1.verdict === "YELLOW", "verdict YELLOW (got " + r1.verdict + ")", r1.red_reasons.join(";"));
assert(r1.total_entries === 3, "3 entries");
assert(r1.rolling_chain.ok === true, "rolling-chain ok");
assert(r1.entry_sig.verified_count === 1, "1 entry_sig verified");
assert(r1.entry_sig.unsigned_count === 2, "2 entries unsigned");
assert(r1.red_reasons.length === 0, "no red reasons (only yellow)");

// T2: tampered entry → RED
console.log("\nT2: tampered entry → RED");
const tamperedEntries = JSON.parse(JSON.stringify(entries));
tamperedEntries[1].event = "COSIGN-TAMPERED";
const tampChain = join(TESTDIR, "chain-tamp.ndjson");
writeFileSync(tampChain, tamperedEntries.map((e: any) => JSON.stringify(e)).join("\n") + "\n");
const r2 = auditCosignChain({ chain_path: tampChain, registry_path: REG });
assert(r2.verdict === "RED", "verdict RED");
assert(r2.rolling_chain.ok === false, "rolling-chain broken");

// T3: seq gap → RED
console.log("\nT3: seq gap → RED");
const gapEntries = [entries[0], entries[2]];  // skip seq=2
const gapChain = join(TESTDIR, "chain-gap.ndjson");
writeFileSync(gapChain, gapEntries.map(e => JSON.stringify(e)).join("\n") + "\n");
const r3 = auditCosignChain({ chain_path: gapChain, registry_path: REG });
assert(r3.verdict === "RED", "seq gap → RED");
assert(r3.seq_continuity.ok === false, "continuity broken");
assert(r3.seq_continuity.gaps.length >= 1, "gaps reported");

// T4: signed entry with key not in registry → RED
console.log("\nT4: unknown-key sig → RED");
const unknownEntries = JSON.parse(JSON.stringify(entries));
unknownEntries[2].entry_sig.key_id = "not-in-registry";
const uChain = join(TESTDIR, "chain-unknown-key.ndjson");
writeFileSync(uChain, unknownEntries.map((e: any) => JSON.stringify(e)).join("\n") + "\n");
const r4 = auditCosignChain({ chain_path: uChain, registry_path: REG });
assert(r4.verdict === "RED", "unknown key → RED");
assert(r4.entry_sig.unverified_count === 1, "1 unverified");
assert(r4.entry_sig.unverified_seqs.includes(3), "seq 3 flagged");

// T5: missing chain file → RED
console.log("\nT5: missing chain → RED");
const r5 = auditCosignChain({ chain_path: join(TESTDIR, "does-not-exist.ndjson"), registry_path: REG });
assert(r5.verdict === "RED", "missing chain → RED");
assert(r5.red_reasons.some(r => r.includes("not found")), "reason cites missing");

// T6: registry with rotated keys counted
console.log("\nT6: rotated keys counted");
const rotatedReg = { ...reg, keys: [{ ...reg.keys[0], rotated_at: "2026-04-17T00:00:00Z" }] };
const rReg = join(TESTDIR, "reg-rotated.json");
writeFileSync(rReg, JSON.stringify(rotatedReg));
const r6 = auditCosignChain({ chain_path: CHAIN, registry_path: rReg });
assert(r6.registry.rotated_keys === 1, "1 rotated key counted");
// entry signed AFTER rotation → flagged yellow/red
assert(r6.entry_sig.unverified_count === 1, "entry signed post-rotation flagged");

// T7: history append + load
console.log("\nT7: audit history NDJSON");
appendAuditHistory(r1, HISTORY);
appendAuditHistory(r2, HISTORY);
appendAuditHistory(r3, HISTORY);
const loaded = loadAuditHistory(HISTORY);
assert(loaded.length === 3, "3 history entries");
assert(loaded[0].verdict === "YELLOW", "first entry YELLOW (majority-unsigned on happy chain)");
assert(loaded[1].verdict === "RED", "second entry RED");

// T8: glyph_sentence shape
console.log("\nT8: glyph_sentence");
assert(r1.glyph_sentence.startsWith("META-COSIGN-AUDIT"), "starts META-COSIGN-AUDIT");
assert(r1.glyph_sentence.includes("verdict=" + r1.verdict), `has verdict=${r1.verdict}`);
assert(r1.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends with mood");

// T9: majority-unsigned yields YELLOW note
console.log("\nT9: majority unsigned → YELLOW note");
// Build a chain with 1 signed + 3 unsigned
const manyUnsignedEntries = [
  ...JSON.parse(JSON.stringify([entries[0], entries[1], entries[0]])),
  JSON.parse(JSON.stringify(entries[2])),
];
// Re-seq
manyUnsignedEntries.forEach((e: any, i: number) => { e.seq = i + 1; if (i > 0) delete e.entry_sig; });
// Sign last one
manyUnsignedEntries[3].entry_sig = { key_id: "test-key-1", alg: "ed25519", signed_at: "2026-04-18T00:05:00Z", sig_b64: signEntryAsLiris(manyUnsignedEntries[3], privSeed) };
// Proper prev_sha chain
const manyLines = manyUnsignedEntries.map((_: any, i: number, a: any[]) => {
  if (i > 0) a[i].prev_sha = rollingSha(a.slice(0, i).map((e: any) => JSON.stringify(e)), i);
  return JSON.stringify(a[i]);
});
const manyChain = join(TESTDIR, "chain-many-unsigned.ndjson");
writeFileSync(manyChain, manyLines.join("\n") + "\n");
const r9 = auditCosignChain({ chain_path: manyChain, registry_path: REG });
// 1 signed / 4 total = 25% signed, 75% unsigned — should trigger yellow
const yellowTriggered = r9.yellow_reasons.some(r => r.includes("unsigned"));
// Note: verdict may still be GREEN if no red, but yellow reasons should be present
assert(yellowTriggered || r9.verdict !== "GREEN", "majority-unsigned yields yellow reason or non-green verdict");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-K-001-COSIGN-AUDIT-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
