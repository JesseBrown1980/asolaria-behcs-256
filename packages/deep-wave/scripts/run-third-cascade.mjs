#!/usr/bin/env node
// run-third-cascade.mjs — executes the THIRD cascade comparison across
// three reward geometries and writes the result artifact.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { compareThirdCascadeVariants } from "../src/third-cascade.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_ROOT || resolvePath(__dirname, "../../..");
const OUT_DIR = resolvePath(REPO_ROOT, "plans/deep-wave");
const OUT = resolvePath(OUT_DIR, "third-cascade-comparison.json");
mkdirSync(OUT_DIR, { recursive: true });

console.log("DEEP WAVE THIRD CASCADE — reward geometry comparison");
console.log("Shape: 6×6×6×6×6×12 = 93,312 points, 3 passes each variant\n");

const t0 = Date.now();
const cmp = compareThirdCascadeVariants(3);
const totalMs = Date.now() - t0;

for (const [label, r] of Object.entries(cmp.variants)) {
  console.log(`── ${label.toUpperCase()} (${r.mode}) ──`);
  for (const p of r.passes) {
    console.log(`  pass ${p.pass}: green=${p.green.toString().padStart(5)} yellow=${p.yellow.toString().padStart(5)} red=${p.red.toString().padStart(6)} gnn-edges=${p.gnn_edges} runtime=${p.runtime_ms}ms`);
  }
  console.log(`  convergence: ${r.convergence}  · Δgreen=${r.delta_green_pass1_to_pass_n}  · Δred=${r.delta_red_pass1_to_pass_n}`);
  console.log("");
}

console.log(`── WINNER ──`);
console.log(`  mode:   ${cmp.winner.mode}`);
console.log(`  reason: ${cmp.winner.reason}`);
console.log(`  total runtime: ${totalMs}ms`);
console.log("");
console.log(cmp.glyph_sentence);

writeFileSync(OUT, JSON.stringify(cmp, null, 2));
console.log(`\nwrote ${OUT}`);
