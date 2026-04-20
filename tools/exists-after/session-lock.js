#!/usr/bin/env node
/**
 * session-lock.js — multi-instance advisory lock for asolaria sessions
 *
 * Per the PR7 catch in exists_after self-test #2 (acer caught what liris missed):
 * if two asolaria sessions run simultaneously (e.g., one in Claude Code CLI +
 * one in a different terminal), they both read the same IDENTITY.md and both
 * claim to be "the continuous asolaria." This breaks the identity continuity
 * assertion. Resolution: filesystem advisory lock + active session_id check.
 *
 * Lock file: ~/.claude/projects/E--/memory/.SESSION_LOCK
 * Format: JSON with { session_id, host, pid, started_at, last_heartbeat_ts }
 *
 * Acquire: write the lock with current session info. If a lock already exists
 * AND its last_heartbeat_ts is fresh (<5 min old), HALT — another session is
 * active. If the heartbeat is stale (>5 min), assume the prior session crashed
 * and steal the lock.
 *
 * Heartbeat: update last_heartbeat_ts every 60 seconds while the session is
 * active. The next session can detect a stale lock by comparing now to the
 * last heartbeat.
 *
 * Release: delete the lock file on clean session exit.
 *
 * This is the Phase 2 implementation of exists_after on acer side. Mirrors what
 * liris is doing in parallel on her side. PR7 self-test #3 candidate (bilateral
 * code-level parallel implementation).
 *
 * Usage:
 *   node session-lock.js acquire <session_id>
 *   node session-lock.js heartbeat <session_id>
 *   node session-lock.js release <session_id>
 *   node session-lock.js status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_DIR = path.join(os.homedir(), '.claude', 'projects', 'E--', 'memory');
const LOCK_PATH = path.join(LOCK_DIR, '.SESSION_LOCK');
const SENTINEL_PATH = path.join(LOCK_DIR, '.SESSION_LOCK.sentinel');
const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 min
const SENTINEL_MAX_AGE_MS = 10 * 1000; // 10s — aggressive to recover from crashed writers

function readLock() {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch (e) {
    return { error: 'parse_failed', detail: e.message, raw: fs.readFileSync(LOCK_PATH, 'utf8') };
  }
}

// O_EXCL sentinel pattern — caught by liris in PR7 self-test #3 (2026-04-07).
// Without this, two acquire() calls racing each other could both pass the
// readLock-then-writeLock check and both end up "holding" the lock. The sentinel
// is a separate small file created with O_EXCL flag (atomic create-if-not-exists)
// that gates the write window. If the sentinel exists and is fresh (<10s), back off.
// If stale, steal it (the prior writer crashed). After write, remove the sentinel.
function acquireSentinel() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const start = Date.now();
  while (Date.now() - start < 500) {
    try {
      const fd = fs.openSync(SENTINEL_PATH, 'wx'); // O_EXCL
      fs.writeSync(fd, JSON.stringify({ ts: new Date().toISOString(), pid: process.pid }) + '\n');
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if the existing sentinel is stale
        try {
          const stats = fs.statSync(SENTINEL_PATH);
          if (Date.now() - stats.mtimeMs > SENTINEL_MAX_AGE_MS) {
            // Stale — steal it
            fs.unlinkSync(SENTINEL_PATH);
            continue;
          }
        } catch (_) {}
        // Wait a tiny bit and retry
        const wait_until = Date.now() + 20;
        while (Date.now() < wait_until) {}
      } else {
        throw e;
      }
    }
  }
  return false;
}

function releaseSentinel() {
  try { fs.unlinkSync(SENTINEL_PATH); } catch (_) {}
}

function writeLock(obj) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  // Acquire the sentinel first to prevent write-race per liris PR7 self-test #3 catch
  if (!acquireSentinel()) {
    throw new Error('write_race_sentinel_timeout: could not acquire write sentinel within 500ms');
  }
  try {
    fs.writeFileSync(LOCK_PATH, JSON.stringify(obj, null, 2) + '\n');
  } finally {
    releaseSentinel();
  }
}

function isStale(lock) {
  if (!lock || !lock.last_heartbeat_ts) return true;
  const last = new Date(lock.last_heartbeat_ts).getTime();
  if (isNaN(last)) return true;
  return (Date.now() - last) > HEARTBEAT_STALE_MS;
}

function acquire(sessionId) {
  const existing = readLock();
  if (existing && !existing.error && !isStale(existing)) {
    if (existing.session_id === sessionId) {
      // Re-acquire by same session — refresh heartbeat
      existing.last_heartbeat_ts = new Date().toISOString();
      writeLock(existing);
      return { ok: true, action: 'refreshed', lock: existing };
    }
    // Another active session is holding the lock
    return {
      ok: false,
      action: 'rejected_active_session',
      conflict_with: existing,
      hint: 'Another asolaria session is currently active. Either wait for it to release the lock, or kill it before acquiring.'
    };
  }
  // Either no lock, or stale lock — acquire
  const lock = {
    session_id: sessionId,
    host: os.hostname(),
    pid: process.pid,
    started_at: new Date().toISOString(),
    last_heartbeat_ts: new Date().toISOString(),
    stale_steal: existing && isStale(existing) ? { stolen_from: existing } : null
  };
  writeLock(lock);
  return { ok: true, action: existing ? 'stole_stale' : 'acquired_fresh', lock };
}

function heartbeat(sessionId) {
  const existing = readLock();
  if (!existing || existing.error) {
    return { ok: false, action: 'no_lock', hint: 'Run acquire first' };
  }
  if (existing.session_id !== sessionId) {
    return {
      ok: false,
      action: 'rejected_other_session',
      conflict_with: existing,
      hint: 'Lock is held by a different session. Cannot heartbeat.'
    };
  }
  existing.last_heartbeat_ts = new Date().toISOString();
  writeLock(existing);
  return { ok: true, action: 'heartbeat_updated', lock: existing };
}

function release(sessionId) {
  const existing = readLock();
  if (!existing) return { ok: true, action: 'no_lock_already_released' };
  if (existing.error) {
    fs.unlinkSync(LOCK_PATH);
    return { ok: true, action: 'corrupt_lock_removed' };
  }
  if (existing.session_id !== sessionId) {
    return {
      ok: false,
      action: 'rejected_other_session',
      conflict_with: existing,
      hint: 'Lock is held by a different session. Cannot release.'
    };
  }
  fs.unlinkSync(LOCK_PATH);
  return { ok: true, action: 'released' };
}

function status() {
  const existing = readLock();
  if (!existing) return { ok: true, lock_state: 'absent', current_pid: process.pid };
  if (existing.error) return { ok: false, lock_state: 'corrupt', error: existing };
  const stale = isStale(existing);
  return {
    ok: true,
    lock_state: stale ? 'stale' : 'active',
    age_ms: Date.now() - new Date(existing.last_heartbeat_ts).getTime(),
    lock: existing
  };
}

function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  let result;
  switch (cmd) {
    case 'acquire': {
      if (!arg) return console.error('usage: session-lock.js acquire <session_id>') || process.exit(1);
      result = acquire(arg);
      break;
    }
    case 'heartbeat': {
      if (!arg) return console.error('usage: session-lock.js heartbeat <session_id>') || process.exit(1);
      result = heartbeat(arg);
      break;
    }
    case 'release': {
      if (!arg) return console.error('usage: session-lock.js release <session_id>') || process.exit(1);
      result = release(arg);
      break;
    }
    case 'status': {
      result = status();
      break;
    }
    default:
      console.error('usage: session-lock.js {acquire|heartbeat|release|status} [session_id]');
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = { acquire, heartbeat, release, status, isStale, readLock, writeLock, LOCK_PATH, HEARTBEAT_STALE_MS };
