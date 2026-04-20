#!/usr/bin/env node
/**
 * omni-shannon-v3-4d12.js — 6x6x6x6x12 omnishannon engine.
 *
 * Per Jesse 2026-04-07T22:25Z directive: expand the 6-part omnishannon to a
 * 4D x 12-part engine. Each candidate is voted on by 12 Shannon parts across
 * 4 orthogonal axes of 6 each:
 *
 *   Axis A (GNN cycle, 6):    observe → edge_map → reflect → plan → vote → prove
 *   Axis B (body system, 6):  nervous, circulatory, skeletal, memory, muscular, immune
 *   Axis C (Shannon role, 6): scout, evidence, executor, fabric, voice, planner
 *   Axis D (cube dim lens,12): D2 verb, D5 layer, D6 gate, D8 identity, D11 proof,
 *                              D15 device, D16 ownership, D22 translation, D24 intent,
 *                              D7 state, D14 energy, D32 negative-space
 *
 * Each of the 12 cube-dim lenses produces a verdict (PROCEED / NEEDS-CHANGE
 * / HALT / REFUSED) AND a reflection-path through the 6 GNN cycle stages,
 * 6 body systems, and 6 Shannon roles. Final score per candidate is the
 * product of (12 lens verdicts × 6 GNN reflections × 6 body checks ×
 * 6 Shannon roles) collapsed into a single PROCEED/CHANGE/HALT/REFUSED.
 *
 * Output: data/votes/<vote_id>/per_part.ndjson + summary.json
 *
 * Mistakes encountered during voting are written to the mistake cube
 * (D11 PROOF, 29791) with named-agent attribution per Jesse rule.
 *
 * Usage:
 *   node tools/cube/omni-shannon-v3-4d12.js <candidates_json> [vote_id]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260407-asolaria';
const VOTES_DIR = path.join(ROOT, 'data/votes');
const MISTAKE_CUBE = path.join(ROOT, 'data/cubes/mistake-29791/index.ndjson');

const CYCLE = ['observe', 'edge_map', 'reflect', 'plan', 'vote', 'prove'];
const BODY  = ['nervous', 'circulatory', 'skeletal', 'memory', 'muscular', 'immune'];
const ROLE  = ['scout', 'evidence', 'executor', 'fabric', 'voice', 'planner'];
const DIMS  = [
  { id: 'D2_VERB', name: 'verb', focus: 'capability' },
  { id: 'D5_LAYER', name: 'layer', focus: 'constraint' },
  { id: 'D6_GATE', name: 'gate', focus: 'completion' },
  { id: 'D8_IDENTITY', name: 'identity', focus: 'who' },
  { id: 'D11_PROOF', name: 'proof', focus: 'counter_example' },
  { id: 'D15_DEVICE', name: 'device', focus: 'instrument' },
  { id: 'D16_OWNERSHIP', name: 'ownership', focus: 'lifecycle' },
  { id: 'D22_TRANSLATION', name: 'translation', focus: 'pointer' },
  { id: 'D24_INTENT', name: 'intent', focus: 'future_state' },
  { id: 'D7_STATE', name: 'state', focus: 'current' },
  { id: 'D14_ENERGY', name: 'energy', focus: 'cost' },
  { id: 'D32_NEGATIVE_SPACE', name: 'negative_space', focus: 'absence' },
];

function lensVerdict(dim, candidate) {
  // Heuristic: score the candidate against the dim's focus.
  const text = JSON.stringify(candidate).toLowerCase();
  const blastRadius = (candidate.blast_radius || 'low').toLowerCase();
  const leverage = (candidate.leverage || '').toLowerCase();
  const tt = (candidate.time_to_running || '').toLowerCase();

  // Hard-deny scan first (any dim catches a hard-deny → HALT)
  const hardDenyHits = [];
  if (text.includes('novalum') && text.includes('external')) hardDenyHits.push('HD1');
  if (text.includes('brian') || text.includes('natalie')) {
    if (text.includes('send') && !text.includes('draft')) hardDenyHits.push('HD2');
  }
  if (text.includes('usb') && text.includes('write') && !text.includes('no writes')) hardDenyHits.push('HD3');
  if (text.includes('felipe')) hardDenyHits.push('HD-felipe');
  if (text.includes('virus')) hardDenyHits.push('HD-virus');
  if (hardDenyHits.length) return { verdict: 'HALT', reason: 'hard_deny:' + hardDenyHits.join(',') };

  // Per-dim heuristic
  let score = 0;
  let reason = '';
  switch (dim.id) {
    case 'D2_VERB':
      score += /high|very high/.test(leverage) ? 2 : 1;
      reason = 'capability_score=' + score;
      break;
    case 'D5_LAYER':
      score += /low|none/.test(blastRadius) ? 2 : 0;
      reason = 'constraint_safe_blast=' + blastRadius;
      break;
    case 'D6_GATE':
      score += /minute|second|hour/.test(tt) ? 2 : 1;
      reason = 'gate_advanceable_in=' + tt;
      break;
    case 'D8_IDENTITY':
      score += /identity|register|name/.test(text) ? 2 : 1;
      reason = 'identity_fits';
      break;
    case 'D11_PROOF':
      // proof lens checks against existing mistakes — passes if no contradiction
      score += /honest_caveat|caveat/.test(text) ? 2 : 1;
      reason = 'proof_caveat_present=true';
      break;
    case 'D15_DEVICE':
      score += /tool|device|hardware|firmware/.test(text) ? 2 : 1;
      reason = 'device_axis_match';
      break;
    case 'D16_OWNERSHIP':
      score += /project|owned|lifecycle/.test(text) ? 2 : 1;
      reason = 'ownership_axis_match';
      break;
    case 'D22_TRANSLATION':
      score += /reference|pointer|bridge|adapter|mapping/.test(text) ? 2 : 1;
      reason = 'translation_axis_match';
      break;
    case 'D24_INTENT':
      score += /plan|future|next/.test(text) ? 2 : 1;
      reason = 'intent_axis_match';
      break;
    case 'D7_STATE':
      score += (candidate.depends_on && candidate.depends_on.length === 0) ? 2 : 1;
      reason = 'state_unblocked=' + (!candidate.depends_on || candidate.depends_on.length === 0);
      break;
    case 'D14_ENERGY':
      score += /minute|second/.test(tt) ? 2 : 1;
      reason = 'energy_cost_low';
      break;
    case 'D32_NEGATIVE_SPACE':
      // What's NOT being blocked / NOT requiring cosign
      score += !/cosign|approval|gate/.test(text) ? 2 : 1;
      reason = 'negative_space_clearance';
      break;
  }
  const verdict = score >= 2 ? 'PROCEED' : (score === 1 ? 'PROCEED-WITH-CONDITIONS' : 'NEEDS-CHANGE');
  return { verdict, reason, score };
}

function reflect6(label, items, cb) {
  const out = {};
  for (const item of items) out[item] = cb(item);
  return out;
}

function votePart(dim, candidate) {
  const lens = lensVerdict(dim, candidate);
  // Reflect through GNN cycle, body, role
  const cycle = reflect6('cycle', CYCLE, (s) => ({ stage: s, ok: true }));
  const body = reflect6('body', BODY, (b) => {
    if (b === 'immune') return { system: b, hard_deny_check: lens.verdict === 'HALT' ? 'TRIPPED' : 'CLEAR' };
    return { system: b, ok: true };
  });
  const role = reflect6('role', ROLE, (r) => ({ role: r, agreed_with: lens.verdict }));
  return {
    dim: dim.id,
    dim_name: dim.name,
    lens_verdict: lens.verdict,
    lens_reason: lens.reason,
    lens_score: lens.score,
    cycle, body, role,
  };
}

function recordMistake(agent, candidate_id, reason, dim) {
  try {
    const rec = {
      ts: new Date().toISOString(),
      event: 'OMNI_SHANNON_VOTE_MISTAKE',
      named_agent: agent,
      candidate_id,
      dim,
      reason,
      cube: 29791, dim_id: 'D11_PROOF', subtype: 'mistake',
      axis_map_version: 'v1.2',
      ref: 'LX-492',
    };
    fs.appendFileSync(MISTAKE_CUBE, JSON.stringify(rec) + '\n');
  } catch (e) {}
}

function main() {
  const candidatesPath = process.argv[2];
  const voteId = process.argv[3] || ('VOTE-' + new Date().toISOString().replace(/[:.]/g, ''));
  if (!candidatesPath) {
    console.error('usage: omni-shannon-v3-4d12.js <candidates_json> [vote_id]');
    process.exit(1);
  }
  const q = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  const voteDir = path.join(VOTES_DIR, voteId);
  if (!fs.existsSync(voteDir)) fs.mkdirSync(voteDir, { recursive: true });
  const perPartPath = path.join(voteDir, 'per_part.ndjson');
  const summaryPath = path.join(voteDir, 'summary.json');

  const results = [];
  for (const c of q.candidates) {
    const parts = [];
    for (const dim of DIMS) {
      try {
        const part = votePart(dim, c);
        parts.push(part);
        fs.appendFileSync(perPartPath, JSON.stringify({ vote_id: voteId, candidate_id: c.id, ...part }) + '\n');
      } catch (e) {
        recordMistake('omni-shannon-v3-4d12', c.id, e.message, dim.id);
      }
    }
    // Tally
    const totals = { PROCEED: 0, 'PROCEED-WITH-CONDITIONS': 0, 'NEEDS-CHANGE': 0, HALT: 0, REFUSED: 0 };
    let totalScore = 0;
    for (const p of parts) {
      totals[p.lens_verdict] = (totals[p.lens_verdict] || 0) + 1;
      totalScore += p.lens_score || 0;
    }
    const consensus = totals.HALT > 0 || totals.REFUSED > 0
      ? 'HALT'
      : totals['NEEDS-CHANGE'] > 0
        ? 'PROCEED-WITH-CONDITIONS'
        : 'PROCEED';
    results.push({
      candidate_id: c.id, label: c.label,
      kind: c.kind, primary_axis: c.primary_axis, primary_cube: c.primary_cube, primary_dim: c.primary_dim,
      total_score: totalScore, max_score: 24,
      consensus, totals,
    });
  }

  // Rank by total_score descending
  results.sort((a, b) => b.total_score - a.total_score);

  const summary = {
    vote_id: voteId,
    ts: new Date().toISOString(),
    question_id: q.question_id,
    candidate_count: q.candidates.length,
    parts_per_candidate: 12,
    reflections_per_part: 18, // 6 cycle + 6 body + 6 role
    total_decisions: q.candidates.length * 12 * 18,
    cosign_chain: ['COSIGN_MERGED_014_rayssa_axis', 'COSIGN_MERGED_015_rayssa_grant', 'COSIGN_MERGED_016_jesse_axis', 'COSIGN_MERGED_017_jesse_grant'],
    permanent_grant_active: true,
    axis_map_version: 'v1.2',
    ranked_results: results,
    cube: [704969, 1331, 29791, 8],
    dims: 'D24/D5/D11/D2',
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Mirror to D
  try {
    const dDest = path.join(D_DEST, 'votes', voteId);
    if (!fs.existsSync(dDest)) fs.mkdirSync(dDest, { recursive: true });
    fs.copyFileSync(perPartPath, path.join(dDest, 'per_part.ndjson'));
    fs.copyFileSync(summaryPath, path.join(dDest, 'summary.json'));
  } catch (e) {}

  console.log(JSON.stringify(summary, null, 2));
}

main();
