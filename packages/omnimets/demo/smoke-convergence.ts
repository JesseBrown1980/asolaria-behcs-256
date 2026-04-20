// smoke-convergence.ts — run the 6×6×6×6×6×12 convergence engine on
// "SMP-V5-FUTURE-PATH" and verify dimensional coverage + convergence arithmetic.

import { runConvergence, BODIES, PHASES, LANES, snapshot, reset } from "../src/index.ts";

async function main(): Promise<void> {
  console.log("=== 6×6×6×6×6×12 CONVERGENCE ENGINE SMOKE (task #29) ===");
  console.log("");
  console.log(`[dimensions] bodies=${BODIES.length} × reflections=${BODIES.length} × waves=6 × phases=${PHASES.length} × lanes=${LANES.length} × iterations=12`);
  console.log(`[theoretical-max] ${BODIES.length * BODIES.length * 6 * PHASES.length * LANES.length * 12} cells`);
  console.log("");

  reset();
  const result = await runConvergence({
    target: "SMP-V5-FUTURE-PATH",
    waves: 6, iterations: 12, shortCircuit: true,
  });

  console.log("--- RESULT ---");
  console.log(`  target:                   ${result.target}`);
  console.log(`  theoretical_max_cells:    ${result.theoretical_max_cells}`);
  console.log(`  actual_cells_dispatched:  ${result.actual_cells_dispatched}`);
  console.log(`  short_circuits:           ${result.short_circuits}`);
  console.log(`  convergence_rate:         ${(result.convergence_rate * 100).toFixed(1)}%`);
  console.log(`  by_verdict:               ${JSON.stringify(result.by_verdict)}`);
  console.log(`  elapsed_ms:               ${result.elapsed_ms}`);
  console.log("");

  console.log("--- CONVERGENCE MAP (first 12 converged triplets) ---");
  const converged = result.convergence_map.filter((m) => m.converged_at_phase !== null).slice(0, 12);
  for (const c of converged) {
    console.log(`  ${c.body.padEnd(12)} × ${c.reflection.padEnd(12)} × ${c.lane.padEnd(12)} converged at phase=${c.converged_at_phase} wave=${c.converged_at_wave}`);
  }
  console.log(`  ... +${result.convergence_map.filter((m) => m.converged_at_phase !== null).length - 12} more`);
  console.log("");

  console.log("--- METS SNAPSHOT ---");
  const snap = snapshot();
  console.log(`  totals: dispatches=${snap.totals.dispatches} promotions=${snap.totals.promotions} deferrals=${snap.totals.deferrals} halts=${snap.totals.halts}`);
  console.log(`  per_lane:`);
  for (const [lane, s] of Object.entries(snap.per_lane)) {
    console.log(`    ${lane.padEnd(14)} dispatches=${s.dispatches} promote=${s.promotions} defer=${s.deferrals} halt=${s.halts}`);
  }
  console.log("");

  console.log("--- FINAL STAMP ---");
  console.log("  " + result.final_sentence);
  console.log("");

  const pass = result.actual_cells_dispatched > 0 &&
    result.by_verdict.CONVERGED > 0 &&
    result.convergence_rate > 0.3 &&
    result.short_circuits > 0;
  console.log(`PASS=${pass}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("fatal:", e); process.exit(2); });
