#!/usr/bin/env node
// run-second-cascade.mjs — executes the real SECOND cascade and writes
// the result artifact to plans/deep-wave/second-cascade-result.json.

import { writeFileSync, mkdirSync } from "node:fs";
import { runSecondCascade } from "../src/cascade.ts";

const OUT = "C:/asolaria-acer/plans/deep-wave/second-cascade-result.json";
mkdirSync("C:/asolaria-acer/plans/deep-wave", { recursive: true });

console.log("DEEP WAVE SECOND CASCADE — 6×6×6×6×6×12 × omnishannon × GNN");
console.log("Executing both passes with GNN feedback learning...\n");

const t0 = Date.now();
const report = runSecondCascade();
const totalMs = Date.now() - t0;

console.log("── PASS 1 ──");
console.log(`  points:       ${report.first_pass.total_points}`);
console.log(`  green:        ${report.first_pass.green}`);
console.log(`  yellow:       ${report.first_pass.yellow}`);
console.log(`  red:          ${report.first_pass.red}`);
console.log(`  L5 promoted:  ${report.first_pass.l5_promoted}`);
console.log(`  GNN edges:    ${report.first_pass.gnn_edges_after}`);
console.log(`  runtime:      ${report.first_pass.runtime_ms}ms`);
console.log("");
console.log("── PASS 2 (SECOND CASCADE with learned GNN priors) ──");
console.log(`  points:       ${report.second_pass.total_points}`);
console.log(`  green:        ${report.second_pass.green}`);
console.log(`  yellow:       ${report.second_pass.yellow}`);
console.log(`  red:          ${report.second_pass.red}`);
console.log(`  L5 promoted:  ${report.second_pass.l5_promoted}`);
console.log(`  GNN edges:    ${report.second_pass.gnn_edges_after}`);
console.log(`  runtime:      ${report.second_pass.runtime_ms}ms`);
console.log("");
console.log("── DELTA ──");
console.log(`  Δgreen:       ${report.delta_green}`);
console.log(`  Δred:         ${report.delta_red}`);
console.log(`  Δpromoted:    ${report.delta_l5_promoted}`);
console.log(`  convergence:  ${report.convergence_signal}`);
console.log(`  total runtime: ${totalMs}ms`);
console.log("");
console.log(report.glyph_sentence);

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwrote ${OUT}`);
