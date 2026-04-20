#!/usr/bin/env node
// P1 upgrade tests for BilateralFingerprintTracker + GNNFeedbackCadenceAdjuster
// Covers: quorum verdict, regression detector, peer history (last 8),
//         symmetric cadence multipliers (0.8 / 1.25), neutral verdict, oscillation damper.

import { BilateralFingerprintTracker } from "../src/bilateral-fingerprint-tracker.mjs";
import { GNNFeedbackCadenceAdjuster } from "../src/gnn-feedback-cadence-adjuster.mjs";

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else       { fail++; console.log("  FAIL  " + label); }
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// ============================================================================
// BilateralFingerprintTracker
// ============================================================================

console.log("\n=== Tracker · QUORUM (2-agree + 1-diverge) ===");
{
  const t = new BilateralFingerprintTracker();
  const shaA = "a".repeat(64);
  const shaZ = "z".repeat(64);
  t.record("acer",  "EVT-Q", "a.json", shaA);
  t.record("liris", "EVT-Q", "a.json", shaA);
  const r = t.record("falcon", "EVT-Q", "a.json", shaZ);
  assert(r.verdict === "QUORUM", "2-agree + 1-diverge = QUORUM");
  assert(r.majority_sha === shaA, "majority_sha = agreed sha");
  assert(Array.isArray(r.majority_peers) && r.majority_peers.length === 2, "majority_peers has 2 entries");
  assert(r.majority_peers.includes("acer") && r.majority_peers.includes("liris"), "majority_peers = [acer,liris]");
  assert(r.minority_peers && r.minority_peers.falcon === shaZ, "minority_peers.falcon = divergent sha");
  assert(!("per_peer" in r), "QUORUM does not leak per_peer shape");
}

console.log("\n=== Tracker · DIVERGE (all-distinct, 3 peers) ===");
{
  const t = new BilateralFingerprintTracker();
  t.record("acer",   "EVT-D", "d.json", "a".repeat(64));
  t.record("liris",  "EVT-D", "d.json", "b".repeat(64));
  const r = t.record("falcon", "EVT-D", "d.json", "c".repeat(64));
  assert(r.verdict === "DIVERGE", "all-distinct → DIVERGE");
  assert(r.distinct_hashes === 3, "distinct_hashes=3");
  assert(r.per_peer.acer && r.per_peer.liris && r.per_peer.falcon, "per_peer has all 3 peers");
}

console.log("\n=== Tracker · BILATERAL-MATCH still works ===");
{
  const t = new BilateralFingerprintTracker();
  const sha = "f".repeat(64);
  t.record("acer",  "EVT-M", "m.json", sha);
  const r = t.record("liris", "EVT-M", "m.json", sha);
  assert(r.verdict === "BILATERAL-MATCH", "two peers same sha → MATCH");
  assert(r.sha256 === sha, "MATCH carries sha256");
}

console.log("\n=== Tracker · single-sided on first record ===");
{
  const t = new BilateralFingerprintTracker();
  const r = t.record("acer", "EVT-S", "s.json", "1".repeat(64));
  assert(r.verdict === "single-sided", "first record → single-sided");
}

console.log("\n=== Tracker · history retains last 8 entries per peer ===");
{
  const t = new BilateralFingerprintTracker();
  const verb = "EVT-H", art = "h.json";
  // Push 12 distinct shas for acer
  for (let i = 0; i < 12; i++) {
    const sha = String(i).padStart(64, "0");
    t.record("acer", verb, art, sha);
  }
  const latestSha = String(11).padStart(64, "0");
  const rec = t.records.get(`${verb}::${art}`);
  assert(rec.peers.acer.sha256 === latestSha, "latest sha stored at .sha256");
  assert(rec.peers.acer.history.length === 8, "history capped at 8");
  // history[] holds PRIOR snapshots (not the current latest). So oldest kept should be the 4th-pushed value (index 3 → '3'),
  // because we pushed 12 total; the first 3 priors fell off; index 4..11 stored as priors for latest=11.
  const oldestPriorSha = rec.peers.acer.history[0].sha;
  assert(oldestPriorSha === String(3).padStart(64, "0"), "oldest retained prior = '3'...");
  const newestPriorSha = rec.peers.acer.history[rec.peers.acer.history.length - 1].sha;
  assert(newestPriorSha === String(10).padStart(64, "0"), "newest retained prior = '10'...");
}

console.log("\n=== Tracker · peerHistory() returns prior + current ===");
{
  const t = new BilateralFingerprintTracker();
  t.record("acer", "EVT-PH", "p.json", "1".repeat(64));
  t.record("acer", "EVT-PH", "p.json", "2".repeat(64));
  t.record("acer", "EVT-PH", "p.json", "3".repeat(64));
  const h = t.peerHistory("acer", "EVT-PH", "p.json");
  assert(h.length === 3, "peerHistory returns 3 entries (2 prior + current)");
  assert(h[h.length - 1].sha === "3".repeat(64), "last entry = current latest");
  assert(h[0].sha === "1".repeat(64), "first entry = oldest recorded");
}

console.log("\n=== Tracker · REGRESSION detector ===");
{
  const t = new BilateralFingerprintTracker();
  const shaA = "a".repeat(64);
  const shaB = "b".repeat(64);
  t.record("acer", "EVT-R", "r.json", shaA);          // prior: A
  t.record("acer", "EVT-R", "r.json", shaB);          // prior: A,B ; latest=B
  const r = t.record("acer", "EVT-R", "r.json", shaA); // latest=A, but A is in history → REGRESSION
  assert(r.verdict === "REGRESSION", "reappearing prior sha → REGRESSION");
  assert(r.peer_id === "acer", "regression carries peer_id");
  assert(r.from_sha === shaB && r.to_sha === shaA, "regression carries from/to shas");
}

console.log("\n=== Tracker · no regression when sha unchanged (idempotent record) ===");
{
  const t = new BilateralFingerprintTracker();
  const sha = "c".repeat(64);
  t.record("acer", "EVT-IDEM", "i.json", sha);
  const r = t.record("acer", "EVT-IDEM", "i.json", sha); // same sha re-recorded
  assert(r.verdict !== "REGRESSION", "re-recording identical latest is not a regression");
  assert(r.verdict === "single-sided", "still single-sided (only acer)");
}

console.log("\n=== Tracker · snapshot reports quorums ===");
{
  const t = new BilateralFingerprintTracker();
  const shaA = "a".repeat(64);
  t.record("acer",  "EVT-SN", "s.json", shaA);
  t.record("liris", "EVT-SN", "s.json", shaA);
  t.record("falcon","EVT-SN", "s.json", "z".repeat(64));
  const snap = t.snapshot();
  assert(snap.total_keys === 1, "snapshot.total_keys");
  assert(snap.quorums === 1, "snapshot.quorums = 1");
  assert(snap.matches === 0, "snapshot.matches = 0 (quorum is not a match)");
}

// ============================================================================
// GNNFeedbackCadenceAdjuster
// ============================================================================

console.log("\n=== GNN · symmetric speed-up multiplier (0.8) ===");
{
  // Isolate: force score > 2.0 then one tick to verify exactly one 0.8× applied above damper band.
  const g = new GNNFeedbackCadenceAdjuster({ min_ms: 1000, max_ms: 1_000_000, initial_ms: 10_000, decay: 1.0 });
  // decay=1 so score accumulates predictably
  g.score = 3.0; // pre-seed above threshold
  const before = g.nextIntervalMs();
  // neutral tick carries no delta; with decay=1 score stays 3.0; damper skipped; speed-up applied
  g.onOutcome({ verdict: "neutral" });
  const after = g.nextIntervalMs();
  assert(after === Math.round(before * 0.8), `speed-up = 0.8× (before=${before}, after=${after})`);
}

console.log("\n=== GNN · symmetric slow-down multiplier (1.25) ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ min_ms: 1000, max_ms: 1_000_000, initial_ms: 10_000, decay: 1.0 });
  g.score = -3.0;
  const before = g.nextIntervalMs();
  g.onOutcome({ verdict: "neutral" });
  const after = g.nextIntervalMs();
  assert(after === Math.round(before * 1.25), `slow-down = 1.25× (before=${before}, after=${after})`);
}

console.log("\n=== GNN · speed-up and slow-down are inverses (symmetric) ===");
{
  // 0.8 × 1.25 = 1.0 exactly.
  assert(near(0.8 * 1.25, 1.0), "0.8 × 1.25 = 1.0 (multiplicative inverses)");
}

console.log("\n=== GNN · neutral verdict delta=0, decay still applied ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ decay: 0.5, initial_ms: 10_000 });
  g.score = 4.0;
  g.onOutcome({ verdict: "neutral" });
  assert(near(g.score, 2.0, 1e-9), `neutral: score = decay·prior (got ${g.score})`);
  const last = g.history[g.history.length - 1];
  assert(last.verdict === "neutral", "history records neutral verdict");
  assert(last.delta === 0, "neutral delta = 0");
}

console.log("\n=== GNN · oscillation damper (|score| < 0.5) ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ min_ms: 1000, max_ms: 1_000_000, initial_ms: 10_000, decay: 1.0 });
  g.score = 0.3;
  const before = g.nextIntervalMs();
  const r = g.onOutcome({ verdict: "neutral" });
  assert(r.damped === true, "damped flag true inside band");
  assert(g.nextIntervalMs() === before, "cadence unchanged while damped");
  assert(g.dampers_skipped === 1, "dampers_skipped incremented");
}

console.log("\n=== GNN · damper does NOT apply when |score| >= 0.5 ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ min_ms: 1000, max_ms: 1_000_000, initial_ms: 10_000, decay: 1.0 });
  g.score = 2.5; // above speed-up threshold
  const r = g.onOutcome({ verdict: "neutral" });
  assert(r.damped === false, "damped flag false outside band");
  assert(g.nextIntervalMs() < 10_000, "cadence adjusted (sped up) when score > 2.0");
}

console.log("\n=== GNN · clamp to [min_ms, max_ms] ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ min_ms: 5000, max_ms: 60_000, initial_ms: 10_000 });
  for (let i = 0; i < 50; i++) g.onOutcome({ verdict: "promote", intent: "leak", is_reply: true });
  assert(g.nextIntervalMs() >= 5000, "never below min_ms");
  for (let i = 0; i < 50; i++) g.onOutcome({ verdict: "halt", intent: "mask" });
  assert(g.nextIntervalMs() <= 60_000, "never above max_ms");
}

console.log("\n=== GNN · unknown verdict contributes 0 (fallthrough) ===");
{
  const g = new GNNFeedbackCadenceAdjuster({ decay: 1.0, initial_ms: 10_000 });
  g.score = 0;
  g.onOutcome({ verdict: "bogus" });
  assert(g.score === 0, "unknown verdict does not move score");
}

console.log("\n=== GNN · snapshot exposes factors ===");
{
  const g = new GNNFeedbackCadenceAdjuster();
  const s = g.snapshot();
  assert(s.factors && s.factors.speed_up === 0.8, "snapshot.factors.speed_up = 0.8");
  assert(near(s.factors.slow_down, 1.25), "snapshot.factors.slow_down = 1.25");
  assert(typeof s.dampers_skipped === "number", "snapshot.dampers_skipped present");
}

console.log("\n=== RESULTS ===");
console.log(`pass=${pass} fail=${fail} verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"}`);
process.exit(fail === 0 ? 0 : 1);
