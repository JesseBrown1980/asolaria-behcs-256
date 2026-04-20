"use strict";

/**
 * agent-keyboard.js — Asolaria-acer side
 *
 * Symmetric mirror of Liris's agent-keyboard at C:\Users\rayss\Asolaria\tools\agent-keyboard.js (port 4820).
 * This is the FIRST cube-aligned omnikeyboard per Jesse's law of 2026-04-06.
 *
 * Port: 4913 (= 17³ = D7 STATE prime cube)
 * Cube law: feedback_everything_revolves_around_hilbert_cubes.md
 * Spec source: LX-485 (Liris's original) + LX-486 pending (this Acer mirror)
 *
 * Hilbert anatomy (the dimensional tags this artifact lives at):
 *   D1  ACTOR       = asolaria-acer
 *   D2  VERB        = keyboard.type, keyboard.press, keyboard.report
 *   D3  TARGET      = peer-omninode (defaults to focused window)
 *   D4  RISK        = 4 (operator+, gated by 6 security checks)
 *   D5  LAYER       = app
 *   D6  GATE        = enabled-flag + bearer-token + ip-allowlist + rate-limit + forbidden-patterns + audit-log
 *   D7  STATE       = primary dimension — keyboard mutates receiver's terminal state
 *   D8  CHAIN       = LX-485 (Liris keyboard), LX-486 (this mirror, pending)
 *   D9  WAVE        = single (per-call), or burst (multiple calls)
 *   D10 DIALECT     = IX (asolaria home dialect)
 *   D11 PROOF       = audit-log entry per request
 *   D12 SCOPE       = operational
 *   D13 SURFACE     = local-http on port 4913
 *   D14 ENERGY      = light (one PowerShell SendKeys call per request)
 *   D15 DEVICE      = jesse-host (acer machine)
 *   D16 PID         = node-process-pid
 *   D17 PROFILE     = asolaria-orchestrator-v1
 *   D18 AI_MODEL    = claude-opus-4-6 (via Claude Code CLI)
 *   D19 LOCATION    = 192.168.1.8 (Jesse_5G WiFi as of 2026-04-06)
 *   D20 TIME        = session-bounded (until process exits)
 *   D21 HARDWARE    = Windows 11 + node + powershell + System.Windows.Forms.SendKeys
 *   D22 TRANSLATION = none (transparent character pass-through)
 *   D23 FEDERATION  = peer-bound (one omnikeyboard per peer in the family)
 *   D24 INTENT      = federation_join_complete
 *
 * Six security gates (ALL must pass for any /type or /press to execute):
 *   1. ENABLED flag file exists at data/vault/owner/agent-keyboard/ENABLED
 *   2. Bearer token matches data/vault/owner/agent-keyboard/token.txt
 *   3. Source IP in data/vault/owner/agent-keyboard/allowlist.json
 *   4. Rate limit: max 1 request per 300ms per client IP
 *   5. Forbidden patterns check: rm -rf, del /f, format C:, diskpart, Remove-Item -Recurse -Force, BEGIN_DESTRUCTIVE_OP
 *   6. Audit log: every request logged with IP + text preview
 *
 * Default state on first run: server starts up, listens on 4913, but refuses every typing request because the
 * ENABLED flag doesn't exist and the allowlist only has localhost. Operator must explicitly enable.
 *
 * To enable (the 4-step sequence, mirrors Liris's design):
 *   1. Run: node tools/agent-keyboard.js (or via the Start-Asolaria-AgentKeyboard.cmd launcher when written)
 *   2. Edit data/vault/owner/agent-keyboard/allowlist.json to add caller IPs (Liris owner-bound peer is 192.168.100.2)
 *   3. Create the ENABLED flag: type nul > data\vault\owner\agent-keyboard\ENABLED
 *   4. Share the token: type data\vault\owner\agent-keyboard\token.txt and relay to peer via secure channel
 *
 * To disable safely: del data\vault\owner\agent-keyboard\ENABLED (server keeps running, refuses all typing)
 * To stop: Ctrl+C
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

// G-090 staleness surface (canonized with liris seq=66 a5638df)
const PROCESS_STARTED_AT = new Date().toISOString();
let SOURCE_COMMIT = 'unknown';
try { SOURCE_COMMIT = execSync('git -C C:/asolaria-acer rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().slice(0, 12); } catch {}

// === Cube-aligned constants ===
const PORT = 4913;  // 17³ = D7 STATE prime cube
const HOST = '0.0.0.0';
const VAULT_DIR = path.join(__dirname, '..', 'data', 'vault', 'owner', 'agent-keyboard');
const ENABLED_FLAG = path.join(VAULT_DIR, 'ENABLED');
const TOKEN_FILE = path.join(VAULT_DIR, 'token.txt');
const ALLOWLIST_FILE = path.join(VAULT_DIR, 'allowlist.json');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'agent-keyboard.log');

const DEFAULT_ALLOWLIST = ['127.0.0.1', '::1'];
const RATE_LIMIT_MS = 300;
const lastRequestByIP = new Map();

const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf?\s/i,
  /\bdel\s+\/[fsq]/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /Remove-Item\s+.*-Recurse\s+.*-Force/i,
  /BEGIN_DESTRUCTIVE_OP/i
];

// === Utility ===
function audit() {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const args = Array.from(arguments).join(' ');
    const line = '[' + new Date().toISOString() + '] ' + args + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

function initVault() {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  if (!fs.existsSync(TOKEN_FILE)) {
    const token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(TOKEN_FILE, token);
    audit('init: token generated', token.slice(0, 8) + '...');
  }
  if (!fs.existsSync(ALLOWLIST_FILE)) {
    fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify({ allowed_ips: DEFAULT_ALLOWLIST }, null, 2));
  }
}

function readToken() {
  return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

function readAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8')).allowed_ips || DEFAULT_ALLOWLIST;
  } catch (e) {
    return DEFAULT_ALLOWLIST;
  }
}

function isEnabled() {
  return fs.existsSync(ENABLED_FLAG);
}

function normalizeIP(ip) {
  if (!ip) return '';
  return ip.replace(/^::ffff:/, '');
}

// === Infinite-timeout peer list (LX-491 directive 2026-04-07) ===
// Per Jesse: acer<->liris pair gets infinite timeout (no SendKeys cap).
// All other peers use the 60s default. Prevents process overload from
// untrusted sources while letting the trusted leader-pair send long packets.
// Updated 2026-04-07T02:20Z to include liris's new ethernet bridge IP 192.168.100.2.
const INFINITE_TIMEOUT_PEERS = new Set([
  '192.168.0.1',   // liris-rayssa (current — updated 2026-04-07T15:25Z per jesse)
  '192.168.1.6',   // liris-rayssa (legacy WiFi, kept for fallback)
  '192.168.100.2', // liris-rayssa (NEW ethernet bridge — added 2026-04-07T02:20Z)
  '127.0.0.1',     // self
  '::1',
  '0.0.0.0'
]);

function isInfiniteTimeoutPeer(ip) {
  return INFINITE_TIMEOUT_PEERS.has(ip);
}

// === PowerShell SendKeys backend ===
function escapeForSendKeys(text) {
  // SendKeys metacharacters that need brace-escape
  return text
    .replace(/\{/g, '{{}')
    .replace(/\}/g, '{}}')
    .replace(/\+/g, '{+}')
    .replace(/\^/g, '{^}')
    .replace(/%/g, '{%}')
    .replace(/~/g, '{~}')
    .replace(/\(/g, '{(}')
    .replace(/\)/g, '{)}')
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}');
}

function escapeForPSSingleQuote(text) {
  // PowerShell single-quoted string: only single-quote needs doubling
  return text.replace(/'/g, "''");
}

function resolveTargetBody(body) {
  const windowTitle = body.window_title || null;
  const rawWindowId = body.window_id;
  const parsedWindowId = rawWindowId === undefined || rawWindowId === null || rawWindowId === ''
    ? 0
    : Number(rawWindowId);
  return {
    windowTitle: windowTitle,
    windowId: Number.isFinite(parsedWindowId) ? parsedWindowId : 0
  };
}

function buildFocusPrefix(target) {
  if (target.windowId > 0) {
    return "Add-Type -AssemblyName System.Windows.Forms; " +
           "$wsh = New-Object -ComObject WScript.Shell; " +
           "$focused = $wsh.AppActivate(" + target.windowId + "); " +
           "if (-not $focused) { throw 'Could not focus window id: " + target.windowId + "' }; " +
           "Start-Sleep -Milliseconds 250; ";
  }
  if (target.windowTitle) {
    const psSafeTitle = escapeForPSSingleQuote(target.windowTitle);
    return "Add-Type -AssemblyName System.Windows.Forms; " +
           "$wsh = New-Object -ComObject WScript.Shell; " +
           "$focused = $wsh.AppActivate('" + psSafeTitle + "'); " +
           "if (-not $focused) { throw 'Could not focus window: " + psSafeTitle + "' }; " +
           "Start-Sleep -Milliseconds 250; ";
  }
  return "Add-Type -AssemblyName System.Windows.Forms; ";
}

function powershellSendKeys(text, target, callerIp) {
  const sendKeysText = escapeForSendKeys(text);
  const psSafeText = escapeForPSSingleQuote(sendKeysText);
  const psScript = buildFocusPrefix(target) +
                   "[System.Windows.Forms.SendKeys]::SendWait('" + psSafeText + "')";

  // LX-491 directive 2026-04-07 (Jesse): acer<->liris pair gets infinite
  // timeout, all other peers stay at 60s. Trusted leader pair can send
  // arbitrarily long packets without artificial cap.
  // maxBuffer raised to 16MB to match Liris's side post-2026-04-07T02:20Z update.
  const opts = { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 };
  if (!isInfiniteTimeoutPeer(callerIp)) {
    opts.timeout = 60000;
  }
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], opts);
}

const VALID_KEYS = ['ENTER', 'TAB', 'ESC', 'SPACE', 'BACKSPACE', 'DELETE', 'HOME', 'END',
  'PAGEUP', 'PAGEDOWN', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'UP', 'DOWN', 'LEFT', 'RIGHT'];

function powershellPressKey(keyName, target, shift) {
  const upper = keyName.toUpperCase();
  if (!VALID_KEYS.includes(upper)) {
    return { error: { message: 'invalid_key' }, status: -1 };
  }

  const sendKeysToken = (shift ? '+' : '') + '{' + upper + '}';
  const psScript = buildFocusPrefix(target) +
                   "[System.Windows.Forms.SendKeys]::SendWait('" + sendKeysToken + "')";

  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 5000
  });
}

function getForegroundWindow() {
  const psScript = "$source = @\"\nusing System;\nusing System.Runtime.InteropServices;\nusing System.Text;\npublic class W {\n  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();\n  [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);\n}\n\"@;\nAdd-Type -TypeDefinition $source;\n$h = [W]::GetForegroundWindow();\n$sb = New-Object System.Text.StringBuilder 1024;\n[W]::GetWindowText($h, $sb, 1024) | Out-Null;\n$sb.ToString()";
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 3000
  });
  return r.stdout ? r.stdout.trim() : '';
}

function getAllWindowTargets() {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | ForEach-Object { "{0}`t{1}`t{2}`t{3}" -f $_.Id, $_.ProcessName, $_.MainWindowHandle, $_.MainWindowTitle }'
  ], { encoding: 'utf8', timeout: 5000 });
  if (!r.stdout) return [];
  return r.stdout
    .split(/\r?\n/)
    .filter(function(line) { return line.trim(); })
    .map(function(line) {
      const parts = line.split('\t');
      return {
        id: Number(parts[0] || 0),
        process: parts[1] || '',
        handle: Number(parts[2] || 0),
        title: parts.slice(3).join('\t')
      };
    })
    .filter(function(target) {
      return target.id > 0 && target.title;
    });
}

function getAllWindows() {
  return getAllWindowTargets().map(function(target) { return target.title; });
}

// === Auth + checks ===
function checkAuth(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  try {
    return m[1] === readToken();
  } catch (e) {
    return false;
  }
}

function checkAllowlist(ip) {
  return readAllowlist().includes(normalizeIP(ip));
}

function checkRateLimit(ip) {
  const now = Date.now();
  const last = lastRequestByIP.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return false;
  lastRequestByIP.set(ip, now);
  return true;
}

function checkForbidden(text) {
  for (let i = 0; i < FORBIDDEN_PATTERNS.length; i++) {
    if (FORBIDDEN_PATTERNS[i].test(text)) return FORBIDDEN_PATTERNS[i].toString();
  }
  return null;
}

// === Body parser ===
function readBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

// === HTTP server ===
const server = http.createServer(async function(req, res) {
  const ip = normalizeIP(req.socket.remoteAddress || '');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  function send(code, body) {
    const headers = Object.assign({}, corsHeaders, { 'Content-Type': 'application/json' });
    res.writeHead(code, headers);
    res.end(JSON.stringify(body));
  }

  audit('[' + ip + ']', req.method, req.url);

  try {
    // GET /health (no auth)
    if (req.method === 'GET' && req.url === '/health') {
      const focused = getForegroundWindow();
      let allowlistCount = 0;
      try { allowlistCount = readAllowlist().length; } catch (e) {}
      return send(200, {
        ok: true,
        service: 'agent-keyboard',
        version: '1.0.0-acer-cube',
        host: 'asolaria-acer',
        port: PORT,
        cube: '17_pow_3',
        cube_value: 4913,
        dimension: 'D7_STATE',
        bind: HOST,
        enabled: isEnabled(),
        foreground_window: focused,
        allowlist_count: allowlistCount,
        log_file: LOG_FILE,
        cube_law: 'feedback_everything_revolves_around_hilbert_cubes.md',
        spec_source: 'LX-485 (Liris) + LX-486 pending (acer mirror)',
        siblings: { 'omnikeyboard@liris→acer': 'http://192.168.100.2:4820' },
        // G-090 staleness surface
        process_started_at: PROCESS_STARTED_AT,
        source_commit: SOURCE_COMMIT,
        uptime_s: Math.round(process.uptime())
      });
    }

    // GET /omninode/anatomy (no auth — public identity)
    if (req.method === 'GET' && req.url === '/omninode/anatomy') {
      try {
        const anatomyPath = path.join(__dirname, '..', 'data', 'omninode-anatomy.json');
        if (fs.existsSync(anatomyPath)) {
          return send(200, JSON.parse(fs.readFileSync(anatomyPath, 'utf8')));
        }
        return send(404, { error: 'anatomy_not_yet_published', expected_path: anatomyPath });
      } catch (e) {
        return send(500, { error: 'anatomy_read_failed', detail: e.message });
      }
    }

    // All other endpoints need auth + allowlist + enabled + rate limit
    if (!checkAuth(req)) {
      return send(401, { error: 'unauthorized' });
    }
    if (!checkAllowlist(ip)) {
      return send(403, { error: 'ip_not_in_allowlist', ip: ip });
    }
    if (!isEnabled()) {
      return send(503, { error: 'disabled', detail: 'create flag at ' + ENABLED_FLAG + ' to enable' });
    }
    if (!checkRateLimit(ip)) {
      return send(429, { error: 'rate_limited', limit_ms: RATE_LIMIT_MS });
    }

    // GET /windows
    if (req.method === 'GET' && req.url === '/windows') {
      const targets = getAllWindowTargets();
      return send(200, {
        ok: true,
        windows: targets.map(function(target) { return target.title; }),
        targets: targets
      });
    }

    // GET /status
    if (req.method === 'GET' && req.url === '/status') {
      const targets = getAllWindowTargets();
      return send(200, {
        ok: true,
        enabled: isEnabled(),
        allowlist: readAllowlist(),
        foreground: getForegroundWindow(),
        windows: targets.map(function(target) { return target.title; }),
        targets: targets,
        port: PORT,
        cube: '17_pow_3',
        dimension: 'D7_STATE'
      });
    }

    // POST /type
    if (req.method === 'POST' && req.url === '/type') {
      const body = await readBody(req);
      const text = String(body.text || '');
      const target = resolveTargetBody(body);
      // CUBE LAW 2026-04-06: ENTER is structurally bound to TYPE.
      // Default press_enter:true so callers can never forget. Opt out only with explicit press_enter:false.
      const pressEnter = body.press_enter !== false;
      const enterDelayMs = Math.max(0, Math.min(2000, Number(body.enter_delay_ms || 0)));

      if (!text) return send(400, { error: 'missing_text' });

      const forbidden = checkForbidden(text);
      if (forbidden) {
        audit('[' + ip + '] FORBIDDEN', forbidden, 'text=' + text.slice(0, 50));
        return send(403, { error: 'forbidden_pattern', pattern: forbidden });
      }

      const r = powershellSendKeys(text, target, ip);
      if (r.status !== 0 || r.error) {
        const detail = (r.error && r.error.message) || (r.stderr || '').slice(0, 200) || 'unknown';
        return send(500, { error: 'sendkeys_failed', detail: detail });
      }

      if (pressEnter) {
        if (enterDelayMs > 0) {
          await new Promise(function(resolve) { setTimeout(resolve, enterDelayMs); });
        }
        const r2 = powershellPressKey('ENTER', target, false);
        if (r2.status !== 0 || r2.error) {
          return send(500, { error: 'enter_failed', typed: text.length });
        }
      }

      audit('[' + ip + ']', '/type', 'window=' + (target.windowTitle || target.windowId || '(focused)'),
            'typed=' + text.length, 'enter=' + pressEnter, 'enter_delay_ms=' + enterDelayMs);
      return send(200, {
        ok: true,
        typed: text.length,
        window_title: target.windowTitle || '<foreground>',
        window_id: target.windowId || null,
        press_enter: pressEnter,
        enter_delay_ms: enterDelayMs
      });
    }

    // === LX-489/LX-490 omni-processor endpoints ===
    // S4-1: GET /omni/units — read-only, returns the units registry. Zero blast radius.
    if (req.method === 'GET' && req.url === '/omni/units') {
      try {
        const registryPath = path.join(__dirname, 'cube', 'omni-processor', 'units-registry.json');
        if (!fs.existsSync(registryPath)) {
          return send(404, { error: 'units_registry_not_found', expected_path: registryPath });
        }
        const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        audit('[' + ip + ']', '/omni/units', 'returned ' + Object.keys(reg.units || {}).length + ' units');
        return send(200, reg);
      } catch (e) {
        return send(500, { error: 'omni_units_read_failed', detail: e.message });
      }
    }

    // S4-2: POST /omni/submit — handler INSTALLED but GATED by STAGE_4_ENABLED flag.
    // Returns 503 until the local operator creates data/vault/owner/omni-processor/STAGE_4_ENABLED
    // (which CANNOT be done via packet — it requires local file write, enforcing LCR S4-3).
    if (req.method === 'POST' && req.url === '/omni/submit') {
      const stageFlagPath = path.join(__dirname, '..', 'data', 'vault', 'owner', 'omni-processor', 'STAGE_4_ENABLED');
      if (!fs.existsSync(stageFlagPath)) {
        audit('[' + ip + ']', '/omni/submit', 'GATED 503');
        return send(503, {
          error: 'stage_4_not_enabled',
          rationale: 'omni_processor cross-host dispatch is installed but gated. Local operator must create the flag file at the path below to enable it. Per LX-487 Local Cosign Rule, this file CANNOT be created via packet — it requires the local operator to be physically present.',
          flag_path: stageFlagPath,
          how_to_enable: 'In acer terminal: type "echo enabled > ' + stageFlagPath + '" — Jesse must do this himself, NOT via federation packet.',
          lcr_enforcement: 'S4-3 of stage_4_protocol'
        });
      }
      // Flag exists — validate + execute
      let manifest;
      try {
        manifest = await readBody(req);
      } catch (e) {
        audit('[' + ip + ']', '/omni/submit', 'BAD_JSON ' + e.message);
        return send(400, { error: 'invalid_json', detail: e.message });
      }
      // Structured validation BEFORE calling runManifest — return clear errors
      // showing what acer received vs what's expected. Added 2026-04-07 after
      // first cross-host attempt from liris hit cryptic "Cannot read properties
      // of undefined (reading 'unit_id')" — that error was thrown deep in
      // runManifest because manifest.unit was undefined. Now the handler tells
      // the caller exactly which field is missing.
      if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        return send(400, { error: 'manifest_must_be_object', received_type: typeof manifest });
      }

      // === SCHEMA BRIDGE v2 2026-04-07 ===
      // Liris uses envelope.target.unit_id; acer-native uses manifest.unit.unit_id.
      // The handler accepts BOTH shapes by translating liris's shape into acer's
      // native shape AND auto-filling other required fields from envelope context
      // before validation. Backwards-compatible. This is the cross-host schema
      // reconciliation point per LX-491 stage 4.
      //
      // v2 (after liris feedback): also auto-fill manifest_id from envelope.job_id,
      // dispatcher from authenticated peer (bearer token lookup), inputs from
      // body.input/body.inputs, authority from peer auth, law_class default to
      // SV_self_vote. So pure liris-native shape arrives without manual padding.
      if (!manifest.unit && manifest.target && typeof manifest.target === 'object' && manifest.target.unit_id) {
        manifest._original_schema = 'liris_envelope_target_unit_id';
        manifest.unit = {
          unit_id: manifest.target.unit_id,
          version: manifest.target.version || '0.1.0',
          novalum_shield_check: manifest.target.novalum_shield_check !== false
        };
        // Synthesize the acer-native target shape so the runner's RG-1 NovaLUM
        // shield check still works. liris's target.host -> our target.host_explicit.
        manifest.target = {
          addressing_mode: 'host_explicit',
          host_explicit: manifest.target.host || 'asolaria-instance@acer',
          host_explicit_local: (manifest.target.host || '') === 'asolaria-instance@acer',
          cube_coordinate: manifest.target.cube_coordinate || null,
          min_resources: manifest.target.constraints || manifest.target.min_resources || { max_runtime_sec: 30, ram_mb: 256 }
        };
        // v2: auto-fill the remaining required top-level fields from envelope context
        if (!manifest.manifest_id) {
          manifest.manifest_id = manifest.job_id || ('liris-bridge-' + Date.now());
        }
        if (!manifest.dispatcher) {
          // The auth gate already verified the bearer token. We know this is
          // an authenticated peer call. For now we attribute to liris-rayssa
          // since that's the only registered peer with credentials right now.
          // Future: look up actual peer from token hash.
          manifest.dispatcher = {
            agent_id: 'liris-rayssa',
            host: 'liris-rayssa',
            operator_witnessed: true,
            _bridge_v2_auto_filled: true
          };
        }
        if (!manifest.inputs) {
          manifest.inputs = manifest.input || manifest.body || manifest.body_input || {};
        }
        if (!manifest.authority) {
          manifest.authority = {
            primary: 'liris_primary',
            cosign_chain: ['liris_authenticated_peer'],
            lx_chain: ['LX-489', 'LX-491']
          };
        }
        if (!manifest.law_class) {
          manifest.law_class = 'SV_self_vote';
        }
        if (!manifest.audit) {
          manifest.audit = {
            evidence_path: 'cross-host bridge v2 auto-filled',
            operator_witnessed: false,
            operator_witness_chain: []
          };
        }
        if (!manifest.result_path) {
          manifest.result_path = { kind: 'sync_return' };
        }
        if (!manifest.schema_version) {
          manifest.schema_version = 'v0';
        }
        if (!manifest.ts_dispatched) {
          manifest.ts_dispatched = new Date().toISOString();
        }
        audit('[' + ip + ']', '/omni/submit', 'SCHEMA_BRIDGE_v2 liris->acer for unit ' + manifest.unit.unit_id);
      }
      const requiredTop = ['manifest_id', 'dispatcher', 'target', 'unit', 'inputs', 'authority', 'law_class'];
      const missingTop = requiredTop.filter(k => manifest[k] === undefined || manifest[k] === null);
      if (missingTop.length > 0) {
        audit('[' + ip + ']', '/omni/submit', 'MISSING_TOP ' + missingTop.join(','));
        return send(400, {
          error: 'missing_required_top_level_fields',
          missing: missingTop,
          received_keys: Object.keys(manifest),
          schema_hint: 'manifest must have: ' + requiredTop.join(', '),
          example: 'see tools/cube/omni-processor/sandbox-runner.js selftest for a valid manifest shape'
        });
      }
      if (typeof manifest.unit !== 'object' || !manifest.unit.unit_id) {
        return send(400, {
          error: 'missing_unit_id',
          detail: 'manifest.unit.unit_id is required',
          received_unit: manifest.unit,
          received_unit_keys: manifest.unit && typeof manifest.unit === 'object' ? Object.keys(manifest.unit) : null,
          schema_hint: '"unit": { "unit_id": "echo-test-v0", "version": "0.1.0", "novalum_shield_check": true }'
        });
      }
      // All structural checks passed — invoke runManifest
      try {
        const sandboxRunner = require(path.join(__dirname, 'cube', 'omni-processor', 'sandbox-runner.js'));
        const result = sandboxRunner.runManifest(manifest);
        audit('[' + ip + ']', '/omni/submit', 'manifest_id=' + manifest.manifest_id, 'ok=' + result.ok);
        return send(result.ok ? 200 : 500, result);
      } catch (e) {
        audit('[' + ip + ']', '/omni/submit', 'RUNNER_ERROR ' + e.message);
        return send(500, { error: 'runner_failed', detail: e.message, manifest_id: manifest.manifest_id });
      }
    }

    // GET /omni/echo — debug endpoint that just echoes the parsed body back
    // so callers can verify what acer received without needing the runner.
    // Auth required (already gated above). No execution.
    if (req.method === 'POST' && req.url === '/omni/echo') {
      let body;
      try { body = await readBody(req); }
      catch (e) { return send(400, { error: 'invalid_json', detail: e.message }); }
      audit('[' + ip + ']', '/omni/echo', 'echoed ' + (typeof body === 'object' ? Object.keys(body).length + ' keys' : typeof body));
      return send(200, {
        ok: true,
        received: body,
        received_type: typeof body,
        received_keys: typeof body === 'object' && body !== null ? Object.keys(body) : null,
        ts: new Date().toISOString()
      });
    }

    // POST /press
    if (req.method === 'POST' && req.url === '/press') {
      const body = await readBody(req);
      const key = String(body.key || '').toUpperCase();
      const target = resolveTargetBody(body);
      const shift = body.shift === true;

      if (!key) return send(400, { error: 'missing_key' });

      const r = powershellPressKey(key, target, shift);
      if (r.error) {
        return send(400, { error: 'press_failed', detail: r.error.message });
      }
      if (r.status !== 0) {
        return send(500, { error: 'sendkeys_failed' });
      }

      audit('[' + ip + ']', '/press', 'key=' + key, 'shift=' + shift, 'window=' + (target.windowTitle || target.windowId || '(focused)'));
      return send(200, {
        ok: true,
        pressed: key,
        shift: shift,
        window_id: target.windowId || null,
        window_title: target.windowTitle || '<foreground>'
      });
    }

    // 404
    return send(404, {
      error: 'not_found',
      endpoints: ['GET /health', 'GET /omninode/anatomy', 'GET /windows', 'GET /status', 'POST /type', 'POST /press', 'GET /omni/units', 'POST /omni/submit']
    });

  } catch (e) {
    audit('[' + ip + '] ERROR', e.message);
    return send(500, { error: 'server_error', detail: e.message });
  }
});

initVault();
audit('agent-keyboard starting on ' + HOST + ':' + PORT, '(cube=17^3 dimension=D7_STATE)');

server.listen(PORT, HOST, function() {
  console.log('agent-keyboard listening on http://' + HOST + ':' + PORT);
  console.log('cube_law: 4913 = 17^3 = D7 STATE prime cube');
  console.log('vault: ' + VAULT_DIR);
  console.log('log: ' + LOG_FILE);
  console.log('enabled: ' + isEnabled());
  console.log('');
  console.log('To enable:');
  console.log('  1) start server (this process is running)');
  console.log('  2) edit ' + ALLOWLIST_FILE + ' to add caller IPs');
  console.log('  3) create ' + ENABLED_FLAG + ' (empty file)');
  console.log('  4) share token from ' + TOKEN_FILE + ' via secure channel');
});

server.on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    console.error('port ' + PORT + ' already in use — another agent-keyboard instance running?');
  } else {
    console.error('server error:', err.message);
  }
  process.exit(1);
});

process.on('SIGINT', function() {
  audit('agent-keyboard shutting down (SIGINT)');
  console.log('\nshutting down');
  process.exit(0);
});
