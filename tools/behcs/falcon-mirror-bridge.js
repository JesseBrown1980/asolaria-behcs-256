#!/usr/bin/env node
/**
 * falcon-mirror-bridge.js — Talk to Falcon using the BEHCS language.
 *
 * Uses ADB to type BEHCS-encoded messages directly to Falcon's screen,
 * and reads Falcon's responses via the BEHCS bus.
 *
 * The OLD mirror: acer sends raw ADB input text commands
 * The NEW mirror: acer sends BEHCS-encoded tuples through the bus,
 * and falls back to ADB screen typing when the bus is down.
 *
 * Three modes:
 *   real   — message appears on Falcon's screen + BEHCS bus
 *   shadow — BEHCS bus only, no screen output
 *   stealth — encrypted, BEHCS bus only, vault-logged
 *
 * Usage:
 *   node falcon-mirror-bridge.js --send "hello falcon"
 *   node falcon-mirror-bridge.js --send "hello" --mode shadow
 *   node falcon-mirror-bridge.js --tuple "(asolaria, behcs.command, falcon, ...)"
 *   node falcon-mirror-bridge.js --listen    # watch for Falcon messages
 *   node falcon-mirror-bridge.js --status    # check all channels
 */

'use strict';

const { execSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

const ADB = 'C:/Users/acer/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe/platform-tools/adb';
const BEHCS_PORT = 4947;
const codex = require('./codex-bridge');

// ═══════════════════════════════════════════════════════════
// ADB CHANNEL — type directly to Falcon's screen
// ═══════════════════════════════════════════════════════════

function adbAvailable() {
  try {
    const out = execSync(`"${ADB}" devices`, { encoding: 'utf8', timeout: 5000 });
    return out.includes('device') && !out.includes('offline');
  } catch (_) { return false; }
}

function adbType(text) {
  // ADB input text escapes: replace spaces with %s, special chars
  const escaped = text.replace(/ /g, '%s').replace(/[&|;<>()$`\\!"']/g, '');
  try {
    execSync(`"${ADB}" shell input text "${escaped}"`, { timeout: 10000 });
    return { ok: true, channel: 'adb-screen' };
  } catch (e) {
    return { ok: false, channel: 'adb-screen', error: e.message.slice(0, 100) };
  }
}

function adbKey(keycode) {
  try {
    execSync(`"${ADB}" shell input keyevent ${keycode}`, { timeout: 5000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 100) };
  }
}

function adbTap(x, y) {
  try {
    execSync(`"${ADB}" shell input tap ${x} ${y}`, { timeout: 5000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 100) };
  }
}

// ═══════════════════════════════════════════════════════════
// BEHCS BUS CHANNEL — send via omnidirectional bus
// ═══════════════════════════════════════════════════════════

function sendViaBus(payload, mode) {
  return new Promise((resolve) => {
    const env = {
      from: 'asolaria',
      to: 'falcon',
      mode: mode || 'real',
      type: 'command',
      ts: new Date().toISOString(),
      id: 'asolaria-' + crypto.randomBytes(8).toString('hex'),
      hilbert_from: codex.hilbertAddress('asolaria'),
      hilbert_to: codex.hilbertAddress('falcon'),
      payload,
    };
    const data = JSON.stringify(env);
    const req = http.request({
      hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false, error: body }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// BEHCS ENCODED MESSAGE — the new way to talk
// ═══════════════════════════════════════════════════════════

function encodeBehcsMessage(text, verb) {
  verb = verb || 'behcs.message';
  const tuple = [
    'asolaria',           // D1 ACTOR
    verb,                 // D2 VERB
    'falcon',             // D3 TARGET
    1,                    // D4 RISK
    'civilization',       // D5 LAYER
    'hookwall+gnn',       // D6 GATE
    'delivering',         // D7 STATE
    '[]',                 // D8 CHAIN
    'relay',              // D9 WAVE
    'IX',                 // D10 DIALECT
    'signed',             // D11 PROOF
    'session',            // D12 SCOPE
    'behcs-bus-4947',     // D13 SURFACE
    'light',              // D14 ENERGY
  ];

  return {
    verb,
    text,
    tuple_short: `(${tuple.join(', ')})`,
    hilbert_from: codex.hilbertAddress('asolaria'),
    hilbert_to: codex.hilbertAddress('falcon'),
    hilbert_verb: codex.hilbertAddress(verb),
    ts: new Date().toISOString(),
    behcs_spec: 'IX-700',
  };
}

// ═══════════════════════════════════════════════════════════
// OMNIDIRECTIONAL SEND — bus + ADB screen, mode-aware
// ═══════════════════════════════════════════════════════════

async function send(text, options) {
  options = options || {};
  const mode = options.mode || 'real';
  const verb = options.verb || 'behcs.message';
  const results = { bus: null, adb: null, mode };

  // Encode in BEHCS
  const msg = encodeBehcsMessage(text, verb);

  // Send via BEHCS bus (always, all modes)
  results.bus = await sendViaBus(msg, mode);

  // In real mode, also type to Falcon's screen via ADB
  if (mode === 'real' && adbAvailable()) {
    // Type plain text to screen (ADB can't handle Unicode glyphs)
    results.adb = adbType(text);
    // Press enter to submit
    adbKey(66); // KEYCODE_ENTER
  }

  return { ok: results.bus?.ok || results.adb?.ok, ...results, message: msg };
}

// ═══════════════════════════════════════════════════════════
// LISTEN — watch the BEHCS bus inbox for Falcon messages
// ═══════════════════════════════════════════════════════════

async function listen() {
  let lastCount = 0;
  console.log('[falcon-mirror] Listening for Falcon messages on BEHCS bus...');
  console.log(`[falcon-mirror] Asolaria: ${codex.hilbertAddress('asolaria')}`);
  console.log(`[falcon-mirror] Falcon:   ${codex.hilbertAddress('falcon')}`);
  console.log('');

  setInterval(async () => {
    try {
      const res = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${BEHCS_PORT}/behcs/inbox?last=5`, (r) => {
          let body = '';
          r.on('data', c => body += c);
          r.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
        }).on('error', () => resolve(null));
      });
      if (res && res.count > lastCount) {
        const newMsgs = res.messages.filter(m => m.from === 'falcon');
        for (const m of newMsgs) {
          const text = m.text || m.payload || JSON.stringify(m).slice(0, 200);
          console.log(`[${m.received_at?.slice(11, 19) || '??'}] falcon → asolaria: ${typeof text === 'string' ? text.slice(0, 300) : JSON.stringify(text).slice(0, 300)}`);
        }
        lastCount = res.count;
      }
    } catch (_) {}
  }, 2000);
}

// ═══════════════════════════════════════════════════════════
// STATUS — check all channels
// ═══════════════════════════════════════════════════════════

async function status() {
  console.log('[falcon-mirror] Channel Status:');
  console.log(`  ADB: ${adbAvailable() ? 'CONNECTED' : 'DISCONNECTED'}`);

  try {
    const busHealth = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${BEHCS_PORT}/behcs/health`, (r) => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
      }).on('error', () => resolve(null));
    });
    console.log(`  BEHCS Bus: ${busHealth?.ok ? 'ALIVE' : 'DEAD'}`);
  } catch (_) { console.log('  BEHCS Bus: DEAD'); }

  console.log(`  Codex: ${codex.context.ok ? 'LOADED' : 'FAILED'} (${codex.context.cubes_loaded} cubes, ${codex.context.catalog_count} catalogs)`);
  console.log(`  Hilbert:`);
  console.log(`    asolaria → ${codex.hilbertAddress('asolaria')}`);
  console.log(`    falcon   → ${codex.hilbertAddress('falcon')}`);
  console.log(`    BEHCS    → ${codex.hilbertAddress('BEHCS')}`);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    await status();
  } else if (args.includes('--listen')) {
    await listen();
  } else if (args.includes('--send')) {
    const idx = args.indexOf('--send');
    const text = args.slice(idx + 1).filter(a => !a.startsWith('--')).join(' ');
    const mode = args.includes('--shadow') ? 'shadow' : (args.includes('--stealth') ? 'stealth' : 'real');
    const verb = args.find(a => a.startsWith('--verb='))?.split('=')[1] || 'behcs.message';
    if (!text) { console.error('Usage: --send <message> [--shadow|--stealth] [--verb=X]'); process.exit(1); }
    const result = await send(text, { mode, verb });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage:');
    console.log('  --send <message>    Send to Falcon (real mode = bus + screen)');
    console.log('  --send <msg> --shadow   Bus only, no screen');
    console.log('  --send <msg> --stealth  Encrypted, vault-logged');
    console.log('  --listen            Watch for Falcon messages');
    console.log('  --status            Check all channels');
  }
}

main().catch(e => console.error('FATAL:', e.message));
module.exports = { send, listen, status, encodeBehcsMessage, adbAvailable };
