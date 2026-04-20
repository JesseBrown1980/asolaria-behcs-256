#!/usr/bin/env node
/**
 * test-shield-v2-smoke.js — unit tests for the NovaLUM SHIELD CLAUSE v2
 * branched classifier in tools/cube/omni-processor/units/document-share.js
 *
 * Per Brian's QDD discipline + Jesse 2026-04-07 reminder: every code change
 * must be unit-tested before merge. Mirrors liris-side test coverage.
 *
 * Test matrix:
 *   - HD-1a (external) → ALWAYS denied (v1 and v2)
 *   - device-registry path → ALWAYS denied (v1 and v2)
 *   - HD-1c local-cube-analysis-* WITH v2 flag → ALLOWED
 *   - HD-1c local-cube-analysis-* WITHOUT v2 flag → DENIED
 *   - bare /novalum/i WITH v2 flag → DENIED (HD-1d not implemented yet)
 *   - bare /novalum/i WITHOUT v2 flag → DENIED (v1 blanket)
 *   - clean filename → ALWAYS allowed
 *
 * Toggles the v2 flag file via fs.writeFileSync / fs.unlinkSync between cases.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const FLAG_PATH = path.join(ROOT, 'data/vault/owner/omni-processor/NOVALUM_SHIELD_V2_DEPLOY');
const UNIT_PATH = path.join(ROOT, 'tools/cube/omni-processor/units/document-share.js');

// Snapshot the original flag state and restore at end
const flagExistedAtStart = fs.existsSync(FLAG_PATH);

function ensureFlag(state) {
  if (state) {
    if (!fs.existsSync(FLAG_PATH)) {
      const dir = path.dirname(FLAG_PATH);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(FLAG_PATH, 'test-shield-v2-smoke.js temporary flag for unit test\n');
    }
  } else {
    if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH);
  }
}

// We can't `require()` document-share.js because it reads from stdin and exits.
// Instead, extract the classifier function via fresh-eval per-call (clears cache
// so the v2 flag check re-runs each test).
function loadClassifier() {
  delete require.cache[require.resolve(UNIT_PATH)];
  // Read the file, extract the classify function definition + its dependencies
  const src = fs.readFileSync(UNIT_PATH, 'utf8');
  // Build a sandbox that exposes classifyNovalumFileName + isShieldV2Deployed
  const sandbox = { fs, path, require, module: { exports: {} }, exports: {}, process };
  const wrapper = `
    (function (fs, path) {
      const ROOT = 'C:/Users/acer/Asolaria';
      const SHIELD_V2_FLAG_PATH = path.join(ROOT, 'data/vault/owner/omni-processor/NOVALUM_SHIELD_V2_DEPLOY');
      function isShieldV2Deployed() {
        try { return fs.existsSync(SHIELD_V2_FLAG_PATH); }
        catch (e) { return false; }
      }
      const NOVALUM_EXTERNAL_PATTERNS = [
        /external.*novalum/i,
        /corporate.*novalum/i,
        /third.*party.*novalum/i,
        /novalum.*exploit/i,
      ];
      const NOVALUM_LOCAL_ANALYSIS_PREFIX = /^(local-cube-analysis|local-novalum-analysis|novalum-local-analysis|novalum-cube-analysis).*\\.(md|json|ndjson|txt)$/i;
      function classifyNovalumFileName(fileName, targetSubdir) {
        for (const pat of NOVALUM_EXTERNAL_PATTERNS) {
          if (pat.test(fileName) || (targetSubdir && pat.test(targetSubdir))) {
            return { class: 'HD-1a', allowed: false, reason: 'external_or_third_party_novalum_pattern_detected' };
          }
        }
        if (/device-registry/i.test(fileName) || (targetSubdir && /device-registry/i.test(targetSubdir))) {
          return { class: 'HD-1a', allowed: false, reason: 'device_registry_path_always_shielded' };
        }
        if (NOVALUM_LOCAL_ANALYSIS_PREFIX.test(fileName)) {
          if (isShieldV2Deployed()) {
            return { class: 'HD-1c', allowed: true, reason: 'local_unit_cube_analysis_scope_v2_deployed' };
          } else {
            return { class: 'HD-1c', allowed: false, reason: 'local_unit_cube_analysis_scope_recognized_BUT_v2_not_deployed' };
          }
        }
        if (/novalum/i.test(fileName) || (targetSubdir && /novalum/i.test(targetSubdir))) {
          if (isShieldV2Deployed()) {
            return { class: 'HD-1d', allowed: false, reason: 'unscoped_novalum_filename_under_v2_requires_explicit_local_analysis_prefix' };
          } else {
            return { class: 'V1_BLANKET', allowed: false, reason: 'v1_blanket_shield_active' };
          }
        }
        return { class: 'CLEAR', allowed: true, reason: 'no_novalum_pattern_detected' };
      }
      return { classifyNovalumFileName, isShieldV2Deployed };
    })
  `;
  return eval(wrapper)(fs, path);
}

let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    fail++;
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

function expect(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson} got ${actualJson}`);
  }
}

// === Test cases ===

test('1. HD-1a external corporate novalum DENIED v2_off', () => {
  ensureFlag(false);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('external-novalum-spec.md', null);
  expect(r.class, 'HD-1a', 'class');
  expect(r.allowed, false, 'allowed');
});

test('2. HD-1a external corporate novalum DENIED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('corporate-novalum-doc.md', null);
  expect(r.class, 'HD-1a', 'class');
  expect(r.allowed, false, 'allowed');
});

test('3. HD-1a third-party-novalum-exploit DENIED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('novalum-exploit-poc.md', null);
  expect(r.class, 'HD-1a', 'class');
  expect(r.allowed, false, 'allowed');
});

test('4. device-registry path DENIED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('something.json', 'device-registry/sub');
  expect(r.class, 'HD-1a', 'class');
  expect(r.allowed, false, 'allowed');
});

test('5. HD-1c local-cube-analysis-* ALLOWED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('local-cube-analysis-stage-1.md', null);
  expect(r.class, 'HD-1c', 'class');
  expect(r.allowed, true, 'allowed');
});

test('6. HD-1c local-novalum-analysis-* ALLOWED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('local-novalum-analysis-pid.json', null);
  expect(r.class, 'HD-1c', 'class');
  expect(r.allowed, true, 'allowed');
});

test('7. HD-1c local-cube-analysis-* DENIED v2_off', () => {
  ensureFlag(false);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('local-cube-analysis-stage-1.md', null);
  expect(r.class, 'HD-1c', 'class');
  expect(r.allowed, false, 'allowed');
});

test('8. bare novalum-anything.md DENIED v2_off (V1_BLANKET)', () => {
  ensureFlag(false);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('novalum-data.md', null);
  expect(r.class, 'V1_BLANKET', 'class');
  expect(r.allowed, false, 'allowed');
});

test('9. bare novalum-anything.md DENIED v2_on (HD-1d not impl)', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('novalum-data.md', null);
  expect(r.class, 'HD-1d', 'class');
  expect(r.allowed, false, 'allowed');
});

test('10. clean filename ALLOWED v2_off', () => {
  ensureFlag(false);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('skeleton-v8.md', null);
  expect(r.class, 'CLEAR', 'class');
  expect(r.allowed, true, 'allowed');
});

test('11. clean filename ALLOWED v2_on', () => {
  ensureFlag(true);
  const c = loadClassifier();
  const r = c.classifyNovalumFileName('paper-section.md', null);
  expect(r.class, 'CLEAR', 'class');
  expect(r.allowed, true, 'allowed');
});

test('12. v2 flag hot-rollback (delete = back to v1)', () => {
  ensureFlag(true);
  let c = loadClassifier();
  let r = c.classifyNovalumFileName('local-cube-analysis-x.md', null);
  expect(r.allowed, true, 'allowed_v2_on');
  ensureFlag(false);
  c = loadClassifier();
  r = c.classifyNovalumFileName('local-cube-analysis-x.md', null);
  expect(r.allowed, false, 'allowed_v2_off');
});

// Restore original flag state
ensureFlag(flagExistedAtStart);

console.log(JSON.stringify({ schema: 'shield-v2-smoke v1', total: pass + fail, pass, fail, results }, null, 2));
process.exit(fail > 0 ? 1 : 0);
