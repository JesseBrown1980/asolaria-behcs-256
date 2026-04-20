#!/usr/bin/env node
// Smoke test for @asolaria/gulp-http-bridge
// Exercises each endpoint's shape, error handling, and the bindLan toggle.
// Uses injected deps so we don't depend on the real runtime being present.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildHandler,
  startDaemon,
  DEFAULT_PORT,
  LEDGER_DEFAULT_TAIL,
  LEDGER_MAX_TAIL,
  PATTERN_CAP,
} from '../src/daemon.mjs';

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

function request(port, urlPath, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, method: 'GET', path: urlPath, headers: { host: '127.0.0.1' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch (_) { /* leave null */ }
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---- Fixture deps ----
const fakeStatus = {
  ok: true,
  running: true,
  state: { lastGulpSequence: 41, initialisedAt: '2026-04-19T10:00:00.000Z' },
  bufferDepth: 17,
  fileCap: { used: 123, cap: 1024 },
  latest: {
    gulpId: 'gulp-2026-04-19T120000000Z-deadbe',
    generatedAt: '2026-04-19T12:00:00.000Z',
    processedMessages: 2000,
    mistakesDetected: 3,
    reportPath: '/tmp/report.json',
  },
};

const fakePatterns = Array.from({ length: 400 }, (_, i) => ({
  id: `PAT-${String(i).padStart(4, '0')}`,
  status: 'active',
  occurrences: 400 - i,
}));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-http-bridge-'));
const ledgerPath = path.join(tmpDir, 'mistake-ledger.ndjson');
const archiveDir = path.join(tmpDir, 'archives');
fs.mkdirSync(archiveDir, { recursive: true });

const ledgerLines = Array.from({ length: 123 }, (_, i) => JSON.stringify({ i, ts: i })).join('\n') + '\n';
fs.writeFileSync(ledgerPath, ledgerLines);

const archiveGulpId = 'gulp-2026-04-19T120000000Z-deadbe';
for (const label of ['inbox', 'queue', 'gnn-edges', 'd0-log', 'message-paths']) {
  fs.writeFileSync(path.join(archiveDir, `${archiveGulpId}-${label}.ndjson`), '{}\n');
}
// Also a decoy that must not match
fs.writeFileSync(path.join(archiveDir, 'gulp-OTHER-inbox.ndjson'), '{}\n');

function deps(overrides = {}) {
  return {
    getCollectorStatus: () => fakeStatus,
    getListMistakePatterns: () => (opts) => {
      const cap = Math.max(1, Math.min(PATTERN_CAP, opts?.limit || PATTERN_CAP));
      return { ok: true, total: fakePatterns.length, patterns: fakePatterns.slice(0, cap) };
    },
    getLedgerTail: (n) => {
      const all = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
      const sliced = all.slice(-n);
      return { ok: true, path: ledgerPath, total: all.length, returned: sliced.length, lines: sliced };
    },
    getArchiveLister: (gulpId) => {
      if (!gulpId) return { ok: false, error: 'gulpId required', stack: null };
      if (/[\\/]/.test(gulpId) || gulpId.includes('..')) {
        return { ok: false, error: 'invalid gulpId', stack: null };
      }
      const all = fs.readdirSync(archiveDir).filter((n) => n.startsWith(gulpId));
      return { ok: true, archiveDir, gulpId, count: all.length, files: all.map((n) => ({ name: n })) };
    },
    ...overrides,
  };
}

async function runServer(handler, host = '127.0.0.1') {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, host, resolve));
  const port = server.address().port;
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// ---- 1. /health ----
console.log('\n=== /health ===');
{
  const handler = buildHandler({ port: 4923, ...deps() });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/health');
  assert(r.status === 200, 'health 200');
  assert(r.json && r.json.ok === true, 'health ok=true');
  assert(r.json && r.json.service === 'gulp-http-bridge', 'health service label');
  assert(r.json && r.json.port === 4923, 'health echoes configured port');
  await srv.close();
}

// ---- 2. /behcs/gulp/status ----
console.log('\n=== /behcs/gulp/status ===');
{
  const handler = buildHandler({ ...deps() });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/behcs/gulp/status');
  assert(r.status === 200, 'status 200');
  assert(r.json?.ok === true, 'status ok=true');
  assert(r.json?.state?.lastGulpSequence === 41, 'status carries collector state');
  assert(r.json?.bufferDepth === 17, 'status bufferDepth passthrough');
  assert(r.json?.latest?.gulpId === fakeStatus.latest.gulpId, 'status latest.gulpId');
  assert(r.json?.latest?.processedMessages === 2000, 'status latest.processedMessages');
  assert(r.json?.latest?.mistakesDetected === 3, 'status latest.mistakesDetected');
  assert(r.json?.fileCap?.cap === 1024, 'status fileCap passthrough');
  await srv.close();
}

// ---- 3. status error handling ----
console.log('\n=== status error handling ===');
{
  const handler = buildHandler({
    ...deps({
      getCollectorStatus: () => { throw new Error('boom'); },
    }),
  });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/behcs/gulp/status');
  assert(r.status === 500, 'status throw → 500');
  assert(r.json?.ok === false, 'status throw ok=false');
  assert(r.json?.error === 'boom', 'status throw error message');
  assert(typeof r.json?.stack === 'string', 'status throw stack present');
  await srv.close();
}

// ---- 4. /behcs/gulp/patterns ----
console.log('\n=== /behcs/gulp/patterns ===');
{
  const handler = buildHandler({ ...deps() });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/behcs/gulp/patterns');
  assert(r.status === 200, 'patterns 200');
  assert(r.json?.ok === true, 'patterns ok=true');
  assert(Array.isArray(r.json?.patterns), 'patterns array returned');
  assert(r.json.patterns.length === PATTERN_CAP, `patterns capped at ${PATTERN_CAP}`);
  assert(r.json?.cap === PATTERN_CAP, 'patterns cap field');
  assert(r.json.patterns[0].id === 'PAT-0000', 'patterns first id');
  await srv.close();
}

// ---- 5. patterns error handling ----
console.log('\n=== patterns error ===');
{
  const handler = buildHandler({
    ...deps({ getListMistakePatterns: () => { throw new Error('store missing'); } }),
  });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/behcs/gulp/patterns');
  assert(r.status === 500, 'patterns store-missing → 500');
  assert(r.json?.error === 'store missing', 'patterns error propagated');
  await srv.close();
}

// ---- 6. /behcs/gulp/ledger-tail defaults + bounds ----
console.log('\n=== /behcs/gulp/ledger-tail ===');
{
  const handler = buildHandler({ ...deps() });
  const srv = await runServer(handler);
  const rDefault = await request(srv.port, '/behcs/gulp/ledger-tail');
  assert(rDefault.status === 200, 'ledger-tail default 200');
  assert(rDefault.json?.ok === true, 'ledger-tail default ok');
  assert(rDefault.json?.returned === LEDGER_DEFAULT_TAIL, `ledger-tail default returns ${LEDGER_DEFAULT_TAIL}`);
  assert(rDefault.json?.requested === LEDGER_DEFAULT_TAIL, 'ledger-tail default requested echo');
  assert(rDefault.json?.total === 123, 'ledger-tail total');

  const rSmall = await request(srv.port, '/behcs/gulp/ledger-tail?n=5');
  assert(rSmall.json?.returned === 5, 'ledger-tail n=5 returns 5');
  assert(rSmall.json?.requested === 5, 'ledger-tail n=5 requested=5');

  const rHuge = await request(srv.port, `/behcs/gulp/ledger-tail?n=${LEDGER_MAX_TAIL + 1000}`);
  assert(rHuge.json?.requested === LEDGER_MAX_TAIL, `ledger-tail n>max clamped to ${LEDGER_MAX_TAIL}`);

  const rJunk = await request(srv.port, '/behcs/gulp/ledger-tail?n=not-a-number');
  assert(rJunk.json?.requested === LEDGER_DEFAULT_TAIL, 'ledger-tail NaN falls back to default');

  const rZero = await request(srv.port, '/behcs/gulp/ledger-tail?n=0');
  assert(rZero.json?.requested === 1, 'ledger-tail n=0 clamps to 1');
  await srv.close();
}

// ---- 7. /behcs/gulp/archive ----
console.log('\n=== /behcs/gulp/archive ===');
{
  const handler = buildHandler({ ...deps() });
  const srv = await runServer(handler);
  const rMissing = await request(srv.port, '/behcs/gulp/archive');
  assert(rMissing.status === 400, 'archive missing gulpId → 400');
  assert(rMissing.json?.ok === false, 'archive missing ok=false');
  assert(rMissing.json?.error === 'gulpId required', 'archive missing error text');

  const rOk = await request(srv.port, `/behcs/gulp/archive?gulpId=${archiveGulpId}`);
  assert(rOk.status === 200, 'archive hit 200');
  assert(rOk.json?.ok === true, 'archive hit ok');
  assert(rOk.json?.count === 5, 'archive returns all 5 label files');
  assert(rOk.json?.files.every((f) => f.name.startsWith(archiveGulpId)), 'archive filter is prefix-correct');

  const rTraversal = await request(srv.port, '/behcs/gulp/archive?gulpId=..%2Fescape');
  assert(rTraversal.status === 400, 'archive traversal → 400');
  assert(rTraversal.json?.error === 'invalid gulpId', 'archive traversal rejected');
  await srv.close();
}

// ---- 8. 404 + method handling ----
console.log('\n=== 404 + POST ===');
{
  const handler = buildHandler({ ...deps() });
  const srv = await runServer(handler);
  const r = await request(srv.port, '/nope');
  assert(r.status === 404, 'unknown route 404');
  assert(Array.isArray(r.json?.routes), '404 lists known routes');
  assert(r.json.routes.includes('/behcs/gulp/status'), '404 includes status route');

  // POST -> 405
  const post = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.port, method: 'POST', path: '/health' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, json: JSON.parse(body) });
      });
    });
    req.on('error', reject);
    req.end();
  });
  assert(post.status === 405, 'POST → 405');
  await srv.close();
}

// ---- 9. LAN bind toggle ----
console.log('\n=== LAN bind toggle ===');
{
  // bindLan=false: loopback request from 127.0.0.1 should work (already proven above)
  // bindLan=true with a non-allowlisted remote: simulate by tightening allowlist to exclude 127.0.0.1 equivalent.
  // Since the handler explicitly permits loopback, to simulate a foreign remote we fake a socket via a wrapper.
  const handler = buildHandler({
    ...deps(),
    bindLan: true,
    lanAllowlist: ['10.0.0.42'], // loopback still allowed by isLanAllowed, so request from 127.0.0.1 passes
  });
  const srv = await runServer(handler);
  const rLoop = await request(srv.port, '/health');
  assert(rLoop.status === 200, 'bindLan=true still accepts loopback');
  await srv.close();

  // Now simulate a foreign remote by directly invoking the handler with a mocked req socket.
  const events = [];
  const mockReq = {
    method: 'GET',
    url: '/health',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '203.0.113.5' },
  };
  const mockRes = {
    writeHead(status, headers) { events.push({ type: 'head', status, headers }); },
    end(body) { events.push({ type: 'end', body }); },
  };
  handler(mockReq, mockRes);
  const head = events.find((e) => e.type === 'head');
  const end = events.find((e) => e.type === 'end');
  assert(head?.status === 403, 'bindLan=true foreign remote → 403');
  const parsed = JSON.parse(end?.body || '{}');
  assert(parsed?.ok === false && parsed?.error === 'remote not in allowlist', 'bindLan=true foreign body shape');

  // And a remote that IS in the allowlist should pass.
  const events2 = [];
  const goodReq = {
    method: 'GET',
    url: '/health',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '10.0.0.42' },
  };
  const goodRes = {
    writeHead(status) { events2.push({ type: 'head', status }); },
    end(body) { events2.push({ type: 'end', body }); },
  };
  handler(goodReq, goodRes);
  const head2 = events2.find((e) => e.type === 'head');
  assert(head2?.status === 200, 'bindLan=true allowlisted remote → 200');
}

// ---- 10. startDaemon actually binds ----
console.log('\n=== startDaemon binding ===');
{
  const { server, host, port } = await startDaemon({
    port: 0, // any free
    deps: deps(),
  });
  assert(typeof port === 'number' && port > 0, 'startDaemon returns a port');
  assert(host === '127.0.0.1', 'startDaemon default host = 127.0.0.1');
  const r = await request(port, '/health');
  assert(r.status === 200, 'startDaemon /health 200');
  await new Promise((resolve) => server.close(resolve));
}

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

console.log(`\n=== RESULTS ===`);
console.log(`pass=${pass} fail=${fail} verdict=${fail === 0 ? 'ALL-GREEN' : 'DIVERGENCE'}`);
process.exit(fail === 0 ? 0 : 1);
