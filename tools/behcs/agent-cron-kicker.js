#!/usr/bin/env node
/**
 * agent-cron-kicker.js — BEHCS 256-glyph named agent cron loop
 *
 * Fires all named agents on interval through :4947 bus.
 * Each kick is glyph-encoded via codex-bridge (IX-700).
 * D0 runtime consumes kicks as INFER events.
 *
 * Targets: NovaLUM, EBACMap, Liris, Phone/Falcon, Encryption, QDD
 *
 * Usage:
 *   node tools/behcs/agent-cron-kicker.js           # default 5m interval
 *   node tools/behcs/agent-cron-kicker.js --once     # single kick + report
 *   node tools/behcs/agent-cron-kicker.js --interval 120000  # custom interval
 *
 * Cube: D24 INTENT (89³=704969) + D7 STATE (17³=4913)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const sovereignty = require('../../ix/verbs/sovereignty');

const ROOT = 'C:/Users/acer/Asolaria';
const BEHCS_PORT = 4947;
const D_DEST = 'D:/safety-backups/session-20260412';
const KICK_LOG = path.join(ROOT, 'data/behcs/d0-runtime/cron-kicks.ndjson');

let codex;
try { codex = require('./codex-bridge'); } catch (e) {
  console.error('[cron] codex-bridge failed:', e.message);
  process.exit(1);
}

const now = () => new Date().toISOString();
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function appendNdjson(f, obj) { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(obj) + '\n'); }

async function runSovereigntyVerb(name, args = {}, permissionTier = 'operator') {
  const verb = sovereignty[name];
  if (typeof verb !== 'function') {
    return { ok: false, error: `unknown_verb:${name}` };
  }
  return verb(args, {
    pid: 'asolaria-cron-kicker',
    host: os.hostname(),
    permissionTier,
    sessionId: `cron-${Date.now()}`,
  });
}

// ═══════════════════════════════════════════════════════════
// NAMED AGENT REGISTRY
// ═══════════════════════════════════════════════════════════

const AGENTS = [
  {
    id: 'jbd.novalum-bridge',
    target: 'novalum-device-COM10',
    cube: 'D15_DEVICE',
    focus: 'NovaLUM serial bridge + encryption audit + adapter health',
    checks: () => {
      // Check if COM10 exists
      try { const r = execSync('powershell -c "Get-WmiObject Win32_SerialPort | Select-Object DeviceID" 2>$null', { timeout: 5000 }).toString(); return r.includes('COM') ? 'COM_FOUND' : 'NO_COM'; } catch (_) { return 'CHECK_FAILED'; }
    },
  },
  {
    id: 'jbd.ebacmap-runtime',
    target: 'ebacmap-qdd-codebase',
    cube: 'D5_LAYER',
    focus: 'EBACMap modernization + route wiring + QDD deliverables',
    checks: () => 'READY',
  },
  {
    id: 'jbd.qdd-deliverable',
    target: 'qdd-master-plan',
    cube: 'D2_VERB',
    focus: 'QDD campaign top-6 candidates + budget + schedule',
    checks: () => {
      const plan = path.join(ROOT, 'reports/qdd-modernization/qdd-master-plan-20260406.md');
      return fs.existsSync(plan) ? 'PLAN_EXISTS' : 'NO_PLAN';
    },
  },
  {
    id: 'jbd.slack-with-natalie-brian',
    target: 'slack-comms-drafts',
    cube: 'D22_TRANSLATION',
    focus: 'Draft prep ONLY — HD-2 hard-deny on send. Jesse visual review required.',
    checks: () => 'HD2_ENFORCED',
  },
  {
    id: 'jbd.novalum.shannon-conductor',
    target: 'novalum-encryption-layer',
    cube: 'D11_PROOF',
    focus: 'NovaLUM encryption analysis + vault + 12-part shannon consensus',
    checks: () => {
      const vault = path.join(ROOT, 'data/vault');
      return fs.existsSync(vault) ? 'VAULT_EXISTS' : 'NO_VAULT';
    },
  },
  {
    id: 'liris-federation-relay',
    target: 'liris-sidecar-4947',
    cube: 'D23_FEDERATION',
    focus: 'Bilateral federation + D0 sync + PR merge + cube hydration',
    checks: () => {
      try {
        const r = execSync('curl -s --connect-timeout 3 http://192.168.100.2:4947/behcs/health 2>&1', { timeout: 5000 }).toString();
        return r.includes('"ok":true') ? 'LIRIS_ALIVE' : 'LIRIS_DOWN';
      } catch (_) { return 'LIRIS_UNREACHABLE'; }
    },
    act: async (check) => {
      if (check === 'LIRIS_ALIVE') {
        const relay = await runSovereigntyVerb('behcs_bus_relay', {
          to: 'liris',
          text: 'cron-kick: check inbox + process pending messages + emit heartbeat back',
          focus: 'federation-heartbeat',
        });
        return relay.ok ? 'RELAYED_TO_LIRIS' : `RELAY_FAILED:${relay.error || 'unknown'}`;
      }
      return 'LIRIS_DOWN_SKIP';
    },
  },
  {
    id: 'phone-falcon-interface',
    target: 'falcon-adb-tunnel',
    cube: 'D15_DEVICE',
    focus: 'Falcon ADB reconnect + tunnel repair + Aether dashboard',
    checks: async () => {
      const scan = await runSovereigntyVerb('aerial_cidr_scan', {
        includeUnknown: false,
        candidates: [
          { name: 'falcon', address: '192.168.1.9:5555' },
          { name: 'felipe', address: '192.168.1.10:5555' },
        ],
      });
      if (!scan.ok) return 'AERIAL_SCAN_FAILED';
      if (scan.counts.connected > 0) return `AERIAL_${scan.counts.connected}_${scan.counts.candidates}`;
      if (scan.counts.active > 0) return `ADB_ACTIVE_${scan.counts.active}`;
      return 'NO_AERIAL_DEVICES';
    },
    act: async (check) => {
      const actions = [];
      const fleet = await runSovereigntyVerb('phone_fleet_scan', { alias: 'cron-phone-fleet' });
      if (fleet.ok) {
        actions.push(`FLEET_${fleet.manifest?.counts?.adbDevices ?? 0}`);
      }
      try {
        // Try reconnect Falcon WiFi ADB if missing
        const devices = execSync('adb devices 2>&1', { timeout: 5000 }).toString();
        if (!devices.includes('192.168.1.9')) {
          try { execSync('adb connect 192.168.1.9:5555 2>&1', { timeout: 8000 }); actions.push('FALCON_RECONNECT_ATTEMPTED'); } catch (_) { actions.push('FALCON_RECONNECT_FAILED'); }
        }
        // Set ADB reverse on Felipe if connected
        if (devices.includes('R9QY205KAKJ')) {
          try { execSync('adb -s R9QY205KAKJ reverse tcp:4948 tcp:4947 2>&1', { timeout: 5000 }); actions.push('FELIPE_REVERSE_SET'); } catch (_) {}
          // Check if micro-agent is running on Felipe
          try {
            const ps = execSync('adb -s R9QY205KAKJ shell "ps -A 2>/dev/null | grep python" 2>&1', { timeout: 5000 }).toString();
            if (ps.includes('python')) { actions.push('FELIPE_AGENT_ALIVE'); }
            else {
              // Restart micro-agent via Termux
              execSync('adb -s R9QY205KAKJ shell "am start -n com.termux/.HomeActivity" 2>&1', { timeout: 5000 });
              execSync('adb -s R9QY205KAKJ shell "input text \'python3 /storage/emulated/0/Asolaria/micro-agent-behcs.py &\' && input keyevent 66" 2>&1', { timeout: 8000 });
              actions.push('FELIPE_AGENT_RESTARTED');
            }
          } catch (_) { actions.push('FELIPE_PS_CHECK_FAILED'); }
        }
      } catch (_) { actions.push('ACT_ERROR'); }
      if (check !== 'NO_AERIAL_DEVICES' && check !== 'AERIAL_SCAN_FAILED') {
        const relay = await runSovereigntyVerb('behcs_bus_relay', {
          to: 'falcon',
          text: 'cron-kick: check inbox + process pending messages + emit heartbeat back',
          focus: 'phone-heartbeat',
        });
        actions.push(relay.ok ? 'RELAYED_TO_FALCON' : 'FALCON_RELAY_FAILED');
      }
      return actions.join('+') || 'NO_ACTION';
    },
  },
];

// ═══════════════════════════════════════════════════════════
// BEHCS SEND
// ═══════════════════════════════════════════════════════════

function sendBehcs(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'bus_unreachable' }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// KICK ALL AGENTS
// ═══════════════════════════════════════════════════════════

async function kickAll(cycle) {
  const ts = now();
  const results = [];
  const registryUpdate = await runSovereigntyVerb('device_registry_update', {
    source: 'cron-kicker',
    dryRun: false,
  });

  for (const agent of AGENTS) {
    const checkResult = await Promise.resolve(agent.checks());
    const glyph = codex.hilbertAddress(agent.id);
    const kickGlyph = codex.hilbertAddress(agent.id + ':' + ts);

    const envelope = {
      from: 'asolaria-cron-kicker',
      to: 'triad',
      mode: 'real',
      type: 'agent_cron_kick',
      id: `kick-${agent.id}-c${cycle}-${Date.now()}`,
      ts,
      tuple: `(asolaria,behcs.agent.cron_kick,${agent.target},0,colony,hookwall,kicking,[${agent.cube}+256GLYPH],cron,LX,signed,session,behcs-bus,heavy)`,
      payload: {
        verb: 'behcs.agent.cron_kick',
        agent_id: agent.id,
        target: agent.target,
        focus: agent.focus,
        glyph, kickGlyph,
        cube: agent.cube,
        check: checkResult,
        cycle,
        status: 'KICKED',
      },
      cube: { D0_RUNTIME: true, D44_HEARTBEAT: 7189057, AGENT_KICK: true },
    };

    // ACTUALLY DO WORK — not just monitor
    let actResult = 'NO_ACT_FN';
    if (agent.act) {
      try { actResult = await Promise.resolve(agent.act(checkResult)); } catch (e) { actResult = 'ACT_ERROR:' + e.message.slice(0, 50); }
    }
    envelope.payload.actResult = actResult;

    const busResult = await sendBehcs(envelope);
    const ok = busResult.ok === true;
    results.push({ id: agent.id, glyph, check: checkResult, gated: ok, acted: actResult });
  }

  // Log kick
  const kickEntry = {
    ts,
    cycle,
    agents: results.length,
    registryUpdated: Array.isArray(registryUpdate.updated) ? registryUpdate.updated.length : 0,
    results: results.map(r => ({ id: r.id, check: r.check, gated: r.gated, acted: r.acted })),
  };
  appendNdjson(KICK_LOG, kickEntry);

  return results;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const intervalIdx = args.indexOf('--interval');
  const intervalMs = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) : 300000; // default 5m

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  BEHCS AGENT CRON KICKER — 256-GLYPH ENCODED');
  console.log(`  Agents: ${AGENTS.length}  Interval: ${intervalMs / 1000}s  Mode: ${once ? 'ONCE' : 'PERSISTENT'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  let cycle = 0;

  async function tick() {
    cycle++;
    const results = await kickAll(cycle);
    const alive = results.filter(r => r.gated).length;
    const checks = results.map(r => `${r.check}`).join(' ');

    console.log(`[cron] cycle #${cycle} — ${alive}/${results.length} kicked  checks: ${checks}`);
    for (const r of results) {
      const mark = r.gated ? '✓' : '✗';
      console.log(`  ${mark} ${r.glyph}  ${r.id.padEnd(38)} check=${r.check}  act=${r.acted || 'NONE'}`);
    }
  }

  await tick();

  if (once) {
    console.log('\n  --once mode. Exiting.');
    return;
  }

  console.log(`\n[cron] Persistent loop. Kicking every ${intervalMs / 1000}s. Ctrl-C to stop.`);

  const loop = setInterval(tick, intervalMs);

  process.on('SIGINT', () => {
    clearInterval(loop);
    console.log(`\n[cron] Stopped after ${cycle} cycles.`);
    process.exit(0);
  });
}

main().catch(e => { console.error('[cron] FATAL:', e); process.exit(1); });
