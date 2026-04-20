#!/usr/bin/env node
// 4-worker symmetric test: starts 4 MOCKED workers, fires 10 POSTs each = 40 POSTs total.
// Asserts all 40 succeed. This is the test that'll run for real once Liris's
// spawn-pool.ts bundle is pushed and opencode binaries are installed on both sides.
//
// Run mocked now: node scripts/4-worker-symmetric-test.mjs
// Run real later: SYMMETRIC_REAL=1 OPENCODE_BIN=C:\path\to\oc node scripts/4-worker-symmetric-test.mjs

import { EventEmitter } from 'node:events';
import { SpawnPool } from '../src/spawn-pool.mjs';
import { buildWorkerList } from '../src/model-catalog.mjs';

const REAL = !!process.env.SYMMETRIC_REAL;

function makeFakeChild(pid) {
  const ee = new EventEmitter();
  ee.pid = pid;
  ee.killed = false;
  ee.kill = () => { ee.killed = true; };
  return ee;
}

function mockSpawnCross() {
  let pid = 20000;
  return (_path, _args, _opts) => makeFakeChild(pid++);
}

function mockFetchPort(port) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    return {
      status: 200,
      ok: true,
      json: async () => ({
        ok: true,
        echoed_message: body.message,
        session_id: body.session_id,
        model: body.model,
        port,
      }),
    };
  };
}

// If REAL, use native fetch + real spawnCross from the package (loaded lazily
// inside SpawnPool). Otherwise inject mocks for both.
const env = { ...process.env, OPENCODE_BIN: process.env.OPENCODE_BIN || 'C:/opencode' };
const workers = buildWorkerList(env);

// Per-worker fetch lookup by port (mocked).
const fetchByPort = new Map();
for (const w of workers) fetchByPort.set(w.port, mockFetchPort(w.port));

let fetchImpl;
let spawnCrossImpl;
if (REAL) {
  fetchImpl = globalThis.fetch;
  spawnCrossImpl = null; // use real one from resolver
} else {
  fetchImpl = async (url, opts) => {
    // url is http://127.0.0.1:<port>/v1/runs
    const m = url.match(/:(\d+)\//);
    const port = m ? Number(m[1]) : 0;
    const f = fetchByPort.get(port);
    if (!f) throw new Error(`no mock for port ${port}`);
    return f(url, opts);
  };
  spawnCrossImpl = mockSpawnCross();
}

const pool = new SpawnPool({
  workers,
  maxRestarts: 3,
  baseBackoffMs: 100,
  spawnCross: spawnCrossImpl,
  fetch: fetchImpl,
});

console.log('=== 4-worker symmetric test ===');
console.log(`  mode: ${REAL ? 'REAL' : 'MOCKED'}`);
console.log(`  workers: ${workers.map((w) => `${w.name}@${w.port}`).join(', ')}`);

const startMap = await pool.start();
console.log(`  spawned: ${startMap.size}`);

const POSTS_PER_WORKER = 10;
const results = [];
const errors = [];
const t0 = Date.now();

for (const w of workers) {
  for (let i = 0; i < POSTS_PER_WORKER; i++) {
    const sessionId = `symmetric-${w.name}-${i}`;
    const message = `ping ${i} to ${w.name}`;
    try {
      const r = await pool.postRun(w.name, message, sessionId, w.model);
      results.push({
        worker: w.name,
        port: w.port,
        session: sessionId,
        ok: !!(r && (r.ok === true || r.echoed_message || r.parsed)),
        model: w.model,
      });
    } catch (err) {
      errors.push({ worker: w.name, session: sessionId, err: err.message });
    }
  }
}

const elapsed = Date.now() - t0;

// Assertions.
let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

assert(results.length === 40, `40 results recorded (got ${results.length})`);
assert(errors.length === 0, `0 errors (got ${errors.length})`);
assert(results.every((r) => r.ok), 'all 40 postRuns ok');

const perWorker = new Map();
for (const r of results) perWorker.set(r.worker, (perWorker.get(r.worker) || 0) + 1);
for (const w of workers) {
  assert(perWorker.get(w.name) === 10, `${w.name} got exactly 10 POSTs`);
}

const snap = pool.snapshot();
assert(snap.length === 4, 'snapshot has 4 workers');
assert(snap.every((s) => s.state === 'running'), 'all workers still running');
assert(snap.every((s) => s.restarts === 0), 'no restarts during test');

console.log('--------------------------------');
console.log(`  posts:     40`);
console.log(`  successes: ${results.filter((r) => r.ok).length}`);
console.log(`  errors:    ${errors.length}`);
console.log(`  elapsed:   ${elapsed}ms`);
console.log(`  ${pass} passed, ${fail} failed`);

await pool.stop();

if (fail > 0) {
  if (errors.length) {
    console.error('ERRORS:');
    for (const e of errors) console.error(`  ${e.worker} ${e.session} :: ${e.err}`);
  }
  process.exit(1);
}
console.log('OK · 40/40 POSTs succeeded · 4 workers symmetric.');
process.exit(0);
