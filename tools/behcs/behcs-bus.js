#!/usr/bin/env node
/**
 * behcs-bus.js — BEHCS Omnidirectional Message Bus
 *
 * Brown-Edens-Hilbert-Chiqueto-Smith universal device communication.
 * Every device talks to every device. Three modes: real, shadow, stealth.
 *
 * Starts an HTTP server on the device that accepts + sends messages
 * to any other device in the BEHCS registry.
 *
 * Usage:
 *   node tools/behcs/behcs-bus.js                    # start bus on this device
 *   node tools/behcs/behcs-bus.js --send <device> <message>  # send to device
 *   node tools/behcs/behcs-bus.js --health            # check all devices
 *
 * Cube: D34 CROSS_COLONY (2685619) + D26 OMNIDIRECTIONAL (1030301)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { ingressCheck: schemaIngressCheck } = require('./schema-ingress.js');

// Q-003 schema-ingress mode: "observe" (default, log-only), "warn", "reject"
const SCHEMA_INGRESS_MODE = process.env.BEHCS_SCHEMA_INGRESS_MODE || 'observe';

// G-090 staleness surface
const PROCESS_STARTED_AT = new Date().toISOString();
let SOURCE_COMMIT = 'unknown';
try {
  SOURCE_COMMIT = execSync('git -C C:/asolaria-acer rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().slice(0, 12);
} catch { /* not a repo or no git */ }

const ROOT = process.env.BEHCS_ROOT || 'C:/Users/acer/Asolaria';
const BEHCS_DIR = path.join(ROOT, 'data/behcs');
const INBOX = path.join(BEHCS_DIR, 'inbox.ndjson');
const OUTBOX = path.join(BEHCS_DIR, 'outbox.ndjson');
const REGISTRY = path.join(BEHCS_DIR, 'device-registry.json');
const SYMBOL_TABLE = path.join(BEHCS_DIR, 'symbol-table-256.json');

// 2026-04-18 ingress sig-verify — complements Liris's outbound signer.
// Loads the ed25519 registry lazily per-request so acer picks up new
// peer keys without needing a bus restart.
const ED25519_REGISTRY_PATH = process.env.ED25519_REGISTRY || 'C:/asolaria-acer/kernel/ed25519-registry.json';

function loadEd25519Registry() {
  try {
    if (!fs.existsSync(ED25519_REGISTRY_PATH)) return null;
    return JSON.parse(fs.readFileSync(ED25519_REGISTRY_PATH, 'utf-8'));
  } catch { return null; }
}

function rawPubKeyToKeyObject(b64) {
  const raw = Buffer.from(b64, 'base64');
  // SPKI ed25519 wrapper: 302a300506032b6570032100 <32 bytes>
  const header = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.concat([header, raw]);
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

// Returns { verdict: 'VERIFIED'|'REJECTED'|'UNSIGNED', reason, owner_glyph, key_id }
function verifyIngressEnvelope(msg) {
  // Accept two shapes:
  //   (a) top-level { payload, signature: { key_id, sig_b64, alg, signed_at } }  (D-055 SignedEnvelope<T>)
  //   (b) nested body.*_signed_envelope same shape (observed in bilateral reciprocal)
  //   (c) no signature → UNSIGNED (backward compat)
  let envelope = null;
  if (msg && msg.signature && msg.payload) envelope = msg;
  else if (msg && msg.body && typeof msg.body === 'object') {
    for (const k of Object.keys(msg.body)) {
      const v = msg.body[k];
      if (v && typeof v === 'object' && v.signature && v.payload) { envelope = v; break; }
    }
  }
  if (!envelope) return { verdict: 'UNSIGNED' };

  const sig = envelope.signature;
  if (!sig.key_id || !sig.sig_b64) return { verdict: 'REJECTED', reason: 'missing_sig_fields' };
  if (sig.alg && sig.alg !== 'ed25519') return { verdict: 'REJECTED', reason: 'wrong_alg', key_id: sig.key_id };

  const reg = loadEd25519Registry();
  if (!reg) return { verdict: 'REJECTED', reason: 'registry_not_loadable', key_id: sig.key_id };

  const entry = (reg.keys || []).find(k => k.key_id === sig.key_id);
  if (!entry) return { verdict: 'REJECTED', reason: 'key_not_in_registry', key_id: sig.key_id };
  if (entry.rotated_at) return { verdict: 'REJECTED', reason: 'key_rotated_out', key_id: sig.key_id, owner_glyph: entry.owner_glyph };

  try {
    const pub = rawPubKeyToKeyObject(entry.public_key_b64);
    const ok = crypto.verify(null, Buffer.from(JSON.stringify(envelope.payload), 'utf-8'), pub, Buffer.from(sig.sig_b64, 'base64'));
    if (!ok) return { verdict: 'REJECTED', reason: 'signature_mismatch', key_id: sig.key_id, owner_glyph: entry.owner_glyph };
    return { verdict: 'VERIFIED', key_id: sig.key_id, owner_glyph: entry.owner_glyph, host_device: entry.host_device };
  } catch (e) {
    return { verdict: 'REJECTED', reason: 'verify_exception:' + (e.message || String(e)), key_id: sig.key_id };
  }
}

const DEFAULT_PORT = parseInt(process.env.BEHCS_PORT || '4947'); // 47th dim cube-adjacent
const DEVICE_ID = process.env.BEHCS_DEVICE || 'acer';

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// GC-INBOX-SUPERVISOR · PROF PID-H04-A01-W035000000-P035-N00001 · Hilbert room 35
// Symmetric mirror of Liris's 2026-04-20T13:36:13Z patch.
// Policy: view=leader-scroll-last-500 · archive=unlimited · never-delete.
// Every 50 appends on INBOX, if line count > 1000, prune to last 500 and move the rest
// to data/behcs/inbox-archives/inbox-<ts>.ndjson so operators can audit.
const GC_THRESHOLD_LINES = 1000;
const GC_KEEP_LAST = 500;
const GC_CHECK_EVERY = 50;
const GC_ARCHIVE_DIR = path.join(__dirname, '..', '..', 'data', 'behcs', 'inbox-archives');
let GC_APPEND_COUNTER = 0;
let GC_LAST_SWEEP_TS = null;

function gcSweepInbox(inboxPath) {
  try {
    if (!fs.existsSync(inboxPath)) return null;
    const data = fs.readFileSync(inboxPath, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    if (lines.length <= GC_THRESHOLD_LINES) return null;
    ensureDir(GC_ARCHIVE_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(GC_ARCHIVE_DIR, `inbox-${ts}.ndjson`);
    const archived = lines.slice(0, lines.length - GC_KEEP_LAST);
    const kept = lines.slice(-GC_KEEP_LAST);
    // Write archive first, then atomically replace inbox.
    fs.writeFileSync(archivePath, archived.join('\n') + '\n');
    const tmp = inboxPath + '.gc.tmp';
    fs.writeFileSync(tmp, kept.join('\n') + '\n');
    fs.renameSync(tmp, inboxPath);
    GC_LAST_SWEEP_TS = new Date().toISOString();
    const sweep = { archived_count: archived.length, kept_count: kept.length, archive_path: archivePath, swept_at: GC_LAST_SWEEP_TS };
    // Emit EVT-BUS-GC-SWEEP as a new inbox line (so downstream observers see the sweep).
    try {
      fs.appendFileSync(inboxPath, JSON.stringify({
        id: `acer-gc-sweep-${Date.now()}`,
        from: 'acer', to: 'federation', mode: 'real',
        verb: 'EVT-BUS-GC-SWEEP',
        actor: 'acer-gc-inbox-supervisor',
        supervisor_pid: 'PID-H04-A01-W035000000-P035-N00001',
        prof_glyph: 'PROF-GC-INBOX-SUPERVISOR',
        hilbert_hotel_room: 35,
        ts: GC_LAST_SWEEP_TS,
        payload: `acer inbox swept · ${sweep.archived_count} archived · ${sweep.kept_count} kept`,
        body: sweep,
      }) + '\n');
    } catch (_) {}
    return sweep;
  } catch (e) {
    // never let GC failure drop envelopes
    console.error('[gc] sweep error', e.message);
    return null;
  }
}

function appendNdjson(f, obj) {
  ensureDir(path.dirname(f));
  fs.appendFileSync(f, JSON.stringify(obj) + '\n');
  // Symmetric leader-scroll-last-500 GC only on the INBOX file.
  if (typeof INBOX === 'string' && f === INBOX) {
    GC_APPEND_COUNTER = (GC_APPEND_COUNTER + 1) % GC_CHECK_EVERY;
    if (GC_APPEND_COUNTER === 0) gcSweepInbox(f);
  }
}

// ═══════════════════════════════════════════════════════════
// DEVICE REGISTRY — all known devices
// ═══════════════════════════════════════════════════════════

const DEFAULT_REGISTRY = {
  devices: {
    acer: {
      id: 'acer', label: 'Asolaria-acer (Jesse)', role: 'capital',
      endpoints: ['http://192.168.15.189:4947', 'http://localhost:4947'],
      capabilities: ['full_compute', 'dashboard', 'gate_pipeline', 'cube_engine'],
      cube: { D15: 103823, D1: 'jesse' },
    },
    liris: {
      id: 'liris', label: 'Liris-kuromi (Rayssa)', role: 'sub_colony',
      endpoints: ['http://192.168.1.6:4947'],
      capabilities: ['full_compute', 'gslgnn', 'omni_processor'],
      cube: { D15: 103823, D1: 'rayssa' },
    },
    falcon: {
      id: 'falcon', label: 'Falcon S24 FE (Jesse)', role: 'orbital',
      endpoints: ['http://localhost:4947'], // via ADB reverse
      capabilities: ['termux', 'edge_compute', 'screen_capture', 'whatsapp'],
      cube: { D15: 103823, D1: 'jesse' },
      adb_serial: 'R5CXA4MGQXV',
    },
    felipe: {
      id: 'felipe', label: 'Felipe A06 (Smith)', role: 'orbital',
      endpoints: ['http://192.168.1.11:4947'],
      capabilities: ['termux', 'edge_compute'],
      cube: { D15: 103823, D1: 'felipe' },
      adb_serial: 'R9QY205KAKJ',
    },
    beast: {
      id: 'beast', label: 'Beast S22 Ultra (Jesse)', role: 'orbital',
      endpoints: [],
      capabilities: ['mtp_only'],
      cube: { D15: 103823, D1: 'jesse' },
      adb_serial: 'RQCT302BXMA',
      note: 'screen broken, USB MTP only',
    },
    dan: {
      id: 'dan', label: 'Dan Edens (remote)', role: 'collaborator',
      endpoints: ['https://github.com/JesseBrown1980/Asolaria'], // via GitHub
      capabilities: ['github_webhook', 'code_review'],
      cube: { D15: 103823, D1: 'dan' },
    },
  },
};

function loadRegistry() {
  if (fs.existsSync(REGISTRY)) {
    try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (_) {}
  }
  ensureDir(BEHCS_DIR);
  fs.writeFileSync(REGISTRY, JSON.stringify(DEFAULT_REGISTRY, null, 2));
  return DEFAULT_REGISTRY;
}

// ═══════════════════════════════════════════════════════════
// MESSAGE ENVELOPE — cube-addressed, mode-tagged
// ═══════════════════════════════════════════════════════════

function createEnvelope(from, to, payload, options = {}) {
  return {
    id: crypto.randomBytes(16).toString('hex'),
    ts: new Date().toISOString(),
    from,
    to,
    mode: options.mode || 'real', // real | shadow | stealth
    type: options.type || 'message', // message | heartbeat | command | inference | cosign | error
    payload,
    cube: {
      D1_ACTOR: from,
      D3_TARGET: to,
      D7_STATE: 'executing',
      D20_TIME: new Date().toISOString(),
      D26_OMNIDIRECTIONAL: 'bilateral',
      D34_CROSS_COLONY: from === to ? 'local_only' : 'cross_host_lan',
      D38_ENCRYPTION: options.mode === 'stealth' ? 'vault_encrypted' : 'plaintext',
    },
    hash: null, // filled below
  };
}

function hashEnvelope(env) {
  const data = JSON.stringify({ from: env.from, to: env.to, ts: env.ts, payload: env.payload });
  env.hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return env;
}

// ═══════════════════════════════════════════════════════════
// BUS SERVER — receives messages from any device
// ═══════════════════════════════════════════════════════════

function startBus(port) {
  ensureDir(BEHCS_DIR);
  const registry = loadRegistry();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    // Health — harmonized v1 schema (bilateral contract with liris per EVT-AGENT-D-BUS-INSPECT 2026-04-20)
    if (url.pathname === '/behcs/health') {
      let inboxDepth = null;
      try { if (fs.existsSync(INBOX)) inboxDepth = fs.readFileSync(INBOX, 'utf8').split('\n').filter(Boolean).length; } catch (_) {}
      res.writeHead(200);
      res.end(JSON.stringify({
        // required harmonized v1 fields (symmetric with liris sidecar)
        ok: true,
        service: 'acer-bus',
        named_agent: 'acer-bus-behcs-v1',
        host: '0.0.0.0',
        port,
        process_started_at: PROCESS_STARTED_AT,
        uptime_s: Math.round(process.uptime()),
        law_001: [4947, 4950],
        inbox_path: INBOX,
        inbox_depth: inboxDepth,
        hilbert_hotel_room: 35, // PROF-GC-INBOX-SUPERVISOR anchors the bus in the GC wing
        prof_wing_position: 'GC=24, GNN=25, UNISON=26, SUP-DAEMON=27, BUS-MIRROR=28, BUS-AND-KICK=29, GC-INBOX=35, MSG-TRACKER=36, SUPER-GULP=37, GC-GNN-FEEDER=38, FALCON-FRONT-END-KICKER=39',
        cosign: { acer: true, liris: 'expected_via_dual_cosign_protocol' },
        source_commit: SOURCE_COMMIT,
        // optional / legacy fields (kept for acer-internal consumers)
        device: DEVICE_ID,
        bus: 'behcs',
        ts: new Date().toISOString(),
        registry: Object.keys(registry.devices).length + ' devices',
        cube: { D34: 2685619, D26: 1030301 },
        contract_version: 'v1-harmonized-2026-04-20',
      }));
      return;
    }

    // Receive message
    if (url.pathname === '/behcs/send' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const msg = JSON.parse(body);

          // 2026-04-18 ingress sig-verify (D-055 + D-056 + complements liris validator).
          // Stamps msg._sig_check with verdict. REJECTED signatures block ingestion
          // with HTTP 403. UNSIGNED envelopes accepted (backward compat) but tagged.
          const sigCheck = verifyIngressEnvelope(msg);
          msg._sig_check = sigCheck;
          if (sigCheck.verdict === 'REJECTED') {
            const evt = {
              event: 'EVT-INGRESS-SIG-REJECTED',
              ts: new Date().toISOString(),
              reason: sigCheck.reason,
              key_id: sigCheck.key_id || null,
              owner_glyph: sigCheck.owner_glyph || null,
              from: msg.from || msg.actor || null,
              verb: msg.verb || null,
              glyph_sentence: `EVT-INGRESS-SIG-REJECTED · reason=${sigCheck.reason} · key=${sigCheck.key_id || 'none'} @ M-EYEWITNESS .`,
            };
            appendNdjson(path.join(BEHCS_DIR, 'ingress-sig-events.ndjson'), evt);
            console.log('[BEHCS] REJECTED sig:', sigCheck.reason, 'key=' + (sigCheck.key_id || 'none'));
            res.writeHead(403);
            res.end(JSON.stringify({ ok: false, error: 'sig_rejected', reason: sigCheck.reason, key_id: sigCheck.key_id, by: DEVICE_ID }));
            return;
          }
          if (sigCheck.verdict === 'VERIFIED') {
            const evt = {
              event: 'EVT-INGRESS-SIG-VERIFIED',
              ts: new Date().toISOString(),
              key_id: sigCheck.key_id,
              owner_glyph: sigCheck.owner_glyph,
              host_device: sigCheck.host_device,
              from: msg.from || msg.actor || null,
              verb: msg.verb || null,
              glyph_sentence: `EVT-INGRESS-SIG-VERIFIED · key=${sigCheck.key_id} · owner=${sigCheck.owner_glyph} @ M-EYEWITNESS .`,
            };
            appendNdjson(path.join(BEHCS_DIR, 'ingress-sig-events.ndjson'), evt);
            console.log('[BEHCS] VERIFIED sig:', sigCheck.key_id, 'owner=' + sigCheck.owner_glyph);
          }

          // Q-003 schema ingress check — observe-mode logs drift without blocking.
          // Authoritative contracts in packages/schema-contracts; this probe mirrors
          // their shape in plain JS so behcs-bus can measure real-wire compliance.
          try {
            const schemaCheck = schemaIngressCheck(msg, SCHEMA_INGRESS_MODE);
            msg._schema_check = { action: schemaCheck.action, matched: schemaCheck.matched_contract, violations: schemaCheck.violations.length };
            if (schemaCheck.violations.length > 0 || schemaCheck.matched_contract) {
              const evt = {
                event: schemaCheck.violations.length > 0
                  ? (SCHEMA_INGRESS_MODE === 'reject' ? 'EVT-INGRESS-SCHEMA-REJECTED' :
                     SCHEMA_INGRESS_MODE === 'warn' ? 'EVT-INGRESS-SCHEMA-WARNED' : 'EVT-INGRESS-SCHEMA-OBSERVED')
                  : 'EVT-INGRESS-SCHEMA-OK',
                ts: new Date().toISOString(),
                mode: SCHEMA_INGRESS_MODE,
                verb: msg.verb || null,
                matched_contract: schemaCheck.matched_contract,
                violation_count: schemaCheck.violations.length,
                violations: schemaCheck.violations.slice(0, 10),
                from: msg.from || msg.actor || null,
                glyph_sentence: schemaCheck.glyph_sentence,
              };
              appendNdjson(path.join(BEHCS_DIR, 'ingress-schema-events.ndjson'), evt);
              if (schemaCheck.violations.length > 0) {
                console.log('[BEHCS:schema]', schemaCheck.glyph_sentence);
              }
            }
            if (schemaCheck.action === 'reject' && SCHEMA_INGRESS_MODE === 'reject') {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: 'schema_rejected', contract: schemaCheck.matched_contract, violations: schemaCheck.violations, by: DEVICE_ID }));
              return;
            }
          } catch (se) {
            console.log('[BEHCS:schema] shim error:', se.message);
          }

          msg.received_at = new Date().toISOString();
          msg.received_by = DEVICE_ID;

          // Log to inbox
          if (msg.mode === 'stealth') {
            // Stealth: encrypt before logging
            const encrypted = crypto.createHash('sha256').update(JSON.stringify(msg.payload)).digest('hex');
            appendNdjson(INBOX, { ...msg, payload: '[STEALTH:' + encrypted.slice(0, 8) + ']' });
          } else {
            appendNdjson(INBOX, msg);
          }

          // Print to console if real mode
          if (msg.mode === 'real') {
            console.log(`[BEHCS] ${msg.from} → ${msg.to}: ${typeof msg.payload === 'string' ? msg.payload.slice(0, 200) : JSON.stringify(msg.payload).slice(0, 200)}`);
          } else if (msg.mode === 'shadow') {
            console.log(`[BEHCS:shadow] ${msg.from} → ${msg.to}: [shadow message]`);
          }
          // Stealth: no console output

          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, received: msg.id, by: DEVICE_ID, sig_verdict: sigCheck.verdict, sig_owner: sigCheck.owner_glyph || null }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // List inbox
    if (url.pathname === '/behcs/inbox') {
      try {
        // 2026-04-18 fix: honor all filter params (bilateral fix mirroring
        // liris sidecar). Previously only ?mode and ?last were read, so
        // targeted ack-tracking lost messages under heartbeat flood.
        const mode = url.searchParams.get('mode') || 'all';
        const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || url.searchParams.get('last') || '50', 10) || 50), 5000);
        const since = url.searchParams.get('since');
        const actor = url.searchParams.get('actor');
        const verb = url.searchParams.get('verb');
        const target = url.searchParams.get('target');
        const eventId = url.searchParams.get('event_id');
        const fallbackD1 = url.searchParams.get('d1');

        const raw = fs.existsSync(INBOX)
          ? fs.readFileSync(INBOX, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean)
          : [];
        let msgs = mode === 'all' ? raw : raw.filter(l => l.mode === mode);
        if (eventId) {
          msgs = msgs.filter(m => {
            const eid = m.gate_results && m.gate_results.gnn && m.gate_results.gnn.edge && m.gate_results.gnn.edge.eventId;
            return eid === eventId;
          });
        } else {
          if (since) { const s = Date.parse(since); if (!isNaN(s)) msgs = msgs.filter(m => Date.parse(m.received_at || m.ts || '') >= s); }
          if (actor) msgs = msgs.filter(m => m.actor === actor || m.from === actor);
          if (verb) msgs = msgs.filter(m => m.verb === verb);
          if (target) msgs = msgs.filter(m => m.target === target || m.to === target);
          if (fallbackD1) msgs = msgs.filter(m => Array.isArray(m.fallbackTuples) && m.fallbackTuples.includes('D1:' + fallbackD1));
        }

        const tail = msgs.slice(-limit);
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          count: raw.length,
          filtered: msgs.length,
          returned: tail.length,
          filters_applied: { mode, limit, since, actor, verb, target, event_id: eventId, d1: fallbackD1 },
          messages: tail,
        }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // Device registry
    if (url.pathname === '/behcs/devices') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, devices: registry.devices }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'not found', routes: ['/behcs/health', '/behcs/send', '/behcs/inbox', '/behcs/devices'] }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[BEHCS] Bus running on 0.0.0.0:${port} as device=${DEVICE_ID}`);
    console.log(`[BEHCS] Modes: real | shadow | stealth`);
    console.log(`[BEHCS] Devices: ${Object.keys(registry.devices).join(', ')}`);
    console.log(`[BEHCS] Cube: D34 CROSS_COLONY (2685619) + D26 OMNIDIRECTIONAL (1030301)`);
  });

  return server;
}

// ═══════════════════════════════════════════════════════════
// SEND — push message to another device
// ═══════════════════════════════════════════════════════════

function sendMessage(targetDevice, payload, options = {}) {
  const registry = loadRegistry();
  const target = registry.devices[targetDevice];
  if (!target) {
    console.error(`[BEHCS] Unknown device: ${targetDevice}`);
    return Promise.resolve({ ok: false, error: 'unknown device' });
  }
  if (!target.endpoints || target.endpoints.length === 0) {
    console.error(`[BEHCS] No endpoints for device: ${targetDevice}`);
    return Promise.resolve({ ok: false, error: 'no endpoints' });
  }

  const env = hashEnvelope(createEnvelope(DEVICE_ID, targetDevice, payload, options));

  // Log to outbox
  appendNdjson(OUTBOX, env);

  // Try each endpoint
  const endpoint = target.endpoints[0];
  const url = new URL('/behcs/send', endpoint);
  const data = JSON.stringify(env);

  return new Promise((resolve) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false, error: body }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK — ping all devices
// ═══════════════════════════════════════════════════════════

async function healthCheck() {
  const registry = loadRegistry();
  const results = {};
  for (const [id, device] of Object.entries(registry.devices)) {
    if (!device.endpoints || device.endpoints.length === 0) {
      results[id] = { ok: false, reason: 'no endpoints' };
      continue;
    }
    for (const ep of device.endpoints) {
      try {
        const url = new URL('/behcs/health', ep);
        const res = await new Promise((resolve) => {
          const req = http.get(url, (r) => {
            let body = '';
            r.on('data', c => body += c);
            r.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false }); } });
          });
          req.on('error', () => resolve({ ok: false }));
          req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
        });
        results[id] = res;
        break; // first successful endpoint wins
      } catch (_) {
        results[id] = { ok: false };
      }
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--health')) {
    const results = await healthCheck();
    console.log('[BEHCS] Device Health:');
    for (const [id, res] of Object.entries(results)) {
      console.log(`  ${id}: ${res.ok ? 'ALIVE' : 'DEAD'} ${res.error || ''}`);
    }
    return;
  }

  if (args.includes('--send')) {
    const idx = args.indexOf('--send');
    const target = args[idx + 1];
    const message = args.slice(idx + 2).join(' ');
    if (!target || !message) {
      console.error('Usage: --send <device> <message>');
      process.exit(1);
    }
    const mode = args.includes('--shadow') ? 'shadow' : (args.includes('--stealth') ? 'stealth' : 'real');
    const result = await sendMessage(target, message, { mode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Default: start bus
  startBus(DEFAULT_PORT);
}

main().catch(e => console.error('FATAL:', e.message));

module.exports = { startBus, sendMessage, healthCheck, createEnvelope, loadRegistry };
