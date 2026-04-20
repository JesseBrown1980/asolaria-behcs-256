#!/usr/bin/env node
/**
 * omnicalendar-visual-loop.js — 30s visual confirmation cron.
 *
 * Every 30 seconds:
 *   1. Screenshot the other agent's screen via ADB
 *   2. Check BEHCS bus for heartbeat (is agent alive?)
 *   3. If hung: ESC → type BEHCS command → enter
 *   4. If ESC fails: restart terminal
 *   5. Log everything as BEHCS visual confirmation tuple
 *
 * Cube: D44 HEARTBEAT (7189057) + D47 BOUNDARY (9393931)
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ADB = 'C:/Users/acer/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb';
const CAPTURES_DIR = 'C:/Users/acer/Asolaria/logs/captures/omnicalendar';
const BEHCS_PORT = 4947;
const INTERVAL_MS = 30000;

let codex;
try { codex = require('./codex-bridge'); } catch (_) { codex = { hilbertAddress: k => k }; }

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ═══ ADB helpers ═══
const FALCON_SERIAL = 'R5CXA4MGQXV';
function adbRun(cmd) {
  try { return { ok: true, out: execSync(`"${ADB}" -s ${FALCON_SERIAL} ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim() }; }
  catch (e) { return { ok: false, error: e.message.slice(0, 100) }; }
}

function isDeviceConnected() {
  try {
    const out = execSync(`"${ADB}" -s ${FALCON_SERIAL} get-state`, { encoding: 'utf8', timeout: 5000 }).trim();
    return out === 'device';
  } catch (_) { return false; }
}

function screenshot() {
  ensureDir(CAPTURES_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '');
  const file = path.join(CAPTURES_DIR, `falcon-${ts}.png`);
  try {
    execSync(`"${ADB}" -s ${FALCON_SERIAL} exec-out screencap -p > "${file}"`, { timeout: 10000 });
    const stat = fs.statSync(file);
    return { ok: true, file, bytes: stat.size, ts };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 100) };
  }
}

function pressEsc() { return adbRun('shell input keyevent 111'); }
function pressEnter() { return adbRun('shell input keyevent 66'); }
function typeText(text) {
  const escaped = text.replace(/ /g, '%s').replace(/[&|;<>()$`\\!"']/g, '');
  return adbRun(`shell input text "${escaped}"`);
}

function restartTermux() {
  adbRun('shell am force-stop com.termux');
  return adbRun('shell am start -n com.termux/.HomeActivity');
}

// ═══ BEHCS bus helpers ═══
function checkBusHeartbeat() {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${BEHCS_PORT}/behcs/inbox?last=3`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const falconMsgs = j.messages.filter(m => m.from === 'falcon');
          if (falconMsgs.length === 0) return resolve({ alive: false, reason: 'no falcon messages' });
          const last = falconMsgs[falconMsgs.length - 1];
          const age = Date.now() - new Date(last.received_at || last.ts || 0).getTime();
          resolve({ alive: age < 120000, age_ms: age, last_ts: last.received_at || last.ts });
        } catch (_) { resolve({ alive: false, reason: 'parse error' }); }
      });
    }).on('error', () => resolve({ alive: false, reason: 'bus unreachable' }));
  });
}

function logToBus(assessment) {
  const env = JSON.stringify({
    from: 'asolaria', to: 'falcon', mode: 'shadow', type: 'visual_confirmation',
    id: 'vc-' + crypto.randomBytes(6).toString('hex'),
    ts: new Date().toISOString(),
    hilbert: codex.hilbertAddress('visual-confirmation-' + Date.now()),
    payload: assessment,
    cube: { D44: 7189057, D47: 9393931, D36: 3442951 },
  });
  const req = http.request({
    hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(env) },
  });
  req.on('error', () => {});
  req.write(env);
  req.end();
}

// ═══ Rebind tunnels if needed ═══
function ensureTunnels() {
  const list = adbRun('reverse --list');
  if (!list.ok || !list.out.includes('4947')) {
    adbRun('reverse tcp:4947 tcp:4947');
    adbRun('reverse tcp:4913 tcp:4913');
    adbRun('reverse tcp:4781 tcp:4781');
    return 'rebound';
  }
  return 'intact';
}

// ═══ Main 30s cycle ═══
let cycleCount = 0;
let lastAction = 'none';
let consecutiveHangs = 0;

async function cycle() {
  cycleCount++;
  const ts = new Date().toISOString().slice(11, 19);

  // Step 0: Check device
  if (!isDeviceConnected()) {
    console.log(`[${ts}] #${cycleCount} DEVICE OFFLINE — skipping`);
    logToBus({ status: 'device_offline', cycle: cycleCount });
    return;
  }

  // Step 0.5: Ensure tunnels
  const tunnelStatus = ensureTunnels();

  // Step 1: Screenshot
  const cap = screenshot();

  // Step 2: Check heartbeat
  const hb = await checkBusHeartbeat();

  // Step 3: Assess
  let status;
  if (hb.alive && hb.age_ms < 60000) {
    status = 'working';
    consecutiveHangs = 0;
  } else if (hb.alive && hb.age_ms < 120000) {
    status = 'waiting';
    consecutiveHangs = 0;
  } else {
    status = 'hung';
    consecutiveHangs++;
  }

  // BEHCS-LAW-007: boss checks not blind kicks
  // Screenshot FIRST, assess, then decide
  // Never ESC. Nudge via bus after 3+ hangs. Type to screen after 5+.
  const action = status === 'working' ? 'observe' :
                 status === 'waiting' ? 'observe' :
                 consecutiveHangs <= 3 ? 'observe' :
                 consecutiveHangs <= 5 ? 'nudge_bus' : 'nudge_screen';

  // Step 4: Act like a boss — look first, then decide
  if (action === 'nudge_bus') {
    // Gentle: bus only, no screen touch
    logToBus({ verb: 'behcs.boss_check', text: 'Falcon silent ' + (consecutiveHangs * 30) + 's. Screenshot taken. Bus nudge sent.', consecutiveHangs });
  } else if (action === 'nudge_screen') {
    // Firm: type to screen (NOT ESC, just a message)
    typeText('BEHCS%sboss%scheck.%sYou%shave%sbeen%ssilent%s' + (consecutiveHangs * 30) + 's.%sRespond%sor%ssend%sworking%stuple.');
    pressEnter();
    logToBus({ verb: 'behcs.boss_kick', text: 'Typed to screen after ' + (consecutiveHangs * 30) + 's silence', consecutiveHangs });
    consecutiveHangs = 0;
  } else if (action === 'DISABLED_restart') {
    console.log(`[${ts}] #${cycleCount} RESTARTING TERMUX — ${consecutiveHangs} consecutive hangs`);
    restartTermux();
    consecutiveHangs = 0;
  }

  lastAction = action;

  // Step 5: Log
  const assessment = {
    cycle: cycleCount,
    status,
    action,
    tunnels: tunnelStatus,
    heartbeat: { alive: hb.alive, age_ms: hb.age_ms },
    screenshot: cap.ok ? { file: cap.file, bytes: cap.bytes } : { error: cap.error },
    consecutiveHangs,
  };

  logToBus(assessment);

  const icon = { observe: '👁', nudge: '📢', unstick: '🔧', restart: '🔄' }[action] || '?';
  console.log(`[${ts}] #${cycleCount} ${icon} ${status} → ${action} | hb_age=${hb.age_ms ? Math.round(hb.age_ms / 1000) + 's' : '?'} | tunnels=${tunnelStatus} | cap=${cap.ok ? cap.bytes + 'B' : 'fail'}`);

  // ═══ GARBAGE COLLECTION — prevent infinite memory/disk growth ═══

  // GC screenshots (keep last 20, ~6MB cap)
  try {
    const files = fs.readdirSync(CAPTURES_DIR).filter(f => f.startsWith('falcon-')).sort();
    if (files.length > 20) {
      for (const f of files.slice(0, files.length - 20)) {
        fs.unlinkSync(path.join(CAPTURES_DIR, f));
      }
    }
  } catch (_) {}

  // GC BEHCS inbox (keep last 200 lines, truncate the rest)
  if (cycleCount % 10 === 0) { // every 5 minutes
    try {
      const inboxPath = path.join('C:/Users/acer/Asolaria/data/behcs/inbox.ndjson');
      if (fs.existsSync(inboxPath)) {
        const lines = fs.readFileSync(inboxPath, 'utf8').split('\n').filter(l => l.trim());
        if (lines.length > 200) {
          fs.writeFileSync(inboxPath, lines.slice(-200).join('\n') + '\n');
          console.log(`[GC] inbox truncated ${lines.length} → 200`);
        }
      }
    } catch (_) {}
  }

  // GC BEHCS outbox (keep last 100)
  if (cycleCount % 10 === 0) {
    try {
      const outboxPath = path.join('C:/Users/acer/Asolaria/data/behcs/outbox.ndjson');
      if (fs.existsSync(outboxPath)) {
        const lines = fs.readFileSync(outboxPath, 'utf8').split('\n').filter(l => l.trim());
        if (lines.length > 100) {
          fs.writeFileSync(outboxPath, lines.slice(-100).join('\n') + '\n');
          console.log(`[GC] outbox truncated ${lines.length} → 100`);
        }
      }
    } catch (_) {}
  }

  // GC heal/cycle/vote logs (keep last 10 per dir)
  if (cycleCount % 20 === 0) { // every 10 minutes
    for (const dir of ['data/heal-runs', 'data/cycles', 'data/intersection-cube']) {
      try {
        const fullDir = path.join('C:/Users/acer/Asolaria', dir);
        if (!fs.existsSync(fullDir)) continue;
        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.json')).sort();
        if (files.length > 10) {
          for (const f of files.slice(0, files.length - 10)) {
            fs.unlinkSync(path.join(fullDir, f));
          }
          console.log(`[GC] ${dir} pruned to 10 files`);
        }
      } catch (_) {}
    }
  }

  // GC vote directories (keep last 10)
  if (cycleCount % 20 === 0) {
    try {
      const votesDir = 'C:/Users/acer/Asolaria/data/votes';
      if (fs.existsSync(votesDir)) {
        const dirs = fs.readdirSync(votesDir).filter(d => fs.statSync(path.join(votesDir, d)).isDirectory()).sort();
        if (dirs.length > 10) {
          for (const d of dirs.slice(0, dirs.length - 10)) {
            fs.rmSync(path.join(votesDir, d), { recursive: true, force: true });
          }
          console.log(`[GC] votes pruned to 10 dirs`);
        }
      }
    } catch (_) {}
  }

  // Force Node GC hint every 60 cycles (30 minutes)
  if (cycleCount % 60 === 0 && global.gc) {
    global.gc();
    console.log(`[GC] node gc() forced at cycle ${cycleCount}`);
  }
}

// ═══ Start ═══
console.log('[omnicalendar] BEHCS 30s visual confirmation loop starting');
console.log(`[omnicalendar] Device: Falcon (${ADB})`);
console.log(`[omnicalendar] Interval: ${INTERVAL_MS}ms`);
console.log(`[omnicalendar] Captures: ${CAPTURES_DIR}`);
console.log(`[omnicalendar] Escalation: observe → nudge → unstick (ESC) → restart`);
console.log(`[omnicalendar] Hilbert: ${codex.hilbertAddress('omnicalendar-visual-loop')}`);
console.log('');

cycle();
setInterval(cycle, INTERVAL_MS);
