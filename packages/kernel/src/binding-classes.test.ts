// packages/kernel/src/binding-classes.test.ts — D-056 unit tests
// Run: npx tsx packages/kernel/src/binding-classes.test.ts

import {
  entityKindOf, bindingClassOf, declOf, taxonomySummary,
  validateKeyEntry, validateDeviceEntry, ENTITY_KIND_DECLS,
} from "./binding-classes.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== D-056 binding-classes tests ===\n");

// T1: glyph prefix recognition for each kind
console.log("T1: entityKindOf");
assert(entityKindOf("OP-JESSE") === "OP", "OP-JESSE → OP");
assert(entityKindOf("CIV-ASOLARIA") === "CIV", "CIV-ASOLARIA → CIV");
assert(entityKindOf("COL-LIRIS") === "COL", "COL-LIRIS → COL");
assert(entityKindOf("AGT-ROSE") === "AGT", "AGT-ROSE → AGT");
assert(entityKindOf("DEV-ACER") === "DEV", "DEV-ACER → DEV");
assert(entityKindOf("ORBITAL-FELIPE-A06") === "ORBITAL", "ORBITAL-FELIPE-A06 → ORBITAL");
assert(entityKindOf("HW-H02-KCPU-DACER-I001-S3f8a21c9") === "HW", "HW glyph → HW");
assert(entityKindOf("XYZ-ABC") === null, "unknown prefix → null");
assert(entityKindOf("") === null, "empty → null");

// T2: bindingClassOf returns declared class
console.log("\nT2: bindingClassOf");
assert(bindingClassOf("OP-JESSE") === "substrate-independent", "OP → substrate-independent");
assert(bindingClassOf("CIV-ASOLARIA") === "substrate-independent", "CIV → substrate-independent");
assert(bindingClassOf("COL-AMY") === "substrate-independent", "COL → substrate-independent");
assert(bindingClassOf("AGT-ROSE") === "substrate-independent", "AGT → substrate-independent");
assert(bindingClassOf("DEV-ACER") === "hybrid", "DEV → hybrid");
assert(bindingClassOf("ORBITAL-FELIPE-A06") === "device-bound", "ORBITAL → device-bound");
assert(bindingClassOf("HW-H02-KCPU-DACER-I001-S3f8a21c9") === "device-bound", "HW → device-bound");
assert(bindingClassOf("NOT-A-GLYPH") === null, "unknown → null");

// T3: declOf returns full declaration
console.log("\nT3: declOf");
const devDecl = declOf("DEV-ACER");
assert(devDecl !== null && devDecl.kind === "DEV", "DEV decl present");
assert(devDecl!.facets !== undefined, "DEV has facets map (hybrid only)");
assert(devDecl!.facets!.hardware === "device-bound", "DEV.hardware facet=device-bound");
assert(devDecl!.facets!.profile === "substrate-independent", "DEV.profile facet=substrate-independent");
assert(declOf("CIV-ASOLARIA")!.facets === undefined, "CIV has no facets (not hybrid)");

// T4: invariants present and non-empty
console.log("\nT4: invariants");
for (const k of Object.keys(ENTITY_KIND_DECLS)) {
  const d = (ENTITY_KIND_DECLS as any)[k];
  assert(Array.isArray(d.invariants) && d.invariants.length >= 1, `${k} has ≥1 invariant`);
  assert(typeof d.rationale === "string" && d.rationale.length > 20, `${k} rationale non-trivial`);
}

// T5: validateKeyEntry — ok case
console.log("\nT5: validateKeyEntry valid");
const validKey = {
  key_id: "dev-acer-4abb0a9c",
  owner_glyph: "DEV-ACER",
  public_key_b64: "X7Shge7FmD5za+rw+cFecUuQV0RdeJpD3L6bDz7Eohw=",
  binding_class: "device-bound",
  host_device: "DEV-ACER",
};
const r1 = validateKeyEntry(validKey);
assert(r1.ok === true, "valid key passes", JSON.stringify(r1.violations));
assert(r1.violations.length === 0, "0 violations");

// T6: validateKeyEntry — missing host_device
console.log("\nT6: validateKeyEntry missing host_device");
const r2 = validateKeyEntry({ key_id: "bad", public_key_b64: "AAA=", binding_class: "device-bound" });
assert(r2.ok === false, "missing host_device rejected");
assert(r2.violations.some(v => v.includes("host_device")), "violation mentions host_device");

// T7: validateKeyEntry — wrong binding_class
console.log("\nT7: validateKeyEntry wrong binding");
const r3 = validateKeyEntry({
  key_id: "bad", public_key_b64: "AAA=", host_device: "DEV-X",
  binding_class: "substrate-independent",  // WRONG for AGT-KEY
});
assert(r3.ok === false, "substrate-independent key rejected");
assert(r3.violations.some(v => v.includes("device-bound")), "violation cites required class");

// T8: validateKeyEntry — private_key_b64 leaked
console.log("\nT8: validateKeyEntry leaks private");
const r4 = validateKeyEntry({
  key_id: "leak", public_key_b64: "AAA=", host_device: "DEV-X",
  binding_class: "device-bound",
  private_key_b64: "SECRET" as any,
});
assert(r4.ok === false, "private_key_b64 in registry rejected");
assert(r4.violations.some(v => v.includes("MUST NOT contain private")), "violation names the leak");

// T9: validateDeviceEntry — ok case
console.log("\nT9: validateDeviceEntry valid");
const r5 = validateDeviceEntry({
  glyph: "DEV-ACER",
  federation_port: 4947,
  canonical_root: "C:/Users/acer/",
  role: "capital",
});
assert(r5.ok === true, "valid device entry", JSON.stringify(r5.violations));

// T10: validateDeviceEntry — missing port
console.log("\nT10: validateDeviceEntry missing port");
const r6 = validateDeviceEntry({ glyph: "DEV-FOO" });
assert(r6.ok === false, "missing federation_port rejected");

// T11: validateDeviceEntry — bogus canonical_root
console.log("\nT11: validateDeviceEntry bogus canonical_root");
const r7 = validateDeviceEntry({ glyph: "DEV-FOO", federation_port: 4947, canonical_root: "relative/path" });
assert(r7.ok === false, "non-local canonical_root rejected");

// T12: taxonomySummary totals
console.log("\nT12: taxonomySummary");
const tax = taxonomySummary();
assert(tax.kind_count === 8, "8 entity kinds");
assert(tax.by_binding["substrate-independent"].length === 4, "4 substrate-independent (OP/CIV/COL/AGT)");
assert(tax.by_binding["device-bound"].length === 3, "3 device-bound (ORBITAL/HW/AGT-KEY)");
assert(tax.by_binding["hybrid"].length === 1, "1 hybrid (DEV)");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-D-056-BINDING-CLASSES-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
console.log("");
console.log("Taxonomy:");
console.log("  " + tax.summary_sentence);
process.exit(fail === 0 ? 0 : 1);
