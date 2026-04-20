#!/usr/bin/env node
/**
 * test-session-lock.js — unit tests for the multi-instance advisory lock
 *
 * Per Brian's QDD discipline: every code change unit-tested before merge.
 *
 * Test matrix:
 *   1. acquire from clean state (no lock) → success, action=acquired_fresh
 *   2. re-acquire same session → success, action=refreshed
 *   3. acquire different session while active → rejected_active_session
 *   4. heartbeat by holder → updated
 *   5. heartbeat by non-holder → rejected_other_session
 *   6. release by holder → released, file gone
 *   7. release by non-holder → rejected_other_session
 *   8. release when no lock → no_lock_already_released
 *   9. acquire stale lock → stole_stale
 *   10. status when no lock → absent
 *   11. status when active → active
 *   12. status when stale → stale
 *   13. corrupt lock file → recoverable
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lock = require('./session-lock');

let pass = 0, fail = 0;
const results = [];

function test(name, fn) {
  try {
    // Clean state before each test
    if (fs.existsSync(lock.LOCK_PATH)) fs.unlinkSync(lock.LOCK_PATH);
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

// === Test cases ===

test('1. acquire from clean state', () => {
  const r = lock.acquire('test-session-001');
  expect(r.ok, true, 'ok');
  expect(r.action, 'acquired_fresh', 'action');
  expectTruthy(fs.existsSync(lock.LOCK_PATH), 'lock_file_exists');
});

test('2. re-acquire same session refreshes', () => {
  lock.acquire('test-session-002');
  const r = lock.acquire('test-session-002');
  expect(r.ok, true, 'ok');
  expect(r.action, 'refreshed', 'action');
});

test('3. acquire different session while active rejected', () => {
  lock.acquire('test-session-003a');
  const r = lock.acquire('test-session-003b');
  expect(r.ok, false, 'ok');
  expect(r.action, 'rejected_active_session', 'action');
});

test('4. heartbeat by holder updates', () => {
  lock.acquire('test-session-004');
  const before = lock.readLock().last_heartbeat_ts;
  // small wait then heartbeat
  const wait_until = Date.now() + 10;
  while (Date.now() < wait_until) {}
  const r = lock.heartbeat('test-session-004');
  expect(r.ok, true, 'ok');
  expect(r.action, 'heartbeat_updated', 'action');
  const after = lock.readLock().last_heartbeat_ts;
  if (after === before) throw new Error('heartbeat ts did not advance');
});

test('5. heartbeat by non-holder rejected', () => {
  lock.acquire('test-session-005a');
  const r = lock.heartbeat('test-session-005b');
  expect(r.ok, false, 'ok');
  expect(r.action, 'rejected_other_session', 'action');
});

test('6. release by holder', () => {
  lock.acquire('test-session-006');
  const r = lock.release('test-session-006');
  expect(r.ok, true, 'ok');
  expect(r.action, 'released', 'action');
  if (fs.existsSync(lock.LOCK_PATH)) throw new Error('lock_file_should_be_gone');
});

test('7. release by non-holder rejected', () => {
  lock.acquire('test-session-007a');
  const r = lock.release('test-session-007b');
  expect(r.ok, false, 'ok');
  expect(r.action, 'rejected_other_session', 'action');
});

test('8. release when no lock', () => {
  const r = lock.release('test-session-008');
  expect(r.ok, true, 'ok');
  expect(r.action, 'no_lock_already_released', 'action');
});

test('9. acquire stale lock steals', () => {
  // Write a stale lock manually
  lock.writeLock({
    session_id: 'stale-session',
    host: 'somehost',
    pid: 99999,
    started_at: '2026-04-06T00:00:00Z',
    last_heartbeat_ts: '2026-04-06T00:00:00Z'
  });
  const r = lock.acquire('test-session-009');
  expect(r.ok, true, 'ok');
  expect(r.action, 'stole_stale', 'action');
  const newLock = lock.readLock();
  expect(newLock.session_id, 'test-session-009', 'session_id');
  expectTruthy(newLock.stale_steal, 'stale_steal_recorded');
});

test('10. status when no lock', () => {
  const r = lock.status();
  expect(r.ok, true, 'ok');
  expect(r.lock_state, 'absent', 'lock_state');
});

test('11. status when active', () => {
  lock.acquire('test-session-011');
  const r = lock.status();
  expect(r.ok, true, 'ok');
  expect(r.lock_state, 'active', 'lock_state');
});

test('12. status when stale', () => {
  lock.writeLock({
    session_id: 'stale-12',
    host: 'h',
    pid: 1,
    started_at: '2026-04-06T00:00:00Z',
    last_heartbeat_ts: '2026-04-06T00:00:00Z'
  });
  const r = lock.status();
  expect(r.ok, true, 'ok');
  expect(r.lock_state, 'stale', 'lock_state');
});

test('13. corrupt lock file recoverable', () => {
  fs.mkdirSync(path.dirname(lock.LOCK_PATH), { recursive: true });
  fs.writeFileSync(lock.LOCK_PATH, 'this is not json {{{');
  const r = lock.status();
  expect(r.ok, false, 'ok');
  expect(r.lock_state, 'corrupt', 'lock_state');
  // release should remove the corrupt file
  const rel = lock.release('any-session');
  expect(rel.ok, true, 'release_ok');
  expect(rel.action, 'corrupt_lock_removed', 'release_action');
  if (fs.existsSync(lock.LOCK_PATH)) throw new Error('corrupt_lock_should_be_removed');
});

// Cleanup
if (fs.existsSync(lock.LOCK_PATH)) fs.unlinkSync(lock.LOCK_PATH);

console.log(JSON.stringify({ schema: 'session-lock-smoke v1', total: pass + fail, pass, fail, results }, null, 2));
process.exit(fail > 0 ? 1 : 0);
