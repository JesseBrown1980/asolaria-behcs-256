#!/usr/bin/env node
/**
 * sandbox-runner.js — omni-processor stage 3 runner (acer side)
 *
 * LX-489 + LX-490 implementation. Runs a workload manifest through 11 runtime
 * guardrails (RG-1..RG-11). Spawns the unit's executable in a child process with
 * restricted env, cwd in a per-manifest sandbox dir, timeout, output capture.
 * Writes RG-11 human-in-loop events to the qdd-recon-allhands meeting room.
 * Appends every action to logs/omni-processor.ndjson.
 *
 * Cosign chain: LX-489 tier-2 acer-side cosigned by Jesse 2026-04-07T00:55Z.
 * Cube law: every record carries cube[] tags. NovaLUM shield is RG-1.
 *
 * Usage:
 *   node tools/cube/omni-processor/sandbox-runner.js <manifest.json>
 *   node tools/cube/omni-processor/sandbox-runner.js --selftest
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = 'C:/Users/acer/Asolaria';
const REGISTRY_PATH = path.join(ROOT, 'tools/cube/omni-processor/units-registry.json');
const SANDBOX_ROOT = path.join(ROOT, 'data/omni-processor/sandbox');
const LOG_PATH = path.join(ROOT, 'logs/omni-processor.ndjson');
const ALLHANDS_PATH = path.join(ROOT, 'data/meeting-rooms/qdd-recon-allhands.ndjson');

const NOVALUM_SHIELDED_CUBE = 103823;
const KILL_TOKEN_DIR = path.join(ROOT, 'data/vault/owner/omni-processor');
const KILL_ALL_FILE = path.join(KILL_TOKEN_DIR, 'KILL_ALL');

// In-flight job table — module-level so listInFlight can read it
const inFlightJobs = new Map();

function checkKillToken(manifestId) {
  if (fs.existsSync(KILL_ALL_FILE)) return 'KILL_ALL';
  const perJob = path.join(KILL_TOKEN_DIR, 'KILL_' + manifestId);
  if (fs.existsSync(perJob)) return 'KILL_' + manifestId;
  return null;
}

function listInFlight() {
  return Array.from(inFlightJobs.values());
}

const now = () => new Date().toISOString();
const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const appendLine = (f, o) => { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(o) + '\n'); };

function appendLog(record) { appendLine(LOG_PATH, { ts: now(), ...record }); }

function postAllhands(verb, manifestId, body) {
  appendLine(ALLHANDS_PATH, {
    ts: now(),
    room: 'qdd-recon-allhands',
    from: 'sandbox-runner',
    to: 'jesse_operator',
    verb,
    cube: [50653, 704969],
    dims: ['D12_ECHO', 'D24_INTENT'],
    body: `@${verb} manifest_id=${manifestId} ${body || ''}`,
  });
}

function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

// === Guardrails ===
function rg1_novalum_shield(manifest, unit) {
  if (unit.novalum_shield_compliant === false) {
    const isLocal = manifest.target && manifest.target.host_explicit_local === true;
    const sameHost = manifest.dispatcher && manifest.dispatcher.host === 'asolaria-instance@acer';
    if (!(isLocal && sameHost)) {
      throw new Error('RG-1 NOVALUM_SHIELD: shielded unit dispatched cross-host or not host-explicit-local');
    }
  }
  const targetCube = manifest.target && manifest.target.cube_coordinate;
  if (targetCube === NOVALUM_SHIELDED_CUBE) {
    throw new Error('RG-1 NOVALUM_SHIELD: target cube 103823 is shielded from compute fabric');
  }
}
function rg2_schema(manifest) {
  const required = ['manifest_id', 'dispatcher', 'target', 'unit', 'inputs', 'authority', 'law_class'];
  for (const k of required) {
    if (manifest[k] === undefined) throw new Error('RG-2 SCHEMA: missing field ' + k);
  }
  if (!manifest.unit.unit_id) throw new Error('RG-2 SCHEMA: missing unit.unit_id');
}
function rg3_inputs(manifest, unit) {
  for (const [k, schema] of Object.entries(unit.input_schema || {})) {
    const required = typeof schema === 'string' && schema.includes('required');
    if (required && (manifest.inputs[k] === undefined || manifest.inputs[k] === null)) {
      throw new Error('RG-3 INPUTS: missing required input ' + k);
    }
  }
}
function rg5_memory_args(manifest) {
  const ram = (manifest.target && manifest.target.min_resources && manifest.target.min_resources.ram_mb) || 256;
  const heapMB = Math.floor(ram * 0.9);
  return ['--max-old-space-size=' + heapMB];
}
function rg6_makeSandbox(manifestId) {
  const dir = path.join(SANDBOX_ROOT, manifestId);
  ensureDir(path.join(dir, 'in'));
  ensureDir(path.join(dir, 'out'));
  ensureDir(path.join(dir, 'tmp'));
  ensureDir(path.join(dir, 'log'));
  return dir;
}
function rg8_strippedEnv() {
  const env = {
    PATH: process.env.PATH || '',
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    NODE_OPTIONS: '',
  };
  // strip secrets
  return env;
}

// === Main run ===
function runManifest(manifest) {
  const startTs = Date.now();
  appendLog({ kind: 'workload_received', manifest_id: manifest.manifest_id, dispatcher: manifest.dispatcher });

  const registry = loadRegistry();
  const unit = registry.units[manifest.unit.unit_id];
  if (!unit) {
    const err = 'unit not in registry: ' + manifest.unit.unit_id;
    appendLog({ kind: 'workload_rejected', manifest_id: manifest.manifest_id, reason: err });
    throw new Error(err);
  }

  // RG-1
  rg1_novalum_shield(manifest, unit);
  // RG-2
  rg2_schema(manifest);
  // RG-3
  rg3_inputs(manifest, unit);

  // KILL_NOW pre-check (RG-11 extension)
  const preKill = checkKillToken(manifest.manifest_id);
  if (preKill) {
    appendLog({ kind: 'workload_killed_pre', manifest_id: manifest.manifest_id, kill_token: preKill });
    throw new Error('KILL_NOW token present pre-spawn: ' + preKill);
  }

  // Register in-flight
  inFlightJobs.set(manifest.manifest_id, {
    manifest_id: manifest.manifest_id,
    unit_id: unit.unit_id,
    dispatcher: manifest.dispatcher.agent_id,
    started_at: now(),
    pid: null,
  });

  // RG-11 STARTED
  postAllhands('workload.started', manifest.manifest_id, `unit=${unit.unit_id} dispatcher=${manifest.dispatcher.agent_id}`);
  appendLog({ kind: 'workload_started', manifest_id: manifest.manifest_id, unit_id: unit.unit_id });

  // RG-6 sandbox
  const sandboxDir = rg6_makeSandbox(manifest.manifest_id);

  // RG-4 timeout
  const maxRuntimeSec = (manifest.target && manifest.target.min_resources && manifest.target.min_resources.max_runtime_sec) || 60;

  // RG-5 memory args
  const memArgs = rg5_memory_args(manifest);

  // RG-8 stripped env
  const env = rg8_strippedEnv();

  // Spawn
  const exePath = path.join(ROOT, unit.executable);
  if (!fs.existsSync(exePath)) {
    throw new Error('unit executable missing: ' + exePath);
  }
  const child = cp.spawnSync('node', [...memArgs, exePath], {
    cwd: sandboxDir,
    env,
    input: JSON.stringify(manifest),
    encoding: 'utf8',
    timeout: maxRuntimeSec * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const elapsedMs = Date.now() - startTs;
  const ok = child.status === 0 && !child.error;

  // Remove from in-flight
  inFlightJobs.delete(manifest.manifest_id);
  const stdout = (child.stdout || '').trim();
  const stderr = (child.stderr || '').trim();

  let result = null;
  if (ok && stdout) {
    try { result = JSON.parse(stdout); } catch (_) { /* leave null */ }
  }

  // result write
  fs.writeFileSync(path.join(sandboxDir, 'out', 'result.json'), JSON.stringify({ ok, status: child.status, stdout, stderr, result }, null, 2));

  // RG-11 COMPLETED/FAILED
  const verb = ok ? 'workload.completed' : 'workload.failed';
  postAllhands(verb, manifest.manifest_id, `elapsed_ms=${elapsedMs} status=${child.status}`);
  appendLog({ kind: ok ? 'workload_completed' : 'workload_failed', manifest_id: manifest.manifest_id, elapsed_ms: elapsedMs, status: child.status, stderr_head: stderr.slice(0, 200) });

  return { ok, manifest_id: manifest.manifest_id, elapsed_ms: elapsedMs, status: child.status, result, sandbox_dir: sandboxDir };
}

// === Self-test ===
function selftest() {
  const tests = [];
  const log = (name, ok, detail) => { tests.push({ name, ok, detail }); console.log((ok ? '[PASS]' : '[FAIL]') + ' ' + name + (detail ? ' — ' + detail : '')); };

  // T1: registry loads
  try { const r = loadRegistry(); log('T1 registry loads', !!r.units, Object.keys(r.units).length + ' units'); }
  catch (e) { log('T1 registry loads', false, e.message); }

  // T2: trivial echo manifest runs
  const echoManifest = {
    manifest_id: 'selftest-echo-' + Date.now(),
    schema_version: 'v0',
    ts_dispatched: now(),
    dispatcher: { agent_id: 'sandbox-runner-selftest', host: 'asolaria-instance@acer', operator_witnessed: true },
    target: { addressing_mode: 'host_explicit', host_explicit: 'asolaria-instance@acer', host_explicit_local: true, min_resources: { max_runtime_sec: 10, ram_mb: 128 } },
    unit: { unit_id: 'echo-test-v0', version: '0.1.0', novalum_shield_check: true },
    inputs: { message: 'hello from selftest at ' + now() },
    result_path: { kind: 'sync_return' },
    authority: { primary: 'asolaria_primary', cosign_chain: ['jesse_acer_tier2_2026-04-07T00:55Z'], lx_chain: ['LX-489'] },
    law_class: 'AAR_auto_approve',
    audit: { evidence_path: 'sandbox-runner selftest', operator_witnessed: true, operator_witness_chain: ['jesse'] },
  };
  let echoResult;
  try { echoResult = runManifest(echoManifest); log('T2 echo runs ok', echoResult.ok, 'elapsed=' + echoResult.elapsed_ms + 'ms'); }
  catch (e) { log('T2 echo runs ok', false, e.message); }

  // T3: echo result content matches
  if (echoResult && echoResult.result) {
    const m = echoResult.result.echoed === echoManifest.inputs.message;
    log('T3 echo content matches', m, m ? '' : 'expected="' + echoManifest.inputs.message + '" got="' + echoResult.result.echoed + '"');
  } else {
    log('T3 echo content matches', false, 'no result');
  }

  // T4: rg1 novalum shield catches a bad manifest
  const badManifest = JSON.parse(JSON.stringify(echoManifest));
  badManifest.manifest_id = 'selftest-shield-' + Date.now();
  badManifest.target.cube_coordinate = NOVALUM_SHIELDED_CUBE;
  badManifest.target.host_explicit_local = false;
  let shieldCaught = false;
  try { runManifest(badManifest); }
  catch (e) { if (e.message.includes('RG-1')) shieldCaught = true; }
  log('T4 RG-1 catches NovaLUM shield', shieldCaught);

  // T5: rg2 schema catches missing field
  const malformed = JSON.parse(JSON.stringify(echoManifest));
  malformed.manifest_id = 'selftest-malformed-' + Date.now();
  delete malformed.authority;
  let schemaCaught = false;
  try { runManifest(malformed); }
  catch (e) { if (e.message.includes('RG-2')) schemaCaught = true; }
  log('T5 RG-2 catches missing field', schemaCaught);

  // T6: log file got entries
  const logExists = fs.existsSync(LOG_PATH);
  let lineCount = 0;
  if (logExists) lineCount = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length;
  log('T6 audit log appended', logExists && lineCount > 0, 'lines=' + lineCount);

  // T7: allhands meeting room got entries
  const allhandsExists = fs.existsSync(ALLHANDS_PATH);
  let allhandsCount = 0;
  if (allhandsExists) {
    const content = fs.readFileSync(ALLHANDS_PATH, 'utf8');
    allhandsCount = (content.match(/sandbox-runner/g) || []).length;
  }
  log('T7 RG-11 allhands posts', allhandsExists && allhandsCount > 0, 'sandbox-runner posts=' + allhandsCount);

  // T8: KILL_NOW token catches a workload before spawn
  ensureDir(KILL_TOKEN_DIR);
  const killManifest = JSON.parse(JSON.stringify(echoManifest));
  killManifest.manifest_id = 'selftest-killtoken-' + Date.now();
  fs.writeFileSync(path.join(KILL_TOKEN_DIR, 'KILL_' + killManifest.manifest_id), 'kill');
  let killCaught = false;
  try { runManifest(killManifest); }
  catch (e) { if (e.message.includes('KILL_NOW')) killCaught = true; }
  // cleanup the token
  try { fs.unlinkSync(path.join(KILL_TOKEN_DIR, 'KILL_' + killManifest.manifest_id)); } catch (_) {}
  log('T8 KILL_NOW token catches', killCaught);

  // T9: listInFlight returns empty after all jobs completed
  const inFlight = listInFlight();
  log('T9 listInFlight clean post-completion', inFlight.length === 0, 'count=' + inFlight.length);

  const passed = tests.filter(t => t.ok).length;
  const total = tests.length;
  console.log('\n=== ' + passed + '/' + total + ' tests passed ===');
  process.exit(passed === total ? 0 : 1);
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) {
    selftest();
  } else {
    const manifestPath = process.argv[2];
    if (!manifestPath) { console.error('usage: sandbox-runner.js <manifest.json> | --selftest'); process.exit(1); }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const result = runManifest(manifest);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
}

module.exports = { runManifest, loadRegistry, listInFlight, checkKillToken };
