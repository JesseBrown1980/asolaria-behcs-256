#!/usr/bin/env node
/**
 * type-to-liris.js — structural enforcement of the ENTER-after-TYPE rule
 *
 * Wraps the curl POST to liris's agent-keyboard so that:
 *   1. press_enter is ALWAYS set, structurally — not a flag, not optional
 *   2. the bearer token is loaded from the peer-tokens vault, never inline
 *   3. the URL is fixed to liris's keyboard endpoint
 *   4. the timeout is 60s (matches infinite-peer pair config)
 *
 * Per the cube law (feedback_press_enter_after_typing_to_agents.md):
 *   ENTER is structurally bound to TYPE. It is impossible to call this helper
 *   without ENTER being pressed at the receiver. We now rely on the receiver's
 *   own /type -> ENTER coupling because it types and presses inside one
 *   execution path, which is more reliable than a follow-up /press.
 *
 * Usage:
 *   node tools/keyboard/type-to-liris.js "<omnilanguage packet text>"
 *   echo "<text>" | node tools/keyboard/type-to-liris.js -
 *
 * This is an outbound helper. The inbound side (POST /type on acer's own
 * agent-keyboard at 4913) already defaults press_enter:true at the server,
 * so this completes the symmetry: outbound ALWAYS presses, inbound DEFAULTS
 * to pressing.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = 'C:/Users/acer/Asolaria';
const PEER_TOKENS_PATH = path.join(ROOT, 'data/vault/owner/agent-keyboard/peer-tokens.json');
const LIRIS_PATH = '/type';
const LIRIS_PRESS_PATH = '/press';
const LIRIS_HEALTH_PATH = '/health';
const LIRIS_WINDOWS_PATH = '/windows';
const WINDOW = process.env.LIRIS_WINDOW_TITLE || 'Claude Code';
const ENTER_DELAY_MS = Number(process.env.LIRIS_ENTER_DELAY_MS || 180);
// Per-call timeout. Was 60s (too short for big packets) → 24h (too long, hides
// receiver-side freezes). Now 90s — long enough for ~2KB packets to type+ack
// even on slow receiver, short enough to surface a hang quickly so the caller
// can recover. The chunker should use its own retry/backoff on top of this.
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
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (c) { buf += c; });
    process.stdin.on('end', function () { resolve(buf); });
  });
}

function getJSON(peer, pathName) {
  return new Promise(function (resolve, reject) {
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
    const req = peer.transport.request(options, function (res) {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { chunks += c; });
      res.on('end', function () {
        try {
          resolve({ status_code: res.statusCode, body: JSON.parse(chunks || '{}') });
        } catch (_e) {
          resolve({ status_code: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', function (err) { reject(new Error('request_failed: ' + err.message)); });
    req.on('timeout', function () { req.destroy(); reject(new Error('timeout after ' + REQUEST_TIMEOUT_MS + 'ms')); });
    req.end();
  });
}

async function main() {
  let text;
  if (process.argv[2] === '-') {
    text = (await readStdin()).trim();
  } else if (process.argv.length >= 3) {
    text = process.argv.slice(2).join(' ');
  } else {
    console.error('usage: type-to-liris.js "<text>" | type-to-liris.js -');
    process.exit(1);
  }

  if (!text || text.length === 0) {
    console.error('error: empty text');
    process.exit(2);
  }

  const peer = loadLirisPeer();
  let resolvedWindowTitle = WINDOW;
  let resolvedWindowId = 0;
  let remoteForeground = '';
  try {
    const health = await getJSON(peer, LIRIS_HEALTH_PATH);
    remoteForeground = String((health.body && health.body.foreground_window) || '').trim();
    if (health.status_code === 200 && remoteForeground) {
      const desired = String(WINDOW).toLowerCase();
      const current = remoteForeground.toLowerCase();
      if (current.includes(desired) || desired.includes(current)) {
        // If the correct window is already foreground, skip AppActivate entirely
        // and send keys directly to the active surface.
        resolvedWindowTitle = '';
      }
    }
  } catch (_e) {
    // Keep the configured fallback if health preflight is unavailable.
  }
  try {
    const windows = await getJSON(peer, LIRIS_WINDOWS_PATH);
    const targets = Array.isArray(windows.body && windows.body.targets) ? windows.body.targets : [];
    if (targets.length > 0) {
      const desired = String(WINDOW).toLowerCase();
      const foreground = remoteForeground.toLowerCase();
      const exactForeground = targets.find(function(target) {
        return String(target.title || '').toLowerCase() === foreground;
      });
      const matchingTarget = exactForeground || targets.find(function(target) {
        const title = String(target.title || '').toLowerCase();
        return title.includes(desired) || desired.includes(title);
      });
      if (matchingTarget && Number(matchingTarget.id) > 0) {
        resolvedWindowId = Number(matchingTarget.id);
      }
    }
  } catch (_e) {
    // Old receivers may not expose window targets yet.
  }

  // STRUCTURAL ENFORCEMENT — ENTER is owned by the receiver's /type route.
  //
  // The remote keyboard server types and presses ENTER internally when
  // press_enter is not false. That keeps both operations in one focused path.
  // Separate /press fallback looked successful at the HTTP layer but still
  // missed app-level delivery in Claude Code.
  function postJSON(pathName, bodyObj) {
    return new Promise(function (resolve, reject) {
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
      const req = peer.transport.request(options, function (res) {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { chunks += c; });
        res.on('end', function () {
          resolve({ status_code: res.statusCode, body: chunks });
        });
      });
      req.on('error', function (err) { reject(new Error('request_failed: ' + err.message)); });
      req.on('timeout', function () { req.destroy(); reject(new Error('timeout after ' + REQUEST_TIMEOUT_MS + 'ms')); });
      req.write(body);
      req.end();
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Call 1: TYPE
  const typeBody = {
    text: text,
    press_enter: true,
    enter_delay_ms: ENTER_DELAY_MS
  };
  if (resolvedWindowTitle) {
    typeBody.window_title = resolvedWindowTitle;
  }
  if (resolvedWindowId > 0) {
    typeBody.window_id = resolvedWindowId;
  }
  const typeRes = await postJSON(LIRIS_PATH, typeBody);

  const result = {
    status_code: typeRes.status_code,
    text_length: text.length,
    press_enter: true,
    resolved_window_title: resolvedWindowTitle,
    resolved_window_id: resolvedWindowId,
    remote_foreground_window: remoteForeground,
    type_response: typeRes.body.length < 300 ? typeRes.body : typeRes.body.slice(0, 300) + '...',
    press_status: typeRes.status_code,
    press_response: 'receiver_owned_by_/type'
  };
  console.log(JSON.stringify(result));
  if (typeRes.status_code !== 200) process.exit(3);
  process.exit(0);
}

if (require.main === module) {
  main().catch(function (e) { console.error(JSON.stringify({ error: 'main_failed', detail: e.message })); process.exit(6); });
}

module.exports = { loadLirisPeer };
