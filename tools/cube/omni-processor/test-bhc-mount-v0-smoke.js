#!/usr/bin/env node
/**
 * test-bhc-mount-v0-smoke.js — smoke tests for bhc-mount-v0 unit Phase 1
 *
 * Per Brian's QDD discipline.
 *
 * Tests run against TEST_CANONICAL_ROOT = D:/test-canonical-store (NOT real USB).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Override canonical root to a temp test dir
process.env.BHC_CANONICAL_ROOT = 'D:/test-canonical-store-smoke';

const unit = require('./units/bhc-mount-v0');

// Clean state
function reset() {
  if (fs.existsSync(unit.TEST_CANONICAL_ROOT)) {
    fs.rmSync(unit.TEST_CANONICAL_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(unit.TEST_CANONICAL_ROOT, { recursive: true });
}

let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  try {
    reset();
    fn();
    pass++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    fail++;
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

function expect(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

function expectTruthy(actual, label) {
  if (!actual) throw new Error(`${label}: expected truthy got ${JSON.stringify(actual)}`);
}

function shaOf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// === Tests ===

test('1. attest returns holder info + canonical PID quadruple', () => {
  const r = unit.dispatch({ verb: 'attest' });
  expect(r.ok, true, 'ok');
  expectTruthy(r.holder_attest, 'holder_attest');
  expect(r.holder_attest.canonical_pid_quadruple.mbr_signature_hex, '0xA7C09001', 'mbr_hex_corrected');
  expect(r.holder_attest.canonical_pid_quadruple.mbr_signature_decimal, 2814414849, 'mbr_decimal');
});

test('2. list empty canonical store', () => {
  const r = unit.dispatch({ verb: 'list', path: '.' });
  expect(r.ok, true, 'ok');
  expect(r.total, 0, 'total');
});

test('3. write + read round-trip', () => {
  const content = 'hello brown-hilbert cube';
  const buf = Buffer.from(content);
  const sha = shaOf(buf);
  const wr = unit.dispatch({
    verb: 'write',
    path: 'test/hello.txt',
    content_base64: buf.toString('base64'),
    sha256: sha
  });
  expect(wr.ok, true, 'write_ok');
  expect(wr.sha256, sha, 'write_sha');
  const rd = unit.dispatch({ verb: 'read', path: 'test/hello.txt' });
  expect(rd.ok, true, 'read_ok');
  expect(rd.sha256, sha, 'read_sha');
  expect(Buffer.from(rd.content_base64, 'base64').toString(), content, 'content_match');
});

test('4. hash returns sha without bytes', () => {
  const buf = Buffer.from('hash me');
  const sha = shaOf(buf);
  unit.dispatch({ verb: 'write', path: 'h.txt', content_base64: buf.toString('base64'), sha256: sha });
  const r = unit.dispatch({ verb: 'hash', paths: ['h.txt'] });
  expect(r.ok, true, 'ok');
  expect(r.hashes['h.txt'].sha256, sha, 'sha');
});

test('5. read with sha mismatch rejected', () => {
  const buf = Buffer.from('cube');
  const sha = shaOf(buf);
  unit.dispatch({ verb: 'write', path: 'cube.txt', content_base64: buf.toString('base64'), sha256: sha });
  const r = unit.dispatch({ verb: 'read', path: 'cube.txt', expected_sha256: 'wrongshaIIwrongshaIIwrongshaIIwrongshaIIwrongshaIIwrongshaIIwrong' });
  expect(r.ok, false, 'ok');
  expect(r.error, 'sha_mismatch', 'error');
});

test('6. write with sha mismatch rejected', () => {
  const buf = Buffer.from('test');
  const r = unit.dispatch({
    verb: 'write',
    path: 'wrong.txt',
    content_base64: buf.toString('base64'),
    sha256: 'definitely_not_right_sha_string_just_garbage_here'
  });
  expect(r.ok, false, 'ok');
  expect(r.error, 'sha_mismatch', 'error');
});

test('7. NOVALUM external pattern denied', () => {
  const buf = Buffer.from('x');
  const sha = shaOf(buf);
  const r = unit.dispatch({
    verb: 'write',
    path: 'external-novalum-doc.md',
    content_base64: buf.toString('base64'),
    sha256: sha
  });
  expect(r.ok, false, 'ok');
  expect(r.error, 'gate_denied', 'error');
  expect(r.gate.gate, 'HD-1a', 'gate');
});

test('8. HD-2 ext brian pattern denied', () => {
  const buf = Buffer.from('x');
  const sha = shaOf(buf);
  const r = unit.dispatch({
    verb: 'write',
    path: 'message-to-brian.md',
    content_base64: buf.toString('base64'),
    sha256: sha
  });
  expect(r.ok, false, 'ok');
  expect(r.error, 'gate_denied', 'error');
  expect(r.gate.gate, 'HD-2_ext', 'gate');
});

test('9. felipe device pattern denied', () => {
  const buf = Buffer.from('x');
  const sha = shaOf(buf);
  const r = unit.dispatch({
    verb: 'write',
    path: 'felipe-phone-data.json',
    content_base64: buf.toString('base64'),
    sha256: sha
  });
  expect(r.ok, false, 'ok');
  expect(r.error, 'gate_denied', 'error');
  expect(r.gate.gate, 'HD-felipe-rayssa', 'gate');
});

test('10. path traversal rejected', () => {
  const r = unit.dispatch({ verb: 'list', path: '../escape' });
  expect(r.ok, false, 'ok');
  expect(r.gate.gate, 'path_safety', 'gate');
});

test('11. absolute path rejected', () => {
  const r = unit.dispatch({ verb: 'read', path: '/etc/passwd' });
  expect(r.ok, false, 'ok');
});

test('12. drive letter rejected', () => {
  const r = unit.dispatch({ verb: 'read', path: 'C:/Windows/system32' });
  expect(r.ok, false, 'ok');
});

test('13. write w/o overwrite refuses on existing', () => {
  const buf = Buffer.from('first');
  const sha = shaOf(buf);
  unit.dispatch({ verb: 'write', path: 'exist.txt', content_base64: buf.toString('base64'), sha256: sha });
  const buf2 = Buffer.from('second');
  const sha2 = shaOf(buf2);
  const r = unit.dispatch({ verb: 'write', path: 'exist.txt', content_base64: buf2.toString('base64'), sha256: sha2 });
  expect(r.ok, false, 'ok');
  expect(r.error, 'file_exists', 'error');
});

test('14. write w/ overwrite succeeds + records pre_state_sha', () => {
  const buf = Buffer.from('first');
  const sha = shaOf(buf);
  unit.dispatch({ verb: 'write', path: 'exist2.txt', content_base64: buf.toString('base64'), sha256: sha });
  const buf2 = Buffer.from('second');
  const sha2 = shaOf(buf2);
  const r = unit.dispatch({ verb: 'write', path: 'exist2.txt', content_base64: buf2.toString('base64'), sha256: sha2, overwrite: true });
  expect(r.ok, true, 'ok');
  expect(r.sha256, sha2, 'new_sha');
  expect(r.pre_state_sha256, sha, 'pre_state_sha');
});

test('15. audit_chain accumulates entries', () => {
  const buf = Buffer.from('a');
  const sha = shaOf(buf);
  unit.dispatch({ verb: 'write', path: 'a.txt', content_base64: buf.toString('base64'), sha256: sha });
  unit.dispatch({ verb: 'write', path: 'b.txt', content_base64: buf.toString('base64'), sha256: sha });
  unit.dispatch({ verb: 'read', path: 'a.txt' });
  const r = unit.dispatch({ verb: 'audit_chain' });
  expect(r.ok, true, 'ok');
  expect(r.total, 3, 'total');
  expectTruthy(r.tail_sha, 'tail_sha');
});

test('16. rotate verb is Phase 1 stub', () => {
  const r = unit.dispatch({ verb: 'rotate' });
  expect(r.ok, false, 'ok');
  expect(r.error, 'rotate_phase_1_stub', 'error');
});

test('17. cosign_pending verb is Phase 1 stub', () => {
  const r = unit.dispatch({ verb: 'cosign_pending' });
  expect(r.ok, false, 'ok');
  expect(r.error, 'cosign_pending_phase_1_stub', 'error');
});

test('18. unknown verb rejected', () => {
  const r = unit.dispatch({ verb: 'fly' });
  expect(r.ok, false, 'ok');
  expect(r.error, 'unknown_verb', 'error');
});

test('19. missing verb rejected', () => {
  const r = unit.dispatch({});
  expect(r.ok, false, 'ok');
  expect(r.error, 'missing_verb', 'error');
});

test('20. canonical PID quadruple has corrected hex', () => {
  expect(unit.CANONICAL_PID_QUADRUPLE.mbr_signature_hex, '0xA7C09001', 'hex');
  expect(unit.CANONICAL_PID_QUADRUPLE.mbr_signature_decimal, 2814414849, 'decimal');
});

// Cleanup
if (fs.existsSync(unit.TEST_CANONICAL_ROOT)) {
  fs.rmSync(unit.TEST_CANONICAL_ROOT, { recursive: true, force: true });
}

console.log(JSON.stringify({ schema: 'bhc-mount-v0-smoke v1', total: pass + fail, pass, fail, results }, null, 2));
process.exit(fail > 0 ? 1 : 0);
