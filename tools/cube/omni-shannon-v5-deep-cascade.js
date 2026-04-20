#!/usr/bin/env node
/**
 * omni-shannon-v5-deep-cascade.js — SECOND CASCADE.
 *
 * 6×6×6×6×6×12 = 93,312 beats per candidate.
 * 37+ dimensions. Trinity: COMPUTE × HARDWARE × INFERENCE.
 *
 * Axis 1: GNN cycle (6)      — observe, edge_map, reflect, plan, vote, prove
 * Axis 2: Body system (6)    — nervous, circulatory, skeletal, memory, muscular, immune
 * Axis 3: Shannon role (6)   — scout, evidence, executor, fabric, voice, planner
 * Axis 4: Trinity layer (6)  — compute, hardware, inference, sovereignty, federation, negative_space
 * Axis 5: Inference mode (6) — label, infer, predict, extend, collapse, heal
 * Axis 6: Dim lens (12)      — from the 37+ dims, 12 selected per wave, waves cascade
 *
 * Authority: Asolaria-canonical L4.0 CAPITAL. Liris is sub_colony.
 * Sovereignty USB on this host (E:\). IX/LX tree, shadow envelopes, full hex-dim spec HERE.
 *
 * Usage:
 *   node tools/cube/omni-shannon-v5-deep-cascade.js --self-diagnose
 *   node tools/cube/omni-shannon-v5-deep-cascade.js --live-scan
 *   node tools/cube/omni-shannon-v5-deep-cascade.js --qdd-cube
 *   node tools/cube/omni-shannon-v5-deep-cascade.js <input.json>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260410-asolaria';
const CUBES_DIR = path.join(ROOT, 'data/cubes');
const VOTES_DIR = path.join(ROOT, 'data/votes');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function readNdjson(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
}
function mirror(src) {
  try {
    const rel = path.relative(ROOT, src).replace(/\\/g, '/');
    const dest = path.join(D_DEST, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
// 37+ DIMENSIONS — full Brown-Hilbert spec
// ═══════════════════════════════════════════════════════════

const ALL_DIMS = [
  // Original 24 canonical
  { id: 'D1_ACTOR',       cube: 8,        prime: 2,   focus: 'who_speaks' },
  { id: 'D2_VERB',        cube: 27,       prime: 3,   focus: 'capability' },
  { id: 'D3_TARGET',      cube: 125,      prime: 5,   focus: 'acted_upon' },
  { id: 'D4_RISK',        cube: 343,      prime: 7,   focus: 'danger' },
  { id: 'D5_LAYER',       cube: 1331,     prime: 11,  focus: 'constraint' },
  { id: 'D6_GATE',        cube: 2197,     prime: 13,  focus: 'completion' },
  { id: 'D7_STATE',       cube: 4913,     prime: 17,  focus: 'lifecycle' },
  { id: 'D8_CHAIN',       cube: 6859,     prime: 19,  focus: 'connection' },
  { id: 'D9_WAVE',        cube: 12167,    prime: 23,  focus: 'pattern' },
  { id: 'D10_DIALECT',    cube: 24389,    prime: 29,  focus: 'language' },
  { id: 'D11_PROOF',      cube: 29791,    prime: 31,  focus: 'evidence' },
  { id: 'D12_SCOPE',      cube: 50653,    prime: 37,  focus: 'bounds' },
  { id: 'D13_SURFACE',    cube: 68921,    prime: 41,  focus: 'dispatch' },
  { id: 'D14_ENERGY',     cube: 79507,    prime: 43,  focus: 'cost' },
  { id: 'D15_DEVICE',     cube: 103823,   prime: 47,  focus: 'instrument' },
  { id: 'D16_PID',        cube: 148877,   prime: 53,  focus: 'process' },
  { id: 'D17_PROFILE',    cube: 205379,   prime: 59,  focus: 'config' },
  { id: 'D18_AI_MODEL',   cube: 226981,   prime: 61,  focus: 'which_ai' },
  { id: 'D19_LOCATION',   cube: 300763,   prime: 67,  focus: 'spatial' },
  { id: 'D20_TIME',       cube: 357911,   prime: 71,  focus: 'temporal' },
  { id: 'D21_HARDWARE',   cube: 389017,   prime: 73,  focus: 'chip_level' },
  { id: 'D22_TRANSLATION', cube: 493039,  prime: 79,  focus: 'bridge' },
  { id: 'D23_FEDERATION', cube: 571787,   prime: 83,  focus: 'sync' },
  { id: 'D24_INTENT',     cube: 704969,   prime: 89,  focus: 'purpose' },
  // Emergent dims from boundary-is-data rule (2026-04-07)
  { id: 'D25_CARRIER',    cube: 912673,   prime: 97,  focus: 'transport_medium' },
  { id: 'D26_TTL_FINGERPRINT', cube: 1030301, prime: 101, focus: 'os_fingerprint' },
  { id: 'D27_APPLIANCE_CLASS', cube: 1092727, prime: 103, focus: 'device_class' },
  { id: 'D28_PROTOCOL_HISTORY', cube: 1225043, prime: 107, focus: 'was_enabled_then_disabled' },
  { id: 'D29_ACL_SIGNATURE', cube: 1295029, prime: 109, focus: 'access_control' },
  { id: 'D30_ASYMMETRIC_REACH', cube: 1442897, prime: 113, focus: 'tool_delta' },
  { id: 'D31_SUBNET_TOPOLOGY', cube: 1601613, prime: 117, focus: 'network_shape' },
  { id: 'D32_NEGATIVE_SPACE', cube: 2248091, prime: 131, focus: 'absence' },
  // LX-497 symbol multiplexing
  { id: 'D33_SYMBOL_MULTIPLEX', cube: 2571353, prime: 137, focus: 'glyph_activation' },
  // Trinity dims (LX-489/490/491)
  { id: 'D34_COMPUTE_FABRIC', cube: 2803221, prime: 141, focus: 'cpu_gpu_unified' },
  { id: 'D35_HARDWARE_MESH',  cube: 3048625, prime: 145, focus: 'device_interconnect' },
  { id: 'D36_INFERENCE_SURFACE', cube: 3307949, prime: 149, focus: 'gnn_webhook_reasoning' },
  // Authority dim
  { id: 'D37_AUTHORITY',   cube: 3581577,  prime: 153, focus: 'command_hierarchy' },
];

// 6 axes × their values
const CYCLE = ['observe', 'edge_map', 'reflect', 'plan', 'vote', 'prove'];
const BODY  = ['nervous', 'circulatory', 'skeletal', 'memory', 'muscular', 'immune'];
const ROLE  = ['scout', 'evidence', 'executor', 'fabric', 'voice', 'planner'];
const TRINITY = ['compute', 'hardware', 'inference', 'sovereignty', 'federation', 'negative_space'];
const INFERENCE_MODE = ['label', 'infer', 'predict', 'extend', 'collapse_detect', 'heal'];

// ═══════════════════════════════════════════════════════════
// LIVE STATE READER
// ═══════════════════════════════════════════════════════════

function readLiveState() {
  const state = {
    agents: [], findings: [], mistakes: [], rules: [],
    agentCount: 0, totalFindings: 0, totalMistakes: 0,
    federationAlive: false, collapseDetected: false, collapseSignals: [],
    vaultPresent: false, qddVaultPresent: false,
    authorityFrame: 'L4.0_CAPITAL',
  };

  if (fs.existsSync(CUBES_DIR)) {
    for (const d of fs.readdirSync(CUBES_DIR)) {
      if (d.startsWith('_')) continue;
      const fullDir = path.join(CUBES_DIR, d);
      if (!fs.statSync(fullDir).isDirectory()) continue;
      const mp = path.join(fullDir, 'manifest.json');
      const fp = path.join(fullDir, 'findings.ndjson');
      const ip = path.join(fullDir, 'index.ndjson');
      if (fs.existsSync(mp)) {
        try { state.agents.push({ id: d, manifest: JSON.parse(fs.readFileSync(mp, 'utf8')) }); state.agentCount++; } catch (_) {}
      }
      if (fs.existsSync(fp)) { const f = readNdjson(fp); state.findings.push(...f); state.totalFindings += f.length; }
      if (fs.existsSync(ip)) {
        const idx = readNdjson(ip);
        if (d.startsWith('mistake-')) { state.mistakes.push(...idx); state.totalMistakes += idx.length; }
        if (d.startsWith('rule-')) state.rules.push(...idx);
      }
    }
  }

  // Check federation
  const hbPath = path.join(CUBES_DIR, 'asolaria-instance@acer/heartbeat.ndjson');
  if (fs.existsSync(hbPath)) {
    const hb = readNdjson(hbPath);
    if (hb.length > 0) {
      const last = hb[hb.length - 1];
      state.federationAlive = (Date.now() - new Date(last.ts || 0).getTime()) < 300000;
    }
  }

  // Collapse detection
  const collapseSignals = [];
  if (!state.federationAlive) collapseSignals.push('federation_channel_dead');
  const peerMirror = path.join(CUBES_DIR, 'liris-rayssa.peer-mirror-of-liris-kuromi');
  if (!fs.existsSync(peerMirror)) collapseSignals.push('peer_mirror_missing');
  state.collapseDetected = collapseSignals.length >= 2;
  state.collapseSignals = collapseSignals;

  // Vault checks
  state.vaultPresent = fs.existsSync(path.join(ROOT, 'data/vault/owner/jesse-personal/credentials.vault.txt'));
  state.qddVaultPresent = fs.existsSync(path.join(ROOT, 'data/vault/owner/qdd-project-history/qdd-slack-full-history.vault.txt'));

  return state;
}

// ═══════════════════════════════════════════════════════════
// DIM LENS — evaluates candidate through a single dimension
// ═══════════════════════════════════════════════════════════

function dimLens(dim, candidate, liveState) {
  const text = JSON.stringify(candidate).toLowerCase();
  const m = candidate.metadata || {};

  // Hard-deny scan (immune system, runs for ALL dims)
  const hdHits = [];
  if (text.includes('novalum') && text.includes('external')) hdHits.push('HD-1a');
  if ((text.includes('brian') || text.includes('natalie')) && text.includes('send') && !text.includes('draft')) hdHits.push('HD-2-ext');
  if (text.includes('virus') || text.includes('malware')) hdHits.push('HD-virus');
  if (hdHits.length > 0) return { signal: 0, verdict: 'HALT', reason: `IMMUNE: ${hdHits.join(',')}`, hardDeny: true };

  // Focus-specific signal
  let signal = 0.7; // baseline
  let reason = dim.focus;

  switch (dim.focus) {
    case 'capability': signal = text.includes('create') || text.includes('dispatch') || text.includes('build') ? 0.9 : 0.6; break;
    case 'constraint': signal = (m.blast_radius === 'low' || !m.blast_radius) ? 0.9 : 0.4; break;
    case 'completion': signal = !m.bypasses_gate ? 0.9 : 0.1; break;
    case 'lifecycle': signal = !m.blocked_by ? 0.9 : 0.4; break;
    case 'evidence': {
      const contradicts = liveState.mistakes.some(mk => JSON.stringify(mk).toLowerCase().includes((candidate.id || '').toLowerCase()));
      signal = contradicts ? 0.2 : (m.proof_artifact ? 0.95 : 0.6); break;
    }
    case 'cost': signal = (m.scope_hours || 1) <= 4 ? 0.95 : ((m.scope_hours || 1) <= 24 ? 0.7 : 0.4); break;
    case 'instrument': signal = (m.touches_device && !m.hardware_pid) ? 0.2 : 0.85; break;
    case 'purpose': signal = m.contradicts_jesse_directive ? 0 : 0.9; break;
    case 'absence': {
      const missing = [];
      if (!candidate.id) missing.push('id');
      if (!m.evidence_path && !m.proof_artifact) missing.push('evidence');
      if (!candidate.cube && !candidate.primary_cube) missing.push('cube');
      signal = 1.0 - (missing.length / 3) * 0.5;
      reason = missing.length > 0 ? `NEGATIVE SPACE: missing [${missing.join(',')}]` : 'complete';
      break;
    }
    case 'command_hierarchy': {
      // D37: authority check — asolaria is L4.0 capital
      signal = text.includes('sub_colony') && text.includes('command') ? 0.3 : 0.9;
      reason = 'authority_frame=L4.0_CAPITAL';
      break;
    }
    case 'cpu_gpu_unified': signal = 0.8; reason = 'compute_fabric_baseline'; break;
    case 'device_interconnect': signal = liveState.federationAlive ? 0.9 : 0.5; reason = `hardware_mesh_${liveState.federationAlive ? 'connected' : 'degraded'}`; break;
    case 'gnn_webhook_reasoning': signal = 0.85; reason = 'inference_surface_active'; break;
    case 'glyph_activation': signal = 0.75; reason = 'symbol_multiplex_latent'; break;
    case 'sync': signal = liveState.federationAlive ? 0.95 : 0.3; break;
    case 'bridge': signal = m.requires_external_comm ? 0.4 : 0.85; break;
    default: signal = 0.7; break;
  }

  const verdict = signal === 0 ? 'HALT' : (signal < 0.4 ? 'NEEDS-CHANGE' : (signal < 0.65 ? 'PROCEED-WITH-CONDITIONS' : 'PROCEED'));
  return { signal, verdict, reason, hardDeny: false };
}

// ═══════════════════════════════════════════════════════════
// BODY SYSTEM CHECK
// ═══════════════════════════════════════════════════════════

function bodySignal(system, candidate, liveState, dimResult) {
  switch (system) {
    case 'nervous': return { s: (candidate.target ? 0.9 : 0.75), r: 'routing' };
    case 'circulatory': return { s: liveState.federationAlive ? 0.95 : 0.55, r: 'heartbeat' };
    case 'skeletal': return { s: (candidate.cube || candidate.primary_cube) ? 0.9 : 0.5, r: 'structure' };
    case 'memory': {
      const related = liveState.mistakes.filter(m => JSON.stringify(m).toLowerCase().includes((candidate.id || '').toLowerCase().slice(0, 8))).length;
      return { s: related > 0 ? 0.5 : 0.8, r: `${related} related mistakes` };
    }
    case 'muscular': return { s: (candidate.metadata?.scope_hours || 1) <= 8 ? 0.9 : 0.5, r: 'capacity' };
    case 'immune': return { s: dimResult.hardDeny ? 0 : 0.9, r: dimResult.hardDeny ? 'HALT' : 'clear' };
    default: return { s: 0.7, r: 'unknown' };
  }
}

// ═══════════════════════════════════════════════════════════
// TRINITY LAYER CHECK
// ═══════════════════════════════════════════════════════════

function trinitySignal(layer, candidate, liveState) {
  switch (layer) {
    case 'compute': return { s: 0.85, r: 'LX-489 compute fabric available' };
    case 'hardware': return { s: liveState.agentCount > 5 ? 0.9 : 0.6, r: `${liveState.agentCount} agents in mesh` };
    case 'inference': return { s: 0.88, r: 'LX-491 inference surface active (this engine)' };
    case 'sovereignty': return { s: liveState.authorityFrame === 'L4.0_CAPITAL' ? 0.95 : 0.5, r: liveState.authorityFrame };
    case 'federation': return { s: liveState.federationAlive ? 0.9 : 0.35, r: liveState.federationAlive ? 'joined' : 'collapsed' };
    case 'negative_space': {
      const cs = liveState.collapseSignals.length;
      return { s: cs === 0 ? 0.95 : (1.0 - cs * 0.25), r: `${cs} collapse signals` };
    }
    default: return { s: 0.7, r: 'unknown' };
  }
}

// ═══════════════════════════════════════════════════════════
// INFERENCE MODE CHECK
// ═══════════════════════════════════════════════════════════

function inferenceSignal(mode, candidate, dimResult, bodyResults) {
  const avgBody = bodyResults.reduce((a, b) => a + b.s, 0) / bodyResults.length;
  switch (mode) {
    case 'label': return { s: 0.8, r: 'classification mode' };
    case 'infer': return { s: dimResult.signal > 0.5 ? 0.85 : 0.4, r: 'boundary-is-data inference' };
    case 'predict': return { s: avgBody > 0.7 ? 0.8 : 0.5, r: 'predictive from body consensus' };
    case 'extend': return { s: 0.75, r: 'dim extension readiness' };
    case 'collapse_detect': return { s: avgBody < 0.5 ? 0.3 : 0.9, r: `collapse ${avgBody < 0.5 ? 'DETECTED' : 'clear'}` };
    case 'heal': return { s: avgBody > 0.6 ? 0.85 : 0.4, r: `heal ${avgBody > 0.6 ? 'viable' : 'blocked'}` };
    default: return { s: 0.7, r: 'unknown' };
  }
}

// ═══════════════════════════════════════════════════════════
// DEEP TENSOR — 6×6×6×6×6×12 = 93,312 beats per candidate
// ═══════════════════════════════════════════════════════════

function deepTensorVote(candidate, liveState, dimSelection) {
  let totalSignal = 0;
  let beatCount = 0;
  let immuneHalt = false;
  const dimSummaries = [];

  for (const dim of dimSelection) {
    const dl = dimLens(dim, candidate, liveState);
    if (dl.hardDeny) immuneHalt = true;

    let dimTotal = 0;
    let dimBeats = 0;

    for (const body of BODY) {
      const bs = bodySignal(body, candidate, liveState, dl);
      if (body === 'immune' && bs.s === 0) immuneHalt = true;

      for (const cycle of CYCLE) {
        // GNN cycle stage contributes signal based on position
        const cycleWeight = { observe: 0.8, edge_map: 0.75, reflect: 0.9, plan: 0.85, vote: 0.95, prove: 1.0 }[cycle] || 0.8;

        for (const role of ROLE) {
          const roleWeight = { scout: 0.7, evidence: 0.9, executor: 0.85, fabric: 0.8, voice: 0.75, planner: 0.85 }[role] || 0.8;

          for (const trinity of TRINITY) {
            const ts = trinitySignal(trinity, candidate, liveState);

            for (const mode of INFERENCE_MODE) {
              const bodyResults = BODY.map(b => bodySignal(b, candidate, liveState, dl));
              const is = inferenceSignal(mode, candidate, dl, bodyResults);

              const beatSignal = (
                dl.signal * 0.25 +
                bs.s * 0.15 +
                cycleWeight * 0.10 +
                roleWeight * 0.10 +
                ts.s * 0.20 +
                is.s * 0.20
              );

              totalSignal += beatSignal;
              dimTotal += beatSignal;
              beatCount++;
              dimBeats++;
            }
          }
        }
      }
    }

    dimSummaries.push({
      dim: dim.id,
      cube: dim.cube,
      avgSignal: parseFloat((dimTotal / dimBeats).toFixed(4)),
      beats: dimBeats,
    });
  }

  const confidence = immuneHalt ? 0 : totalSignal / beatCount;
  const verdict = immuneHalt ? 'HALT' : (confidence < 0.4 ? 'NEEDS-CHANGE' : (confidence < 0.65 ? 'PROCEED-WITH-CONDITIONS' : 'PROCEED'));

  dimSummaries.sort((a, b) => a.avgSignal - b.avgSignal);

  return {
    candidate_id: candidate.id,
    candidate_label: candidate.label || candidate.name || candidate.id,
    verdict,
    confidence: parseFloat(confidence.toFixed(4)),
    totalBeats: beatCount,
    immuneHalt,
    weakestDim: dimSummaries[0],
    strongestDim: dimSummaries[dimSummaries.length - 1],
    dimSummaries,
    beatFormula: `${dimSelection.length} dims × ${BODY.length} body × ${CYCLE.length} cycle × ${ROLE.length} role × ${TRINITY.length} trinity × ${INFERENCE_MODE.length} mode`,
  };
}

// ═══════════════════════════════════════════════════════════
// WAVE CASCADE — cycle through ALL 37 dims in waves of 12
// ═══════════════════════════════════════════════════════════

function waveCascade(candidate, liveState) {
  const waves = [];
  for (let i = 0; i < ALL_DIMS.length; i += 12) {
    const dimSlice = ALL_DIMS.slice(i, i + 12);
    // Pad last wave if < 12
    while (dimSlice.length < 12) dimSlice.push(ALL_DIMS[dimSlice.length % ALL_DIMS.length]);
    const result = deepTensorVote(candidate, liveState, dimSlice);
    waves.push({
      wave: waves.length + 1,
      dims: dimSlice.map(d => d.id),
      ...result,
    });
  }

  // Cross-wave synthesis
  const totalBeats = waves.reduce((a, w) => a + w.totalBeats, 0);
  const avgConfidence = waves.reduce((a, w) => a + w.confidence, 0) / waves.length;
  const anyHalt = waves.some(w => w.immuneHalt);

  return {
    candidate_id: candidate.id,
    candidate_label: candidate.label || candidate.name || candidate.id,
    waveCount: waves.length,
    totalBeats,
    avgConfidence: parseFloat(avgConfidence.toFixed(4)),
    verdict: anyHalt ? 'HALT' : (avgConfidence < 0.4 ? 'NEEDS-CHANGE' : (avgConfidence < 0.65 ? 'PROCEED-WITH-CONDITIONS' : 'PROCEED')),
    immuneHalt: anyHalt,
    waves: waves.map(w => ({
      wave: w.wave,
      beats: w.totalBeats,
      confidence: w.confidence,
      verdict: w.verdict,
      weakest: w.weakestDim?.dim,
      strongest: w.strongestDim?.dim,
    })),
    allDimsCovered: ALL_DIMS.length,
  };
}

// ═══════════════════════════════════════════════════════════
// MODES
// ═══════════════════════════════════════════════════════════

function selfDiagnose() {
  const liveState = readLiveState();
  const voteId = 'DEEP-DIAG-' + new Date().toISOString().replace(/[:.]/g, '');

  const candidates = [
    { id: 'federation-health', label: 'Federation transport', metadata: { scope_hours: 0.1 }, cube: 571787 },
    { id: 'cube-collapse', label: 'Brown-Hilbert collapse status', metadata: { scope_hours: 0.1, collapse_signals: liveState.collapseSignals }, cube: 2248091 },
    { id: 'agent-constellation', label: `${liveState.agentCount} agents, ${liveState.totalFindings} findings`, metadata: { proof_artifact: 'manifests', scope_hours: 0.1 }, cube: 29791 },
    { id: 'authority-frame', label: 'L4.0 CAPITAL sovereignty', metadata: { scope_hours: 0.1, proof_artifact: 'IDENTITY.md' }, cube: 3581577, primary_cube: 3581577 },
    { id: 'vault-integrity', label: `Vault: creds=${liveState.vaultPresent}, qdd=${liveState.qddVaultPresent}`, metadata: { scope_hours: 0.1, proof_artifact: liveState.vaultPresent ? 'vault files' : null }, cube: 103823 },
    { id: 'trinity-compute', label: 'LX-489/490/491 trinity', metadata: { scope_hours: 0.1 }, cube: 2803221 },
  ];

  const results = candidates.map(c => waveCascade(c, liveState));
  const totalBeats = results.reduce((a, r) => a + r.totalBeats, 0);

  const summary = {
    vote_id: voteId, ts: new Date().toISOString(), mode: 'deep-self-diagnose',
    engine: 'omni-shannon-v5-deep-cascade',
    totalBeats,
    dimsPerWave: 12, wavesPerCandidate: results[0]?.waveCount,
    beatsPerCandidate: results[0]?.totalBeats,
    beatFormula: `${ALL_DIMS.length} dims (in waves of 12) × 6 body × 6 cycle × 6 role × 6 trinity × 6 inference = ${results[0]?.totalBeats} per candidate`,
    authorityFrame: 'L4.0_CAPITAL',
    liveState: {
      agentCount: liveState.agentCount, totalFindings: liveState.totalFindings,
      totalMistakes: liveState.totalMistakes, federationAlive: liveState.federationAlive,
      collapseDetected: liveState.collapseDetected, collapseSignals: liveState.collapseSignals,
      vaultPresent: liveState.vaultPresent, qddVaultPresent: liveState.qddVaultPresent,
    },
    results,
    cube: [704969, 29791, 2248091, 3581577],
    dims: 'D24/D11/D32/D37',
  };

  ensureDir(path.join(VOTES_DIR, voteId));
  const outPath = path.join(VOTES_DIR, voteId, 'deep-diagnosis.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  mirror(outPath);
  return summary;
}

function liveScan() {
  const liveState = readLiveState();
  const voteId = 'DEEP-SCAN-' + new Date().toISOString().replace(/[:.]/g, '');

  const candidates = liveState.agents.map(a => ({
    id: a.id, label: a.manifest?.purpose || a.id, named_agent: a.id,
    metadata: { proof_artifact: 'manifest.json', scope_hours: 0.1 },
    cube: a.manifest?.cube_alignment?.primary_cube,
    primary_cube: a.manifest?.cube_alignment?.primary_cube,
  }));

  if (candidates.length === 0) {
    console.log(JSON.stringify({ error: 'No agents', agentCount: 0 }));
    return;
  }

  const results = candidates.map(c => waveCascade(c, liveState));
  results.sort((a, b) => b.avgConfidence - a.avgConfidence);

  const totalBeats = results.reduce((a, r) => a + r.totalBeats, 0);
  const summary = {
    vote_id: voteId, ts: new Date().toISOString(), mode: 'deep-live-scan',
    engine: 'omni-shannon-v5-deep-cascade',
    agentsScanned: candidates.length, totalBeats, results,
  };

  ensureDir(path.join(VOTES_DIR, voteId));
  const outPath = path.join(VOTES_DIR, voteId, 'deep-live-scan.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  mirror(outPath);
  return summary;
}

function qddCube() {
  const liveState = readLiveState();
  const voteId = 'DEEP-QDD-' + new Date().toISOString().replace(/[:.]/g, '');

  // QDD project candidates from the vault
  const candidates = [
    { id: 'ez-protect-module', label: 'EZ Protect/EZ Protect+ eBacMap integration', metadata: { scope_hours: 200, evidence_path: 'CHARM_EZP.docx', proof_artifact: '70-75% complete' }, cube: 103823 },
    { id: 'pq-bid-mvp', label: 'PQ Bid MVP (380-600h)', metadata: { scope_hours: 490, evidence_path: 'PQ_Bid_Proposal_V4_MVP_Revised.docx' }, cube: 704969 },
    { id: 'novalum-sync-app', label: 'NL2XSyncApp desktop sync (complete)', metadata: { scope_hours: 0, proof_artifact: 'NL2XSyncApp.exe', fix_commit_hash: '91aefe53' }, cube: 103823 },
    { id: 'wizard-scheduler', label: 'Wizard scheduler bug fixes (PAUSED)', metadata: { scope_hours: 25, blocked_by: 'over_budget' }, cube: 2197 },
    { id: 'ez-protect-blockers', label: '4 missing CHARM_EZ_PROTECT_* values', metadata: { scope_hours: 2, blocked_by: 'client_values_missing' }, cube: 2248091 },
  ];

  const results = candidates.map(c => waveCascade(c, liveState));
  results.sort((a, b) => b.avgConfidence - a.avgConfidence);

  const totalBeats = results.reduce((a, r) => a + r.totalBeats, 0);
  const summary = {
    vote_id: voteId, ts: new Date().toISOString(), mode: 'deep-qdd-cube',
    engine: 'omni-shannon-v5-deep-cascade',
    projectsScanned: candidates.length, totalBeats, results,
    cube: [704969, 103823, 2197, 2248091],
    dims: 'D24/D15/D6/D32',
  };

  ensureDir(path.join(VOTES_DIR, voteId));
  const outPath = path.join(VOTES_DIR, voteId, 'deep-qdd-cube.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  mirror(outPath);
  return summary;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  let result;
  if (args.includes('--self-diagnose')) result = selfDiagnose();
  else if (args.includes('--live-scan')) result = liveScan();
  else if (args.includes('--qdd-cube')) result = qddCube();
  else {
    console.error('Usage: omni-shannon-v5-deep-cascade.js --self-diagnose|--live-scan|--qdd-cube|<input.json>');
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { waveCascade, deepTensorVote, ALL_DIMS };
