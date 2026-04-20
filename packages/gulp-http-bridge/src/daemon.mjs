#!/usr/bin/env node
// @asolaria/gulp-http-bridge daemon
// HTTP mirror for BEHCS gulp collector. Exposes:
//   GET /health
//   GET /behcs/gulp/status       -> collectorStatus()
//   GET /behcs/gulp/patterns     -> listMistakePatterns({ limit: 256 })
//   GET /behcs/gulp/ledger-tail?n=N
//   GET /behcs/gulp/archive?gulpId=X
//
// Binds 127.0.0.1 by default; GULP_HTTP_BIND_LAN=1 opens 0.0.0.0 but
// restricts non-loopback access to an LAN allowlist (default 192.168.100.2).
//
// Port: 4923 (configurable via GULP_HTTP_PORT)
// Runtime source: C:/Users/acer/Asolaria/tools/behcs/behcs-gulp-runtime.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);

export const DEFAULT_PORT = 4923;
export const LEDGER_DEFAULT_TAIL = 50;
export const LEDGER_MAX_TAIL = 500;
export const PATTERN_CAP = 256;
export const DEFAULT_LAN_ALLOWLIST = ['192.168.100.2'];

function defaultRuntimeRoot() {
  return process.env.ASOLARIA_INSTANCE_ROOT
    || process.env.ASOLARIA_ROOT
    || 'C:/Users/acer/Asolaria';
}

function defaultRuntimePath() {
  return process.env.ASOLARIA_GULP_RUNTIME_PATH
    || path.join(defaultRuntimeRoot(), 'tools', 'behcs', 'behcs-gulp-runtime.js');
}

function defaultLedgerPath() {
  return process.env.ASOLARIA_MISTAKE_LEDGER_PATH
    || path.join(defaultRuntimeRoot(), 'data', 'mistake-ledger.ndjson');
}

function defaultArchiveDir() {
  return process.env.ASOLARIA_GULP_ARCHIVES_DIR
    || path.join(defaultRuntimeRoot(), 'data', 'behcs', 'garbage-collector', 'archives');
}

// Lazy require — lets tests pass when runtime isn't installed at standard path.
function resolveRuntime(runtimePath = defaultRuntimePath()) {
  if (!fs.existsSync(runtimePath)) {
    const err = new Error(`behcs-gulp-runtime not found at ${runtimePath}`);
    err.code = 'RUNTIME_MISSING';
    throw err;
  }
  // Use absolute path so CJS cache resolves consistently.
  return require(path.resolve(runtimePath));
}

function resolveListMistakePatterns() {
  // listMistakePatterns lives in src/mistakePatternStore.js, not the runtime.
  const root = defaultRuntimeRoot();
  const storePath = path.join(root, 'src', 'mistakePatternStore.js');
  if (!fs.existsSync(storePath)) {
    const err = new Error(`mistakePatternStore not found at ${storePath}`);
    err.code = 'PATTERN_STORE_MISSING';
    throw err;
  }
  const store = require(path.resolve(storePath));
  if (typeof store.listMistakePatterns !== 'function') {
    const err = new Error('listMistakePatterns export missing');
    err.code = 'PATTERN_STORE_SIG';
    throw err;
  }
  return store.listMistakePatterns;
}

function tailLines(filePath, n) {
  if (!fs.existsSync(filePath)) return { ok: true, path: filePath, lines: [], total: 0, note: 'file-missing' };
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return { ok: true, path: filePath, lines: [], total: 0, note: 'not-a-file' };
  // NDJSON is line-structured; reading all is acceptable at expected scales.
  // For multi-GB files, a reverse chunked reader would be a later upgrade.
  const raw = fs.readFileSync(filePath, 'utf8');
  const all = raw.split(/\r?\n/).filter((s) => s.length > 0);
  const slice = all.slice(-n);
  return {
    ok: true,
    path: filePath,
    total: all.length,
    returned: slice.length,
    lines: slice,
  };
}

function listArchivesForGulp(archiveDir, gulpId) {
  if (!gulpId || typeof gulpId !== 'string') {
    return { ok: false, error: 'gulpId required', stack: null };
  }
  // Minimal sanitization: gulp ids are ASCII [a-zA-Z0-9:\-TZ] basically.
  // Reject separators outright; no directory traversal allowed.
  if (/[\\/]/.test(gulpId) || gulpId.includes('..')) {
    return { ok: false, error: 'invalid gulpId', stack: null };
  }
  if (!fs.existsSync(archiveDir)) {
    return { ok: true, archiveDir, gulpId, files: [], note: 'archives-dir-missing' };
  }
  const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
  const matches = entries
    .filter((d) => d.isFile() && d.name.startsWith(gulpId))
    .map((d) => {
      const full = path.join(archiveDir, d.name);
      const st = fs.statSync(full);
      return { name: d.name, path: full, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, archiveDir, gulpId, files: matches, count: matches.length };
}

function isLanAllowed(remoteAddr, allowlist = DEFAULT_LAN_ALLOWLIST) {
  if (!remoteAddr) return false;
  const clean = remoteAddr.replace(/^::ffff:/, '');
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  return allowlist.includes(clean);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function errorShape(err) {
  return {
    ok: false,
    error: err?.message || String(err) || 'unknown error',
    stack: err?.stack || null,
  };
}

/**
 * Build the request handler. Dependencies are injected so tests can swap them.
 */
export function buildHandler({
  port = DEFAULT_PORT,
  getCollectorStatus,
  getListMistakePatterns,
  getLedgerTail,
  getArchiveLister,
  lanAllowlist = DEFAULT_LAN_ALLOWLIST,
  bindLan = false,
} = {}) {
  return function handler(req, res) {
    // Access control: on LAN binding, reject remotes not in allowlist.
    if (bindLan) {
      const remote = req.socket?.remoteAddress || '';
      if (!isLanAllowed(remote, lanAllowlist)) {
        return sendJson(res, 403, { ok: false, error: 'remote not in allowlist', remote });
      }
    }
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    } catch (e) {
      return sendJson(res, 400, errorShape(e));
    }
    const p = url.pathname;
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method not allowed', method: req.method });
    }

    if (p === '/health') {
      return sendJson(res, 200, { ok: true, service: 'gulp-http-bridge', port });
    }

    if (p === '/behcs/gulp/status') {
      try {
        const raw = getCollectorStatus();
        // Normalize expected shape — collectorStatus already returns ok/state/bufferDepth/latest/fileCap.
        const safe = {
          ok: raw?.ok ?? true,
          state: raw?.state ?? null,
          bufferDepth: typeof raw?.bufferDepth === 'number' ? raw.bufferDepth : 0,
          latest: raw?.latest
            ? {
                gulpId: raw.latest.gulpId ?? null,
                generatedAt: raw.latest.generatedAt ?? null,
                processedMessages: raw.latest.processedMessages ?? 0,
                mistakesDetected: raw.latest.mistakesDetected ?? 0,
              }
            : null,
          fileCap: raw?.fileCap ?? null,
          running: typeof raw?.running === 'boolean' ? raw.running : undefined,
        };
        return sendJson(res, 200, safe);
      } catch (e) {
        return sendJson(res, 500, errorShape(e));
      }
    }

    if (p === '/behcs/gulp/patterns') {
      try {
        const listFn = getListMistakePatterns();
        const out = listFn({ status: 'active', limit: PATTERN_CAP });
        // Cap defensively even if upstream ignores limit.
        const patterns = Array.isArray(out?.patterns) ? out.patterns.slice(0, PATTERN_CAP) : [];
        return sendJson(res, 200, {
          ok: out?.ok ?? true,
          total: patterns.length,
          cap: PATTERN_CAP,
          patterns,
        });
      } catch (e) {
        return sendJson(res, 500, errorShape(e));
      }
    }

    if (p === '/behcs/gulp/ledger-tail') {
      try {
        const rawN = parseInt(url.searchParams.get('n') || String(LEDGER_DEFAULT_TAIL), 10);
        const n = Math.max(1, Math.min(LEDGER_MAX_TAIL, Number.isFinite(rawN) ? rawN : LEDGER_DEFAULT_TAIL));
        const result = getLedgerTail(n);
        return sendJson(res, 200, { ...result, requested: n });
      } catch (e) {
        return sendJson(res, 500, errorShape(e));
      }
    }

    if (p === '/behcs/gulp/archive') {
      try {
        const gulpId = url.searchParams.get('gulpId');
        const result = getArchiveLister(gulpId);
        const status = result?.ok ? 200 : 400;
        return sendJson(res, status, result);
      } catch (e) {
        return sendJson(res, 500, errorShape(e));
      }
    }

    return sendJson(res, 404, {
      ok: false,
      error: 'not found',
      routes: [
        '/health',
        '/behcs/gulp/status',
        '/behcs/gulp/patterns',
        '/behcs/gulp/ledger-tail',
        '/behcs/gulp/archive',
      ],
    });
  };
}

export function createDefaultDeps({
  runtimePath = defaultRuntimePath(),
  ledgerPath = defaultLedgerPath(),
  archiveDir = defaultArchiveDir(),
} = {}) {
  return {
    getCollectorStatus: () => {
      const rt = resolveRuntime(runtimePath);
      if (typeof rt.collectorStatus !== 'function') {
        const err = new Error('collectorStatus export missing from behcs-gulp-runtime');
        err.code = 'RUNTIME_SIG';
        throw err;
      }
      return rt.collectorStatus();
    },
    getListMistakePatterns: () => resolveListMistakePatterns(),
    getLedgerTail: (n) => tailLines(ledgerPath, n),
    getArchiveLister: (gulpId) => listArchivesForGulp(archiveDir, gulpId),
  };
}

export function startDaemon({
  port = parseInt(process.env.GULP_HTTP_PORT || String(DEFAULT_PORT), 10),
  bindLan = process.env.GULP_HTTP_BIND_LAN === '1',
  lanAllowlist = (process.env.GULP_HTTP_LAN_ALLOWLIST || DEFAULT_LAN_ALLOWLIST.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  deps = createDefaultDeps(),
  logger = console,
} = {}) {
  const handler = buildHandler({ port, bindLan, lanAllowlist, ...deps });
  const server = http.createServer(handler);
  const host = bindLan ? '0.0.0.0' : '127.0.0.1';
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const bound = server.address();
      const actualPort = typeof bound === 'object' && bound ? bound.port : port;
      logger?.log?.(
        JSON.stringify({
          event: 'gulp-http-bridge.boot',
          ts: new Date().toISOString(),
          host,
          port: actualPort,
          bindLan,
          lanAllowlist: bindLan ? lanAllowlist : null,
        }),
      );
      resolve({ server, host, port: actualPort });
    });
  });
}

function isEntrypoint() {
  // True when this module is executed directly (node src/daemon.mjs).
  const arg = process.argv[1] || '';
  return arg.endsWith('daemon.mjs');
}

if (isEntrypoint()) {
  startDaemon()
    .then(({ server }) => {
      const shutdown = (signal) => {
        console.log(
          JSON.stringify({ event: 'gulp-http-bridge.shutdown', ts: new Date().toISOString(), signal }),
        );
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 500).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error(
        JSON.stringify({
          event: 'gulp-http-bridge.start_failed',
          ts: new Date().toISOString(),
          error: err?.message || String(err),
        }),
      );
      process.exit(1);
    });
}
