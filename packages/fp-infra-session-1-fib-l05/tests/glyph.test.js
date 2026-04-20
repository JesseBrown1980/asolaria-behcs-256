// FIB-L05 tests
const { AXES, extractAxes, toGlyph, stamp, agree } = require("../src/bilateral-glyph.js");

let pass = 0, fail = 0;
function t(n, c, d="") { c ? (pass++, console.log("[PASS]", n, d)) : (fail++, console.log("[FAIL]", n, d)); }

// T1 axes list
t("01-5-axes", AXES.length === 5 && AXES.join(",") === "D1,D2,D3,D4,D5");

// T2 extractAxes deterministic
{
  const env = { src: "acer", kind: "EVT-X", dst: "liris", mode: "real", body: { promotion: "T09" } };
  const a1 = extractAxes(env);
  const a2 = extractAxes(env);
  t("02-extract-deterministic", JSON.stringify(a1) === JSON.stringify(a2));
  t("03-extract-values", a1.D1 === "acer" && a1.D2 === "EVT-X" && a1.D3 === "liris" && a1.D4 === "real" && a1.D5 === "T09");
}

// T3 toGlyph 8-char sha slice
{
  const g = toGlyph("test");
  t("04-glyph-8-chars", g.length === 8);
  t("05-glyph-deterministic", toGlyph("test") === g);
  t("06-glyph-differs-per-input", toGlyph("test") !== toGlyph("other"));
}

// T4 stamp produces 5-tuple + bilateral_sha
{
  const s = stamp({ src: "acer", kind: "EVT-X", dst: "liris", mode: "real", body: {} });
  t("07-stamp-has-glyphs", Object.keys(s.glyphs).length === 5);
  t("08-stamp-five-tuple", s.five_tuple.split(":").length === 5);
  t("09-stamp-bilateral-sha-64", s.bilateral_sha.length === 64);
}

// T5 agree on identical envelopes
{
  const env = { src: "acer", kind: "EVT-X", dst: "liris", mode: "real", body: { promotion: "T09" } };
  const a = stamp(env);
  const b = stamp(env);
  t("10-agree-same", agree(a, b).ok === true);
}

// T6 diverge on different src
{
  const a = stamp({ src: "acer",  kind: "EVT-X", dst: "liris", mode: "real", body: {} });
  const b = stamp({ src: "liris", kind: "EVT-X", dst: "liris", mode: "real", body: {} });
  const r = agree(a, b);
  t("11-diverge-sha", !r.ok && r.reason === "sha-diverge");
}

// T7 diverge on different verb
{
  const a = stamp({ src: "acer", kind: "EVT-X", dst: "liris", mode: "real", body: {} });
  const b = stamp({ src: "acer", kind: "EVT-Y", dst: "liris", mode: "real", body: {} });
  t("12-diverge-verb", !agree(a, b).ok);
}

// T8 shadow vs real mode changes sha
{
  const a = stamp({ src: "acer", kind: "EVT-X", dst: "liris", mode: "real",   body: {} });
  const b = stamp({ src: "acer", kind: "EVT-X", dst: "liris", mode: "shadow", body: {} });
  t("13-mode-axis-divergent", !agree(a, b).ok);
}

// T9 empty promotion still produces valid stamp
{
  const s = stamp({ src: "acer", kind: "EVT-X", dst: "liris", body: {} });
  t("14-default-promotion-empty", s.axes.D5 === "" && s.bilateral_sha.length === 64);
}

// T10 bilateral_sha content-deterministic (no ts/throughput/walltime involvement)
{
  const env1 = { src: "a", kind: "K", dst: "d", mode: "real", body: {} };
  const env2 = { ...env1, body: { ...env1.body, ts: Date.now(), walltime: 999, throughput: 500 } };
  // These fields are NOT in the axis extract, so sha stays same
  t("15-content-deterministic", stamp(env1).bilateral_sha === stamp(env2).bilateral_sha);
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
