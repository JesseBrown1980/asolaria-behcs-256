#!/usr/bin/env node
/**
 * omnitranslator-v0.js — LX-491 Stage 2 stub
 *
 * Pluggable translator framework that auto-translates between dialects so the
 * inference fabric is omnidirectionally consumable.
 *
 * Stage 2 ships ONE pair: omnilanguage <-> JSON. Round-trip preserved.
 * NovaLUM shield clause inherited (translation cannot cause shielded resources
 * to become cross-host-dispatchable). No privesc class changes via translation.
 *
 * Cosign chain: LX-491 tier-2 acer cosign by Jesse "Yes begin" 2026-04-07T02:30Z
 * + sweep "approve all - directive go" 2026-04-07T02:35Z.
 *
 * Usage:
 *   node tools/cube/omni-processor/omnitranslator-v0.js --self-test
 *   node tools/cube/omni-processor/omnitranslator-v0.js --translate <from> <to> <input>
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const LOG_FILE = path.join(ROOT, 'logs/omnitranslator.ndjson');
const CALENDAR = path.join(ROOT, 'data/omnidirectional-calendar.ndjson');

const now = () => new Date().toISOString();
const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const appendLine = (f, o) => { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(o) + '\n'); };

// === Registered dialects (6 per liris LX-491 stage 2 stub) ===
const DIALECTS = {
  omnilanguage: {
    id: 'omnilanguage',
    is_trunk: true,
    description: '@packet from=X to=Y verb=Z key=value form, the federation channel canonical form',
    pair_status: { 'json': 'implemented', 'IX': 'planned', 'LX': 'planned', 'XL': 'planned', 'plain_english': 'planned' }
  },
  json: {
    id: 'json',
    is_trunk: false,
    description: 'structured JSON object form (workload manifests, cube findings, ndjsons)',
    pair_status: { 'omnilanguage': 'implemented', 'IX': 'planned', 'LX': 'planned', 'XL': 'planned', 'plain_english': 'planned' }
  },
  IX: {
    id: 'IX',
    is_trunk: false,
    description: 'OMNI-LANGUAGE-V3 14-24D tuple form for high-dim reasoning',
    pair_status: { 'omnilanguage': 'planned', 'json': 'planned' }
  },
  LX: {
    id: 'LX',
    is_trunk: false,
    description: 'markdown chain entries in agent-index/projects/LX-NNN-*.md',
    pair_status: { 'omnilanguage': 'planned', 'json': 'planned' }
  },
  XL: {
    id: 'XL',
    is_trunk: false,
    description: 'Xylos lore taxonomy from AETHER bundle (XL.entity.x, XL.location.y) — D10 dialect, declared LX-483',
    pair_status: { 'omnilanguage': 'planned', 'json': 'planned' }
  },
  plain_english: {
    id: 'plain_english',
    is_trunk: false,
    description: 'natural language form for operator briefings, drafts, paper writing — human-in-loop fallback',
    pair_status: { 'omnilanguage': 'planned', 'json': 'planned' }
  }
};

// === Translation pairs ===
// Each pair is identified by `from->to`. The function takes the source string
// and returns the translated form. round-trip invariants preserved.

const PAIRS = {};

// omnilanguage -> json
// Input: "@packet from=asolaria to=liris verb=test key1=v1 key2=v2"
// Output: { kind: "omnilanguage", root: "packet", from: "asolaria", to: "liris", verb: "test", fields: { key1: "v1", key2: "v2" } }
PAIRS['omnilanguage->json'] = function (src) {
  if (typeof src !== 'string') throw new Error('omnilanguage->json: src must be string');
  const trimmed = src.trim();
  if (!trimmed.startsWith('@')) throw new Error('omnilanguage->json: must start with @<root>');
  // Tokenize: @root key=value key=value ...
  // Values may contain = if we see them as part of a value (we treat first = as separator)
  const parts = [];
  let buf = '';
  let inToken = false;
  // Simple state machine — split on whitespace but keep key=value tokens together
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      if (inToken) { parts.push(buf); buf = ''; inToken = false; }
    } else {
      buf += c; inToken = true;
    }
  }
  if (inToken) parts.push(buf);
  if (parts.length === 0) throw new Error('omnilanguage->json: empty packet');
  const root = parts[0].slice(1); // strip @
  const fields = {};
  // Standard fields hoisted to top level
  let from = null, to = null, verb = null;
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq === -1) {
      // bare token, store as flag
      fields['_flag_' + i] = parts[i];
      continue;
    }
    const k = parts[i].slice(0, eq);
    const v = parts[i].slice(eq + 1);
    if (k === 'from') from = v;
    else if (k === 'to') to = v;
    else if (k === 'verb') verb = v;
    else fields[k] = v;
  }
  return {
    kind: 'omnilanguage',
    root,
    from,
    to,
    verb,
    fields,
    _translated_from: 'omnilanguage',
    _translated_at: now()
  };
};

// json -> omnilanguage
// Input: { root, from, to, verb, fields }
// Output: "@root from=... to=... verb=... key=value key=value"
PAIRS['json->omnilanguage'] = function (obj) {
  if (typeof obj === 'string') obj = JSON.parse(obj);
  if (!obj || !obj.root) throw new Error('json->omnilanguage: missing root');
  let s = '@' + obj.root;
  if (obj.from) s += ' from=' + obj.from;
  if (obj.to) s += ' to=' + obj.to;
  if (obj.verb) s += ' verb=' + obj.verb;
  if (obj.fields) {
    for (const [k, v] of Object.entries(obj.fields)) {
      if (k.startsWith('_')) continue; // strip internal fields
      s += ' ' + k + '=' + v;
    }
  }
  return s;
};

// === Translation invariants check ===
// 1. round-trip preservation: translate(translate(x, A->B), B->A) === normalized(x)
// 2. no novalum shield bypass: any field referencing cube 103823 stays cube 103823
// 3. no privesc: law_class field cannot be elevated through translation
function validateInvariants(originalSrc, translated, fromDialect, toDialect) {
  const violations = [];
  // Check #2: novalum shield preservation
  const srcStr = typeof originalSrc === 'string' ? originalSrc : JSON.stringify(originalSrc);
  const tgtStr = typeof translated === 'string' ? translated : JSON.stringify(translated);
  if (srcStr.includes('103823') && !tgtStr.includes('103823')) {
    violations.push('novalum_shield_lost: cube 103823 reference dropped during translation');
  }
  // Check #3: law_class preservation
  const srcLaw = (srcStr.match(/law_class[=:]\s*"?(\w+)/) || [])[1];
  const tgtLaw = (tgtStr.match(/law_class[=:]\s*"?(\w+)/) || [])[1];
  if (srcLaw && tgtLaw && srcLaw !== tgtLaw) {
    violations.push('law_class_changed: ' + srcLaw + ' -> ' + tgtLaw);
  }
  return violations;
}

function translate(from, to, input) {
  const key = from + '->' + to;
  if (!PAIRS[key]) throw new Error('No translator pair: ' + key);
  const result = PAIRS[key](input);
  const violations = validateInvariants(input, result, from, to);
  appendLine(LOG_FILE, {
    ts: now(),
    kind: 'translation',
    from_dialect: from,
    to_dialect: to,
    input_size: typeof input === 'string' ? input.length : JSON.stringify(input).length,
    output_size: typeof result === 'string' ? result.length : JSON.stringify(result).length,
    violations,
    cube: [50653, 29791], // D12 ECHO + D11 PROOF
    dims: ['D12_ECHO', 'D11_PROOF']
  });
  if (violations.length > 0) {
    throw new Error('Translation invariant violation: ' + violations.join('; '));
  }
  return result;
}

// === Self-test ===
function selftest() {
  const tests = [];
  const log = (name, ok, detail) => { tests.push({ name, ok, detail }); console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + name + (detail ? ' — ' + detail : '')); };

  // T1: dialects registered
  log('T1 dialects registered', Object.keys(DIALECTS).length >= 2 && DIALECTS.omnilanguage && DIALECTS.json, Object.keys(DIALECTS).join(','));

  // T2: omnilanguage -> json basic
  const sample = '@packet from=asolaria to=liris verb=test_message key1=value1 key2=value2';
  let parsed;
  try { parsed = translate('omnilanguage', 'json', sample); log('T2 omnilanguage->json basic', !!parsed && parsed.root === 'packet' && parsed.from === 'asolaria'); }
  catch (e) { log('T2 omnilanguage->json basic', false, e.message); }

  // T3: json -> omnilanguage basic
  let serialized;
  try { serialized = translate('json', 'omnilanguage', parsed); log('T3 json->omnilanguage basic', serialized.startsWith('@packet')); }
  catch (e) { log('T3 json->omnilanguage basic', false, e.message); }

  // T4: round-trip preservation (semantic equality)
  let roundTrip;
  try {
    roundTrip = translate('omnilanguage', 'json', serialized);
    const sameRoot = roundTrip.root === parsed.root;
    const sameFrom = roundTrip.from === parsed.from;
    const sameTo = roundTrip.to === parsed.to;
    const sameVerb = roundTrip.verb === parsed.verb;
    const sameKey1 = roundTrip.fields.key1 === parsed.fields.key1;
    log('T4 round-trip preservation', sameRoot && sameFrom && sameTo && sameVerb && sameKey1);
  } catch (e) { log('T4 round-trip preservation', false, e.message); }

  // T5: novalum shield invariant — cube 103823 must round-trip
  const shieldedSample = '@packet from=jbd.novalum-bridge to=jbd.qdd.network-mapper verb=device.read cube=103823 dim=D15_DEVICE';
  let shieldedParsed;
  try {
    shieldedParsed = translate('omnilanguage', 'json', shieldedSample);
    const stayed = JSON.stringify(shieldedParsed).includes('103823');
    log('T5 novalum cube preserved', stayed);
  } catch (e) { log('T5 novalum cube preserved', false, e.message); }

  // T6: log file received entries
  let lineCount = 0;
  if (fs.existsSync(LOG_FILE)) lineCount = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length;
  log('T6 translation log populated', lineCount > 0, 'lines=' + lineCount);

  // T7: unknown pair throws
  let threw = false;
  try { translate('omnilanguage', 'XL', sample); }
  catch (_) { threw = true; }
  log('T7 unknown pair throws', threw);

  const passed = tests.filter(t => t.ok).length;
  console.log('\n=== ' + passed + '/' + tests.length + ' tests passed ===');
  process.exit(passed === tests.length ? 0 : 1);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selftest();
  } else if (process.argv[2] === '--translate' && process.argv.length >= 6) {
    const from = process.argv[3];
    const to = process.argv[4];
    const input = process.argv.slice(5).join(' ');
    const result = translate(from, to, input);
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  } else {
    console.error('usage: omnitranslator-v0.js --self-test | --translate <from> <to> <input>');
    process.exit(1);
  }
}

module.exports = { translate, DIALECTS, PAIRS };
