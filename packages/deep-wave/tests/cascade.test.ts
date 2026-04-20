import {
  enumerateCascade, runOmnishannon, makeGNN, gnnUpdate, gnnScoreOf,
  runCascadePass, runSecondCascade,
  DIM_ACTORS, DIM_VERBS, DIM_TARGETS, DIM_STATES, WAVES,
} from "../src/cascade.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Deep Wave SECOND cascade tests ===\n");

// T1: dimension sizes
console.log("T1: dims");
assert(DIM_ACTORS.length === 6, "6 actors");
assert(DIM_VERBS.length === 6, "6 verbs");
assert(DIM_TARGETS.length === 6, "6 targets");
assert(DIM_STATES.length === 6, "6 states");
assert(WAVES === 12, "12 waves");

// T2: enumerate shape = 6^5 × 12 = 93312
console.log("\nT2: shape count");
const points = enumerateCascade();
assert(points.length === 6 * 6 * 6 * 6 * 6 * 12, `count=${points.length} expected 93312`);
assert(points.length === 93312, "exactly 93312");

// T3: every point has unique hilbert_key
console.log("\nT3: unique keys");
const keys = new Set(points.map(p => p.hilbert_key));
assert(keys.size === points.length, "all keys unique");

// T4: every point has 16-char fingerprint
console.log("\nT4: fingerprint shape");
assert(points[0].fingerprint.length === 16, "16-char");
assert(/^[0-9a-f]+$/.test(points[0].fingerprint), "hex");

// T5: actor coverage
console.log("\nT5: actor coverage");
const byActor = new Map<string, number>();
for (const p of points) byActor.set(p.actor, (byActor.get(p.actor) ?? 0) + 1);
assert(byActor.size === 6, "6 distinct actors");
for (const [, count] of byActor) assert(count === 93312 / 6, "equal coverage per actor");

// T6: wave coverage
console.log("\nT6: wave coverage");
const byWave = new Map<number, number>();
for (const p of points) byWave.set(p.wave, (byWave.get(p.wave) ?? 0) + 1);
assert(byWave.size === 12, "12 waves");
for (const [, count] of byWave) assert(count === 93312 / 12, "equal per wave");

// T7: omnishannon — low-risk pending accept → promote
console.log("\nT7: omnishannon low-risk");
const gnn = makeGNN();
const lowRisk = points.find(p => p.risk === 0 && p.state === "pending")!;
const v = runOmnishannon(lowRisk, gnn);
assert(v.l0_l2_pass === true, "L0L2 pass");
assert(v.l3_verdict === "accept", "L3 accept");
assert(v.l5_verdict === "promote", "L5 promote");
assert(v.l6_final === "green", "green");

// T8: omnishannon — high-risk → halt/red
console.log("\nT8: high-risk");
const highRisk = points.find(p => p.risk === 5 && p.state === "pending")!;
const vH = runOmnishannon(highRisk, gnn);
assert(vH.l3_verdict === "reject", "high risk rejected");
assert(vH.l6_final === "red", "red");

// T9: omnishannon — failed state fails L0L2
console.log("\nT9: failed state");
const failed = points.find(p => p.state === "failed")!;
const vF = runOmnishannon(failed, gnn);
assert(vF.l0_l2_pass === false, "L0L2 fail");

// T10: GNN score read/write
console.log("\nT10: GNN");
const g = makeGNN();
assert(gnnScoreOf(g, "a", "b") === 0, "empty gnn = 0");
gnnUpdate(g, "a", "b", 0.3);
assert(gnnScoreOf(g, "a", "b") === 0.8, "0.5 base + 0.3");
gnnUpdate(g, "a", "b", -0.5);
assert(Math.abs(gnnScoreOf(g, "a", "b") - 0.3) < 0.001, "clamp low");
gnnUpdate(g, "a", "b", 10);
assert(gnnScoreOf(g, "a", "b") === 1, "clamp high to 1");

// T11: cascade pass 1 full execution
console.log("\nT11: cascade pass 1");
const gnnPass = makeGNN();
const p1 = runCascadePass(points, gnnPass, 1);
assert(p1.total_points === 93312, "93312 points");
assert(p1.green + p1.yellow + p1.red === 93312, "colors sum to total");
assert(p1.green > 0 && p1.red > 0, "both colors present");
assert(p1.runtime_ms >= 0, "runtime measured");
assert(p1.gnn_edges_after <= 36, "≤36 distinct edges (6 actors × 6 targets)");

// T12: actor/verb breakdown
console.log("\nT12: breakdown");
for (const a of DIM_ACTORS) {
  const sum = p1.by_actor[a].green + p1.by_actor[a].yellow + p1.by_actor[a].red;
  assert(sum === 93312 / 6, `actor ${a} has equal total`);
}

// T13: second cascade
console.log("\nT13: second cascade");
const report = runSecondCascade();
assert(report.total_points_per_pass === 93312, "93312 per pass");
assert(report.first_pass.pass_number === 1, "first pass number");
assert(report.second_pass.pass_number === 2, "second pass number");
assert(report.first_pass.green + report.first_pass.yellow + report.first_pass.red === 93312, "first pass sums");
assert(report.second_pass.green + report.second_pass.yellow + report.second_pass.red === 93312, "second pass sums");

// T14: second pass uses learned GNN priors
console.log("\nT14: GNN learning effect");
// Second pass should have more GNN edges than first because first pass seeded them
assert(report.second_pass.gnn_edges_after >= report.first_pass.gnn_edges_after, "GNN grew");
// Second pass may shift color distribution due to learned priors
// Delta should be non-zero or clearly steady (not random garbage)
assert(typeof report.delta_green === "number", "delta defined");
assert(["converging", "diverging", "steady"].includes(report.convergence_signal), "valid convergence");

// T15: runtime sanity (93312 points should run in <5s each pass)
console.log("\nT15: runtime");
assert(report.first_pass.runtime_ms < 5000, `pass 1 <5s (got ${report.first_pass.runtime_ms}ms)`);
assert(report.second_pass.runtime_ms < 5000, `pass 2 <5s (got ${report.second_pass.runtime_ms}ms)`);

// T16: glyph shape
console.log("\nT16: glyphs");
assert(p1.glyph_sentence.includes("CASCADE-PASS-1"), "pass 1 glyph");
assert(p1.glyph_sentence.includes("points=93312"), "point count in glyph");
assert(report.glyph_sentence.includes("SECOND-CASCADE"), "second glyph");
assert(report.glyph_sentence.includes("convergence="), "convergence in glyph");
assert(report.glyph_sentence.includes("6x6x6x6x6x12"), "shape in glyph");

// T17: determinism — same input produces same output
console.log("\nT17: determinism");
const r1a = runSecondCascade();
const r1b = runSecondCascade();
assert(r1a.first_pass.green === r1b.first_pass.green, "green deterministic");
assert(r1a.first_pass.red === r1b.first_pass.red, "red deterministic");
assert(r1a.second_pass.green === r1b.second_pass.green, "pass 2 deterministic");

// T18: l5 promotion accounting
console.log("\nT18: L5 promotions");
assert(p1.l5_promoted <= 93312, "promotions bounded");
assert(p1.l5_promoted === p1.green, "L5 promote = L6 green");

// T19: gnn_updates_this_pass non-negative
console.log("\nT19: gnn updates");
assert(p1.gnn_updates_this_pass >= 0, "non-neg updates");

// T20: unique wave positions
console.log("\nT20: wave 0..11");
const waves = new Set(points.map(p => p.wave));
assert(waves.size === 12, "12 distinct waves");
for (let i = 0; i < 12; i++) assert(waves.has(i), `has wave ${i}`);

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-DEEP-WAVE-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
