// codex/connectors.generate.js — Full-mesh connector generator
// IX-705 | author: falcon | spec: IX-700 extension
// Usage: node ~/sovereignty/ix/codex/connectors.generate.js [--verify]
//
// Reads every cube under ../cubes, computes the N×(N-1) edge set, classifies each
// edge by catalog overlap, and writes connectors.json. With --verify, checks that
// every cube's declared connectors object references real cube ids.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CODEX_DIR  = path.dirname(fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, ''));
const CUBES_DIR  = path.join(CODEX_DIR, '..', 'cubes');
const OUT_FILE   = path.join(CODEX_DIR, 'connectors.json');
const CATALOGS   = JSON.parse(fs.readFileSync(path.join(CODEX_DIR, 'catalogs.json'), 'utf8'));
const VERIFY     = process.argv.includes('--verify');

// AI_MODEL is D18 — used for cross-lane-twin classification. Cubes may expose
// an `aiModel` or `ai_model` field; otherwise we look in payload.ai_model or
// fall back to 'unassigned' so the classifier still runs.
function laneOf(cube) {
  return cube.aiModel || cube.ai_model || cube.payload?.ai_model || cube.payload?.aiModel || 'unassigned';
}

async function loadCubes() {
  const cubes = [];
  if (!fs.existsSync(CUBES_DIR)) return cubes;
  for (const f of fs.readdirSync(CUBES_DIR).filter(f => f.endsWith('.cube.js'))) {
    try {
      const mod = await import(pathToFileURL(path.join(CUBES_DIR, f)).href);
      if (mod.CUBE?.id) cubes.push({ file: f, ...mod.CUBE });
    } catch (e) {
      console.error(`[connectors.generate] failed to load ${f}: ${e.message}`);
    }
  }
  return cubes;
}

function classify(a, b) {
  const aPri = a.primaryCatalog?.D;
  const bPri = b.primaryCatalog?.D;
  const aTouches = new Set([aPri, ...(a.touches || [])]);
  const bTouches = new Set([bPri, ...(b.touches || [])]);
  const overlap = [...aTouches].filter(d => bTouches.has(d));
  const aLane = laneOf(a);
  const bLane = laneOf(b);

  if (aPri != null && aPri === bPri) {
    return { type: 'siblings', basis: `same primaryCatalog D${aPri}` };
  }
  if (aLane !== 'unassigned' && bLane !== 'unassigned' && aLane !== bLane) {
    return { type: 'cross-lane-twin', basis: `D18 ${aLane} ↔ ${bLane}` };
  }
  if (overlap.length > 0) {
    return { type: 'colony-peer', basis: `touches overlap D[${overlap.sort((x,y)=>x-y).join(',')}]` };
  }
  return { type: 'loose-link', basis: 'no catalog overlap' };
}

function buildEdges(cubes) {
  const edges = [];
  for (let i = 0; i < cubes.length; i++) {
    for (let j = 0; j < cubes.length; j++) {
      if (i === j) continue;
      const a = cubes[i], b = cubes[j];
      const { type, basis } = classify(a, b);
      edges.push({ from: a.id, to: b.id, type, basis });
    }
  }
  return edges;
}

function verifyConnectors(cubes) {
  const ids = new Set(cubes.map(c => c.id));
  const orphans = [];
  for (const c of cubes) {
    const decl = c.connectors || {};
    for (const ref of Object.keys(decl)) {
      if (!ids.has(ref)) orphans.push({ cube: c.id, refers_to: ref, label: decl[ref] });
    }
  }
  return orphans;
}

const cubes = await loadCubes();
const edges = buildEdges(cubes);

const out = {
  generated_at: new Date().toISOString(),
  spec: 'IX-705',
  cube_count: cubes.length,
  edge_count: edges.length,
  edges
};
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
console.log(`[connectors.generate] ${cubes.length} cubes → ${edges.length} edges written to connectors.json`);

if (VERIFY) {
  const orphans = verifyConnectors(cubes);
  if (orphans.length === 0) {
    console.log(`[connectors.generate] --verify: OK — all declared connectors reference real cube ids (${cubes.length} cubes checked)`);
  } else {
    console.log(`[connectors.generate] --verify: ${orphans.length} orphan reference(s) found:`);
    for (const o of orphans) console.log(`  - ${o.cube} → ${o.refers_to} (${o.label}) [NOT A LOADED CUBE]`);
    process.exitCode = 1;
  }
}

export { cubes, edges, classify, buildEdges, verifyConnectors };
