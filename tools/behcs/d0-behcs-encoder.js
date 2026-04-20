#!/usr/bin/env node
/**
 * d0-behcs-encoder.js — Transform D0 runtime output into BEHCS 256-symbol code.
 *
 * Takes the D0 prove-life output, encodes every dim signal + agent wake
 * into the BEHCS 256-glyph alphabet via hilbertAddress, pipes it through
 * the bus, reads it back, verifies round-trip, and loops until it works.
 *
 * The BEHCS symbol language:
 *   - Every dim state = hilbertAddress(dim_id + signal + state)
 *   - Every agent action = hilbertAddress(agent_role + action + event)
 *   - Every event = hilbertAddress(event_name + ts)
 *   - Full cascade result = concatenation of all glyph addresses
 *
 * This is the "pipe it through as code" step:
 *   D0 output → BEHCS 256 encode → POST /behcs/send → read inbox → verify → loop
 *
 * Usage:
 *   node tools/behcs/d0-behcs-encoder.js               # encode + send + verify
 *   node tools/behcs/d0-behcs-encoder.js --loop 5      # loop N times until pass
 *
 * Cube: D33 SYMBOL_MULTIPLEX (2571353) + D10 DIALECT (24389)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = 'C:/Users/acer/Asolaria';
const BEHCS_DIR = path.join(ROOT, 'data/behcs');
const D0_DIR = path.join(BEHCS_DIR, 'd0-runtime');
const D_DEST = 'D:/safety-backups/session-20260411-behcs-v6';
const BEHCS_PORT = 4947;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirror(src) {
  try {
    const rel = path.relative(ROOT, src).replace(/\\/g, '/');
    const dest = path.join(D_DEST, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch (_) {}
}
const now = () => new Date().toISOString();

// Load codex-bridge for 256-glyph encoding
let codex;
try {
  codex = require('./codex-bridge');
} catch (e) {
  console.error('[encoder] FATAL: codex-bridge failed to load:', e.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// BEHCS 256-SYMBOL ENCODER
// ═══════════════════════════════════════════════════════════

function encodeD0Snapshot(snapshot) {
  const encoded = {
    ts: now(),
    type: 'behcs_256_encoded_d0_snapshot',
    glyphs: {},
    dims: {},
    agents: {},
    fullGlyphString: '',
    metadata: {
      alphabet_base: codex.alphabet.base,
      glyph_count: codex.alphabet.glyphs.length,
      catalog_count: codex.catalogs.catalogs.length,
    },
  };

  // Encode each dim as a glyph address
  const glyphParts = [];
  for (const [id, dim] of Object.entries(snapshot.dims || {})) {
    const key = `${id}:${dim.signal.toFixed(3)}:${dim.state}:${dim.fireCount}`;
    const glyph = codex.hilbertAddress(key);
    encoded.dims[id] = {
      glyph,
      key,
      signal: dim.signal,
      state: dim.state,
      fires: dim.fireCount,
      cube: dim.cube,
    };
    encoded.glyphs[id] = glyph;
    glyphParts.push(glyph);
  }

  // Encode each agent as a glyph address
  for (const [role, agent] of Object.entries(snapshot.agents || {})) {
    const key = `${role}:${agent.state}:${agent.wakeCount}`;
    const glyph = codex.hilbertAddress(key);
    encoded.agents[role] = {
      glyph,
      key,
      state: agent.state,
      wakes: agent.wakeCount,
    };
    encoded.glyphs[role] = glyph;
    glyphParts.push(glyph);
  }

  // Full glyph string — the entire D0 state as one BEHCS symbol sequence
  encoded.fullGlyphString = glyphParts.join('·');

  // Runtime meta-glyph (the hash of the whole state)
  encoded.glyphs._runtime = codex.hilbertAddress(
    `d0:${snapshot.cycleCount}:${Object.keys(snapshot.dims).length}:${Object.keys(snapshot.agents).length}`
  );

  return encoded;
}

// ═══════════════════════════════════════════════════════════
// BEHCS BUS INTERFACE
// ═══════════════════════════════════════════════════════════

function postToBus(envelope) {
  return new Promise((resolve) => {
    const data = JSON.stringify(envelope);
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

function readInbox(last = 5) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${BEHCS_PORT}/behcs/inbox?last=${last}`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false }); } });
    }).on('error', () => resolve({ ok: false }));
  });
}

// ═══════════════════════════════════════════════════════════
// ENCODE → SEND → VERIFY LOOP
// ═══════════════════════════════════════════════════════════

async function encodeAndSend() {
  // Step 1: Run D0 prove-life to get fresh snapshot
  console.log('[encoder] Step 1: Running D0 prove-life for fresh state...');
  const { D0Runtime } = require('./d0-runtime');
  const runtime = new D0Runtime();
  await runtime.proveLife();
  const snapshot = runtime.snapshot();

  // Step 2: Encode to BEHCS 256 symbols
  console.log('[encoder] Step 2: Encoding D0 state to BEHCS 256-symbol language...');
  const encoded = encodeD0Snapshot(snapshot);

  console.log('');
  console.log('  BEHCS 256-SYMBOL ENCODED STATE:');
  console.log('  ─'.repeat(30));
  for (const [id, dim] of Object.entries(encoded.dims)) {
    console.log(`  ${id.padEnd(25)} ${dim.glyph}  signal=${dim.signal.toFixed(3)} state=${dim.state}`);
  }
  console.log('');
  for (const [role, agent] of Object.entries(encoded.agents)) {
    console.log(`  ${role.padEnd(25)} ${agent.glyph}  state=${agent.state} wakes=${agent.wakes}`);
  }
  console.log('');
  console.log(`  Runtime glyph: ${encoded.glyphs._runtime}`);
  console.log(`  Full string (${encoded.fullGlyphString.length} chars): ${encoded.fullGlyphString.slice(0, 80)}...`);

  // Step 3: Send encoded state to BEHCS bus
  console.log('');
  console.log('[encoder] Step 3: Sending BEHCS-encoded state to bus...');
  const sendId = 'd0-enc-' + crypto.randomBytes(4).toString('hex');
  const busResult = await postToBus({
    id: sendId,
    ts: now(),
    from: 'asolaria-d0-encoder',
    to: 'triad',
    mode: 'real',
    type: 'behcs_256_state',
    payload: {
      verb: 'behcs.d0.encoded_state',
      encoded_dims: encoded.dims,
      encoded_agents: encoded.agents,
      fullGlyphString: encoded.fullGlyphString,
      runtime_glyph: encoded.glyphs._runtime,
    },
    cube: {
      D33_SYMBOL_MULTIPLEX: 2571353,
      D10_DIALECT: 24389,
      D0_RUNTIME: true,
    },
    hash: crypto.createHash('sha256').update(encoded.fullGlyphString).digest('hex').slice(0, 16),
  });

  console.log(`  Bus response: ${JSON.stringify(busResult)}`);

  // Step 4: Read back from inbox and verify
  console.log('[encoder] Step 4: Reading back from inbox to verify round-trip...');
  await new Promise(r => setTimeout(r, 500)); // brief wait for bus processing
  const inbox = await readInbox(5);

  let verified = false;
  if (inbox.ok && inbox.messages) {
    const ourMsg = inbox.messages.find(m => m.id === sendId);
    if (ourMsg) {
      // Verify the glyph string survived
      const receivedGlyphs = ourMsg.payload?.fullGlyphString;
      if (receivedGlyphs === encoded.fullGlyphString) {
        verified = true;
        console.log('  ROUND-TRIP VERIFIED: glyph string intact');
      } else if (receivedGlyphs) {
        console.log('  ROUND-TRIP PARTIAL: glyph string present but differs');
        console.log(`    sent:     ${encoded.fullGlyphString.slice(0, 40)}...`);
        console.log(`    received: ${receivedGlyphs.slice(0, 40)}...`);
      } else {
        console.log('  ROUND-TRIP FAIL: message found but no glyph string');
      }
    } else {
      console.log(`  ROUND-TRIP FAIL: message ${sendId} not found in last ${inbox.messages.length} inbox entries`);
    }
  } else {
    console.log('  ROUND-TRIP FAIL: inbox read failed');
  }

  // Save result
  const resultPath = path.join(D0_DIR, 'encode-result.json');
  const result = {
    ts: now(),
    verified,
    sendId,
    busResult,
    encoded: {
      dimCount: Object.keys(encoded.dims).length,
      agentCount: Object.keys(encoded.agents).length,
      glyphStringLength: encoded.fullGlyphString.length,
      runtimeGlyph: encoded.glyphs._runtime,
    },
    fullGlyphString: encoded.fullGlyphString,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  mirror(resultPath);

  return { verified, result, encoded };
}

// ═══════════════════════════════════════════════════════════
// LOOP UNTIL IT WORKS
// ═══════════════════════════════════════════════════════════

async function loopUntilPass(maxAttempts = 5) {
  console.log('');
  console.log('='.repeat(64));
  console.log('  D0 → BEHCS 256-SYMBOL ENCODER → BUS → VERIFY LOOP');
  console.log(`  Max attempts: ${maxAttempts}`);
  console.log('='.repeat(64));
  console.log('');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n${'━'.repeat(64)}`);
    console.log(`  ATTEMPT ${attempt}/${maxAttempts}`);
    console.log(`${'━'.repeat(64)}\n`);

    try {
      const { verified, result, encoded } = await encodeAndSend();

      if (verified) {
        console.log('');
        console.log('═'.repeat(64));
        console.log(`  PASS on attempt ${attempt}/${maxAttempts}`);
        console.log(`  ${Object.keys(encoded.dims).length} dims encoded`);
        console.log(`  ${Object.keys(encoded.agents).length} agents encoded`);
        console.log(`  Glyph string: ${encoded.fullGlyphString.length} chars`);
        console.log(`  Runtime glyph: ${encoded.glyphs._runtime}`);
        console.log(`  Round-trip: VERIFIED`);
        console.log('═'.repeat(64));

        // Save passing result
        const passPath = path.join(D0_DIR, 'encode-loop-pass.json');
        fs.writeFileSync(passPath, JSON.stringify({
          ts: now(), attempt, maxAttempts, verified: true,
          glyphString: encoded.fullGlyphString,
          runtimeGlyph: encoded.glyphs._runtime,
          dims: Object.keys(encoded.dims),
          agents: Object.keys(encoded.agents),
        }, null, 2));
        mirror(passPath);

        return { pass: true, attempt };
      }

      console.log(`  Attempt ${attempt} failed verification. Retrying...`);
      await new Promise(r => setTimeout(r, 1000));

    } catch (e) {
      console.log(`  Attempt ${attempt} ERROR: ${e.message}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('');
  console.log(`  FAIL: did not pass after ${maxAttempts} attempts`);
  return { pass: false, attempts: maxAttempts };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const loopIdx = args.indexOf('--loop');
  const maxLoop = loopIdx >= 0 ? parseInt(args[loopIdx + 1] || '5') : 3;

  if (loopIdx >= 0 || args.length === 0) {
    await loopUntilPass(maxLoop);
  }
}

if (require.main === module) main().catch(e => console.error('FATAL:', e.message));
module.exports = { encodeD0Snapshot, encodeAndSend };
