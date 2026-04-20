"use strict";

/**
 * heartbeat.js — federation heartbeat client
 *
 * Periodically GETs /health on configured peer omnikeyboards. Logs to
 * C:\Users\acer\Asolaria\logs\heartbeat.ndjson (append-only). Mirrors to
 * D:\safety-backups\session-20260406-asolaria\heartbeat.ndjson on each tick.
 *
 * Cube law: this script lives at D7 STATE (it observes state across the federation).
 * Tick interval: 30 seconds (default), configurable via HEARTBEAT_INTERVAL_MS env.
 *
 * Hilbert anatomy:
 *   D1  ACTOR       = asolaria-acer
 *   D2  VERB        = orch.heartbeat
 *   D3  TARGET      = peer omnikeyboards
 *   D7  STATE       = primary — heartbeat IS state observation
 *   D9  WAVE        = pulse (from OMNI-LANGUAGE-V3.md D9 wave types)
 *   D11 PROOF       = log entry per tick
 *   D14 ENERGY      = free (just an HTTP GET)
 *   D20 TIME        = periodic (cron-like)
 *   D23 FEDERATION  = primary — closes the federation feedback loop
 *
 * Spec source: Jesse 2026-04-06 directive: "IS there a way to force it with a heart beat"
 *
 * Usage:
 *   node tools/heartbeat.js
 *
 * Environment:
 *   HEARTBEAT_INTERVAL_MS  default 30000
 *   HEARTBEAT_TIMEOUT_MS   default 5000 (per-request timeout)
 *
 * Peers configured below in PEERS array. Add new peers as omninodes come online.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10);
const TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '5000', 10);

const PEER_TOKENS_PATH = path.join(__dirname, '..', 'data', 'vault', 'owner', 'agent-keyboard', 'peer-tokens.json');

function resolveLirisHeartbeatUrl() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PEER_TOKENS_PATH, 'utf8'));
    const peer = parsed.peers && parsed.peers['liris-rayssa'];
    if (!peer || !peer.url) return 'http://192.168.100.2:4820/health';
    const endpoint = new URL(peer.url);
    endpoint.pathname = '/health';
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint.toString();
  } catch (_error) {
    return 'http://192.168.100.2:4820/health';
  }
}

const PEERS = [
  {
    id: 'liris-rayssa',
    name: 'omnikeyboard@liris→acer',
    url: resolveLirisHeartbeatUrl(),
    cube_port: 4820,
    cube_note: 'owner-bound ethernet-first peer from peer-tokens',
    primary_dimension: 'D7_STATE'
  },
  {
    id: 'self-acer',
    name: 'omnikeyboard@acer→liris',
    url: 'http://127.0.0.1:4913/health',
    cube_port: 4913,
    cube_note: '17^3 = D7 STATE prime cube',
    primary_dimension: 'D7_STATE'
  }
  // Future peers added here as omnikeyboards come online for falcon, felipe, beast, etc.
];

const LOG_FILE = path.join(__dirname, '..', 'logs', 'heartbeat.ndjson');
const D_MIRROR_DIR = 'D:\\safety-backups\\session-20260406-asolaria';
const D_MIRROR_FILE = path.join(D_MIRROR_DIR, 'heartbeat.ndjson');

function ensureDir(filePath) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (e) {}
}

function appendLog(entry) {
  ensureDir(LOG_FILE);
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  // Mirror to D: per rolling backup rule
  try {
    if (fs.existsSync(D_MIRROR_DIR)) {
      fs.appendFileSync(D_MIRROR_FILE, JSON.stringify(entry) + '\n');
    }
  } catch (e) {
    // D: mirror is best-effort, never blocks the main log
  }
}

function pingPeer(peer) {
  return new Promise(function(resolve) {
    const startedAt = Date.now();
    const req = http.get(peer.url, { timeout: TIMEOUT_MS }, function(res) {
      let body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        const elapsed = Date.now() - startedAt;
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) {}
        resolve({
          peer: peer.id,
          name: peer.name,
          url: peer.url,
          status: res.statusCode,
          elapsed_ms: elapsed,
          ok: res.statusCode === 200,
          enabled: parsed ? parsed.enabled : null,
          foreground_window: parsed ? parsed.foreground_window : null,
          allowlist_count: parsed ? parsed.allowlist_count : null,
          cube: parsed ? parsed.cube : peer.cube_note,
          dimension: parsed ? parsed.dimension : peer.primary_dimension
        });
      });
    });
    req.on('timeout', function() {
      req.destroy();
      resolve({
        peer: peer.id,
        name: peer.name,
        url: peer.url,
        ok: false,
        error: 'timeout',
        elapsed_ms: Date.now() - startedAt
      });
    });
    req.on('error', function(err) {
      resolve({
        peer: peer.id,
        name: peer.name,
        url: peer.url,
        ok: false,
        error: err.message,
        elapsed_ms: Date.now() - startedAt
      });
    });
  });
}

async function tick() {
  const ts = new Date().toISOString();
  const results = await Promise.all(PEERS.map(pingPeer));
  const summary = {
    ts: ts,
    verb: 'orch.heartbeat',
    actor: 'asolaria-acer',
    wave: 'pulse',
    interval_ms: INTERVAL_MS,
    peers_total: PEERS.length,
    peers_ok: results.filter(function(r) { return r.ok; }).length,
    peers_failed: results.filter(function(r) { return !r.ok; }).length,
    results: results
  };
  appendLog(summary);

  const okCount = summary.peers_ok;
  const failCount = summary.peers_failed;
  const status = failCount === 0 ? 'GREEN' : (okCount === 0 ? 'RED' : 'YELLOW');
  console.log('[' + ts + '] heartbeat ' + status + ' ok=' + okCount + ' fail=' + failCount + '/' + summary.peers_total);

  if (failCount > 0) {
    results.forEach(function(r) {
      if (!r.ok) {
        console.log('  FAIL ' + r.peer + ' (' + r.name + '): ' + (r.error || 'http ' + r.status));
      }
    });
  }
}

console.log('heartbeat.js starting');
console.log('  interval: ' + INTERVAL_MS + 'ms');
console.log('  timeout:  ' + TIMEOUT_MS + 'ms');
console.log('  peers:    ' + PEERS.length);
console.log('  log:      ' + LOG_FILE);
console.log('  mirror:   ' + D_MIRROR_FILE);
console.log('');

// First tick immediately
tick().then(function() {
  // Then on interval
  setInterval(tick, INTERVAL_MS);
}).catch(function(err) {
  console.error('first tick error:', err.message);
  setInterval(tick, INTERVAL_MS);
});

process.on('SIGINT', function() {
  console.log('\nheartbeat shutting down (SIGINT)');
  process.exit(0);
});
