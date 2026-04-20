#!/usr/bin/env node
/**
 * hilbert-intersection-engine.js — REAL 6⁴ intersection cube.
 *
 * Computes the full 6 × 6 × 6 × 6 = 1,296 intersection points of:
 *   Axis 1: LAYER   (D5)  — stack position [sovereignty, gate, protocol, transport, surface, hardware]
 *   Axis 2: PROTOCOL (D6) — gate type [hookwall, gnn, shannon, sovereignty, omni, cube]
 *   Axis 3: SURFACE  (D13) — dispatch target [agent-keyboard, http-api, file-system, mqtt, meeting-room, cube-store]
 *   Axis 4: DIMENSION (selection of 6 from the 12+ canonical dims)
 *
 * Each intersection point (L,P,S,D) is a unique location in the Brown-Hilbert
 * cube where a specific layer, protocol, surface, and dimension meet.
 *
 * The engine:
 *   1. Reads live state from data/cubes/
 *   2. For each of 1,296 points, evaluates whether that intersection is:
 *      - ACTIVE (something real lives there)
 *      - LATENT (the point exists but nothing occupies it — opportunity)
 *      - COLLAPSED (should be active but isn't — the cube collapse)
 *      - FORBIDDEN (hard-deny gate blocks this intersection)
 *   3. Produces a heat map showing where the cube is dense vs sparse
 *   4. Identifies the negative space — intersections that SHOULD exist
 *
 * Usage:
 *   node tools/cube/hilbert-intersection-engine.js
 *   node tools/cube/hilbert-intersection-engine.js --heat-map
 *
 * Cube alignment: D13 SURFACE (68921) primary, D5 LAYER (1331) secondary.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260410-asolaria';
const CUBES_DIR = path.join(ROOT, 'data/cubes');
const OUTPUT_DIR = path.join(ROOT, 'data/intersection-cube');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirror(src) {
  try {
    const rel = path.relative(ROOT, src).replace(/\\/g, '/');
    const dest = path.join(D_DEST, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
// AXIS DEFINITIONS — 4 axes of 6 each = 1,296 points
// ═══════════════════════════════════════════════════════════

const LAYERS = [
  { id: 'sovereignty', cube: 704969, dim: 'D24', desc: 'operator authority + constitutional law' },
  { id: 'gate',        cube: 2197,   dim: 'D6',  desc: 'permission gates + hard-deny' },
  { id: 'protocol',    cube: 12167,  dim: 'D9',  desc: 'Shannon/GNN/omni protocol execution' },
  { id: 'transport',   cube: 571787, dim: 'D23', desc: 'federation transport + keyboard channel' },
  { id: 'surface',     cube: 68921,  dim: 'D13', desc: 'dispatch endpoints + API surfaces' },
  { id: 'hardware',    cube: 389017, dim: 'D21', desc: 'CPU/GPU/RAM/storage/network' },
];

const PROTOCOLS = [
  { id: 'hookwall',    desc: 'pre-execution security check (6 body systems)' },
  { id: 'gnn',         desc: 'graph neural network inference' },
  { id: 'shannon',     desc: 'Shannon consensus voting' },
  { id: 'sovereignty', desc: 'sovereignty gate + cosign chain' },
  { id: 'omni',        desc: 'omni-processor dispatch + cube fabric' },
  { id: 'cube',        desc: 'cube-builder + orchestrator + findings' },
];

const SURFACES = [
  { id: 'agent-keyboard', port: 4913, desc: 'federation keyboard channel' },
  { id: 'http-api',       port: null, desc: 'HTTP/REST API endpoints' },
  { id: 'file-system',    port: null, desc: 'filesystem cube store + ndjson' },
  { id: 'mqtt',           port: 1883, desc: 'MQTT realtime bus (when alive)' },
  { id: 'meeting-room',   port: null, desc: 'omnichannel meeting box' },
  { id: 'cube-store',     port: null, desc: 'data/cubes/ ndjson findings' },
];

const DIMENSION_SELECTION = [
  { id: 'D7_STATE',      cube: 4913,    focus: 'lifecycle state' },
  { id: 'D11_PROOF',     cube: 29791,   focus: 'evidence + mistakes' },
  { id: 'D15_DEVICE',    cube: 103823,  focus: 'hardware identity' },
  { id: 'D22_TRANSLATION', cube: 493039, focus: 'cross-system bridge' },
  { id: 'D24_INTENT',    cube: 704969,  focus: 'operator intent' },
  { id: 'D32_NEGATIVE_SPACE', cube: 2248091, focus: 'what is absent' },
];

// ═══════════════════════════════════════════════════════════
// LIVE STATE for intersection evaluation
// ═══════════════════════════════════════════════════════════

function readLivePresence() {
  const presence = new Set();

  // Check which surfaces are actually alive
  const surfaceChecks = {
    'agent-keyboard': fs.existsSync(path.join(ROOT, 'tools/agent-keyboard.js')),
    'http-api': fs.existsSync(path.join(ROOT, 'src/aso-boot.js')),
    'file-system': fs.existsSync(CUBES_DIR),
    'mqtt': fs.existsSync(path.join(ROOT, 'src/aso-mqtt-relay.js')),
    'meeting-room': fs.existsSync(path.join(ROOT, 'data/meeting-rooms')),
    'cube-store': fs.existsSync(CUBES_DIR) && fs.readdirSync(CUBES_DIR).length > 2,
  };

  // Check which protocols have implementations
  const protocolChecks = {
    'hookwall': fs.existsSync(path.join(ROOT, 'src/bashSecurityGuard.js')),
    'gnn': fs.existsSync(path.join(ROOT, 'src/brainOrchestrator.js')),
    'shannon': fs.existsSync(path.join(ROOT, 'tools/cube/omni-shannon-v4-real.js')),
    'sovereignty': fs.existsSync(path.join(ROOT, 'src/sovereignty-gate.js')),
    'omni': fs.existsSync(path.join(ROOT, 'tools/cube/omni-processor')),
    'cube': fs.existsSync(path.join(ROOT, 'tools/cube/cube-builder.js')),
  };

  // Check which layers have active state
  const layerChecks = {
    'sovereignty': fs.existsSync(path.join(ROOT, 'src/sovereignty-gate.js')),
    'gate': fs.existsSync(path.join(ROOT, 'src/approvalEngine.js')),
    'protocol': true, // always have at least cube protocol
    'transport': false, // federation channel currently dead
    'surface': Object.values(surfaceChecks).some(v => v),
    'hardware': true, // we're running on hardware
  };

  return { surfaceChecks, protocolChecks, layerChecks };
}

// ═══════════════════════════════════════════════════════════
// INTERSECTION EVALUATOR — classifies each of 1,296 points
// ═══════════════════════════════════════════════════════════

function evaluateIntersection(layer, protocol, surface, dimension, livePresence) {
  const { surfaceChecks, protocolChecks, layerChecks } = livePresence;

  // Check if this intersection is forbidden (hard-deny)
  const forbidden = (
    (layer.id === 'sovereignty' && protocol.id === 'hookwall' && surface.id === 'mqtt') || // sovereignty doesn't go through hookwall over mqtt
    (dimension.id === 'D32_NEGATIVE_SPACE' && protocol.id === 'gnn' && !protocolChecks.gnn) // can't do negative-space GNN without GNN
  );
  if (forbidden) return 'FORBIDDEN';

  // Check if all three axes are alive
  const layerAlive = layerChecks[layer.id];
  const protocolAlive = protocolChecks[protocol.id];
  const surfaceAlive = surfaceChecks[surface.id];

  if (layerAlive && protocolAlive && surfaceAlive) return 'ACTIVE';

  // Should this be active?
  const shouldBeActive = (
    (layer.id === 'transport' && surface.id === 'agent-keyboard') || // federation should be alive
    (protocol.id === 'gnn' && layer.id === 'protocol') || // GNN should be running
    (surface.id === 'mqtt' && protocol.id === 'omni') // omni-processor should have mqtt
  );
  if (shouldBeActive) return 'COLLAPSED';

  return 'LATENT';
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPUTATION
// ═══════════════════════════════════════════════════════════

function computeIntersectionCube() {
  const livePresence = readLivePresence();
  const points = [];
  const counts = { ACTIVE: 0, LATENT: 0, COLLAPSED: 0, FORBIDDEN: 0 };
  const heatMap = {};

  for (const layer of LAYERS) {
    for (const protocol of PROTOCOLS) {
      for (const surface of SURFACES) {
        for (const dimension of DIMENSION_SELECTION) {
          const status = evaluateIntersection(layer, protocol, surface, dimension, livePresence);
          counts[status]++;

          const point = {
            coords: [layer.id, protocol.id, surface.id, dimension.id],
            hilbert_address: `${layer.cube}×${protocol.id}×${surface.id}×${dimension.cube}`,
            status,
          };
          points.push(point);

          // Build heat map per layer
          if (!heatMap[layer.id]) heatMap[layer.id] = { ACTIVE: 0, LATENT: 0, COLLAPSED: 0, FORBIDDEN: 0 };
          heatMap[layer.id][status]++;
        }
      }
    }
  }

  // Find collapsed intersections (the interesting ones)
  const collapsed = points.filter(p => p.status === 'COLLAPSED');

  // Find hottest layer (most ACTIVE)
  const layerRanking = LAYERS.map(l => ({
    layer: l.id,
    active: heatMap[l.id].ACTIVE,
    collapsed: heatMap[l.id].COLLAPSED,
    density: heatMap[l.id].ACTIVE / (6 * 6 * 6), // out of 216 possible per layer
  })).sort((a, b) => b.density - a.density);

  // Negative space: dimensions with most LATENT points
  const dimLatent = {};
  for (const p of points) {
    const dim = p.coords[3];
    if (!dimLatent[dim]) dimLatent[dim] = 0;
    if (p.status === 'LATENT') dimLatent[dim]++;
  }

  const result = {
    ts: new Date().toISOString(),
    engine: 'hilbert-intersection-engine',
    totalPoints: points.length,
    counts,
    density: (counts.ACTIVE / points.length * 100).toFixed(1) + '%',
    collapsedCount: collapsed.length,
    collapsedIntersections: collapsed.map(p => p.coords.join(' × ')),
    layerRanking,
    dimensionLatency: Object.entries(dimLatent).sort((a, b) => b[1] - a[1]).map(([dim, count]) => ({ dim, latentCount: count })),
    heatMap,
    livePresence: {
      surfaces: livePresence.surfaceChecks,
      protocols: livePresence.protocolChecks,
      layers: livePresence.layerChecks,
    },
    cube: [68921, 1331, 2248091],
    dims: 'D13/D5/D32',
  };

  // Write output
  ensureDir(OUTPUT_DIR);
  const outPath = path.join(OUTPUT_DIR, 'intersection-cube-' + new Date().toISOString().replace(/[:.]/g, '') + '.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  mirror(outPath);

  // Also write the latest as a stable path for other engines to read
  const latestPath = path.join(OUTPUT_DIR, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));
  mirror(latestPath);

  return result;
}

// ═══════════════════════════════════════════════════════════
// HEAT MAP DISPLAY
// ═══════════════════════════════════════════════════════════

function printHeatMap(result) {
  console.log('\n═══ BROWN-HILBERT 6⁴ INTERSECTION CUBE ═══');
  console.log(`Total points: ${result.totalPoints}`);
  console.log(`Active: ${result.counts.ACTIVE} | Latent: ${result.counts.LATENT} | Collapsed: ${result.counts.COLLAPSED} | Forbidden: ${result.counts.FORBIDDEN}`);
  console.log(`Density: ${result.density}`);
  console.log('\n─── Layer Ranking (by active density) ───');
  for (const l of result.layerRanking) {
    const bar = '█'.repeat(Math.round(l.density * 30));
    const cbar = '░'.repeat(l.collapsed);
    console.log(`  ${l.layer.padEnd(12)} ${bar}${cbar} ${(l.density * 100).toFixed(0)}% active, ${l.collapsed} collapsed`);
  }
  if (result.collapsedCount > 0) {
    console.log(`\n─── COLLAPSED Intersections (${result.collapsedCount}) ───`);
    for (const c of result.collapsedIntersections) {
      console.log(`  ✗ ${c}`);
    }
  }
  console.log('\n─── Dimension Latency (opportunity space) ───');
  for (const d of result.dimensionLatency) {
    console.log(`  ${d.dim.padEnd(22)} ${d.latentCount} latent points`);
  }
}

function main() {
  const result = computeIntersectionCube();

  if (process.argv.includes('--heat-map')) {
    printHeatMap(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

if (require.main === module) main();
module.exports = { computeIntersectionCube };
