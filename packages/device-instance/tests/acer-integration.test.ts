import { bootSignedInstance, signWithDeviceKey } from "../src/acer-integration.ts";
import { loadRegistry } from "../../kernel/src/ed25519-registry.ts";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== E-acer-integration tests ===\n");

const TESTDIR = join(tmpdir(), "asolaria-e-acer-" + Date.now());
mkdirSync(TESTDIR);

function sampleFingerprint() {
  return { scale_1: "a", scale_10: "b", scale_100: "c", scale_1k: "d", scale_10k: "e" };
}
function sampleObs() {
  return { ts: "2026-04-19T00:00:00Z", observer_pid: "test-pid", observer_surface: "asolaria" as const, operator_id: "jesse" as const, host_surface: "test-host" };
}

// T1: spawn new device — mint key + write manifest
console.log("T1: fresh spawn");
const man1 = join(TESTDIR, "manifest1.json");
const reg1 = join(TESTDIR, "reg1.json");
const r1 = bootSignedInstance({
  device_glyph: "DEV-ACER",
  manifest_path: man1,
  registry_path: reg1,
  operator: "jesse",
  permanent_name: "dev-acer-test",
  hilbert_pid: "PID-H01-TEST-DEV-ACER-I001-S00000000",
  shape_fingerprint: sampleFingerprint(),
  first_observation_tuple: sampleObs(),
});
assert(r1.ok === true, "boot ok", r1.violations.join(";"));
assert(r1.manifest_action === "spawned", "manifest spawned");
assert(r1.key_action === "minted", "key minted");
assert(r1.private_key_b64 !== undefined, "private key returned");
assert(r1.key_entry?.owner_glyph === "DEV-ACER", "key owned by device");
assert(r1.binding_class === "hybrid", "DEV-* binding=hybrid");

// T2: second boot reuses key + loads manifest
console.log("\nT2: second boot reuses");
const r2 = bootSignedInstance({
  device_glyph: "DEV-ACER",
  manifest_path: man1,
  registry_path: reg1,
  operator: "jesse",
});
assert(r2.ok === true, "second boot ok");
assert(r2.manifest_action === "loaded", "manifest loaded");
assert(r2.key_action === "reused", "key reused");
assert(r2.private_key_b64 === undefined, "no private on reuse");

// T3: non-DEV glyph rejected
console.log("\nT3: non-DEV rejected");
const r3 = bootSignedInstance({
  device_glyph: "AGT-ROSE",
  manifest_path: join(TESTDIR, "m3.json"),
  registry_path: reg1,
  operator: "jesse",
  permanent_name: "n", hilbert_pid: "p",
  shape_fingerprint: sampleFingerprint(),
  first_observation_tuple: sampleObs(),
});
assert(r3.ok === false, "AGT-ROSE rejected");
assert(r3.violations.some(v => v.includes("DEV-*")), "reason names DEV-*");

// T4: spawn w/o required fields
console.log("\nT4: incomplete spawn");
const r4 = bootSignedInstance({
  device_glyph: "DEV-NEW",
  manifest_path: join(TESTDIR, "m4.json"),
  registry_path: reg1,
  operator: "jesse",
  // missing permanent_name etc.
});
assert(r4.ok === false, "incomplete spawn rejected");
assert(r4.violations.some(v => v.includes("spawn requires")), "reason names spawn requires");

// T5: registry persisted — second call finds key
console.log("\nT5: registry persisted");
const reg = loadRegistry(reg1);
assert(reg.keys.some(k => k.owner_glyph === "DEV-ACER"), "DEV-ACER in registry");

// T6: signWithDeviceKey round-trip
console.log("\nT6: signWithDeviceKey");
const priv = r1.private_key_b64!;
const s1 = signWithDeviceKey({ verb: "test-envelope", body: { hello: "world" } }, "DEV-ACER", reg1, priv);
assert(s1.ok === true, "sign ok");
assert(s1.signed?.verb === "test-envelope", "verb preserved at top");
assert(s1.signed?.entry_sig?.alg === "ed25519", "entry_sig sibling");
assert(s1.signed?.entry_sig?.key_id === s1.key_id, "key_id threaded");

// T7: signWithDeviceKey unknown device
console.log("\nT7: signWithDeviceKey unknown device");
const s2 = signWithDeviceKey({ v: "x" }, "DEV-GHOST", reg1, priv);
assert(s2.ok === false, "unknown device rejected");
assert(s2.reason?.includes("no active key"), "reason names no key");

// T8: boot emits correct glyph on success
console.log("\nT8: glyph on success");
assert(r1.glyph_sentence.includes("M-EYEWITNESS"), "success mood");
assert(r1.glyph_sentence.includes("device=DEV-ACER"), "device in glyph");

// T9: boot emits subjunctive on failure
console.log("\nT9: glyph on failure");
assert(r3.glyph_sentence.includes("M-SUBJUNCTIVE"), "failure mood");

// T10: key_invariant_check passes
console.log("\nT10: key invariant check");
assert(r1.key_invariant_check.ok === true, "AGT-KEY invariants pass");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-E-ACER-INTEGRATION-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
