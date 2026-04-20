import { buildHistogram, detectRegression, renderHistogram, DEFAULT_BUCKETS_MS, type LatencySample } from "../src/l6-latency.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== G-094 L6 latency tests ===\n");

function mkSample(ms: number, i: number = 0): LatencySample {
  return { scan_id: `s${i}`, latency_ms: ms, at: "2026-04-19T05:00:00Z" };
}

// T1: empty histogram
console.log("T1: empty");
const h1 = buildHistogram([]);
assert(h1.total_samples === 0, "0 samples");
assert(h1.buckets.length === DEFAULT_BUCKETS_MS.length, "default buckets");
assert(h1.glyph_sentence.includes("samples=0"), "glyph");

// T2: single sample
console.log("\nT2: single");
const h2 = buildHistogram([mkSample(100)]);
assert(h2.total_samples === 1, "1");
assert(h2.min_ms === 100, "min=100");
assert(h2.max_ms === 100, "max=100");
assert(h2.avg_ms === 100, "avg=100");
assert(h2.p95_ms === 100, "p95");

// T3: min/max/avg correct
console.log("\nT3: stats correctness");
const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const h3 = buildHistogram(values.map(v => mkSample(v)));
assert(h3.min_ms === 10, "min");
assert(h3.max_ms === 100, "max");
assert(h3.avg_ms === 55, "avg=55");
assert(h3.median_ms === 60, "median=60 (5th of 10 0-indexed = 50th percentile)");

// T4: percentiles
console.log("\nT4: percentiles");
const values4: number[] = [];
for (let i = 1; i <= 100; i++) values4.push(i);  // 1..100
const h4 = buildHistogram(values4.map(v => mkSample(v)));
assert(h4.p95_ms === 96, `p95 (got ${h4.p95_ms})`);
assert(h4.p99_ms >= 99, "p99 near top");

// T5: bucket counts
console.log("\nT5: bucket counts");
const h5 = buildHistogram([
  mkSample(5),     // ≤10
  mkSample(25),    // ≤50
  mkSample(75),    // ≤100
  mkSample(200),   // ≤500
  mkSample(700),   // ≤1000
  mkSample(2000),  // ≤5000
]);
assert(h5.buckets[0].count === 1, "≤10 = 1");
assert(h5.buckets[1].count === 1, "≤50 = 1");
assert(h5.buckets[2].count === 1, "≤100 = 1");
assert(h5.buckets[3].count === 1, "≤500 = 1");

// T6: custom bucket bounds
console.log("\nT6: custom buckets");
const h6 = buildHistogram([mkSample(50), mkSample(150), mkSample(250)], [100, 200, 300]);
assert(h6.buckets.length === 3, "3 buckets");
assert(h6.buckets[0].count === 1, "≤100 = 1");
assert(h6.buckets[1].count === 1, "≤200 = 1");
assert(h6.buckets[2].count === 1, "≤300 = 1");

// T7: regression NOT detected when within threshold
console.log("\nT7: no regression");
const oldVals = Array.from({ length: 20 }, (_, i) => 50 + i);  // p95 ~= 69
const curVals = Array.from({ length: 20 }, (_, i) => 55 + i);  // p95 ~= 74 — +7%
const rNo = detectRegression(buildHistogram(oldVals.map(v => mkSample(v))), buildHistogram(curVals.map(v => mkSample(v))), 25);
assert(rNo.regression_detected === false, "no regression");
assert(rNo.glyph_sentence.includes("OK"), "ok glyph");

// T8: regression DETECTED
console.log("\nT8: regression detected");
const slowVals = Array.from({ length: 20 }, (_, i) => 100 + i * 10);  // p95 ~= 280
const rYes = detectRegression(buildHistogram(oldVals.map(v => mkSample(v))), buildHistogram(slowVals.map(v => mkSample(v))), 25);
assert(rYes.regression_detected === true, "regression detected");
assert(rYes.delta_percent > 25, "delta > threshold");
assert(rYes.glyph_sentence.includes("REGRESS-DETECTED"), "detected glyph");

// T9: insufficient samples bypasses regression
console.log("\nT9: insufficient samples");
const rSparse = detectRegression(buildHistogram([mkSample(10)]), buildHistogram([mkSample(100)]));
assert(rSparse.regression_detected === false, "skipped");
assert(rSparse.reason.includes("insufficient"), "reason cites insufficient");

// T10: custom threshold
console.log("\nT10: custom threshold");
const rLoose = detectRegression(
  buildHistogram(oldVals.map(v => mkSample(v))),
  buildHistogram(curVals.map(v => mkSample(v))),
  5  // very strict — 5%
);
// our curVals is ~+7% over oldVals, should exceed 5% threshold
assert(rLoose.regression_detected === true, "strict threshold catches small regression");

// T11: render histogram
console.log("\nT11: render");
const text = renderHistogram(h5);
assert(text.includes("L6 LATENCY HISTOGRAM"), "header");
assert(text.includes("samples=6"), "samples count");
assert(text.includes("p95="), "p95 shown");
assert(text.includes("█"), "bar character");
assert(text.includes("EVT-L6-LATENCY-HIST"), "glyph");

// T12: infinity bucket label
console.log("\nT12: infinity bucket");
assert(text.includes("∞"), "inf label rendered");

// T13: large workload — 10k samples
console.log("\nT13: 10k samples");
const large: LatencySample[] = [];
for (let i = 0; i < 10000; i++) large.push(mkSample(Math.random() * 500, i));
const hLarge = buildHistogram(large);
assert(hLarge.total_samples === 10000, "10k");
assert(hLarge.min_ms >= 0 && hLarge.max_ms <= 500, "values in range");
assert(hLarge.avg_ms > 200 && hLarge.avg_ms < 300, "avg near 250");
assert(hLarge.p95_ms > hLarge.median_ms, "p95 > median");

// T14: glyph shows p95/p99/max
console.log("\nT14: glyph content");
assert(h4.glyph_sentence.includes("p95=96ms"), "p95 in glyph");
assert(h4.glyph_sentence.includes("max=100ms"), "max in glyph");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-G-094-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
