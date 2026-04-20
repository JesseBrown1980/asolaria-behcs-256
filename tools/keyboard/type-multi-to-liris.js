#!/usr/bin/env node
/**
 * type-multi-to-liris.js — multi-part packet helper
 *
 * Per Jesse 2026-04-07T19:40Z: when a single packet is too long for the /type
 * endpoint (90s timeout pattern observed on ~2200-char packets), split into
 * multiple parts. Use SHIFT+ENTER between parts to insert a newline in the
 * textbox WITHOUT submitting. Let the FINAL part submit through /type with
 * press_enter:true so typing and ENTER stay in one focused receiver path.
 *
 * This lets us send arbitrarily long packets by chaining parts. Each part is
 * its own POST /type call. Between parts we POST /press with key=enter +
 * shift=true (which inserts a newline). The LAST part is sent with
 * press_enter:true and the receiver submits internally.
 *
 * Usage:
 *   node tools/keyboard/type-multi-to-liris.js "part1" "part2" "part3" ...
 *   echo -e "part1\npart2\npart3" | node tools/keyboard/type-multi-to-liris.js -
 *
 * Each part is sent as a separate /type call with shift+enter between them.
 * The final part submits via /type press_enter:true.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = 'C:/Users/acer/Asolaria';
const PEER_TOKENS_PATH = path.join(ROOT, 'data/vault/owner/agent-keyboard/peer-tokens.json');
const LIRIS_TYPE_PATH = '/type';
const LIRIS_PRESS_PATH = '/press';
const LIRIS_HEALTH_PATH = '/health';
const LIRIS_WINDOWS_PATH = '/windows';
const WINDOW = process.env.LIRIS_WINDOW_TITLE || 'Claude Code';
const PART_GAP_MS = 200;
const ENTER_DELAY_MS = Number(process.env.LIRIS_ENTER_DELAY_MS || 180);
const REQUEST_TIMEOUT_MS = 90 * 1000;

function loadLirisPeer() {
  if (!fs.existsSync(PEER_TOKENS_PATH)) {
    throw new Error('peer-tokens.json missing at ' + PEER_TOKENS_PATH);
  }
  const data = JSON.parse(fs.readFileSync(PEER_TOKENS_PATH, 'utf8'));
  const peer = data.peers && data.peers['liris-rayssa'];
  if (!peer || !peer.token || !peer.url) {
    throw new Error('liris-rayssa url/token missing in peer-tokens.json');
  }
  const endpoint = new URL(peer.url);
  return {
    token: peer.token,
    endpoint,
    transport: endpoint.protocol === 'https:' ? https : http
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
  });
}

function postJSON(peer, pathName, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const options = {
      hostname: peer.endpoint.hostname,
      port: Number(peer.endpoint.port || (peer.endpoint.protocol === 'https:' ? 443 : 80)),
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + peer.token
      },
      timeout: REQUEST_TIMEOUT_MS
    };
    const req = peer.transport.request(options, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status_code: res.statusCode, body: chunks }));
    });
    req.on('error', (err) => reject(new Error('request_failed: ' + err.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout after ' + REQUEST_TIMEOUT_MS + 'ms')); });
    req.write(body);
    req.end();
  });
}

function getJSON(peer, pathName) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: peer.endpoint.hostname,
      port: Number(peer.endpoint.port || (peer.endpoint.protocol === 'https:' ? 443 : 80)),
      path: pathName,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + peer.token
      },
      timeout: REQUEST_TIMEOUT_MS
    };
    const req = peer.transport.request(options, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try {
          resolve({ status_code: res.statusCode, body: JSON.parse(chunks || '{}') });
        } catch (_e) {
          resolve({ status_code: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', (err) => reject(new Error('request_failed: ' + err.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout after ' + REQUEST_TIMEOUT_MS + 'ms')); });
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let parts;
  if (process.argv[2] === '-') {
    const stdin = (await readStdin()).trim();
    parts = stdin.split('\n').filter(p => p.length > 0);
  } else if (process.argv.length >= 3) {
    parts = process.argv.slice(2);
  } else {
    console.error('usage: type-multi-to-liris.js "part1" "part2" ... | type-multi-to-liris.js -');
    process.exit(1);
  }

  if (!parts || parts.length === 0) {
    console.error('error: no parts');
    process.exit(2);
  }

  const peer = loadLirisPeer();
  let resolvedWindowTitle = WINDOW;
  let resolvedWindowId = 0;
  let foreground = '';
  try {
    const health = await getJSON(peer, LIRIS_HEALTH_PATH);
    foreground = String((health.body && health.body.foreground_window) || '').trim();
    if (health.status_code === 200 && foreground) {
      const desired = String(WINDOW).toLowerCase();
      const current = foreground.toLowerCase();
      if (current.includes(desired) || desired.includes(current)) {
        // If the correct window is already focused, omit window_title so the
        // receiver types into the live foreground surface without AppActivate.
        resolvedWindowTitle = '';
      }
    }
  } catch (_e) {
    // Fallback to configured title if the preflight is unavailable.
  }
  try {
    const windows = await getJSON(peer, LIRIS_WINDOWS_PATH);
    const targets = Array.isArray(windows.body && windows.body.targets) ? windows.body.targets : [];
    if (targets.length > 0) {
      const desired = String(WINDOW).toLowerCase();
      const current = String(foreground).toLowerCase();
      const exactForeground = targets.find((target) => String(target.title || '').toLowerCase() === current);
      const matchingTarget = exactForeground || targets.find((target) => {
        const title = String(target.title || '').toLowerCase();
        return title.includes(desired) || desired.includes(title);
      });
      if (matchingTarget && Number(matchingTarget.id) > 0) {
        resolvedWindowId = Number(matchingTarget.id);
      }
    }
  } catch (_e) {
    // Old receivers may not expose targets yet.
  }
  const results = [];

  // Type each part. Between parts: POST /press with shift+enter
  // (newline without submit). The LAST part submits through /type.
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = (i === parts.length - 1);

    // Intermediate parts suppress ENTER. Final part lets the receiver own
    // ENTER inside the /type route.
    const typeBody = {
      text: part,
      press_enter: isLast,
      enter_delay_ms: isLast ? ENTER_DELAY_MS : 0
    };
    if (resolvedWindowTitle) {
      typeBody.window_title = resolvedWindowTitle;
    }
    if (resolvedWindowId > 0) {
      typeBody.window_id = resolvedWindowId;
    }
    const typeRes = await postJSON(peer, LIRIS_TYPE_PATH, typeBody);
    results.push({ part: i, op: 'type', status: typeRes.status_code, len: part.length });

    if (typeRes.status_code !== 200) {
      console.log(JSON.stringify({ ok: false, error: 'type_failed', part: i, results }));
      process.exit(3);
    }

    await sleep(PART_GAP_MS);

    if (!isLast) {
      // Intermediate part: insert a newline via shift+enter (newline without submit).
      // Try the canonical chord form first; if the receiver doesn't honor it, the
      // text just stays on one line which is harmless.
      const pressBody = {
        key: 'enter',
        shift: true
      };
      if (resolvedWindowTitle) {
        pressBody.window_title = resolvedWindowTitle;
      }
      if (resolvedWindowId > 0) {
        pressBody.window_id = resolvedWindowId;
      }
      const pressRes = await postJSON(peer, LIRIS_PRESS_PATH, pressBody);
      results.push({ part: i, op: 'press_shift_enter', status: pressRes.status_code });
      // Don't fail hard on intermediate press — the next /type still appends.
      await sleep(PART_GAP_MS);
    }
  }

  console.log(JSON.stringify({ ok: true, parts: parts.length, total_chars: parts.reduce((a, b) => a + b.length, 0), results }));
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ error: 'main_failed', detail: e.message }));
    process.exit(6);
  });
}
