import { compressBatch, decompressBatch, computeCompressionStats } from "../src/compress.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== J-compress batch compression tests ===\n");

// T1: empty batch
console.log("T1: empty");
const c1 = compressBatch([]);
assert(c1.count === 0, "count=0");
assert(Object.keys(c1.base).length === 0, "empty base");
assert(c1.overlays.length === 0, "no overlays");

// T2: single entry
console.log("\nT2: single");
const c2 = compressBatch([{ actor: "liris", verb: "scan", scan_id: "s1" }]);
assert(c2.count === 1, "count=1");
assert(c2.overlays.length === 1, "1 overlay");
// decompress roundtrip
const d2 = decompressBatch(c2);
assert(d2[0].actor === "liris", "roundtrip actor");
assert(d2[0].verb === "scan", "roundtrip verb");
assert(d2[0].scan_id === "s1", "roundtrip scan_id");

// T3: repetitive batch — actor/verb should go to base
console.log("\nT3: repetitive batch");
const entries3 = Array.from({ length: 100 }, (_, i) => ({
  actor: "liris", verb: "scan", target: "acer",
  scan_id: `s${i}`, sequence: i,
}));
const c3 = compressBatch(entries3);
assert(c3.base.actor === "liris", "actor in base");
assert(c3.base.verb === "scan", "verb in base");
assert(c3.base.target === "acer", "target in base");
assert(c3.base.scan_id === undefined, "scan_id NOT in base (unique per entry)");

// T4: overlays contain only differing fields
console.log("\nT4: overlay minimal");
assert(!("actor" in c3.overlays[0]), "actor not in overlay");
assert("scan_id" in c3.overlays[0], "scan_id in overlay");
assert("sequence" in c3.overlays[0], "sequence in overlay");

// T5: decompress roundtrip preserves all entries
console.log("\nT5: roundtrip");
const d3 = decompressBatch(c3);
assert(d3.length === 100, "100 entries restored");
for (let i = 0; i < 100; i++) {
  if (d3[i].actor !== "liris" || d3[i].scan_id !== `s${i}` || d3[i].sequence !== i) {
    assert(false, `entry ${i} mismatch`, JSON.stringify(d3[i]));
    break;
  }
}
assert(d3[99].sequence === 99, "last entry preserved");

// T6: compression savings on repetitive data
console.log("\nT6: compression savings");
const stats = computeCompressionStats(entries3, c3);
assert(stats.input_bytes > stats.output_bytes, "output smaller");
assert(stats.savings_percent > 0, `positive savings (${stats.savings_percent}%)`);
assert(stats.base_field_count === 3, "3 base fields");

// T7: mostly-unique batch has less savings
console.log("\nT7: unique batch");
const entries7 = Array.from({ length: 10 }, (_, i) => ({
  actor: `actor-${i}`, verb: `verb-${i}`, target: `t-${i}`,
}));
const c7 = compressBatch(entries7);
assert(Object.keys(c7.base).length === 0, "no base fields (all unique)");
const stats7 = computeCompressionStats(entries7, c7);
// With no base fields, output may be larger due to envelope overhead — allow either direction
assert(stats7.base_field_count === 0, "0 base fields");

// T8: 50/50 split — base is the majority value
console.log("\nT8: 50/50 split");
const half = Array.from({ length: 10 }, (_, i) => ({ verb: i < 5 ? "a" : "b", id: i }));
const c8 = compressBatch(half);
// Either "a" or "b" should make it (half majority threshold = 5)
assert(["a", "b"].includes(c8.base.verb as string), "majority verb in base");

// T9: minority is in overlays
console.log("\nT9: minority overlay");
const majority = Array.from({ length: 10 }, () => ({ verb: "common", id: 0 }));
majority[0].verb = "rare";
const c9 = compressBatch(majority);
assert(c9.base.verb === "common", "common in base");
assert(c9.overlays[0].verb === "rare", "rare in overlay");
assert(!("verb" in c9.overlays[1]), "common not in overlay");

// T10: boolean + number values
console.log("\nT10: typed values");
const typed = Array.from({ length: 20 }, () => ({ ok: true, count: 42, name: "same" }));
const c10 = compressBatch(typed);
assert(c10.base.ok === true, "boolean in base");
assert(c10.base.count === 42, "number in base");
const d10 = decompressBatch(c10);
assert(d10[0].ok === true, "boolean roundtrip");
assert(d10[0].count === 42, "number roundtrip");

// T11: nested objects skipped from base (kept as overlay)
console.log("\nT11: nested objects");
const nested = Array.from({ length: 10 }, (_, i) => ({
  actor: "a", body: { scan_id: `s${i}` },
}));
const c11 = compressBatch(nested);
assert(c11.base.actor === "a", "actor in base");
assert(c11.base.body === undefined, "nested obj NOT in base");
assert("body" in c11.overlays[0], "nested in overlay");
const d11 = decompressBatch(c11);
assert(d11[0].body.scan_id === "s0", "nested roundtrip");

// T12: large repetitive batch — measure actual savings
console.log("\nT12: 1000-entry batch savings");
const big: any[] = [];
for (let i = 0; i < 1000; i++) {
  big.push({
    actor: "liris-shannon-civ", verb: "shannon-scan-dispatch",
    target: "acer", d1: "IDENTITY",
    scan_id: `scan-${i}`, sequence: i,
  });
}
const cBig = compressBatch(big);
const statsBig = computeCompressionStats(big, cBig);
assert(statsBig.savings_percent > 30, `savings >30% (got ${statsBig.savings_percent}%)`);
const dBig = decompressBatch(cBig);
assert(dBig.length === 1000, "1000 restored");
assert(dBig[500].scan_id === "scan-500", "mid entry preserved");

// T13: glyph
console.log("\nT13: glyph");
assert(c3.glyph_sentence.startsWith("EVT-J-COMPRESS-BATCH"), "glyph prefix");
assert(c3.glyph_sentence.includes("entries=100"), "entries count");
assert(c3.glyph_sentence.includes("base-fields=3"), "base fields count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-J-COMPRESS-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
