// STAGE→ACTUAL converter
// Pipeline: envelope → hookwall gate → Shannon L0-L6 → whiteroom cube address → OmniGNN + reverse-gain-GNN agreement gate → promote to ACTUAL or park in STAGE.
// Supervisors attributed per-envelope by Hilbert room PID.
// Dual-GNN disagreement = HALT + super-gulp for adjudication (never rubber-stamp).

import { createHash } from "node:crypto";

export const SUPERVISOR_PIDS = Object.freeze({
  gc:             { room: 24, pid: "PID-H04-A01-W024000000-P024-N00001", glyph: "PROF-GC-SUPERVISOR" },
  gnn:            { room: 25, pid: "PID-H04-A01-W025000000-P025-N00001", glyph: "PROF-GNN-SUPERVISOR" },
  unison:         { room: 26, pid: "PID-H04-A01-W026000000-P026-N00001", glyph: "PROF-UNISON-PROCESSOR" },
  supervisor_daemon: { room: 27, pid: "PID-H04-A01-W027000000-P027-N00001", glyph: "PROF-SUPERVISOR-DAEMON" },
  bus_mirror:     { room: 28, pid: "PID-H04-A01-W028000000-P028-N00001", glyph: "PROF-BUS-MIRROR" },
  bus_and_kick:   { room: 29, pid: "PID-H04-A01-W029000000-P029-N00001", glyph: "PROF-BUS-AND-KICK" },
  gc_inbox:       { room: 35, pid: "PID-H04-A01-W035000000-P035-N00001", glyph: "PROF-GC-INBOX-SUPERVISOR" },
  msg_tracker:    { room: 36, pid: "PID-H04-A01-W036000000-P036-N00001", glyph: "PROF-MESSAGE-TRACKER-SUPERVISOR" },
  super_gulp:     { room: 37, pid: "PID-H04-A01-W037000000-P037-N00001", glyph: "PROF-SUPER-GULP-SUPERVISOR" },
  gc_gnn_feeder:  { room: 38, pid: "PID-H04-A01-W038000000-P038-N00001", glyph: "PROF-GC-GNN-FEEDER" },
  falcon_kicker:  { room: 39, pid: "PID-H04-A01-W039000000-P039-N00001", glyph: "PROF-FALCON-FRONT-END-KICKER" },
});

// ─── Hookwall gate — 14-event PreToolUse-style check ───
export function hookwallGate(envelope) {
  // Returns pass/fail/flag + reason. Deterministic on envelope shape.
  if (!envelope || typeof envelope !== "object") return { verdict: "fail", reason: "not-object" };
  if (!envelope.verb || typeof envelope.verb !== "string") return { verdict: "fail", reason: "no-verb" };
  if (envelope.verb.includes("HALT")) return { verdict: "flag", reason: "halt-verb" };
  if (envelope._sig_check?.verdict === "REJECTED") return { verdict: "fail", reason: "signature-rejected" };
  return { verdict: "pass", attributed_to: SUPERVISOR_PIDS.gc_gnn_feeder };
}

// ─── Shannon L0-L6 — compute deterministic verdict score from envelope canonical form ───
export function shannonVerdict(envelope) {
  const canon = JSON.stringify(Object.entries(envelope).sort());
  const h = createHash("sha256").update(canon).digest();
  // 7 L-levels; score = sum of L-level bits / 7
  const L0 = h[0] & 1; const L1 = (h[0] >> 1) & 1;
  const L2 = (h[1] & 1); const L3 = (h[1] >> 1) & 1;
  const L4 = (h[2] & 1); const L5 = (h[2] >> 1) & 1;
  const L6 = (h[3] & 1);
  const score = (L0 + L1 + L2 + L3 + L4 + L5 + L6) / 7;
  return { levels: { L0,L1,L2,L3,L4,L5,L6 }, score, attributed_to: SUPERVISOR_PIDS.gnn };
}

// ─── Whiteroom cube addressing — 3×6×6 per packages/whiteroom-consumer ───
export function whiteroomCubeAddress(envelope) {
  const canon = JSON.stringify(Object.entries(envelope.body || envelope).sort());
  const sha = createHash("sha256").update(canon).digest("hex");
  const layer = parseInt(sha.slice(0, 3), 16) % 3;
  const axis1 = parseInt(sha.slice(3, 4), 16) % 6;
  const axis2 = parseInt(sha.slice(4, 5), 16) % 6;
  return { sha, cube_address: [layer, axis1, axis2], attributed_to: SUPERVISOR_PIDS.super_gulp };
}

// ─── OmniGNN (forward) — composes hookwall + shannon + whiteroom into a node embedding ───
export function omniGnnScore({ hookwall, shannon, whiteroom }) {
  if (hookwall.verdict === "fail") return { score: 0, decision: "stage", attributed_to: SUPERVISOR_PIDS.gnn };
  // normalize components to [0,1]
  const h_score = hookwall.verdict === "pass" ? 1 : 0.3;  // flag = 0.3
  const s_score = shannon.score;                           // 0..1
  const w_score = (whiteroom.cube_address[0] + whiteroom.cube_address[1] / 6 + whiteroom.cube_address[2] / 36) / 3;  // 0..1-ish
  // weighted ensemble (reverse-gain-friendly weights from D11=PROVEN spec)
  const score = 0.4 * h_score + 0.35 * s_score + 0.25 * w_score;
  const decision = score > 0.65 ? "actual" : score > 0.35 ? "candidate" : "stage";
  return { score, decision, components: { h_score, s_score, w_score }, attributed_to: SUPERVISOR_PIDS.gnn };
}

// ─── Reverse-gain GNN — same inputs, but sign-flipped on mask-intent signals ───
// Per reverse-gain methodology: mask signals lower the score (opposite of leak which raises it).
export function reverseGainGnnScore({ hookwall, shannon, whiteroom, envelope }) {
  if (hookwall.verdict === "fail") return { score: 0, decision: "stage", attributed_to: SUPERVISOR_PIDS.gc_gnn_feeder };
  const h_score = hookwall.verdict === "pass" ? 1 : 0.3;
  const s_score = shannon.score;
  const w_score = (whiteroom.cube_address[0] + whiteroom.cube_address[1] / 6 + whiteroom.cube_address[2] / 36) / 3;
  // Detect "mask" intent markers
  const verbLower = String(envelope.verb || "").toLowerCase();
  const bodyStr = JSON.stringify(envelope.body || "").toLowerCase();
  const has_mask_marker = /mask|stealth|deceive|hide|obfuscate|stage/.test(verbLower + " " + bodyStr);
  const mask_flip = has_mask_marker ? -1 : 1;
  // reverse-gain weights mirror forward but flip sign on mask signal
  const score = 0.4 * h_score + 0.35 * (s_score * mask_flip * 0.5 + 0.5) + 0.25 * w_score;
  const decision = score > 0.65 ? "actual" : score > 0.35 ? "candidate" : "stage";
  return { score, decision, components: { h_score, s_score, w_score, mask_flip }, attributed_to: SUPERVISOR_PIDS.gc_gnn_feeder };
}

// ─── Agreement gate — promote only on dual-GNN agreement, HALT on disagreement ───
export function agreementGate({ omni, reverse }) {
  if (omni.decision === reverse.decision) {
    return { agree: true, joint_decision: omni.decision, confidence: (omni.score + reverse.score) / 2 };
  }
  // Disagreement = HALT + super-gulp for adjudication
  return {
    agree: false,
    joint_decision: "halt-for-adjudication",
    omni_says: omni.decision,
    reverse_says: reverse.decision,
    confidence: 0,
    escalate_to: SUPERVISOR_PIDS.super_gulp,
  };
}

// ─── Main converter ───
export function convertStageToActual(envelope) {
  const hookwall = hookwallGate(envelope);
  const shannon = shannonVerdict(envelope);
  const whiteroom = whiteroomCubeAddress(envelope);
  const omni = omniGnnScore({ hookwall, shannon, whiteroom });
  const reverse = reverseGainGnnScore({ hookwall, shannon, whiteroom, envelope });
  const agreement = agreementGate({ omni, reverse });
  return {
    envelope_id: envelope.id || null,
    envelope_verb: envelope.verb || null,
    hookwall,
    shannon: { score: shannon.score },
    whiteroom: { cube_address: whiteroom.cube_address, sha_prefix: whiteroom.sha.slice(0, 16) },
    omni_gnn: { score: omni.score, decision: omni.decision },
    reverse_gnn: { score: reverse.score, decision: reverse.decision },
    agreement,
    final_outcome: agreement.agree ? agreement.joint_decision : "halt-super-gulp",
    supervisor_chain: [
      SUPERVISOR_PIDS.gc_gnn_feeder.pid,  // hookwall
      SUPERVISOR_PIDS.gnn.pid,            // shannon + omni
      SUPERVISOR_PIDS.super_gulp.pid,     // whiteroom + reverse-gain + adjudication
    ],
    processed_at: new Date().toISOString(),
  };
}

// ─── Batch converter with output partitioning ───
export function convertBatch(envelopes) {
  const out = { actual: [], candidate: [], stage: [], halt_super_gulp: [] };
  const stats = { total: envelopes.length, actual: 0, candidate: 0, stage: 0, halt_super_gulp: 0 };
  for (const env of envelopes) {
    const result = convertStageToActual(env);
    const bucket = result.final_outcome === "actual" ? "actual"
                 : result.final_outcome === "candidate" ? "candidate"
                 : result.final_outcome === "stage" ? "stage"
                 : "halt_super_gulp";
    out[bucket].push(result);
    stats[bucket]++;
  }
  return { buckets: out, stats };
}
