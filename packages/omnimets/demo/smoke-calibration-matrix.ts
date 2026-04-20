// smoke-calibration-matrix.ts — measure per-factor rate delta for each
// Shannon-18 calibration deferred from the prior pass (#15, #17, #14).
// 8 runs: baseline + 3 single-factor + 3 pair + 1 all-three.

import { runConvergence } from "../src/index.ts";

interface Row { label: string; config: Record<string, boolean>; rate: number; cells: number; converged: number; elapsed: number; }

async function main(): Promise<void> {
  const passes: Array<{ label: string; cfg: { sealRequiresRatify?: boolean; laneModulatedKinship?: boolean; asymmetricDensity?: boolean } }> = [
    { label: "baseline (all off)",           cfg: { sealRequiresRatify: false, laneModulatedKinship: false, asymmetricDensity: false } },
    { label: "#15 seal-requires-ratify",     cfg: { sealRequiresRatify: true,  laneModulatedKinship: false, asymmetricDensity: false } },
    { label: "#17 lane-modulated",           cfg: { sealRequiresRatify: false, laneModulatedKinship: true,  asymmetricDensity: false } },
    { label: "#14 asymmetric-density",       cfg: { sealRequiresRatify: false, laneModulatedKinship: false, asymmetricDensity: true  } },
    { label: "#15+#17",                      cfg: { sealRequiresRatify: true,  laneModulatedKinship: true,  asymmetricDensity: false } },
    { label: "#15+#14",                      cfg: { sealRequiresRatify: true,  laneModulatedKinship: false, asymmetricDensity: true  } },
    { label: "#17+#14",                      cfg: { sealRequiresRatify: false, laneModulatedKinship: true,  asymmetricDensity: true  } },
    { label: "ALL THREE (#15+#17+#14)",      cfg: { sealRequiresRatify: true,  laneModulatedKinship: true,  asymmetricDensity: true  } },
  ];

  console.log("=== CALIBRATION MATRIX (8 passes) ===");
  console.log("Measuring per-factor rate delta for Shannon-18 deferred calibrations.");
  console.log("");

  const rows: Row[] = [];
  for (const p of passes) {
    const r = await runConvergence({
      target: `CAL-${p.label.replace(/[^A-Z0-9]/gi, "-")}`,
      waves: 6, iterations: 12, shortCircuit: true, shortCircuitKConsecutive: 3,
      ...p.cfg,
    });
    rows.push({
      label: p.label,
      config: p.cfg as Record<string, boolean>,
      rate: r.convergence_rate, cells: r.actual_cells_dispatched,
      converged: r.by_verdict.CONVERGED, elapsed: r.elapsed_ms ?? 0,
    });
    console.log(`  ${p.label.padEnd(34)}  rate=${(r.convergence_rate*100).toFixed(1).padStart(5)}%  cells=${String(r.actual_cells_dispatched).padStart(6)}  converged=${String(r.by_verdict.CONVERGED).padStart(5)}  elapsed=${r.elapsed}ms`);
  }

  console.log("");
  console.log("=== DELTA TABLE (vs baseline) ===");
  const baseline = rows[0];
  for (const r of rows.slice(1)) {
    const rateDelta = ((r.rate - baseline.rate) * 100).toFixed(1);
    const cellsDelta = r.cells - baseline.cells;
    const elapsedDelta = r.elapsed - baseline.elapsed;
    console.log(`  ${r.label.padEnd(34)}  Δrate=${rateDelta.padStart(6)}pp  Δcells=${String(cellsDelta).padStart(7)}  Δelapsed=${String(elapsedDelta).padStart(7)}ms`);
  }

  console.log("");
  console.log("=== STAMP ===");
  const best = rows.reduce((a, b) => a.rate > b.rate ? a : b);
  console.log(`  META-CALIBRATION-MATRIX · best-factor-stack=${best.label} · best-rate=${(best.rate*100).toFixed(1)}% · baseline-rate=${(baseline.rate*100).toFixed(1)}% · ΔPP=${((best.rate-baseline.rate)*100).toFixed(1)} @ M-INDICATIVE .`);
  process.exit(0);
}

main().catch((e) => { console.error("fatal:", e); process.exit(2); });
