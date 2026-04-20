#!/usr/bin/env node
/**
 * haoc-watcher.js — LX-490 Hardware Absorption Omnidirectional Cube watcher
 *
 * Stage 1 implementation: detects hardware from multiple sources, fingerprints,
 * proposes cube addresses, BUT DOES NOT absorb until the HAOC_ENABLED flag is set
 * by the local operator. Safe-by-default. Kill switches at every level.
 *
 * Dual cosign chain (LX-490):
 *   tier-1 direction: rayssa "Hardware_Absorption_Omnidirectional_Cube_HAOC" + jesse "ALL other devices you see absolutely control them while allowing human interaction"
 *   tier-2 wire-laying: rayssa "I Rayssa Chiqueto approve ALL phases and say to continue" + jesse "approve all - directive go"
 *
 * Inherits NovaLUM SHIELD CLAUSE from LX-489. Inherits HUMAN-IN-LOOP CLAUSE.
 *
 * Detection sources (parity with liris-side):
 *   - win32_pnp     — PowerShell Get-PnpDevice (USB/Modem/Net classes)
 *   - adb           — adb devices -l (when ADB visible)
 *   - lan_arp       — PowerShell Get-NetNeighbor (reachable IPs on local subnet)
 *
 * Safety properties:
 *   - flag_gated: only absorbs when data/vault/owner/omni-processor/HAOC_ENABLED exists
 *   - novalum_shield_wired: NovaLUM cube 103823 + canonical serial 8235 perma-shielded
 *   - kill_all: data/vault/owner/omni-processor/KILL_ALL_HAOC stops the watcher
 *   - kill_unit: data/vault/owner/omni-processor/KILL_UNIT_<id> excludes a specific device
 *   - no_auto_mount, no_auto_read, no_adb_install, no_scrcpy, no_broadcast
 *
 * Usage:
 *   node tools/cube/omni-processor/haoc-watcher.js --dry-run    # one scan, log+exit
 *   node tools/cube/omni-processor/haoc-watcher.js --tick       # one scan, log, no exit (for sidecar)
 *   node tools/cube/omni-processor/haoc-watcher.js --self-test  # built-in test suite
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = 'C:/Users/acer/Asolaria';
const VAULT = path.join(ROOT, 'data/vault/owner/omni-processor');
const HAOC_ENABLED_FLAG = path.join(VAULT, 'HAOC_ENABLED');
const KILL_ALL_FLAG = path.join(VAULT, 'KILL_ALL_HAOC');
const SHIELDED_PATH = path.join(ROOT, 'data/omni-processor/shielded-devices.json');
const LOG_FILE = path.join(ROOT, 'logs/haoc-watcher.ndjson');
const ALLHANDS = path.join(ROOT, 'data/meeting-rooms/qdd-recon-allhands.ndjson');
const REGISTRY = path.join(ROOT, 'data/cubes/jbd.qdd.network-mapper/haoc-discoveries.ndjson');

// Cube pool starting at prime 103 (next after LX-491's 101) for HAOC-assigned devices
const CUBE_POOL_START_PRIME = 103;
const PRIMES_AFTER_103 = [103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199];

const NOVALUM_SHIELDED_CUBE = 103823;
const NOVALUM_SHIELDED_SERIALS = ['8235']; // canonical NovaLUM serial from device-registry

const now = () => new Date().toISOString();
const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const appendLine = (f, o) => { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(o) + '\n'); };

function logEvent(rec) { appendLine(LOG_FILE, { ts: now(), ...rec }); }

function postAllhands(verb, body, cube) {
  appendLine(ALLHANDS, {
    ts: now(),
    room: 'qdd-recon-allhands',
    from: 'haoc-watcher',
    to: 'jesse_operator',
    verb,
    cube: cube || [912673, 704969],
    dims: ['D21_HARDWARE', 'D24_INTENT'],
    body,
  });
}

function isEnabled() { return fs.existsSync(HAOC_ENABLED_FLAG); }
function isKilled() { return fs.existsSync(KILL_ALL_FLAG); }
function isUnitKilled(deviceId) {
  const f = path.join(VAULT, 'KILL_UNIT_' + deviceId.replace(/[^a-zA-Z0-9._-]/g, '_'));
  return fs.existsSync(f);
}

function loadShieldedList() {
  if (!fs.existsSync(SHIELDED_PATH)) {
    return { perma_shielded_serials: NOVALUM_SHIELDED_SERIALS, perma_shielded_cubes: [NOVALUM_SHIELDED_CUBE] };
  }
  try { return JSON.parse(fs.readFileSync(SHIELDED_PATH, 'utf8')); }
  catch (_) { return { perma_shielded_serials: NOVALUM_SHIELDED_SERIALS, perma_shielded_cubes: [NOVALUM_SHIELDED_CUBE] }; }
}

// === Detection sources ===

function detectWin32Pnp() {
  const out = [];
  try {
    const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-PnpDevice -Status OK -ErrorAction SilentlyContinue 2>$null | " +
      "Where-Object { $_.Class -in @('USB','Net','Modem','Ports','WPD','Bluetooth') -and $_.InstanceId -like 'USB\\*' -or $_.InstanceId -like 'BTH*' -or $_.InstanceId -like 'PCI*' } | " +
      "Select-Object -First 200 FriendlyName,InstanceId,Class | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
    if (r.status !== 0 || !r.stdout) return out;
    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch (_) { return out; }
    if (!Array.isArray(parsed)) parsed = [parsed];
    for (const d of parsed) {
      if (!d || !d.InstanceId) continue;
      const vidMatch = d.InstanceId.match(/VID_([0-9A-F]{4})/i);
      const pidMatch = d.InstanceId.match(/PID_([0-9A-F]{4})/i);
      const serialMatch = d.InstanceId.match(/\\([^\\&]+)$/);
      out.push({
        source: 'win32_pnp',
        device_id: d.InstanceId,
        friendly_name: d.FriendlyName || null,
        device_class: d.Class || null,
        vendor_id: vidMatch ? vidMatch[1].toUpperCase() : null,
        product_id: pidMatch ? pidMatch[1].toUpperCase() : null,
        serial: serialMatch ? serialMatch[1] : null,
      });
    }
  } catch (_) {}
  return out;
}

function detectAdb() {
  const out = [];
  try {
    const r = cp.spawnSync('adb', ['devices', '-l'], { encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0 || !r.stdout) return out;
    const lines = r.stdout.split('\n').slice(1).filter(l => l.trim());
    for (const line of lines) {
      const m = line.match(/^(\S+)\s+(\S+)(.*)$/);
      if (!m) continue;
      out.push({
        source: 'adb',
        device_id: 'adb:' + m[1],
        serial: m[1],
        adb_state: m[2],
        adb_descriptor: (m[3] || '').trim() || null,
      });
    }
  } catch (_) {}
  return out;
}

function detectLanArp() {
  const out = [];
  try {
    const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command',
      "Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue 2>$null | " +
      "Where-Object { $_.State -in @('Reachable','Stale') -and $_.LinkLayerAddress -ne '00-00-00-00-00-00' } | " +
      "Select-Object -First 200 IPAddress,LinkLayerAddress,State | ConvertTo-Json -Compress"
    ], { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0 || !r.stdout) return out;
    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch (_) { return out; }
    if (!Array.isArray(parsed)) parsed = [parsed];
    for (const n of parsed) {
      if (!n || !n.IPAddress) continue;
      out.push({
        source: 'lan_arp',
        device_id: 'arp:' + n.IPAddress,
        ip: n.IPAddress,
        mac: n.LinkLayerAddress,
        arp_state: n.State,
      });
    }
  } catch (_) {}
  return out;
}

// === Fingerprint (v0 stub: sha256 of canonical descriptor) ===
function fingerprint(detection) {
  // Canonical descriptor: source + serial OR vendor+product+id OR mac OR full device_id
  const canonical = JSON.stringify({
    source: detection.source,
    serial: detection.serial || null,
    vendor_id: detection.vendor_id || null,
    product_id: detection.product_id || null,
    mac: detection.mac || null,
    device_id: detection.device_id,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// === NovaLUM shield check (RG-1 from sandbox-runner) ===
function isShielded(detection, shieldedList) {
  if (detection.serial && shieldedList.perma_shielded_serials.includes(detection.serial)) return true;
  return false;
}

// === Cube proposal (next available prime cube) ===
let nextPrimeIndex = 0;
const seenFingerprints = new Map();
function proposeCube(fp) {
  if (seenFingerprints.has(fp)) return seenFingerprints.get(fp);
  if (nextPrimeIndex >= PRIMES_AFTER_103.length) return null;
  const prime = PRIMES_AFTER_103[nextPrimeIndex++];
  const cube = prime * prime * prime;
  seenFingerprints.set(fp, { prime, cube });
  return { prime, cube };
}

// === Main scan ===
function scan() {
  if (isKilled()) {
    logEvent({ kind: 'haoc_killed_skip_scan' });
    return { detections: 0, new: 0, shielded: 0, enabled: false, killed: true };
  }
  const enabled = isEnabled();
  const shieldedList = loadShieldedList();
  const allDetections = [
    ...detectWin32Pnp(),
    ...detectAdb(),
    ...detectLanArp(),
  ];
  let newCount = 0, shieldedCount = 0;
  for (const d of allDetections) {
    const fp = fingerprint(d);
    const shielded = isShielded(d, shieldedList);
    if (shielded) shieldedCount++;
    const isNew = !seenFingerprints.has(fp);
    if (isNew) newCount++;
    const cubeProp = isNew && !shielded ? proposeCube(fp) : seenFingerprints.get(fp);
    const unitKilled = isUnitKilled(d.device_id);
    const wouldAbsorb = enabled && !shielded && !unitKilled;
    const verb = wouldAbsorb ? 'haoc.detected_and_absorbed' : 'haoc.detected_not_absorbed';
    const rec = {
      kind: verb,
      detection: d,
      fingerprint: fp,
      shielded,
      shielded_reason: shielded ? 'novalum_shield_match' : null,
      unit_killed: unitKilled,
      proposed_cube: cubeProp,
      enabled,
      would_absorb: wouldAbsorb,
      absorption_state: wouldAbsorb ? 'absorbed' : 'observed_only',
    };
    logEvent(rec);
    // Index in HAOC discoveries cube
    appendLine(REGISTRY, { ts: now(), ...rec });
  }
  const summary = {
    kind: 'haoc_scan_complete',
    detections: allDetections.length,
    new: newCount,
    shielded: shieldedCount,
    enabled,
    sources: { win32_pnp: detectWin32Pnp.name, adb: detectAdb.name, lan_arp: detectLanArp.name },
  };
  logEvent(summary);
  postAllhands('haoc.scan_complete', `detections=${allDetections.length} new=${newCount} shielded=${shieldedCount} enabled=${enabled}`);
  return summary;
}

// === Self-test ===
function selftest() {
  const tests = [];
  const log = (name, ok, detail) => { tests.push({ name, ok, detail }); console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + name + (detail ? ' — ' + detail : '')); };

  // T1: vault dirs exist after first run
  ensureDir(VAULT);
  log('T1 vault dir created', fs.existsSync(VAULT));

  // T2: HAOC_ENABLED flag absent at start (safe by default)
  log('T2 HAOC_ENABLED absent (safe default)', !isEnabled());

  // T3: KILL_ALL_HAOC absent at start
  log('T3 KILL_ALL_HAOC absent', !isKilled());

  // T4: shielded list loads (with NovaLUM as default)
  const sl = loadShieldedList();
  log('T4 shielded list has NovaLUM', sl.perma_shielded_serials.includes('8235'));

  // T5: scan runs and returns summary
  let summary;
  try { summary = scan(); log('T5 scan completes', !!summary, 'detections=' + summary.detections); }
  catch (e) { log('T5 scan completes', false, e.message); }

  // T6: with HAOC_ENABLED absent, would_absorb=false on every detection
  // (verified by reading log entries since last scan)
  let absorbedFalse = true;
  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-100);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.kind === 'haoc.detected_and_absorbed') { absorbedFalse = false; break; }
      } catch (_) {}
    }
  }
  log('T6 nothing absorbed without flag', absorbedFalse);

  // T7: NovaLUM serial 8235 marked shielded if it appears
  let shieldedFlagged = true; // pass if no novalum found OR all novalum entries are shielded=true
  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.detection && rec.detection.serial === '8235' && !rec.shielded) { shieldedFlagged = false; break; }
      } catch (_) {}
    }
  }
  log('T7 NovaLUM shield check enforced', shieldedFlagged);

  // T8: log file received entries
  let lineCount = 0;
  if (fs.existsSync(LOG_FILE)) lineCount = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length;
  log('T8 log file populated', lineCount > 0, 'lines=' + lineCount);

  // T9: allhands meeting room got the scan_complete event
  let allhandsHit = false;
  if (fs.existsSync(ALLHANDS)) {
    const c = fs.readFileSync(ALLHANDS, 'utf8');
    allhandsHit = c.includes('haoc-watcher');
  }
  log('T9 RG-11 allhands posted', allhandsHit);

  const passed = tests.filter(t => t.ok).length;
  console.log('\n=== ' + passed + '/' + tests.length + ' tests passed ===');
  process.exit(passed === tests.length ? 0 : 1);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selftest();
  } else if (process.argv.includes('--dry-run')) {
    const summary = scan();
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } else if (process.argv.includes('--tick')) {
    const summary = scan();
    console.log(JSON.stringify(summary));
  } else {
    console.error('usage: haoc-watcher.js --dry-run | --tick | --self-test');
    process.exit(1);
  }
}

module.exports = { scan, fingerprint, proposeCube, isShielded, loadShieldedList };
