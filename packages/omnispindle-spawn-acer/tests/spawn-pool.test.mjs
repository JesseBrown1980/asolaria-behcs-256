#!/usr/bin/env node
// SpawnPool construction + snapshot + postRun test — mocks spawnCross + fetch.
// Plain node. Exits non-zero on any failure.

import { EventEmitter } from 'node:events';
import { SpawnPool, WORKER_STATE } from '../src/spawn-pool.mjs';
import {
  WORKER_TEMPLATES,
  resolveTemplate,
  buildWorkerList,
  OPENCODE_BIN_PLACEHOLDER,
} from '../src/model-catalog.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

// Fake child process — EventEmitter with pid + kill().
function makeFakeChild(pid) {
  const ee = new EventEmitter();
  ee.pid = pid;
  ee.killed = false;
  ee.kill = (_sig) => {
    ee.killed = true;
    return true;
  };
  return ee;
}

// Factory returning (spawnCross mock, call log).
function makeSpawnCrossMock({ failOnce = null, nextPidStart = 1000 } = {}) {
  const calls = [];
  let pid = nextPidStart;
  const state = { failOnce };
  const spawnCross = (path, args, opts) => {
    calls.push({ path, args: [...args], opts: { ...(opts || {}) } });
    if (state.failOnce) {
      state.failOnce = null;
      throw new Error('mock-spawn-fail');
    }
    const child = makeFakeChild(pid++);
    return child;
  };
  return { spawnCross, calls, state };
}

function makeFetchMock() {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
    return {
      status: 200,
      ok: true,
      json: async () => ({ url, parsed: JSON.parse(opts.body) }),
    };
  };
  return { fetch: fetchImpl, calls };
}

console.log('=== @asolaria/omnispindle-spawn-acer tests ===');
console.log('-----------------------------------------------');

// -- Block A: model-catalog ----------------------------------
console.log('\n-- model-catalog --');
ok(Array.isArray(WORKER_TEMPLATES) && WORKER_TEMPLATES.length === 4, 'A1 · 4 worker templates');
ok(
  WORKER_TEMPLATES.map((w) => w.name).join(',') ===
    'big-pickle,gpt-5-nano,minimax-m2.5,nemotron-3-super',
  'A2 · template names in canonical order',
);
ok(
  new Set(WORKER_TEMPLATES.map((w) => w.port)).size === 4,
  'A3 · 4 distinct ports',
);
ok(
  WORKER_TEMPLATES.every((w) => w.path.includes('${OPENCODE_BIN}')),
  'A4 · every template references ${OPENCODE_BIN}',
);
const tmplResolved = resolveTemplate(WORKER_TEMPLATES[0], { OPENCODE_BIN: 'C:\\oc' });
ok(tmplResolved.path === 'C:\\oc/opencode.cmd', 'A5 · resolveTemplate substitutes OPENCODE_BIN');
const tmplUnset = resolveTemplate(WORKER_TEMPLATES[0], {});
ok(
  tmplUnset.path.includes(OPENCODE_BIN_PLACEHOLDER),
  'A6 · resolveTemplate keeps placeholder when env unset',
);
const workers = buildWorkerList({ OPENCODE_BIN: 'C:\\oc' });
ok(workers.length === 4 && workers.every((w) => !w.path.includes('${OPENCODE_BIN}')), 'A7 · buildWorkerList resolves all 4');

// -- Block B: SpawnPool construction validation --------------
console.log('\n-- construction validation --');
let threw;
threw = false;
try { new SpawnPool({ workers: [] }); } catch (_e) { threw = true; }
ok(threw, 'B1 · empty workers[] rejected');

threw = false;
try { new SpawnPool({}); } catch (_e) { threw = true; }
ok(threw, 'B2 · missing workers[] rejected');

threw = false;
try {
  new SpawnPool({
    workers: [
      { name: 'a', path: 'x', args: [], port: 1 },
      { name: 'a', path: 'y', args: [], port: 2 },
    ],
  });
} catch (_e) { threw = true; }
ok(threw, 'B3 · duplicate worker name rejected');

threw = false;
try {
  new SpawnPool({ workers: [{ name: 'a', path: 'x', args: 'not-array', port: 1 }] });
} catch (_e) { threw = true; }
ok(threw, 'B4 · non-array args rejected');

threw = false;
try {
  new SpawnPool({ workers: [{ name: 'a', path: 'x', args: [], port: 70000 }] });
} catch (_e) { threw = true; }
ok(threw, 'B5 · port out-of-range rejected');

// -- Block C: Happy-path start() + snapshot ------------------
console.log('\n-- start() + snapshot() --');
const mockA = makeSpawnCrossMock();
const mockFetchA = makeFetchMock();
const pool = new SpawnPool({
  workers,
  maxRestarts: 2,
  baseBackoffMs: 10,
  spawnCross: mockA.spawnCross,
  fetch: mockFetchA.fetch,
});
const snap0 = pool.snapshot();
ok(snap0.length === 4, 'C1 · snapshot has 4 workers pre-start');
ok(snap0.every((s) => s.state === WORKER_STATE.CREATED), 'C2 · all CREATED pre-start');
ok(snap0.every((s) => s.pid === null), 'C3 · no pids pre-start');

const startResult = await pool.start();
ok(startResult instanceof Map && startResult.size === 4, 'C4 · start() returns Map of 4');
ok(mockA.calls.length === 4, 'C5 · spawnCross called 4 times');
ok(
  mockA.calls.map((c) => c.path).every((p) => p === 'C:\\oc/opencode.cmd'),
  'C6 · all spawn paths resolved from template',
);

const snap1 = pool.snapshot();
ok(snap1.every((s) => s.state === WORKER_STATE.RUNNING), 'C7 · all RUNNING after start');
ok(snap1.every((s) => typeof s.pid === 'number' && s.pid > 0), 'C8 · all pids assigned');
ok(
  snap1.map((s) => s.port).join(',') === '4801,4802,4803,4804',
  'C9 · ports preserved in snapshot',
);
ok(
  snap1.every((s) => typeof s.startedAt === 'string' && s.startedAt.length > 0),
  'C10 · startedAt iso strings present',
);

// Double-start rejected.
threw = false;
try { await pool.start(); } catch (_e) { threw = true; }
ok(threw, 'C11 · double start() rejected');

// -- Block D: postRun() --------------------------------------
console.log('\n-- postRun() --');
const r1 = await pool.postRun('big-pickle', 'hello', 'sess-1', 'big-pickle');
ok(
  mockFetchA.calls.length === 1 && mockFetchA.calls[0].url === 'http://127.0.0.1:4801/v1/runs',
  'D1 · postRun hits /v1/runs on worker port',
);
ok(mockFetchA.calls[0].method === 'POST', 'D2 · POST method');
const parsedBody = JSON.parse(mockFetchA.calls[0].body);
ok(
  parsedBody.message === 'hello' &&
    parsedBody.session_id === 'sess-1' &&
    parsedBody.model === 'big-pickle',
  'D3 · body {message, session_id, model}',
);
ok(r1 && r1.parsed && r1.parsed.session_id === 'sess-1', 'D4 · postRun returns parsed json');

// Unknown worker.
let thrown = null;
try { await pool.postRun('no-such-worker', 'x', 's', 'm'); }
catch (e) { thrown = e; }
ok(thrown && /unknown worker/.test(thrown.message), 'D5 · postRun rejects unknown worker');

// -- Block E: Exit → restart (with backoff) ------------------
console.log('\n-- exit → restart --');
const preRestart = pool.snapshot().find((s) => s.name === 'gpt-5-nano');
ok(preRestart.restarts === 0, 'E1 · restarts=0 pre-exit');
// Find the original child and simulate exit.
const childRec = (function findChild() {
  // Snapshot doesn't expose child; reach into _children.
  return pool._children.get('gpt-5-nano');
})();
ok(childRec && childRec.child, 'E2 · gpt-5-nano has live child handle');
childRec.child.emit('exit', 1, null);
// Give scheduler a moment.
await new Promise((r) => setTimeout(r, 50));
const postRestart = pool.snapshot().find((s) => s.name === 'gpt-5-nano');
ok(
  postRestart.restarts === 1 &&
    (postRestart.state === WORKER_STATE.RUNNING || postRestart.state === WORKER_STATE.RESTARTING),
  'E3 · restart counter incremented + state cycled',
);
ok(mockA.calls.length >= 5, 'E4 · spawnCross re-invoked on restart');

// -- Block F: stop() ----------------------------------------
console.log('\n-- stop() --');
const stopResult = await pool.stop();
ok(stopResult && typeof stopResult.stopped === 'number', 'F1 · stop() returns {stopped}');
const snap2 = pool.snapshot();
ok(snap2.every((s) => s.state === WORKER_STATE.STOPPED), 'F2 · all workers STOPPED after stop()');

// -- Block G: spawnCross failure handled ---------------------
console.log('\n-- spawnCross failure path --');
const mockG = makeSpawnCrossMock({ failOnce: true });
const poolG = new SpawnPool({
  workers: [workers[0]],
  maxRestarts: 1,
  baseBackoffMs: 10,
  spawnCross: mockG.spawnCross,
});
await poolG.start();
await new Promise((r) => setTimeout(r, 50));
const snapG = poolG.snapshot()[0];
ok(
  snapG.lastError && /mock-spawn-fail/.test(snapG.lastError),
  'G1 · spawn-cross throw captured into lastError',
);
await poolG.stop();

// -- Summary --
console.log('-----------------------------------------------');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
