// @asolaria/omnispindle-spawn-acer
//
// ACER-side scaffold of Liris's omnispindle-spawn. This is a SCAFFOLD that
// stands in for her spawn-pool.ts bundle until she pushes it — at which point
// her implementation gets absorbed into THIS file (symmetric Windows patch).
//
// The scaffold is deliberately wire-compatible with what Liris's bundle will
// need: same public API, same worker templates, same /v1/runs POST shape.
// Once her bundle lands:
//   1. Replace this file with her code
//   2. Retarget spawn() calls through resolveSpawnCommand/spawnCross (Windows fix)
//   3. Run the 4-worker-symmetric-test.mjs against real opencode binaries
//
// Until then: tests mock spawnCross so we can validate the shell.
//
// Cross-platform-spawn import:
//   prefer the workspace package. If that fails at resolve-time, fall back
//   to the relative path. We keep the import lazy so tests that inject a
//   mock spawnCross don't need @asolaria/cross-platform-spawn resolvable
//   on the module graph.
//
// Public API (stable; Liris mirrors this):
//   class SpawnPool {
//     constructor({ workers, maxRestarts=3, baseBackoffMs=500, spawnCross=null, fetch=null, logger=console })
//     start()                                         → Map<name, {pid, port, startedAt}>
//     postRun(workerName, message, sessionId, model)  → Promise<stream|object>
//     snapshot()                                      → [{name, port, pid, state, restarts, lastExit, lastError, startedAt}]
//     stop()                                          → Promise<{stopped: number}>
//   }
//
// Worker lifecycle:
//   created → spawning → running → exited → [restarting | halted]
//   maxRestarts caps the restart count. Exponential backoff between restarts.

let _spawnCrossCache = null;

async function _loadSpawnCross() {
  if (_spawnCrossCache) return _spawnCrossCache;
  // Try the named workspace package first.
  try {
    const mod = await import('@asolaria/cross-platform-spawn');
    _spawnCrossCache = mod;
    return mod;
  } catch (_err) {
    // Fall back to relative path from this file:
    //   packages/omnispindle-spawn-acer/src/ -> ../../cross-platform-spawn/src/index.mjs
    const mod = await import('../../cross-platform-spawn/src/index.mjs');
    _spawnCrossCache = mod;
    return mod;
  }
}

export const WORKER_STATE = Object.freeze({
  CREATED: 'created',
  SPAWNING: 'spawning',
  RUNNING: 'running',
  EXITED: 'exited',
  RESTARTING: 'restarting',
  HALTED: 'halted',
  STOPPED: 'stopped',
});

export class SpawnPool {
  constructor({
    workers,
    maxRestarts = 3,
    baseBackoffMs = 500,
    spawnCross = null,
    fetch: fetchImpl = null,
    logger = console,
  } = {}) {
    if (!Array.isArray(workers) || workers.length === 0) {
      throw new Error('SpawnPool: workers[] is required and non-empty');
    }
    const seen = new Set();
    for (const w of workers) {
      if (!w || typeof w !== 'object') {
        throw new Error('SpawnPool: each worker must be an object');
      }
      if (!w.name || typeof w.name !== 'string') {
        throw new Error('SpawnPool: worker.name required');
      }
      if (seen.has(w.name)) {
        throw new Error(`SpawnPool: duplicate worker name "${w.name}"`);
      }
      seen.add(w.name);
      if (!w.path || typeof w.path !== 'string') {
        throw new Error(`SpawnPool: worker "${w.name}" missing path`);
      }
      if (!Array.isArray(w.args)) {
        throw new Error(`SpawnPool: worker "${w.name}" args must be array`);
      }
      if (!Number.isInteger(w.port) || w.port <= 0 || w.port > 65535) {
        throw new Error(`SpawnPool: worker "${w.name}" port invalid`);
      }
    }

    this.workers = workers.map((w) => ({ ...w }));
    this.maxRestarts = maxRestarts;
    this.baseBackoffMs = baseBackoffMs;
    this.logger = logger;
    this._fetch = fetchImpl; // lazy default at call time
    this._spawnCrossOverride = spawnCross;

    this._children = new Map(); // name -> { child, state, restarts, lastExit, lastError, startedAt, pid, port }
    for (const w of this.workers) {
      this._children.set(w.name, {
        name: w.name,
        port: w.port,
        path: w.path,
        args: w.args,
        env: w.env || null,
        cwd: w.cwd || null,
        pid: null,
        state: WORKER_STATE.CREATED,
        restarts: 0,
        lastExit: null,
        lastError: null,
        startedAt: null,
        child: null,
        _restartTimer: null,
      });
    }
    this._started = false;
    this._stopping = false;
  }

  async _resolveSpawnCross() {
    if (this._spawnCrossOverride) return this._spawnCrossOverride;
    const mod = await _loadSpawnCross();
    return mod.spawnCross;
  }

  async _spawnOne(name) {
    if (this._stopping) return;
    const rec = this._children.get(name);
    if (!rec) throw new Error(`SpawnPool: no such worker "${name}"`);
    rec.state = WORKER_STATE.SPAWNING;
    const spawnCross = await this._resolveSpawnCross();
    const opts = {};
    if (rec.cwd) opts.cwd = rec.cwd;
    if (rec.env) opts.env = { ...process.env, ...rec.env };
    let child;
    try {
      child = spawnCross(rec.path, rec.args, opts);
    } catch (err) {
      rec.state = WORKER_STATE.EXITED;
      rec.lastError = err && err.message ? err.message : String(err);
      this._scheduleRestart(name);
      return;
    }
    rec.child = child;
    rec.pid = (child && child.pid) || null;
    rec.startedAt = new Date().toISOString();
    rec.state = WORKER_STATE.RUNNING;

    if (child && typeof child.on === 'function') {
      child.on('exit', (code, signal) => {
        rec.state = WORKER_STATE.EXITED;
        rec.lastExit = { code, signal, at: new Date().toISOString() };
        rec.child = null;
        rec.pid = null;
        if (!this._stopping) this._scheduleRestart(name);
      });
      child.on('error', (err) => {
        rec.lastError = err && err.message ? err.message : String(err);
      });
    }
  }

  _scheduleRestart(name) {
    if (this._stopping) return;
    const rec = this._children.get(name);
    if (!rec) return;
    if (rec.restarts >= this.maxRestarts) {
      rec.state = WORKER_STATE.HALTED;
      if (this.logger && this.logger.warn) {
        this.logger.warn(`SpawnPool: worker "${name}" halted after ${rec.restarts} restarts`);
      }
      return;
    }
    rec.state = WORKER_STATE.RESTARTING;
    const delay = this.baseBackoffMs * Math.pow(2, rec.restarts);
    rec.restarts += 1;
    rec._restartTimer = setTimeout(() => {
      rec._restartTimer = null;
      // Fire-and-forget; errors are captured into rec.
      this._spawnOne(name).catch((err) => {
        rec.lastError = err && err.message ? err.message : String(err);
      });
    }, delay);
    // Don't hold the event loop open just for the restart timer in tests.
    if (rec._restartTimer && typeof rec._restartTimer.unref === 'function') {
      rec._restartTimer.unref();
    }
  }

  async start() {
    if (this._started) throw new Error('SpawnPool: already started');
    this._started = true;
    const results = new Map();
    for (const w of this.workers) {
      await this._spawnOne(w.name);
      const rec = this._children.get(w.name);
      results.set(w.name, {
        pid: rec.pid,
        port: rec.port,
        startedAt: rec.startedAt,
        state: rec.state,
      });
    }
    return results;
  }

  async postRun(workerName, message, sessionId, model) {
    const rec = this._children.get(workerName);
    if (!rec) throw new Error(`SpawnPool: unknown worker "${workerName}"`);
    const url = `http://127.0.0.1:${rec.port}/v1/runs`;
    const body = JSON.stringify({ message, session_id: sessionId, model });
    const f = this._fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) {
      throw new Error('SpawnPool: no fetch implementation available');
    }
    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res) throw new Error('SpawnPool: fetch returned empty response');
    if (res.body && typeof res.body.getReader === 'function') {
      // Stream — return as-is, caller consumes.
      return res.body;
    }
    if (typeof res.json === 'function') {
      return await res.json();
    }
    return res;
  }

  snapshot() {
    const out = [];
    for (const rec of this._children.values()) {
      out.push({
        name: rec.name,
        port: rec.port,
        pid: rec.pid,
        state: rec.state,
        restarts: rec.restarts,
        lastExit: rec.lastExit,
        lastError: rec.lastError,
        startedAt: rec.startedAt,
      });
    }
    return out;
  }

  async stop() {
    this._stopping = true;
    let stopped = 0;
    for (const rec of this._children.values()) {
      if (rec._restartTimer) {
        clearTimeout(rec._restartTimer);
        rec._restartTimer = null;
      }
      if (rec.child && typeof rec.child.kill === 'function') {
        try {
          rec.child.kill('SIGTERM');
          stopped += 1;
        } catch (_err) {
          // ignore — child may have already exited
        }
      }
      rec.state = WORKER_STATE.STOPPED;
    }
    return { stopped };
  }
}

export default SpawnPool;
