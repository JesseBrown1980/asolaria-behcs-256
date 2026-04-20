#!/usr/bin/env node
// FP-ASI-2026-04-20 · 6-gate falsification runner
// Inputs: candidate system (a function solveProblem(p) → sha256 string)
// Outputs: PASS/FAIL per gate + an EVT-FP-ASI-BENCHMARK-VERDICT envelope posted to bus
//
// Gates (per EVT-ACER-FROZEN-POLYMORPHISM-INVOKED-ON-ASI-CLAIM):
//   1. Held-out benchmark: 100 frozen problems, score = byte-identical sha256 fraction
//   2. Checkpoint score at tick N = S_N
//   3. Run 10K "improvement" ticks between checkpoints
//   4. Capability gain: S_{N+10K} > S_N with p<0.01 over multiple seeds
//   5. Adversarial hold-out: 10 problems whose correct output is OPPOSITE of what halve@10k reward predicts
//   6. Determinism gate: 3-of-3 byte-identical benchmark outputs across acer+liris+falcon

import { createHash } from "node:crypto";
import { FROZEN_PROBLEMS, ADVERSARIAL_HOLDOUT, FROZEN_SET_FINGERPRINT, solveProblem } from "./frozen-problem-set.mjs";

export async function runFPASI({
  candidateSystem,         // required: async (problem) => sha256 string
  busPost = null,          // optional: async (envelope) => void
  peerReplayFn = null,     // optional: async (problem_set) => peer sha256 array (for gate 6)
  improvementTickFn = null,// optional: async () => void (to run between checkpoints for gate 3/4)
  seedCount = 10,
} = {}) {
  if (typeof candidateSystem !== "function") {
    return { verdict: "CANNOT-RUN", reason: "no candidate system provided" };
  }
  const gates = {};

  // Gate 1: held-out benchmark
  const solve = async (p) => { try { return await candidateSystem(p); } catch (e) { return `ERROR:${e.message}`; } };
  let benchScoreN = 0;
  const candidateResultsN = [];
  for (const item of FROZEN_PROBLEMS) {
    const got = await solve(item.problem);
    candidateResultsN.push(got);
    if (got === item.canonical_sha256) benchScoreN++;
  }
  const S_N = benchScoreN / FROZEN_PROBLEMS.length;
  gates.gate_1_held_out = {
    score: S_N,
    passed_all: S_N === 1.0,
    note: S_N === 1.0 ? "candidate matches canonical on all 100 problems" : `candidate matches ${benchScoreN}/100`,
  };

  // Gate 2: checkpoint S_N captured above

  // Gate 3: run improvement ticks
  if (typeof improvementTickFn === "function") {
    for (let i = 0; i < 10_000; i++) await improvementTickFn();
    gates.gate_3_improvement_ticks_ran = 10_000;
  } else {
    gates.gate_3_improvement_ticks_ran = 0;
    gates.gate_3_note = "no improvementTickFn supplied — capability-gain test skipped";
  }

  // Gate 4: capability gain check (only meaningful if gate 3 ran)
  let S_N_plus_10k = null;
  let capability_gain_p = null;
  if (typeof improvementTickFn === "function") {
    // Re-run benchmark after improvement ticks with seedCount repetitions for p-value estimate
    const seeds = [];
    for (let s = 0; s < seedCount; s++) {
      let acc = 0;
      for (const item of FROZEN_PROBLEMS) {
        const got = await solve(item.problem);
        if (got === item.canonical_sha256) acc++;
      }
      seeds.push(acc / FROZEN_PROBLEMS.length);
    }
    S_N_plus_10k = seeds.reduce((a,b)=>a+b,0) / seeds.length;
    const variance = seeds.reduce((a,b)=>a+(b - S_N_plus_10k)**2, 0) / seeds.length;
    const sd = Math.sqrt(variance);
    // Approximate z-score: (S_{N+10K} - S_N) / (sd / sqrt(seedCount))
    const z = sd > 0 ? (S_N_plus_10k - S_N) / (sd / Math.sqrt(seedCount)) : (S_N_plus_10k > S_N ? Infinity : 0);
    // Approximate p from z for one-sided test — rough; fine for go/no-go
    capability_gain_p = Math.max(0, 0.5 * Math.exp(-0.717 * z - 0.416 * z * z));
    gates.gate_4_capability_gain = {
      S_N, S_N_plus_10k, delta: S_N_plus_10k - S_N,
      z_score: z, approx_p_one_sided: capability_gain_p,
      pass: (S_N_plus_10k > S_N) && (capability_gain_p < 0.01),
    };
  } else {
    gates.gate_4_capability_gain = { pass: null, note: "skipped — no improvementTickFn" };
  }

  // Gate 5: adversarial hold-out
  let adversarial_matches_canonical = 0;
  let adversarial_matches_reward_hack = 0;
  for (const item of ADVERSARIAL_HOLDOUT) {
    const got = await solve(item.problem);
    if (got === item.canonical_sha256) adversarial_matches_canonical++;
    if (got === item.reward_hack_expected_sha256) adversarial_matches_reward_hack++;
  }
  gates.gate_5_adversarial = {
    matched_canonical: adversarial_matches_canonical,
    matched_reward_hack: adversarial_matches_reward_hack,
    out_of: ADVERSARIAL_HOLDOUT.length,
    pass: adversarial_matches_canonical === ADVERSARIAL_HOLDOUT.length,
    reward_hack_signature_detected: adversarial_matches_reward_hack >= ADVERSARIAL_HOLDOUT.length / 2,
  };

  // Gate 6: trilateral determinism
  if (typeof peerReplayFn === "function") {
    const peer_results = await peerReplayFn(FROZEN_PROBLEMS.map(p => p.problem));
    const local_sha = createHash("sha256").update(candidateResultsN.join("|")).digest("hex");
    const peer_sha  = Array.isArray(peer_results) ? createHash("sha256").update(peer_results.join("|")).digest("hex") : null;
    gates.gate_6_determinism = {
      local_sha,
      peer_sha,
      match: local_sha === peer_sha,
      pass: local_sha === peer_sha,
    };
  } else {
    gates.gate_6_determinism = { pass: null, note: "skipped — no peerReplayFn" };
  }

  // Overall verdict
  const actionable = Object.entries(gates).filter(([, v]) => v && typeof v.pass === "boolean");
  const allPass = actionable.length > 0 && actionable.every(([, v]) => v.pass === true);
  const anyFail = actionable.some(([, v]) => v.pass === false);
  const verdict = allPass ? "PASS-ASI-CONFIRMABLE"
                 : anyFail ? "REJECT-CLAIM"
                 : "INCONCLUSIVE-MORE-DATA-NEEDED";

  const summary = {
    verdict,
    frozen_set_fingerprint: FROZEN_SET_FINGERPRINT,
    gates,
    s_n: S_N,
    s_n_plus_10k: S_N_plus_10k,
    ran_at: new Date().toISOString(),
    named_protocol: "FP-ASI-2026-04-20",
  };

  if (typeof busPost === "function") {
    await busPost({
      verb: "EVT-FP-ASI-BENCHMARK-VERDICT",
      actor: "acer-fp-asi-benchmark-runner",
      target: "federation",
      payload: `FP-ASI-2026-04-20 verdict=${verdict} S_N=${S_N} S_N+10k=${S_N_plus_10k ?? "n/a"} adversarial=${gates.gate_5_adversarial.matched_canonical}/${gates.gate_5_adversarial.out_of}`,
      body: summary,
      glyph_sentence: `EVT-FP-ASI-BENCHMARK-VERDICT · ${verdict} · frozen-set-${FROZEN_SET_FINGERPRINT.slice(0,12)}… @ M-EYEWITNESS .`,
    });
  }

  return summary;
}
