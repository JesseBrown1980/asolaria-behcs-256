#!/usr/bin/env node
/**
 * behcs-sidecar.js — Persistent BEHCS sidecar process.
 *
 * Runs OUTSIDE Claude Code as a standalone Node process.
 * Survives session boundaries. Accepts messages from falcon + liris
 * and queues them for the next Asolaria session to ingest.
 *
 * Features:
 *   1. HTTP server on :4947 (BEHCS bus) — always on
 *   2. Cron kicker: screenshots falcon every 30s, unsticks if hung
 *   3. Message queue: stores inbound messages for asolaria to read
 *   4. Auto-relay: falcon→liris and liris→falcon via acer hub
 *   5. Hookwall gate on every inbound message
 *   6. GNN edge logging per IX-865
 *   7. Rehydration endpoint: /behcs/rehydrate returns all queued
 *      messages so new asolaria session catches up instantly
 *   8. Self-repair: if bus crashes, respawns in 5s
 *   9. D0 RUNTIME — live dimension chain reacts to every message (2026-04-12)
 *  10. CURSOR INTENT — tracks mouse as D24 signal with velocity/dwell (2026-04-12)
 *  11. REFLEX LAYER — pre-inference fast reactions (2026-04-12)
 *  12. PERSISTENT AGENTS — scout/evidence/executor/fabric/voice/planner always listening
 *
 * Ports:
 *   4947 — BEHCS bus (primary)
 *   4948 — sidecar admin (health, rehydrate, flush)
 *
 * Start: node tools/behcs/behcs-sidecar.js
 * Or:    nohup node tools/behcs/behcs-sidecar.js >> logs/behcs-sidecar.log 2>&1 &
 *
 * Cube: D44 HEARTBEAT (7189057) + D36 INFERENCE_SURFACE (3442951) + D0 RUNTIME
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const ROOT = 'C:/Users/acer/Asolaria';
const ADB = 'C:/Users/acer/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb';
const BEHCS_DIR = path.join(ROOT, 'data/behcs');
const INBOX = path.join(BEHCS_DIR, 'inbox.ndjson');
const QUEUE = path.join(BEHCS_DIR, 'rehydration-queue.ndjson');
const GNN_EDGES = path.join(BEHCS_DIR, 'gnn-edges.ndjson');
const CAPTURES_DIR = path.join(ROOT, 'logs/captures/omnicalendar');
const PID_FILE = path.join(BEHCS_DIR, 'sidecar.pid');

const EventEmitter = require('events');
const {
  collectorStatus,
  recordCollectorMessage,
  runGulpRehydration,
  scheduleGulp,
  seedCollectorBuffer,
} = require('./behcs-gulp-runtime');
const { refreshLiveReportFromMessage } = require('./gnn-live-watcher');
const { buildResourceBudgetSnapshot } = require('../../sovereignty/src/resourceBudgetSnapshot');
const { buildGnnSiliconHeartbeat } = require('../../sovereignty/src/gnnSiliconHeartbeat');
const { buildAsolariaAssignableTaskBoard } = require('../../sovereignty/src/asolariaAssignableTaskBoard');

const BUS_PORT = 4947;
const ADMIN_PORT = 4948;
const HEARTBEAT_INTERVAL = 30000;
const MAX_INBOX = 200;
const MAX_QUEUE = 500;
const MAX_EDGES = 1000;
const MAX_CAPTURES = 20;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function appendNdjson(f, obj) { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(obj) + '\n'); }
function truncateNdjson(f, maxLines) {
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length > maxLines) fs.writeFileSync(f, lines.slice(-maxLines).join('\n') + '\n');
}

// ═══ PEERS ═══
const PEERS = {
  liris: { url: 'http://192.168.100.2:4820', token: '129b1a32113392e18169002117528b829816212dcd1fb21089351407e0850621' },
  falcon: { adb: true },
};

// ═══ HOOKWALL GATE (inline, fast) ═══
function hookwallCheck(envelope) {
  const text = JSON.stringify(envelope).toLowerCase();
  const denies = [];
  // HD-1c: LOCAL novalum analysis PERMITTED. Only block external/hack/exploit
  if (text.includes('novalum') && (text.includes('external') && !text.includes('external deny')) && !text.includes('hd-1c') && !text.includes('local analysis') && !text.includes('behcs.novalum')) denies.push('HD-1a');
  if ((text.includes('brian') || text.includes('natalie')) && text.includes('send') && !text.includes('draft')) denies.push('HD-2-ext');
  if (text.includes('virus') || text.includes('malware')) denies.push('HD-virus');
  if (text.includes('force-stop') && !text.includes('termux')) denies.push('HD-destructive');
  return { allow: denies.length === 0, denies };
}

// ═══ GNN EDGE (per IX-865) ═══
function logGnnEdge(envelope) {
  const edge = {
    from: envelope.from || 'unknown',
    to: envelope.to || 'unknown',
    verb: envelope.payload?.verb || envelope.type || 'message',
    weight: (envelope.payload?.risk || 1) * 0.5,
    ts: new Date().toISOString(),
    id: envelope.id,
    pathGlyph: envelope.behcs?.pathGlyph || '',
    messageGlyph: envelope.behcs?.messageGlyph || '',
  };
  appendNdjson(GNN_EDGES, edge);
  truncateNdjson(GNN_EDGES, MAX_EDGES);
  try {
    refreshLiveReportFromMessage({
      ...envelope,
      received_at: envelope.received_at || new Date().toISOString(),
    });
  } catch (error) {
    d0log('GNN_REPORT_REFRESH_FAILED', {
      id: envelope.id || 'unknown',
      from: envelope.from || 'unknown',
      to: envelope.to || 'unknown',
      error: error.message,
    });
  }
  refreshResourceControlSurfaces(envelope);
}

function isResourceSignal(envelope = {}) {
  const payload = envelope.payload || {};
  const verb = String(payload.verb || envelope.type || '').toLowerCase();
  return Boolean(
    payload.cpu
    || payload.ram
    || payload.gpu
    || payload.hw
    || verb.includes('compute_pulse')
    || verb.includes('behcs.pulse')
    || verb.includes('node_boot')
    || envelope.type === 'heartbeat'
  );
}

function refreshResourceControlSurfaces(envelope) {
  if (!isResourceSignal(envelope)) return;
  try {
    const snapshot = buildResourceBudgetSnapshot({ latestMessage: envelope });
    const heartbeat = buildGnnSiliconHeartbeat({ snapshot });
    buildAsolariaAssignableTaskBoard({ snapshot, heartbeat });
  } catch (error) {
    d0log('RESOURCE_CONTROL_REFRESH_FAILED', {
      id: envelope?.id || 'unknown',
      from: envelope?.from || 'unknown',
      to: envelope?.to || 'unknown',
      error: error.message,
    });
  }
}

// ═══ AUTO-RELAY ═══
function relayToLiris(envelope) {
  if (envelope.to === 'liris' || envelope.to === 'liris+falcon' || envelope.to === 'falcon+liris') {
    const data = JSON.stringify({ text: `[relay:${envelope.from}] ${envelope.payload?.text || envelope.text || JSON.stringify(envelope.payload).slice(0, 200)}`, press_enter: true });
    const req = http.request({
      hostname: '192.168.100.2', port: 4820, path: '/type', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PEERS.liris.token}`, 'Content-Length': Buffer.byteLength(data) },
    });
    req.on('error', () => {});
    req.setTimeout(5000, () => req.destroy());
    req.write(data);
    req.end();
  }
}

function relayToFalcon(envelope) {
  if (envelope.to === 'falcon' || envelope.to === 'liris+falcon' || envelope.to === 'falcon+liris') {
    try {
      const text = `[relay:${envelope.from}] ${envelope.payload?.text || envelope.text || ''}`.slice(0, 200).replace(/ /g, '%s');
      execSync(`"${ADB}" shell "input text '${text}'"`, { timeout: 5000 });
      execSync(`"${ADB}" shell input keyevent 66`, { timeout: 3000 });
    } catch (_) {}
  }
}

// ═══ ADB HELPERS ═══
function adbConnected() {
  try { return execSync(`"${ADB}" devices`, { encoding: 'utf8', timeout: 5000 }).includes('device'); } catch (_) { return false; }
}

function ensureTunnels() {
  try {
    const list = execSync(`"${ADB}" reverse --list`, { encoding: 'utf8', timeout: 5000 });
    if (!list.includes('4947')) execSync(`"${ADB}" reverse tcp:4947 tcp:4947`, { timeout: 5000 });
    if (!list.includes('4913')) execSync(`"${ADB}" reverse tcp:4913 tcp:4913`, { timeout: 5000 });
    if (!list.includes('4781')) execSync(`"${ADB}" reverse tcp:4781 tcp:4781`, { timeout: 5000 });
  } catch (_) {}
}

function screenshotFalcon() {
  ensureDir(CAPTURES_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '');
  const file = path.join(CAPTURES_DIR, `falcon-${ts}.png`);
  try {
    execSync(`"${ADB}" exec-out screencap -p > "${file}"`, { timeout: 10000 });
    // Prune old
    const files = fs.readdirSync(CAPTURES_DIR).filter(f => f.startsWith('falcon-')).sort();
    if (files.length > MAX_CAPTURES) {
      for (const f of files.slice(0, files.length - MAX_CAPTURES)) fs.unlinkSync(path.join(CAPTURES_DIR, f));
    }
    return file;
  } catch (_) { return null; }
}

// ═══════════════════════════════════════════════════════════
// D0 RUNTIME — IN-PROCESS (no HTTP loop, direct event bus)
// ═══════════════════════════════════════════════════════════

const D0_DIR = path.join(BEHCS_DIR, 'd0-runtime');
const D0_LOG = path.join(D0_DIR, 'sidecar-d0-events.ndjson');
ensureDir(D0_DIR);

const d0bus = new EventEmitter();
d0bus.setMaxListeners(50);

// Dim state
const dims = {
  D36: { id: 'D36_INFERENCE', signal: 0.5, state: 'idle', fires: 0, errors: 0 },
  D8:  { id: 'D8_CHAIN',      signal: 0.5, state: 'idle', fires: 0, errors: 0 },
  D6:  { id: 'D6_GATE',       signal: 0.5, state: 'idle', fires: 0, errors: 0 },
  D7:  { id: 'D7_STATE',      signal: 0.5, state: 'idle', fires: 0, errors: 0 },
  D43: { id: 'D43_MISTAKE',   signal: 0.5, state: 'idle', fires: 0, errors: 0 },
  D44: { id: 'D44_HEARTBEAT', signal: 0.5, state: 'idle', fires: 0, errors: 0 },
};

// Agent state
const agents = {
  scout:    { wakes: 0, lastEvent: null },
  evidence: { wakes: 0, lastEvent: null },
  executor: { wakes: 0, lastEvent: null },
  fabric:   { wakes: 0, lastEvent: null },
  voice:    { wakes: 0, lastEvent: null },
  planner:  { wakes: 0, lastEvent: null },
};

// Stale detection state
let lastCaptureBytes = 0;
let consecutiveStale = 0;

// Cursor intent state
const cursorHistory = []; // last N positions
const MAX_CURSOR_HISTORY = 30;

function d0log(event, data) {
  const entry = { ts: new Date().toISOString(), event, ...data };
  appendNdjson(D0_LOG, entry);
  truncateNdjson(D0_LOG, 500);
}

// ═══ REFLEX LAYER — pre-inference, fast, rule-based ═══
function reflexCheck(msg) {
  const verb = msg.payload?.verb || msg.type || '';
  const from = msg.from || '';

  // Reflex 1: heartbeat → don't run inference, just ack
  if (verb.includes('heartbeat') || verb.includes('compute_pulse') || msg.type === 'heartbeat') {
    return { action: 'absorb', reason: 'heartbeat_reflex', runInference: false };
  }

  // Reflex 2: own D0 events → don't re-process (prevent loops)
  if (from.includes('d0') || from.includes('v6-cascade') || from.includes('encoder') || from.includes('language-bootstrap')) {
    return { action: 'absorb', reason: 'self_loop_prevention', runInference: false };
  }

  // Reflex 3: capture stale detection
  if (verb.includes('capture')) {
    const bytes = msg.payload?.bytes || 0;
    if (bytes > 0 && bytes === lastCaptureBytes) {
      consecutiveStale++;
      if (consecutiveStale >= 3) {
        return { action: 'flag_stale', reason: `capture_stale_${consecutiveStale}x`, runInference: true, staleFlag: true };
      }
    } else {
      consecutiveStale = 0;
    }
    lastCaptureBytes = bytes;
  }

  // Reflex 4: hard-deny already caught by hookwall, but double-check
  // (hookwall runs before reflex, so this is belt-and-suspenders)

  // Reflex 5: cursor intent extraction
  if (verb.includes('cursor') || msg.payload?.cursor) {
    const pos = msg.payload?.cursor || msg.payload?.position;
    if (pos && typeof pos.x === 'number') {
      cursorHistory.push({ x: pos.x, y: pos.y, ts: Date.now() });
      if (cursorHistory.length > MAX_CURSOR_HISTORY) cursorHistory.shift();

      // Compute velocity + dwell
      const intent = computeCursorIntent();
      return { action: 'cursor_signal', reason: 'cursor_intent', runInference: true, cursorIntent: intent };
    }
  }

  // Default: run full inference
  return { action: 'process', reason: 'normal_message', runInference: true };
}

function computeCursorIntent() {
  if (cursorHistory.length < 2) return { velocity: 0, dwell: 0, entropy: 0 };

  const last = cursorHistory[cursorHistory.length - 1];
  const prev = cursorHistory[cursorHistory.length - 2];
  const dt = (last.ts - prev.ts) / 1000 || 0.001;
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

  // Dwell: how long since last significant movement
  let dwell = 0;
  for (let i = cursorHistory.length - 1; i >= 1; i--) {
    const a = cursorHistory[i], b = cursorHistory[i - 1];
    const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    if (dist > 5) break; // 5px threshold for "movement"
    dwell += (a.ts - b.ts) / 1000;
  }

  // Entropy: randomness of recent movement directions
  const angles = [];
  for (let i = 1; i < cursorHistory.length; i++) {
    const a = cursorHistory[i], b = cursorHistory[i - 1];
    angles.push(Math.atan2(a.y - b.y, a.x - b.x));
  }
  let entropy = 0;
  if (angles.length > 2) {
    const diffs = [];
    for (let i = 1; i < angles.length; i++) diffs.push(Math.abs(angles[i] - angles[i - 1]));
    entropy = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  return {
    position: { x: last.x, y: last.y },
    velocity: parseFloat(velocity.toFixed(1)),
    dwell: parseFloat(dwell.toFixed(2)),
    entropy: parseFloat(entropy.toFixed(3)),
    samples: cursorHistory.length,
  };
}

// ═══ D0 DIMENSION CHAIN — fires on every qualifying message ═══
function d0Process(msg, reflexResult) {
  const text = JSON.stringify(msg).toLowerCase().slice(0, 500);

  // D36 INFERENCE — process the message
  dims.D36.fires++;
  const hasStructure = !!(msg.cube || msg.payload?.cube || msg.id);
  const fromDevice = Object.keys(PEERS).some(p => (msg.from || '').includes(p)) || (msg.from || '').includes('acer');
  dims.D36.signal = (hasStructure ? 0.4 : 0.15) + (fromDevice ? 0.3 : 0.1) + 0.2;
  dims.D36.state = 'idle';

  const inferVerdict = dims.D36.signal > 0.6 ? 'PROCEED' : (dims.D36.signal > 0.3 ? 'CAUTION' : 'BLOCK');

  // D8 CHAIN — route
  dims.D8.fires++;
  dims.D8.signal = inferVerdict === 'PROCEED' ? 0.9 : (inferVerdict === 'CAUTION' ? 0.6 : 0.2);
  const route = inferVerdict === 'BLOCK' ? 'reject' : 'gate_validate';

  // D6 GATE — validate
  dims.D6.fires++;
  if (route === 'reject') {
    dims.D6.signal = 0.1;
  } else {
    // Check hard-deny at gate level (redundant with hookwall, but defense in depth)
    const hdHits = [];
    if (text.includes('novalum') && text.includes('external')) hdHits.push('HD-1a');
    if ((text.includes('brian') || text.includes('natalie')) && text.includes('send') && !text.includes('draft')) hdHits.push('HD-2-ext');
    dims.D6.signal = hdHits.length > 0 ? 0 : 0.9;
  }
  const gatePass = dims.D6.signal > 0.5;

  // D7 STATE — agent tier selection
  dims.D7.fires++;
  let tier = 'observe';
  if (gatePass) {
    if (dims.D36.signal > 0.8) tier = 'instant';
    else if (dims.D36.signal > 0.6) tier = 'micro';
    else tier = 'small';
  }
  dims.D7.signal = gatePass ? 0.85 : 0.3;

  // Wake agents based on what happened
  if (gatePass) {
    agents.scout.wakes++; agents.scout.lastEvent = 'INFERENCE';
    agents.fabric.wakes++; agents.fabric.lastEvent = 'GATE_PASS';

    if (tier === 'instant' || tier === 'micro') {
      agents.executor.wakes++; agents.executor.lastEvent = 'EXECUTE';
    }
    agents.planner.wakes++; agents.planner.lastEvent = 'PLAN';
  } else {
    // Gate blocked — wake voice (escalate) and evidence (log)
    agents.voice.wakes++; agents.voice.lastEvent = 'GATE_BLOCK';
    agents.evidence.wakes++; agents.evidence.lastEvent = 'MISTAKE';

    // D43 MISTAKE — log the block
    dims.D43.fires++;
    dims.D43.signal = 0.3;
    d0log('D43_MISTAKE', { msg_id: msg.id, reason: 'gate_block', route });
  }

  // Stale detection from reflex
  if (reflexResult.staleFlag) {
    dims.D43.fires++;
    dims.D43.signal = 0.2;
    dims.D43.errors++;
    d0log('D43_STALE_CAPTURE', { consecutive: consecutiveStale, bytes: lastCaptureBytes });
  }

  // Cursor intent propagation
  if (reflexResult.cursorIntent) {
    dims.D36.signal = Math.min(dims.D36.signal + 0.1, 1.0); // cursor data enriches inference
    d0log('CURSOR_INTENT', reflexResult.cursorIntent);
  }

  const result = {
    inferVerdict, route, gatePass, tier,
    signals: {
      D36: dims.D36.signal, D8: dims.D8.signal, D6: dims.D6.signal,
      D7: dims.D7.signal, D43: dims.D43.signal,
    },
    agentWakes: Object.fromEntries(Object.entries(agents).filter(([_, a]) => a.lastEvent).map(([k, a]) => [k, a.lastEvent])),
  };

  // Log to D0 event file
  d0log('D0_CHAIN', { msg_id: msg.id, from: msg.from, verb: msg.payload?.verb, ...result });

  return result;
}

// ═══ D44 HEARTBEAT — runs every 30s, monitors all dims + agents ═══
function d0Heartbeat() {
  dims.D44.fires++;

  let aliveCount = 0;
  let errorCount = 0;
  for (const d of Object.values(dims)) {
    if (d.errors > 0) errorCount++;
    else aliveCount++;
  }

  const totalWakes = Object.values(agents).reduce((a, ag) => a + ag.wakes, 0);
  dims.D44.signal = aliveCount / Object.keys(dims).length;

  d0log('D44_HEARTBEAT', {
    alive: aliveCount, errors: errorCount,
    totalDimFires: Object.values(dims).reduce((a, d) => a + d.fires, 0),
    totalAgentWakes: totalWakes,
    dimSignals: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, d.signal.toFixed(3)])),
    staleCount: consecutiveStale,
  });
}

// ═══ D0 STATUS ENDPOINT DATA ═══
function d0Status() {
  return {
    dims: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, { signal: d.signal, state: d.state, fires: d.fires, errors: d.errors }])),
    agents: Object.fromEntries(Object.entries(agents).map(([k, a]) => [k, { wakes: a.wakes, lastEvent: a.lastEvent }])),
    cursor: { history: cursorHistory.length, staleCount: consecutiveStale, lastIntent: computeCursorIntent() },
    alive: true,
  };
}

// ═══ BEHCS BUS SERVER ═══
function startBus() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${BUS_PORT}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    if (url.pathname === '/behcs/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, sidecar: true, device: 'acer', port: BUS_PORT, ts: new Date().toISOString(), entities: 453, triad: true }));
      return;
    }

    // ═══ MIRROR VISION — every node sees every other node's screen ═══
    if (url.pathname === '/behcs/screen/acer') {
      // Acer's own screen via PowerShell screencap
      try {
        const file = path.join(CAPTURES_DIR, 'acer-screen-latest.png');
        execSync('powershell.exe -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | Out-Null; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $gfx = [System.Drawing.Graphics]::FromImage($bmp); $gfx.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save(\'' + file.replace(/\//g,'\\') + '\'); $gfx.Dispose(); $bmp.Dispose()"', { timeout: 10000 });
        res.setHeader('Content-Type', 'image/png');
        res.writeHead(200);
        res.end(fs.readFileSync(file));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: 'screencap failed: ' + e.message.slice(0, 100) }));
      }
      return;
    }

    if (url.pathname === '/behcs/screen/falcon') {
      // Falcon screen via ADB
      try {
        const file = path.join(CAPTURES_DIR, 'falcon-screen-latest.png');
        // Try WiFi ADB first, fallback to USB serial
        try { execSync(`"${ADB}" -s 192.168.1.9:5555 exec-out screencap -p > "${file}"`, { timeout: 10000 }); }
        catch (_) { execSync(`"${ADB}" -s R5CXA4MGQXV exec-out screencap -p > "${file}"`, { timeout: 10000 }); }
        res.setHeader('Content-Type', 'image/png');
        res.writeHead(200);
        res.end(fs.readFileSync(file));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: 'falcon screencap failed: ' + e.message.slice(0, 100) }));
      }
      return;
    }

    if (url.pathname === '/behcs/screen/aether') {
      try {
        const file = path.join(CAPTURES_DIR, 'aether-screen-latest.png');
        execSync(`"${ADB}" -s R9QY205KAKJ exec-out screencap -p > "${file}"`, { timeout: 10000 });
        res.setHeader('Content-Type', 'image/png');
        res.writeHead(200);
        res.end(fs.readFileSync(file));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: 'aether screencap failed: ' + e.message.slice(0, 100) }));
      }
      return;
    }

    if (url.pathname === '/behcs/screen/liris') {
      // Liris — would need liris to serve /behcs/screen endpoint
      // For now proxy request
      res.writeHead(501);
      res.end(JSON.stringify({ ok: false, error: 'liris screen endpoint not yet implemented — needs /behcs/screen on liris:4947' }));
      return;
    }

    if (url.pathname === '/behcs/send' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const msg = JSON.parse(body);
          if (!msg.id) msg.id = 'behcs-' + crypto.randomBytes(6).toString('hex');
          if (!msg.ts) msg.ts = new Date().toISOString();
          const remoteMeta = {
            ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
            port: req.socket?.remotePort || 0,
            method: req.method,
            protocol: req.socket?.encrypted ? 'https' : 'http',
          };
          // HOOKWALL GATE
          const gate = hookwallCheck(msg);
          if (!gate.allow) {
            const denied = {
              ...msg,
              received_at: new Date().toISOString(),
              received_by: 'acer-sidecar',
              gated: false,
              gate: 'hookwall',
              denies: gate.denies,
              reflex: 'rejected',
            };
            appendNdjson(INBOX, denied);
            truncateNdjson(INBOX, MAX_INBOX);
            recordCollectorMessage(denied, {
              reason: 'hookwall_deny',
              remoteMeta,
              gateDenied: true,
              reflex: { action: 'rejected', reason: 'hookwall_deny', runInference: false },
            });
            logGnnEdge(denied);
            const gcDenied = scheduleGulp('hookwall_deny');
            res.writeHead(403);
            res.end(JSON.stringify({
              ok: false,
              gate: 'hookwall',
              denies: gate.denies,
              behcs: denied.behcs || null,
              gcScheduled: gcDenied.scheduled,
            }));
            return;
          }
          msg.received_at = new Date().toISOString();
          msg.received_by = 'acer-sidecar';
          msg.gated = true;

          // ═══ REFLEX LAYER (pre-inference, fast) ═══
          const reflex = reflexCheck(msg);
          msg.reflex = reflex.action;

          // ═══ D0 RUNTIME CHAIN (if reflex says run inference) ═══
          let d0result = null;
          if (reflex.runInference) {
            d0result = d0Process(msg, reflex);
            msg.d0 = { verdict: d0result.inferVerdict, tier: d0result.tier, gatePass: d0result.gatePass };
          }

          recordCollectorMessage(msg, {
            reason: 'message_ingest',
            remoteMeta,
            reflex,
            d0result,
          });

          // Log
          appendNdjson(INBOX, msg);
          truncateNdjson(INBOX, MAX_INBOX);
          // Queue for rehydration
          appendNdjson(QUEUE, msg);
          truncateNdjson(QUEUE, MAX_QUEUE);
          // GNN edge
          logGnnEdge(msg);
          // Auto-relay
          relayToLiris(msg);
          relayToFalcon(msg);
          const gcSchedule = scheduleGulp('message_threshold');
          // Console
          if (msg.mode !== 'stealth') {
            const txt = msg.text || msg.payload?.text || JSON.stringify(msg.payload || '').slice(0, 100);
            const d0tag = d0result ? ` [D0:${d0result.inferVerdict}/${d0result.tier}]` : reflex.action !== 'process' ? ` [reflex:${reflex.action}]` : '';
            process.stdout.write(`[BEHCS] ${msg.from}→${msg.to}: ${typeof txt === 'string' ? txt.slice(0, 120) : ''}${d0tag}\n`);
          }
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            received: msg.id,
            gated: true,
            by: 'acer-sidecar',
            d0: d0result ? { verdict: d0result.inferVerdict, tier: d0result.tier } : null,
            reflex: reflex.action,
            behcs: msg.behcs || null,
            gcScheduled: gcSchedule.scheduled,
          }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/behcs/inbox') {
      try {
        const last = parseInt(url.searchParams.get('last') || '20');
        const lines = fs.existsSync(INBOX) ? fs.readFileSync(INBOX, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : [];
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, count: lines.length, messages: lines.slice(-last) }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
      return;
    }

    if (url.pathname === '/behcs/rehydrate') {
      try {
        const lines = fs.existsSync(QUEUE) ? fs.readFileSync(QUEUE, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : [];
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, count: lines.length, messages: lines }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
      return;
    }

    if (url.pathname === '/behcs/flush') {
      if (fs.existsSync(QUEUE)) fs.writeFileSync(QUEUE, '');
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, flushed: true }));
      return;
    }

    if (url.pathname === '/behcs/gc/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(collectorStatus()));
      return;
    }

    if (url.pathname === '/behcs/gc/run' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const payload = body.trim() ? JSON.parse(body) : {};
          const result = await runGulpRehydration({
            force: true,
            reason: payload.reason || url.searchParams.get('reason') || 'manual_http',
          });
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/behcs/devices') {
      // Load live registry if available
      const regPath = path.join(BEHCS_DIR, 'device-registry.json');
      let devicesData = { triad: { acer: 'hub:4947', falcon: 'usb-adb', liris: 'eth:192.168.100.2:4820' }, entities: 453 };
      try { if (fs.existsSync(regPath)) devicesData = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch (_) {}
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, ...devicesData }));
      return;
    }

    // ═══ D0 STATUS — live dimension + agent state ═══
    if (url.pathname === '/behcs/d0') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, ...d0Status() }));
      return;
    }

    // ═══ CURSOR INTENT — accept cursor position updates ═══
    if (url.pathname === '/behcs/cursor' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const pos = JSON.parse(body);
          if (typeof pos.x === 'number' && typeof pos.y === 'number') {
            cursorHistory.push({ x: pos.x, y: pos.y, ts: Date.now() });
            if (cursorHistory.length > MAX_CURSOR_HISTORY) cursorHistory.shift();
            const intent = computeCursorIntent();
            d0log('CURSOR_UPDATE', intent);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, intent }));
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'need x, y' }));
          }
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // ═══ CURSOR INTENT — read current state ═══
    if (url.pathname === '/behcs/cursor' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, intent: computeCursorIntent(), history: cursorHistory.length }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, routes: ['/behcs/health', '/behcs/send', '/behcs/inbox', '/behcs/rehydrate', '/behcs/flush', '/behcs/gc/status', '/behcs/gc/run', '/behcs/devices', '/behcs/d0', '/behcs/cursor'] }));
  });

  server.listen(BUS_PORT, '0.0.0.0', () => {
    console.log(`[BEHCS-SIDECAR] Bus on 0.0.0.0:${BUS_PORT} — hookwall gated, GNN edges, auto-relay`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`[BEHCS-SIDECAR] Port ${BUS_PORT} in use — existing bus running, attaching cron only`);
    }
  });
  return server;
}

// ═══ CRON KICKER — 30s omnicalendar ═══
let cycleCount = 0;

function cronCycle() {
  cycleCount++;
  const ts = new Date().toISOString().slice(11, 19);

  // Ensure ADB tunnels
  if (adbConnected()) ensureTunnels();

  // Screenshot falcon
  if (cycleCount % 2 === 0 && adbConnected()) screenshotFalcon();

  // GC every 10 cycles (5 min)
  if (cycleCount % 10 === 0) {
    truncateNdjson(INBOX, MAX_INBOX);
    truncateNdjson(QUEUE, MAX_QUEUE);
    truncateNdjson(GNN_EDGES, MAX_EDGES);
  }

  // Self-heartbeat to bus
  const hb = {
    from: 'acer-sidecar', to: 'triad', mode: 'shadow', type: 'heartbeat',
    id: 'sidecar-hb-' + cycleCount, ts: new Date().toISOString(),
    payload: { cycle: cycleCount, uptime_s: cycleCount * 30, adb: adbConnected() },
  };
  recordCollectorMessage(hb, {
    reason: 'sidecar_heartbeat',
    remoteMeta: { ip: '127.0.0.1', port: BUS_PORT, method: 'INTERNAL', protocol: 'behcs' },
    reflex: { action: 'absorb', reason: 'heartbeat_reflex', runInference: false },
  });
  appendNdjson(INBOX, hb);
  logGnnEdge(hb);
  truncateNdjson(INBOX, MAX_INBOX);
  scheduleGulp('heartbeat_threshold');

  // D0 heartbeat — monitor all dims + agents
  d0Heartbeat();

  if (cycleCount % 4 === 0) {
    const totalFires = Object.values(dims).reduce((a, d) => a + d.fires, 0);
    const totalWakes = Object.values(agents).reduce((a, ag) => a + ag.wakes, 0);
    console.log(`[SIDECAR] cycle=${cycleCount} adb=${adbConnected()} d0_fires=${totalFires} agent_wakes=${totalWakes} stale=${consecutiveStale}`);
  }
}

// ═══ PID FILE ═══
function writePid() {
  ensureDir(BEHCS_DIR);
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function cleanPid() {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (_) {}
}

// ═══ MAIN ═══
const CLI_ARGS = new Set(process.argv.slice(2));

if (CLI_ARGS.has('--gc-status')) {
  console.log(JSON.stringify(collectorStatus(), null, 2));
} else if (CLI_ARGS.has('--gc-now')) {
  runGulpRehydration({ force: true, reason: 'cli_manual' })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok === false ? 1 : 0);
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exit(1);
    });
} else {
  seedCollectorBuffer();
  console.log('[BEHCS-SIDECAR] Starting — PID ' + process.pid);
  console.log('[BEHCS-SIDECAR] 453 entities, 22350 edges, 47D, 256 glyphs');
  console.log('[BEHCS-SIDECAR] Hookwall on every message. GNN edge per tuple.');
  console.log('[BEHCS-SIDECAR] D0 RUNTIME: 6 dims LIVE, 6 agents LISTENING');
  console.log('[BEHCS-SIDECAR] REFLEX LAYER: pre-inference fast reactions');
  console.log('[BEHCS-SIDECAR] CURSOR INTENT: POST /behcs/cursor {x,y}');
  console.log('[BEHCS-SIDECAR] GC: every 2000 messages → gulp rehydration → omnishannon × GNN.');
  console.log('[BEHCS-SIDECAR] Cron: 30s heartbeat + D0 monitor + ADB watch.');
  console.log('');

  writePid();
  process.on('exit', cleanPid);
  process.on('SIGINT', () => { cleanPid(); process.exit(0); });
  process.on('SIGTERM', () => { cleanPid(); process.exit(0); });

  startBus();
  setInterval(cronCycle, HEARTBEAT_INTERVAL);
  cronCycle();
}
