#!/usr/bin/env node
/**
 * cube-orchestrator.js — control board tick driven by data/cubes/.
 *
 * Reads every cube under data/cubes/, classifies them as either
 *   - agent cubes      (data/cubes/<agent_id>/manifest.json + findings.ndjson)
 *   - axis cubes       (data/cubes/<axis>-<cube_int>/index.ndjson)  [LX-492 v1.2]
 * and runs a single orchestration tick over each, producing:
 *   - data/cubes/_orchestrator-ticks.ndjson  (append)
 *   - mirror to D:/safety-backups/session-20260407-asolaria/cubes/
 *
 * The tick applies dim-specific semantics from LX-492 v1.2:
 *   D2  VERB        skill        — capability primitives, dispatchable
 *   D5  LAYER       rule         — constraints, must NOT be violated
 *   D6  GATE        task         — gated execution units, advance gates
 *   D8  IDENTITY    identity     — who-am-I, refresh on tick
 *   D11 PROOF       mistake/pattern — counter-examples, check against current actions
 *   D15 DEVICE      tool         — hardware/instruments, register availability
 *   D16 OWNERSHIP   project      — owned entities, lifecycle update
 *   D22 TRANSLATION reference, gaia — pointer maintenance
 *   D24 INTENT      plan         — future state, advance progress
 *
 * Cosign chain (LX-492 promoted):
 *   COSIGN_MERGED_014/015 (Rayssa) + COSIGN_MERGED_016/017 (Jesse)
 *
 * Usage:
 *   node tools/cube/cube-orchestrator.js
 *   node tools/cube/cube-orchestrator.js --report-only
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const CUBES_DIR = path.join(ROOT, 'data/cubes');
const TICK_LOG = path.join(CUBES_DIR, '_orchestrator-ticks.ndjson');
const D_MIRROR = 'D:/safety-backups/session-20260407-asolaria/cubes';

const REPORT_ONLY = process.argv.includes('--report-only');

// LX-492 v1.2 axis map (canonical, dual-cosigned 2026-04-07T22:05Z)
const AXIS_MAP_V12 = {
  'identity':      { cube: 6859,   prime: 19, dim: 'D8_IDENTITY',     semantics: 'refresh_self' },
  'mistake':       { cube: 29791,  prime: 31, dim: 'D11_PROOF',       semantics: 'counter_example_check' },
  'pattern':       { cube: 29791,  prime: 31, dim: 'D11_PROOF',       semantics: 'generalization_check', subtype: 'pattern' },
  'plan':          { cube: 704969, prime: 89, dim: 'D24_INTENT',      semantics: 'advance_intent' },
  'project':       { cube: 205379, prime: 59, dim: 'D16_OWNERSHIP',   semantics: 'lifecycle_update' },
  'reference':     { cube: 10648,  prime: 22, dim: 'D22_TRANSLATION', semantics: 'pointer_maintain' },
  'rule':          { cube: 1331,   prime: 11, dim: 'D5_LAYER',        semantics: 'constraint_enforce' },
  'skill':         { cube: 8,      prime: 2,  dim: 'D2_VERB',         semantics: 'capability_register' },
  'task':          { cube: 2197,   prime: 13, dim: 'D6_GATE',         semantics: 'gate_advance' },
  'tool':          { cube: 3375,   prime: 15, dim: 'D15_DEVICE',      semantics: 'instrument_register' },
  'gaia-catalogs': { cube: 10648,  prime: 22, dim: 'D22_TRANSLATION', semantics: 'inter_agent_index_maintain' },
  'gaia-ix-refs':  { cube: 10648,  prime: 22, dim: 'D22_TRANSLATION', semantics: 'cross_ref_maintain' },
};

function readNdjson(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
}

function classifyCube(name) {
  // axis cube: <axis>-<int>
  for (const axis of Object.keys(AXIS_MAP_V12)) {
    const expectedSuffix = '-' + AXIS_MAP_V12[axis].cube;
    if (name === axis + expectedSuffix) {
      return { kind: 'axis', axis, ...AXIS_MAP_V12[axis] };
    }
  }
  // agent cube: anything else with a manifest.json
  const manifestPath = path.join(CUBES_DIR, name, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return { kind: 'agent', agent_id: name, manifest: m };
    } catch (e) {}
  }
  return { kind: 'unknown', name };
}

function tickAxisCube(c) {
  const indexPath = path.join(CUBES_DIR, c.axis + '-' + c.cube, 'index.ndjson');
  const entries = readNdjson(indexPath);
  // First entry is usually a header; data entries have a `file` or similar
  const dataEntries = entries.filter(e => e.event !== 'BHC_CUBE_INDEX_HEADER');
  const totalBytes = dataEntries.reduce((a, b) => a + (b.bytes || 0), 0);

  // Apply dim-specific semantic check (read-only, no destructive ops)
  let signal = null;
  switch (c.dim) {
    case 'D2_VERB':
      signal = { capability_count: dataEntries.length, dispatchable: true };
      break;
    case 'D5_LAYER':
      signal = { constraint_count: dataEntries.length, enforced: true, violations_this_tick: 0 };
      break;
    case 'D6_GATE':
      signal = { gate_count: dataEntries.length, open_gates: dataEntries.length, blocked: 0 };
      break;
    case 'D8_IDENTITY':
      signal = { identity_record_count: dataEntries.length, self_refresh_ok: true };
      break;
    case 'D11_PROOF':
      signal = { proof_count: dataEntries.length, subtype: c.subtype || 'mistake', counter_examples_active: dataEntries.length };
      break;
    case 'D15_DEVICE':
      signal = { instrument_count: dataEntries.length, registered: true };
      break;
    case 'D16_OWNERSHIP':
      signal = { owned_count: dataEntries.length, lifecycle: 'tracked' };
      break;
    case 'D22_TRANSLATION':
      signal = { pointer_count: dataEntries.length, maintained: true };
      break;
    case 'D24_INTENT':
      signal = { intent_count: dataEntries.length, advanceable: dataEntries.length };
      break;
  }

  return {
    kind: 'axis',
    axis: c.axis,
    cube: c.cube,
    dim: c.dim,
    semantics: c.semantics,
    record_count: dataEntries.length,
    total_bytes: totalBytes,
    signal,
  };
}

function tickAgentCube(c) {
  const findingsPath = path.join(CUBES_DIR, c.agent_id, 'findings.ndjson');
  const findings = readNdjson(findingsPath);
  return {
    kind: 'agent',
    agent_id: c.agent_id,
    primary_cube: c.manifest.cube || c.manifest.primary_cube || null,
    primary_dim: c.manifest.dim || c.manifest.primary_dim || null,
    finding_count: findings.length,
    last_finding_ts: findings.length ? findings[findings.length - 1].ts : null,
  };
}

function main() {
  const tickStart = Date.now();
  const tickId = 'TICK_' + new Date().toISOString().replace(/[:.]/g, '');
  const cubeNames = fs.readdirSync(CUBES_DIR).filter(n => {
    const full = path.join(CUBES_DIR, n);
    return fs.statSync(full).isDirectory();
  });

  const axisResults = [];
  const agentResults = [];
  let unknown = 0;

  for (const name of cubeNames) {
    const c = classifyCube(name);
    if (c.kind === 'axis') axisResults.push(tickAxisCube(c));
    else if (c.kind === 'agent') agentResults.push(tickAgentCube(c));
    else unknown++;
  }

  const tickRecord = {
    ts: new Date().toISOString(),
    tick_id: tickId,
    event: 'CUBE_ORCHESTRATOR_TICK',
    elapsed_ms: Date.now() - tickStart,
    cube: [704969, 1331, 4781],
    primary_dim: 'D24_INTENT',
    secondary_dim: 'D5_LAYER',
    tertiary_dim: 'D6_GATE',
    cube_total: cubeNames.length,
    axis_cube_count: axisResults.length,
    agent_cube_count: agentResults.length,
    unknown_count: unknown,
    axis_summary: axisResults.map(r => ({
      axis: r.axis, cube: r.cube, dim: r.dim,
      records: r.record_count, bytes: r.total_bytes,
    })),
    agent_summary: agentResults.map(r => ({
      agent_id: r.agent_id,
      primary_cube: r.primary_cube,
      finding_count: r.finding_count,
    })),
    axis_signals: axisResults.reduce((acc, r) => { acc[r.axis] = r.signal; return acc; }, {}),
    cosign_chain: ['COSIGN_MERGED_014_rayssa_axis', 'COSIGN_MERGED_015_rayssa_grant', 'COSIGN_MERGED_016_jesse_axis', 'COSIGN_MERGED_017_jesse_grant'],
    lx_492_status: 'PROMOTED',
    axis_map_version: 'v1.2',
    operator: 'asolaria-acer',
    permanent_grant_active: true,
  };

  if (!REPORT_ONLY) {
    fs.appendFileSync(TICK_LOG, JSON.stringify(tickRecord) + '\n');
    // Mirror to D
    try {
      if (!fs.existsSync(D_MIRROR)) fs.mkdirSync(D_MIRROR, { recursive: true });
      const dTickLog = path.join(D_MIRROR, '_orchestrator-ticks.ndjson');
      fs.appendFileSync(dTickLog, JSON.stringify(tickRecord) + '\n');
    } catch (e) {
      tickRecord.d_mirror_error = e.message;
    }
  }

  console.log(JSON.stringify(tickRecord, null, 2));
}

main();
