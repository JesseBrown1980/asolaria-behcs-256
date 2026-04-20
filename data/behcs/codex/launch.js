// codex/launch.js — Brown Hilbert codex loader
// IX-700 | Mandatory launch protocol for any agent that wants to speak Hilbert
// Usage: node ~/sovereignty/ix/codex/launch.js [--verify] [--json]
// Exit 0 = codex loaded, exit 2 = hard fail (missing alphabet or catalogs)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CODEX_DIR = path.dirname(fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, ''));
const CUBES_DIR = path.join(CODEX_DIR, '..', 'cubes');

function fail(msg, code = 2) {
  console.error(`[codex-launch] HARD-FAIL: ${msg}`);
  process.exit(code);
}

function loadJSON(p, label) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`cannot read ${label} at ${p}: ${e.message}`); }
}

const alphabet = loadJSON(path.join(CODEX_DIR, 'alphabet.json'), 'alphabet');
const catalogs = loadJSON(path.join(CODEX_DIR, 'catalogs.json'), 'catalogs');

if (!Array.isArray(alphabet.glyphs) || alphabet.glyphs.length !== alphabet.base)
  fail(`alphabet.glyphs length ${alphabet.glyphs?.length} !== declared base ${alphabet.base}`);
if (!Array.isArray(catalogs.catalogs) || catalogs.catalogs.length !== 47)
  fail(`catalogs.catalogs length ${catalogs.catalogs?.length} !== 47`);

const catalogByD = Object.fromEntries(catalogs.catalogs.map(c => [c.D, c]));
const catalogByName = Object.fromEntries(catalogs.catalogs.map(c => [c.name, c]));

function encodeGlyph(bigintValue, width = alphabet.canonical_width) {
  const base = BigInt(alphabet.base);
  let v = BigInt.asUintN(64, BigInt(bigintValue));
  const out = [];
  for (let i = 0; i < width; i++) { out.push(alphabet.glyphs[Number(v % base)]); v /= base; }
  return out.join('');
}

function hilbertAddress(key) {
  const h = crypto.createHash('sha256').update(key).digest();
  const v = h.readBigUInt64BE(0);
  return encodeGlyph(v);
}

const cubes = {};
if (fs.existsSync(CUBES_DIR)) {
  for (const f of fs.readdirSync(CUBES_DIR).filter(f => f.endsWith('.cube.js'))) {
    try {
      const mod = await import(pathToFileURL(path.join(CUBES_DIR, f)).href);
      if (mod.CUBE) cubes[mod.CUBE.id] = { file: f, ...mod.CUBE };
    } catch (e) { console.error(`[codex-launch] cube ${f} failed to load: ${e.message}`); }
  }
}

const context = {
  ok: true,
  spec: 'IX-700',
  alphabet_base: alphabet.base,
  glyph_count: alphabet.glyphs.length,
  catalog_count: catalogs.catalogs.length,
  catalog_status: catalogs.status,
  cubes_loaded: Object.keys(cubes).length,
  cube_ids: Object.keys(cubes),
  loaded_at: new Date().toISOString()
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ context, catalogByD, cubes, encodeGlyph: 'fn', hilbertAddress: 'fn' }, null, 2));
} else {
  console.log('[codex-launch] OK');
  console.log(`  alphabet: base-${alphabet.base}, ${alphabet.glyphs.length} glyphs`);
  console.log(`  catalogs: ${catalogs.catalogs.length} (status: ${catalogs.status})`);
  console.log(`  cubes:    ${Object.keys(cubes).length} loaded`);
  if (Object.keys(cubes).length) console.log(`    ${Object.keys(cubes).join(', ')}`);
  console.log(`  self-test hilbertAddress("falcon-test"): ${hilbertAddress('falcon-test')}`);
}

export { alphabet, catalogs, catalogByD, catalogByName, cubes, encodeGlyph, hilbertAddress, context };
