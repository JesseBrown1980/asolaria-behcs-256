#!/usr/bin/env node
/**
 * codex-bridge.js — CJS bridge for Falcon's ESM BEHCS codex.
 *
 * Falcon's launch.js uses ESM (import/export). Acer uses CJS (require).
 * This bridge loads the alphabet + catalogs as JSON (universal) and
 * reimplements hilbertAddress + encodeGlyph in CJS.
 *
 * Usage:
 *   const behcs = require('./tools/behcs/codex-bridge');
 *   behcs.hilbertAddress('falcon')  → '⁂←α.Vυ(∞'
 *   behcs.cubeCount                 → 120
 *   behcs.catalogByD[25]            → { D: 25, name: 'MODALITY', ... }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  evaluateFileCap,
  summarizeFileCapStatus,
} = require('./behcs-file-cap');

const BEHCS_DIR = path.join(__dirname, '..', '..', 'data', 'behcs');
const CODEX_DIR = path.join(BEHCS_DIR, 'codex');
const CUBES_DIR = path.join(BEHCS_DIR, 'cubes');

// Load alphabet
const alphabet = JSON.parse(fs.readFileSync(path.join(CODEX_DIR, 'alphabet.json'), 'utf8'));
if (!Array.isArray(alphabet.glyphs) || alphabet.glyphs.length !== alphabet.base) {
  throw new Error(`BEHCS alphabet broken: ${alphabet.glyphs?.length} glyphs vs base ${alphabet.base}`);
}

// Load catalogs
const catalogs = JSON.parse(fs.readFileSync(path.join(CODEX_DIR, 'catalogs.json'), 'utf8'));
if (!Array.isArray(catalogs.catalogs) || catalogs.catalogs.length !== 47) {
  throw new Error(`BEHCS catalogs broken: ${catalogs.catalogs?.length} vs 47`);
}

const catalogByD = {};
const catalogByName = {};
for (const c of catalogs.catalogs) {
  catalogByD[c.D] = c;
  catalogByName[c.name] = c;
}

// Encode a value as base-256 glyphs
function encodeGlyph(value, width) {
  width = width || alphabet.canonical_width;
  const base = BigInt(alphabet.base);
  let v = BigInt.asUintN(64, BigInt(value));
  const out = [];
  for (let i = 0; i < width; i++) {
    out.push(alphabet.glyphs[Number(v % base)]);
    v /= base;
  }
  return out.join('');
}

// SHA-256 → low 64 bits → base-256 glyph sequence
function hilbertAddress(key) {
  const h = crypto.createHash('sha256').update(String(key)).digest();
  const v = h.readBigUInt64BE(0);
  return encodeGlyph(v);
}

// Load cubes from .cube.js files (parse exports without ESM import)
function loadCubes() {
  const cubes = {};
  if (!fs.existsSync(CUBES_DIR)) return cubes;
  for (const f of fs.readdirSync(CUBES_DIR).filter(f => f.endsWith('.cube.js'))) {
    try {
      const src = fs.readFileSync(path.join(CUBES_DIR, f), 'utf8');
      // Extract CUBE object from ESM export via regex
      const match = src.match(/export\s+const\s+CUBE\s*=\s*(\{[\s\S]*?\});?\s*$/m);
      if (match) {
        // Safe eval of the CUBE object literal
        const cubeObj = new Function('return ' + match[1].replace(/'/g, '"'))();
        if (cubeObj && cubeObj.id) {
          cubes[cubeObj.id] = { file: f, ...cubeObj, hilbert: hilbertAddress(cubeObj.id) };
        }
      }
    } catch (_) {
      // Skip cubes that fail to parse
    }
  }
  return cubes;
}

const cubes = loadCubes();

// Load connectors (edge mesh)
let connectors = { edges: [] };
try {
  connectors = JSON.parse(fs.readFileSync(path.join(CODEX_DIR, 'connectors.json'), 'utf8'));
} catch (_) {}

const context = {
  ok: true,
  spec: 'IX-700',
  alphabet_base: alphabet.base,
  glyph_count: alphabet.glyphs.length,
  catalog_count: catalogs.catalogs.length,
  catalog_status: catalogs.status,
  cubes_loaded: Object.keys(cubes).length,
  edge_count: connectors.edges?.length || connectors.edge_count || 0,
  file_cap_guard: summarizeFileCapStatus(evaluateFileCap({
    rootDir: path.join(__dirname, '..', '..'),
    reason: 'codex_bridge',
    surfaceIds: ['behcs_index', 'behcs_codex', 'behcs_cubes', 'ix_codex', 'ix_cubes', 'behcs_state', 'ix_state', 'behcs_gc'],
  })),
  loaded_at: new Date().toISOString(),
};

// Self-test on require
if (require.main === module) {
  console.log('[codex-bridge] BEHCS codex loaded (CJS bridge)');
  console.log(`  alphabet: base-${alphabet.base}, ${alphabet.glyphs.length} glyphs`);
  console.log(`  catalogs: ${catalogs.catalogs.length} (status: ${catalogs.status})`);
  console.log(`  cubes: ${Object.keys(cubes).length} loaded`);
  console.log(`  edges: ${context.edge_count}`);
  console.log(`  hilbertAddress("falcon"): ${hilbertAddress('falcon')}`);
  console.log(`  hilbertAddress("asolaria"): ${hilbertAddress('asolaria')}`);
  console.log(`  hilbertAddress("BEHCS"): ${hilbertAddress('BEHCS')}`);
}

module.exports = {
  alphabet, catalogs, catalogByD, catalogByName,
  cubes, connectors, context,
  encodeGlyph, hilbertAddress, loadCubes,
};
