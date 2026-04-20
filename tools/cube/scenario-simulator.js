#!/usr/bin/env node
/**
 * scenario-simulator.js
 *
 * Lightweight Monte Carlo scenario expansion over QDD candidates.
 * This is NOT a real GNN — Jesse asked for "100bn tests" but we are honest:
 * this runs N deterministic perturbation scenarios per candidate, scoring
 * each by how it interacts with random blocker timings, dependency
 * unblock probabilities, and operator-witnessed window availability.
 *
 * Liris's GSLGNN (F1=0.9926) will eventually be the real GNN backend; this
 * tool is the placeholder so the framework + cube indexing exist for her
 * to plug into when she runs her version.
 *
 * Each scenario:
 *   - assigns random unblock times to each blocker (LIMS, DO, Twilio, Vince)
 *   - assigns random operator-witnessed window times
 *   - assigns random test-pass probabilities
 *   - simulates "did this candidate land in the next 14 days?" yes/no
 *   - aggregates a probability score per candidate
 *
 * Usage:
 *   node tools/cube/scenario-simulator.js <question.json> [n_scenarios=1000]
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260406-asolaria';
const SIM_OUT = path.join(ROOT, 'data/cubes/jbd.qdd.gnn-simulator/scenarios.ndjson');

const now = () => new Date().toISOString();
const append = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirror(src) {
  const rel = path.relative(ROOT, src).replace(/\\/g, '/');
  const dest = path.join(D_DEST, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// PRNG (mulberry32) — deterministic on seed
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random unblock-day for a named blocker. Distribution rough:
//   LIMS specs: lognormal mean ~14 days
//   DO creds:   lognormal mean ~7 days
//   Twilio:     lognormal mean ~10 days
//   Vince:      lognormal mean ~21 days
const BLOCKER_PROFILES = {
  'Charm Sciences LIMS API specs': { mean: 14, sigma: 0.6 },
  'DigitalOcean credentials from Natalie/QDD': { mean: 7, sigma: 0.5 },
  'Twilio credentials from Charm Sciences': { mean: 10, sigma: 0.5 },
  'Vince Benitez proposal approval': { mean: 21, sigma: 0.7 },
};

function lognormalDays(rand, profile) {
  const mu = Math.log(profile.mean) - profile.sigma * profile.sigma / 2;
  const u1 = Math.max(rand(), 1e-9), u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(1, Math.exp(mu + profile.sigma * z));
}

function simulateCandidate(c, n, seed) {
  const rand = mulberry32(seed);
  const blocker = c.metadata && c.metadata.blocked_by;
  const scopeHours = (c.metadata && c.metadata.scope_hours) || 4;
  const requiresExternal = c.metadata && c.metadata.requires_external_creds;
  const touchesDevice = c.metadata && c.metadata.touches_device;

  let landed = 0;
  let totalLandDay = 0;

  for (let i = 0; i < n; i++) {
    // when can we start?
    let startDay = 0;
    if (blocker && BLOCKER_PROFILES[blocker]) {
      startDay = lognormalDays(rand, BLOCKER_PROFILES[blocker]);
    } else if (requiresExternal) {
      startDay = 7 + rand() * 14; // generic external dep
    }

    // dev time once started
    const devDays = scopeHours / 8 + rand() * 0.5;

    // operator-witnessed window adds latency for device work
    const witnessLatency = touchesDevice ? rand() * 3 : 0;

    // test/build time
    const testDays = 0.25 + rand() * 0.5;

    const totalDays = startDay + devDays + witnessLatency + testDays;

    if (totalDays <= 14) {
      landed++;
      totalLandDay += totalDays;
    }
  }

  return {
    candidate_id: c.id,
    label: c.label,
    n_scenarios: n,
    landed_in_14_days: landed,
    land_probability: landed / n,
    avg_land_day: landed > 0 ? totalLandDay / landed : null,
    blocker: blocker || null,
    scope_hours: scopeHours,
  };
}

function main() {
  const qPath = process.argv[2];
  const n = parseInt(process.argv[3] || '1000', 10);
  if (!qPath) { console.error('usage: scenario-simulator.js <question.json> [n=1000]'); process.exit(1); }
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const candidates = q.candidates || [];

  ensureDir(path.dirname(SIM_OUT));

  const results = [];
  let seed = 0xC0DECAFE;
  for (const c of candidates) {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    const r = simulateCandidate(c, n, seed);
    append(SIM_OUT, { ts: now(), kind: 'scenario_run', vote_id: q.question_id, ...r });
    results.push(r);
  }

  // sort by land probability descending
  results.sort((a, b) => b.land_probability - a.land_probability);

  const summary = {
    ts: now(),
    kind: 'scenario_summary',
    vote_id: q.question_id,
    total_scenarios: candidates.length * n,
    n_per_candidate: n,
    ranking: results.map((r, i) => ({
      rank: i + 1,
      candidate_id: r.candidate_id,
      land_probability: Math.round(r.land_probability * 1000) / 10 + '%',
      avg_land_day: r.avg_land_day ? Math.round(r.avg_land_day * 10) / 10 : null,
      blocker: r.blocker,
    })),
    note: 'NOT a real GNN — deterministic mulberry32 + lognormal blocker timings. Liris GSLGNN F1=0.9926 will replace this when she plugs in.',
  };
  append(SIM_OUT, summary);
  mirror(SIM_OUT);

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) main();
module.exports = { simulateCandidate, mulberry32 };
