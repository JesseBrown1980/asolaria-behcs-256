// packages/deep-wave/src/cascade.ts — Deep Wave SECOND Cascade
//
// Shape: 6 × 6 × 6 × 6 × 6 × 12 = 93,312 points per pass.
//   D1 actor (6)    acer, liris, falcon, felipe, beast, dan
//   D2 verb (6)     scan-dispatch, scan-result, drift-detected,
//                   cosign-append, migration-intent, heartbeat
//   D3 target (6)   acer, liris, falcon, federation, phantom, witness
//   D4 risk (6)     0..5
//   D5 state (6)    pending, in-flight, dispatched, settled, failed, observed
//   D6 wave (12)    w0..w11 positions in the 12-beat cycle
//
// × Omnishannon: every point runs L0→L2 (pre-filter) → L3→L5 (classify
//   + synthesize + verdict) → L6 (finalize). Verdict gates propagation
//   into the SECOND cascade.
//
// × GNN: per-edge risk score is computed from actor/verb/target
//   fingerprint. Edges learned from the first cascade seed the second
//   cascade's prior — that is what makes this a SECOND cascade rather
//   than two independent passes.
//
// Pure — deterministic. No I/O. Caller wires output to behcs receipts.

import { createHash } from "node:crypto";

export const DIM_ACTORS = ["acer", "liris", "falcon", "felipe", "beast", "dan"] as const;
export const DIM_VERBS = ["scan-dispatch", "scan-result", "drift-detected", "cosign-append", "migration-intent", "heartbeat"] as const;
export const DIM_TARGETS = ["acer", "liris", "falcon", "federation", "phantom", "witness"] as const;
export const DIM_STATES = ["pending", "in-flight", "dispatched", "settled", "failed", "observed"] as const;
export const WAVES = 12;

export type Actor = typeof DIM_ACTORS[number];
export type Verb = typeof DIM_VERBS[number];
export type Target = typeof DIM_TARGETS[number];
export type State = typeof DIM_STATES[number];

export interface CascadePoint {
  actor: Actor;
  verb: Verb;
  target: Target;
  risk: 0 | 1 | 2 | 3 | 4 | 5;
  state: State;
  wave: number;               // 0..11
  hilbert_key: string;        // "D1:actor/D2:verb/D3:target/D4:risk/D5:state/D6:w"
  fingerprint: string;        // sha256-slice of the above
}

export interface OmniShannonVerdict {
  l0_l2_pass: boolean;
  l3_verdict: "accept" | "reject";
  l4_evidence: "STRONG" | "WEAK" | "INSUFFICIENT";
  l5_verdict: "promote" | "halt" | "pending";
  l6_final: "green" | "yellow" | "red";
}

export interface GNNEdge {
  src: string;                // actor
  dst: string;                // target
  weight: number;             // risk contribution 0..1
  edge_id: string;
}

export interface GNNState {
  edges: Map<string, GNNEdge>;
  updates: number;
}

export function makeGNN(): GNNState { return { edges: new Map(), updates: 0 }; }

export function gnnScoreOf(gnn: GNNState, src: string, dst: string): number {
  const key = `${src}→${dst}`;
  return gnn.edges.get(key)?.weight ?? 0;
}

export function gnnUpdate(gnn: GNNState, src: string, dst: string, delta: number): void {
  const key = `${src}→${dst}`;
  const existing = gnn.edges.get(key);
  const weight = Math.min(1, Math.max(0, (existing?.weight ?? 0.5) + delta));
  gnn.edges.set(key, { src, dst, weight, edge_id: key });
  gnn.updates++;
}

// Enumerate the full 6×6×6×6×6×12 = 93312 shape
export function enumerateCascade(): CascadePoint[] {
  const points: CascadePoint[] = [];
  for (const actor of DIM_ACTORS) {
    for (const verb of DIM_VERBS) {
      for (const target of DIM_TARGETS) {
        for (let risk = 0; risk <= 5; risk++) {
          for (const state of DIM_STATES) {
            for (let wave = 0; wave < WAVES; wave++) {
              const key = `D1:${actor}/D2:${verb}/D3:${target}/D4:${risk}/D5:${state}/D6:w${wave}`;
              const fp = createHash("sha256").update(key).digest("hex").slice(0, 16);
              points.push({ actor, verb, target, risk: risk as any, state, wave, hilbert_key: key, fingerprint: fp });
            }
          }
        }
      }
    }
  }
  return points;
}

// Omnishannon L0→L6 gate per point
export function runOmnishannon(p: CascadePoint, gnn: GNNState): OmniShannonVerdict {
  const l0_l2_pass = p.state !== "failed";
  const l3_verdict = p.risk <= 3 && p.state !== "observed" ? "accept" : "reject";
  const gnnRisk = gnnScoreOf(gnn, p.actor, p.target);
  const l4_evidence = gnnRisk < 0.3 ? "STRONG" : gnnRisk < 0.6 ? "WEAK" : "INSUFFICIENT";
  const l5_verdict =
    l3_verdict === "accept" && l4_evidence === "STRONG" ? "promote"
    : l3_verdict === "reject" || l4_evidence === "INSUFFICIENT" ? "halt"
    : "pending";
  const l6_final =
    l5_verdict === "promote" ? "green"
    : l5_verdict === "halt" ? "red"
    : "yellow";
  return { l0_l2_pass, l3_verdict, l4_evidence, l5_verdict, l6_final };
}

// Single cascade pass: evaluate all points, update GNN from outcomes, return summary
export interface CascadePassResult {
  pass_number: 1 | 2;
  total_points: number;
  green: number;
  yellow: number;
  red: number;
  l0_l2_rejected: number;
  l3_rejected: number;
  l4_insufficient: number;
  l5_promoted: number;
  gnn_edges_after: number;
  gnn_updates_this_pass: number;
  by_actor: Record<Actor, { green: number; yellow: number; red: number }>;
  by_verb: Record<Verb, { green: number; yellow: number; red: number }>;
  runtime_ms: number;
  glyph_sentence: string;
}

export function runCascadePass(
  points: CascadePoint[],
  gnn: GNNState,
  pass_number: 1 | 2,
): CascadePassResult {
  const t0 = Date.now();
  const byActor = {} as any;
  const byVerb = {} as any;
  for (const a of DIM_ACTORS) byActor[a] = { green: 0, yellow: 0, red: 0 };
  for (const v of DIM_VERBS) byVerb[v] = { green: 0, yellow: 0, red: 0 };

  let green = 0, yellow = 0, red = 0;
  let l012Rej = 0, l3Rej = 0, l4Ins = 0, l5Promo = 0;
  const priorUpdates = gnn.updates;

  for (const p of points) {
    const v = runOmnishannon(p, gnn);
    if (!v.l0_l2_pass) l012Rej++;
    if (v.l3_verdict === "reject") l3Rej++;
    if (v.l4_evidence === "INSUFFICIENT") l4Ins++;
    if (v.l5_verdict === "promote") l5Promo++;

    if (v.l6_final === "green") { green++; byActor[p.actor].green++; byVerb[p.verb].green++; }
    else if (v.l6_final === "yellow") { yellow++; byActor[p.actor].yellow++; byVerb[p.verb].yellow++; }
    else { red++; byActor[p.actor].red++; byVerb[p.verb].red++; }

    // GNN learns from outcome: red edges weight up, green edges weight down
    const delta = v.l6_final === "red" ? 0.05 : v.l6_final === "green" ? -0.02 : 0;
    if (delta !== 0) gnnUpdate(gnn, p.actor, p.target, delta);
  }

  const runtime = Date.now() - t0;
  const updatesThisPass = gnn.updates - priorUpdates;

  return {
    pass_number,
    total_points: points.length,
    green, yellow, red,
    l0_l2_rejected: l012Rej,
    l3_rejected: l3Rej,
    l4_insufficient: l4Ins,
    l5_promoted: l5Promo,
    gnn_edges_after: gnn.edges.size,
    gnn_updates_this_pass: updatesThisPass,
    by_actor: byActor,
    by_verb: byVerb,
    runtime_ms: runtime,
    glyph_sentence: `EVT-DEEP-WAVE-CASCADE-PASS-${pass_number} · points=${points.length} · green=${green} · yellow=${yellow} · red=${red} · gnn-edges=${gnn.edges.size} · runtime=${runtime}ms @ M-EYEWITNESS .`,
  };
}

export interface SecondCascadeReport {
  shape: string;
  total_points_per_pass: number;
  first_pass: CascadePassResult;
  second_pass: CascadePassResult;
  delta_green: number;
  delta_red: number;
  delta_l5_promoted: number;
  convergence_signal: "converging" | "diverging" | "steady";
  glyph_sentence: string;
}

// SECOND cascade: run pass 1, let GNN learn, then run pass 2 with learned priors.
// The delta between passes shows whether the feedback loop stabilizes.
export function runSecondCascade(): SecondCascadeReport {
  const points = enumerateCascade();
  const gnn = makeGNN();
  const first = runCascadePass(points, gnn, 1);
  const second = runCascadePass(points, gnn, 2);

  const deltaGreen = second.green - first.green;
  const deltaRed = second.red - first.red;
  const deltaPromote = second.l5_promoted - first.l5_promoted;

  let convergence: "converging" | "diverging" | "steady";
  if (Math.abs(deltaGreen) + Math.abs(deltaRed) < points.length * 0.01) convergence = "steady";
  else if (deltaGreen > 0) convergence = "converging";
  else convergence = "diverging";

  return {
    shape: "6×6×6×6×6×12 = 93312",
    total_points_per_pass: points.length,
    first_pass: first,
    second_pass: second,
    delta_green: deltaGreen,
    delta_red: deltaRed,
    delta_l5_promoted: deltaPromote,
    convergence_signal: convergence,
    glyph_sentence: `EVT-DEEP-WAVE-SECOND-CASCADE · shape=6x6x6x6x6x12 · per-pass=${points.length} · Δgreen=${deltaGreen} · Δred=${deltaRed} · Δpromote=${deltaPromote} · convergence=${convergence} @ M-EYEWITNESS .`,
  };
}
