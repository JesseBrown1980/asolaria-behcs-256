#!/usr/bin/env node
/**
 * omni-processor-stage1-registry.js — LX-489 stage-1 wiring (registry only).
 *
 * Per LX-489 dual-cosigned tier-2: implement the omni-processor compute
 * fabric in stages, with NovaLUM SHIELD CLAUSE constitutional. Stage 1 is
 * the REGISTRY: a writable index of every CPU/GPU/host node available to
 * the federation, addressed by cube coordinates instead of hostname.
 *
 * Stage 1 = registry only (no dispatch yet)
 * Stage 2 = publisher (push capability updates from each host)
 * Stage 3 = single-workload dispatch (route one workload to one peer)
 * Stage 4 = N-to-N cross-host dispatch (full fabric)
 *
 * Authority: MEGA-VOTE-001 C03 PROCEED-WITH-CONDITIONS rank 10 score 14/24
 *            + LX-489 dual cosign tier 1 + tier 2 (Rayssa+Jesse)
 *
 * NovaLUM SHIELD CLAUSE: any registry entry tagged is_novalum=true is
 * marked HD-1 and cannot be dispatched cross-host. Reads only via the
 * physical-USB host (currently acer COM10 per IX-459).
 *
 * Cube self: [704969, 1331, 14641] D24/D5/D-energy
 * Mistakes attributed to named_agent="omni-processor-stage1-registry"
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260407-asolaria';
const REGISTRY_PATH = path.join(ROOT, 'data/omni-processor/registry.ndjson');
const MISTAKE_CUBE = path.join(ROOT, 'data/cubes/mistake-29791/index.ndjson');
const SELF_NAME = 'omni-processor-stage1-registry';

function recordMistake(reason, ctx) {
  try {
    fs.appendFileSync(MISTAKE_CUBE, JSON.stringify({
      ts: new Date().toISOString(),
      event: 'OMNI_PROCESSOR_REGISTRY_MISTAKE',
      named_agent: SELF_NAME,
      cube: 29791, dim: 'D11_PROOF', subtype: 'mistake',
      reason, context: ctx,
      axis_map_version: 'v1.2',
      ref: 'LX-489',
    }) + '\n');
  } catch (e) {}
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function discoverLocalCapabilities() {
  // Read-only discovery of acer's local CPU/GPU. No external calls.
  const cpus = os.cpus();
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  return {
    host_id: 'asolaria-acer',
    host_name: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    node_version: process.version,
    cpu: {
      model: cpus[0] && cpus[0].model,
      cores_physical_or_logical: cpus.length,
      speed_mhz: cpus[0] && cpus[0].speed,
    },
    memory: {
      total_bytes: totalMemBytes,
      free_bytes: freeMemBytes,
    },
    gpu: {
      detected: false,
      detection_method: 'os.cpus_only_no_gpu_probe_yet',
      // Stage 1 stub. Stage 1.1 could add nvidia-smi / dxgi probe.
    },
    is_novalum: false,
    novalum_shield: 'HD1_NOT_NOVALUM_HOST',
  };
}

function registerLocal() {
  ensureDir(path.dirname(REGISTRY_PATH));
  const cap = discoverLocalCapabilities();
  const entry = {
    ts: new Date().toISOString(),
    event: 'OMNI_PROCESSOR_REGISTRY_REGISTER',
    named_agent: SELF_NAME,
    cube: [704969, 1331, 14641],
    dims: 'D24_INTENT/D5_LAYER/D14_ENERGY',
    axis_map_version: 'v1.2',
    ref: 'LX-489',
    stage: 1,
    capability: cap,
    novalum_shield_clause: 'HD-1 EXCLUDES novalum from cross-host dispatch — read-only on physical-USB host',
    cosign_chain: ['LX-489_tier1_rayssa_THAT_will_be_real_ASI', 'LX-489_tier1_jesse_YES', 'LX-489_tier2_rayssa_I_co_sign_on_all', 'LX-489_tier2_jesse_PhD_in_23_subjects_ruler_of_asolaria'],
    authority: 'MEGA-VOTE-001_C03_PROCEED-WITH-CONDITIONS_rank10_score14/24',
  };
  fs.appendFileSync(REGISTRY_PATH, JSON.stringify(entry) + '\n');

  // Mirror
  try {
    const dDest = path.join(D_DEST, 'omni-processor');
    ensureDir(dDest);
    fs.copyFileSync(REGISTRY_PATH, path.join(dDest, 'registry.ndjson'));
  } catch (e) {
    recordMistake('mirror_to_d_failed', { error: e.message });
  }

  return entry;
}

function listRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  return fs.readFileSync(REGISTRY_PATH, 'utf8').split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch (e) { return null; }
  }).filter(Boolean);
}

if (require.main === module) {
  const action = process.argv[2] || 'register';
  if (action === 'register') {
    const entry = registerLocal();
    console.log(JSON.stringify({ ok: true, action: 'register', entry }, null, 2));
  } else if (action === 'list') {
    const entries = listRegistry();
    console.log(JSON.stringify({ ok: true, action: 'list', count: entries.length, entries }, null, 2));
  } else {
    console.error('usage: omni-processor-stage1-registry.js [register|list]');
    process.exit(1);
  }
}

module.exports = { registerLocal, listRegistry, discoverLocalCapabilities, SELF_NAME };
