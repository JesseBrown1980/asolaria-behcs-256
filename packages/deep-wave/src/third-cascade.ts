// packages/deep-wave/src/third-cascade.ts — Deep Wave THIRD cascade
//
// The SECOND cascade (packages/deep-wave/src/cascade.ts) diverged: the
// naive +0.05 red / -0.02 green reward geometry saturated all 36 GNN
// edges under the red-dominant population. THIRD cascade tests three
// fixes:
//   (a) symmetric delta (±0.02)
//   (b) confidence-weighted updates (delta scales with evidence quality)
//   (c) periodic baseline reset (half the edge weight every N points)
//
// All three variants run on the same 93,312-point shape. Pure — caller
// picks the variant that produces the stability they want.

import { enumerateCascade, makeGNN, runOmnishannon, gnnUpdate, type CascadePoint, type GNNState } from "./cascade.ts";

export type RewardMode = "symmetric" | "confidence-weighted" | "periodic-reset";

export interface ThirdCascadeVariantResult {
  mode: RewardMode;
  passes: Array<{ pass: number; green: number; yellow: number; red: number; gnn_edges: number; runtime_ms: number }>;
  delta_green_pass1_to_pass_n: number;
  delta_red_pass1_to_pass_n: number;
  convergence: "converging" | "diverging" | "steady";
  n_passes: number;
  glyph_sentence: string;
}

function runOnePass(points: CascadePoint[], gnn: GNNState, mode: RewardMode, passNum: number, resetEvery: number): { green: number; yellow: number; red: number; runtime_ms: number } {
  const t0 = Date.now();
  let green = 0, yellow = 0, red = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const v = runOmnishannon(p, gnn);

    if (v.l6_final === "green") green++;
    else if (v.l6_final === "yellow") yellow++;
    else red++;

    let delta = 0;
    if (mode === "symmetric") {
      delta = v.l6_final === "red" ? 0.02 : v.l6_final === "green" ? -0.02 : 0;
    } else if (mode === "confidence-weighted") {
      // Scale delta by L4 evidence strength. INSUFFICIENT = full magnitude (untrusted),
      // STRONG = quarter magnitude (trusted, already settled), WEAK = half.
      const scale = v.l4_evidence === "STRONG" ? 0.25 : v.l4_evidence === "WEAK" ? 0.5 : 1.0;
      delta = (v.l6_final === "red" ? 0.02 : v.l6_final === "green" ? -0.02 : 0) * scale;
    } else if (mode === "periodic-reset") {
      delta = v.l6_final === "red" ? 0.02 : v.l6_final === "green" ? -0.02 : 0;
      // Every resetEvery points, halve every edge weight toward 0.5
      if (i > 0 && i % resetEvery === 0) {
        for (const e of gnn.edges.values()) {
          e.weight = 0.5 + (e.weight - 0.5) * 0.5;
        }
      }
    }

    if (delta !== 0) gnnUpdate(gnn, p.actor, p.target, delta);
  }
  return { green, yellow, red, runtime_ms: Date.now() - t0 };
}

export function runThirdCascadeVariant(mode: RewardMode, n_passes: number = 3, reset_every: number = 10000): ThirdCascadeVariantResult {
  const points = enumerateCascade();
  const gnn = makeGNN();
  const passes: ThirdCascadeVariantResult["passes"] = [];

  for (let i = 1; i <= n_passes; i++) {
    const r = runOnePass(points, gnn, mode, i, reset_every);
    passes.push({
      pass: i,
      green: r.green,
      yellow: r.yellow,
      red: r.red,
      gnn_edges: gnn.edges.size,
      runtime_ms: r.runtime_ms,
    });
  }

  const first = passes[0];
  const last = passes[passes.length - 1];
  const dGreen = last.green - first.green;
  const dRed = last.red - first.red;

  let convergence: "converging" | "diverging" | "steady";
  if (Math.abs(dGreen) + Math.abs(dRed) < points.length * 0.01) convergence = "steady";
  else if (dGreen > 0 || dRed < 0) convergence = "converging";
  else convergence = "diverging";

  return {
    mode,
    passes,
    delta_green_pass1_to_pass_n: dGreen,
    delta_red_pass1_to_pass_n: dRed,
    convergence,
    n_passes,
    glyph_sentence: `EVT-DEEP-WAVE-THIRD-CASCADE-${mode.toUpperCase()} · passes=${n_passes} · Δgreen=${dGreen} · Δred=${dRed} · convergence=${convergence} @ M-EYEWITNESS .`,
  };
}

export interface ThirdCascadeComparison {
  shape: string;
  points_per_pass: number;
  variants: {
    symmetric: ThirdCascadeVariantResult;
    confidence_weighted: ThirdCascadeVariantResult;
    periodic_reset: ThirdCascadeVariantResult;
  };
  winner: { mode: RewardMode; reason: string };
  glyph_sentence: string;
}

// Compare all three reward geometries on the same shape; pick the most stable
export function compareThirdCascadeVariants(n_passes: number = 3): ThirdCascadeComparison {
  const symmetric = runThirdCascadeVariant("symmetric", n_passes);
  const confidence = runThirdCascadeVariant("confidence-weighted", n_passes);
  const periodic = runThirdCascadeVariant("periodic-reset", n_passes);

  const variants = [
    { mode: "symmetric" as const, r: symmetric },
    { mode: "confidence-weighted" as const, r: confidence },
    { mode: "periodic-reset" as const, r: periodic },
  ];

  // Winner: converging > steady > diverging; break ties by larger Δgreen
  const rank = { converging: 2, steady: 1, diverging: 0 };
  let winner = variants[0];
  for (const v of variants.slice(1)) {
    if (rank[v.r.convergence] > rank[winner.r.convergence]) winner = v;
    else if (rank[v.r.convergence] === rank[winner.r.convergence] && v.r.delta_green_pass1_to_pass_n > winner.r.delta_green_pass1_to_pass_n) winner = v;
  }

  return {
    shape: "6×6×6×6×6×12 = 93312",
    points_per_pass: 93312,
    variants: { symmetric, confidence_weighted: confidence, periodic_reset: periodic },
    winner: { mode: winner.mode, reason: `best convergence (${winner.r.convergence}) with Δgreen=${winner.r.delta_green_pass1_to_pass_n}` },
    glyph_sentence: `EVT-DEEP-WAVE-THIRD-COMPARISON · winner=${winner.mode} · sym=${symmetric.convergence} · conf=${confidence.convergence} · periodic=${periodic.convergence} @ M-EYEWITNESS .`,
  };
}
