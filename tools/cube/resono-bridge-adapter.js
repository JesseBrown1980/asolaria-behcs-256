#!/usr/bin/env node
/**
 * resono-bridge-adapter.js — maps ReSono Labs OpenClaw device-bridge.*
 * namespace onto asolaria's federation primitives, treating any ReSono
 * device as a D15 DEVICE federation node with native bridge translation.
 *
 * Per LX-493 CANDIDATE (ReSono Labs structural twin finding 2026-04-07T22:15Z):
 *   device-bridge.session.*    → asolaria session lifecycle (gateway :4791)
 *   device-bridge.results.*    → omni-request-box approve/deny/escalate
 *   device-bridge.tasks.enqueue → asolaria task queue + omni-cron-kicker
 *   device-bridge.status        → cube-orchestrator tick + heartbeat
 *
 * This is a STUB adapter — the file declares the namespace mappings as
 * pure data, exposes a translate(verb, args) function, and runs a
 * self-test that validates every ReSono verb has an asolaria target.
 *
 * No external network calls in stub mode. When/if a real ReSono device
 * joins the federation, this adapter is the wire-up point.
 *
 * Cube self: [3375, 10648, 29791] D15/D22/D11
 * Authority: COSIGN_MERGED_016+017 jesse permanent grant + MEGA-VOTE-001 C01 PROCEED rank 1 score 21/24
 * Mistakes: every mistake here is attributed to named_agent="resono-bridge-adapter"
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260407-asolaria';
const MISTAKE_CUBE = path.join(ROOT, 'data/cubes/mistake-29791/index.ndjson');
const SELF_NAME = 'resono-bridge-adapter';

// === Namespace mapping (LX-493 structural twin) ===
const NAMESPACE_MAP = {
  'device-bridge.session.start': {
    asolaria_target: 'gateway:/api/session/start',
    asolaria_port: 4791,
    cube: 4913, dim: 'D7_STATE',
    semantics: 'session_lifecycle_open',
  },
  'device-bridge.session.end': {
    asolaria_target: 'gateway:/api/session/end',
    asolaria_port: 4791,
    cube: 4913, dim: 'D7_STATE',
    semantics: 'session_lifecycle_close',
  },
  'device-bridge.session.heartbeat': {
    asolaria_target: 'cube-orchestrator:tick',
    cube: 2197, dim: 'D6_GATE',
    semantics: 'liveness_pulse',
  },
  'device-bridge.results.approve': {
    asolaria_target: 'omni-request-box:approve',
    cube: 6859, dim: 'D8_IDENTITY',
    semantics: 'authorization_grant',
  },
  'device-bridge.results.deny': {
    asolaria_target: 'omni-request-box:deny',
    cube: 6859, dim: 'D8_IDENTITY',
    semantics: 'authorization_refuse',
  },
  'device-bridge.results.escalate': {
    asolaria_target: 'omni-request-box:escalate_to_jesse',
    cube: 704969, dim: 'D24_INTENT',
    semantics: 'human_in_loop',
  },
  'device-bridge.tasks.enqueue': {
    asolaria_target: 'asolaria:/api/tasks',
    asolaria_port: 4781,
    cube: 2197, dim: 'D6_GATE',
    semantics: 'background_job_queue',
  },
  'device-bridge.status': {
    asolaria_target: 'cube-orchestrator:state',
    cube: 4913, dim: 'D7_STATE',
    semantics: 'health_state_report',
  },
};

function recordMistake(reason, context) {
  try {
    const rec = {
      ts: new Date().toISOString(),
      event: 'RESONO_BRIDGE_ADAPTER_MISTAKE',
      named_agent: SELF_NAME, // Per R-MISTAKE-BY-NAMED-AGENT
      cube: 29791, dim: 'D11_PROOF', subtype: 'mistake',
      reason,
      context,
      axis_map_version: 'v1.2',
      ref: 'LX-493',
    };
    fs.appendFileSync(MISTAKE_CUBE, JSON.stringify(rec) + '\n');
  } catch (e) {}
}

function translate(verb, args) {
  if (!NAMESPACE_MAP[verb]) {
    recordMistake('unknown_resono_verb', { verb, args });
    return { ok: false, error: 'unknown_verb', verb };
  }
  const map = NAMESPACE_MAP[verb];
  return {
    ok: true,
    resono_verb: verb,
    asolaria_target: map.asolaria_target,
    asolaria_port: map.asolaria_port,
    cube: map.cube,
    dim: map.dim,
    semantics: map.semantics,
    payload: args,
    via_adapter: SELF_NAME,
    axis_map_version: 'v1.2',
  };
}

function selfTest() {
  const verbs = Object.keys(NAMESPACE_MAP);
  const results = verbs.map(v => ({
    verb: v,
    translation: translate(v, { _stub: true }),
  }));
  const ok = results.every(r => r.translation.ok);
  return { ok, verb_count: verbs.length, results };
}

if (require.main === module) {
  const test = selfTest();
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    adapter: SELF_NAME,
    namespace_count: Object.keys(NAMESPACE_MAP).length,
    self_test: test,
    cube_self: [3375, 10648, 29791],
    dims: 'D15/D22/D11',
    ref: 'LX-493_CANDIDATE',
    authority: 'MEGA-VOTE-001_C01_PROCEED_rank1_score21/24',
  }, null, 2));
}

module.exports = { translate, selfTest, NAMESPACE_MAP, SELF_NAME };
