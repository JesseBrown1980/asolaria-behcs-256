// Item 028 · Unit tests (plain-node, no framework required)
// Run: `node tests/envelope/translators.test.js`

const { validate } = require("../../src/envelope/validate.js");
const { translateBehcs } = require("../../src/envelope/translate-behcs.js");
const { translateDroidswarm } = require("../../src/envelope/translate-droidswarm.js");
const { translateOpdispatch } = require("../../src/envelope/translate-opdispatch.js");

let pass = 0, fail = 0;
function t(name, cond, detail = "") {
  if (cond) { console.log(`  [PASS] ${name}`, detail); pass++; }
  else      { console.log(`  [FAIL] ${name}`, detail); fail++; }
}

// T1 validator required-fields fallback
{
  const r = validate({});
  t("01-validate-empty-fails", !r.ok && r.errors && r.errors.length >= 5);
  const ok = validate({ id: "abc123", ts: "2026-04-20T00:00:00Z", src: "acer", kind: "EVT-TEST", body: {} });
  t("02-validate-minimum-ok", ok.ok === true);
}

// T2 BEHCS translator
{
  const legacy = { id: "behcs-1", from: "acer", to: "liris", mode: "real", actor: "acer-ns-coord", verb: "EVT-X", ts: "2026-04-20T00:00:00Z", payload: "hi", body: { k: 1 }, glyph_sentence: "g @ M-EYEWITNESS ." };
  const v1 = translateBehcs(legacy);
  t("10-behcs-id-preserved", v1.id === "behcs-1");
  t("11-behcs-kind-from-verb", v1.kind === "EVT-X");
  t("12-behcs-src-from-from", v1.src === "acer");
  t("13-behcs-dst-from-to", v1.dst === "liris");
  t("14-behcs-mode", v1.mode === "real");
  t("15-behcs-schema-ok", validate(v1).ok === true);
}

// T3 DroidSwarm translator
{
  const ds = { swarm_id: "falcon-3474", kind: "SWARM_HEARTBEAT", src: "falcon", t: 1776320000, data: { pid: 3474 } };
  const v1 = translateDroidswarm(ds);
  t("20-ds-id-from-swarm_id", v1.id === "falcon-3474");
  t("21-ds-src-preserved", v1.src === "falcon");
  t("22-ds-ts-is-iso", typeof v1.ts === "string" && v1.ts.endsWith("Z"));
  t("23-ds-schema-ok", validate(v1).ok === true);
}

// T4 OP_DISPATCH translator
{
  const op = { op: "OP-KICK-AETHER", issued_by: "acer", t: "2026-04-20T00:00:00Z", args: { text: "hi" } };
  const v1 = translateOpdispatch(op);
  t("30-op-kind-from-op", v1.kind === "OP-KICK-AETHER");
  t("31-op-src-from-issued_by", v1.src === "acer");
  t("32-op-schema-ok", validate(v1).ok === true);
}

// T5 dimensional tags + 47d_ext
{
  const env = { id: "dim-test", ts: "2026-04-20T00:00:00Z", src: "acer", kind: "EVT-DIM", body: {}, dimensional_tags: { d1: "glyphA", d2: "glyphB", d35: "glyphZ" }, d47_ext: { dims: ["a","b"], catalog: "crypto" } };
  t("40-dimensional-ok", validate(env).ok === true);
  const bad = { ...env, dimensional_tags: { d99: "bad" } };
  t("41-dimensional-out-of-range-fails", validate(bad).ok === false);
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
