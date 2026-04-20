"use strict";

/**
 * cpu-gpu-watcher.js — first concrete watcher in the omnidirectional control plane
 *
 * Cube law: D14 ENERGY (prime 43, cube 79507). Watcher publishes compute metrics
 * into the D14 ENERGY pipe. This is the first producer in the mesh.
 *
 * Spec source: project_omnidirectional_control_plane.md (2026-04-06 Jesse directive)
 *
 * Hilbert anatomy:
 *   D1  ACTOR       = asolaria-acer
 *   D2  VERB        = know.observe (watcher verb)
 *   D3  TARGET      = local cpu + gpu
 *   D5  LAYER       = chip + os
 *   D7  STATE       = observed each tick
 *   D14 ENERGY      = primary dimension (the watcher IS an energy observer)
 *   D15 DEVICE      = local hardware
 *   D20 TIME        = periodic (cron-like, default 5s)
 *   D21 HARDWARE    = primary subdimension
 *
 * Output:
 *   - Append-only NDJSON at C:\Users\acer\Asolaria\logs\cpu-gpu-watcher.ndjson
 *   - Mirrored to D:\safety-backups\session-20260406-asolaria\cpu-gpu-watcher.ndjson
 *   - Each tick is one JSON line with the full anatomy of the observation
 *
 * Cube tags on each observation:
 *   - dimension: D14_ENERGY
 *   - cube_value: 79507
 *   - cube_prime: 43
 *
 * Default tick: 5000ms (5s). Override with WATCHER_INTERVAL_MS env.
 *
 * Usage: node tools/cpu-gpu-watcher.js
 *
 * Stop: Ctrl+C (graceful, writes a final tick and exits).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const INTERVAL_MS = parseInt(process.env.WATCHER_INTERVAL_MS || '5000', 10);
const RUN_ONCE = process.argv.includes('--once');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'cpu-gpu-watcher.ndjson');
const D_MIRROR_DIR = 'D:\\safety-backups\\session-20260406-asolaria';
const D_MIRROR_FILE = path.join(D_MIRROR_DIR, 'cpu-gpu-watcher.ndjson');

// LX-491 cube-alignment: publish a compact compute manifest pulse to the
// omnidirectional calendar every CALENDAR_INTERVAL_TICKS ticks (default 12 =
// once per minute at 5s tick rate). This is the watcher's contribution to the
// omnidirectional cubes — it makes compute resources discoverable + addressable
// by the omni_processor scheduler when LX-489 stage 4+ goes live.
const CALENDAR_FILE = path.join(__dirname, '..', 'data', 'omnidirectional-calendar.ndjson');
const CALENDAR_INTERVAL_TICKS = parseInt(process.env.WATCHER_CALENDAR_INTERVAL_TICKS || '12', 10);
let tickCount = 0;

const HILBERT_TAGS = {
  dimension: 'D14_ENERGY',
  cube_value: 79507,
  cube_prime: 43,
  watcher_id: 'cpu-gpu-watcher',
  actor: 'asolaria-acer',
  verb: 'know.observe',
  layer: 'chip+os'
};

function ensureDir(filePath) {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (e) {}
}

function appendLog(entry) {
  ensureDir(LOG_FILE);
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  try {
    if (fs.existsSync(D_MIRROR_DIR)) {
      fs.appendFileSync(D_MIRROR_FILE, JSON.stringify(entry) + '\n');
    }
  } catch (e) {
    // best-effort mirror
  }
}

function readCpuOs() {
  // Use Node.js os module — fast, no PowerShell needed for per-tick reads
  const cpus = os.cpus();
  const loadAvg = os.loadavg(); // on Windows this returns [0,0,0] but kept for cross-platform
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  // Per-CPU usage from /proc-style: cpu.times provides cumulative ticks
  const perCpu = cpus.map(function(c, i) {
    const total = c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
    const idle = c.times.idle;
    return {
      core: i,
      model: c.model,
      speed_mhz: c.speed,
      total_ticks: total,
      idle_ticks: idle,
      idle_pct: total > 0 ? (idle / total * 100) : 0
    };
  });

  return {
    cpu: {
      cores_logical: cpus.length,
      per_core: perCpu,
      load_avg_1_5_15: loadAvg,
      uptime_sec: uptime
    },
    ram: {
      total_bytes: totalMem,
      free_bytes: freeMem,
      used_bytes: totalMem - freeMem,
      total_gb: Math.round(totalMem / 1073741824 * 100) / 100,
      free_gb: Math.round(freeMem / 1073741824 * 100) / 100,
      used_pct: Math.round((totalMem - freeMem) / totalMem * 10000) / 100
    }
  };
}

let nvidiaSmiPath = null;
function findNvidiaSmi() {
  if (nvidiaSmiPath) return nvidiaSmiPath;
  const candidates = [
    'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
    'C:\\Windows\\System32\\nvidia-smi.exe'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
      nvidiaSmiPath = candidates[i];
      return nvidiaSmiPath;
    }
  }
  return null;
}

function readGpu() {
  const smi = findNvidiaSmi();
  if (!smi) {
    return {
      available: false,
      reason: 'nvidia-smi not found',
      checked_paths: ['C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe', 'C:\\Windows\\System32\\nvidia-smi.exe']
    };
  }

  // Query nvidia-smi for compact CSV output (no PowerShell needed, no special chars)
  const r = spawnSync(smi, [
    '--query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw',
    '--format=csv,noheader,nounits'
  ], { encoding: 'utf8', timeout: 3000 });

  if (r.status !== 0 || !r.stdout) {
    return {
      available: false,
      reason: 'nvidia-smi query failed',
      stderr: (r.stderr || '').slice(0, 200)
    };
  }

  const lines = r.stdout.trim().split(/\r?\n/);
  const gpus = lines.map(function(line) {
    const parts = line.split(',').map(function(s) { return s.trim(); });
    return {
      index: parseInt(parts[0], 10),
      name: parts[1],
      gpu_util_pct: parseFloat(parts[2]) || 0,
      mem_util_pct: parseFloat(parts[3]) || 0,
      mem_used_mib: parseFloat(parts[4]) || 0,
      mem_total_mib: parseFloat(parts[5]) || 0,
      temperature_c: parseFloat(parts[6]) || 0,
      power_draw_w: parseFloat(parts[7]) || null  // [Not Supported] gives NaN
    };
  });

  return { available: true, count: gpus.length, gpus: gpus };
}

function tick() {
  const ts = new Date().toISOString();
  const cpuRam = readCpuOs();
  const gpu = readGpu();

  const observation = Object.assign({
    ts: ts,
    type: 'compute_observation'
  }, HILBERT_TAGS, {
    cpu: cpuRam.cpu,
    ram: cpuRam.ram,
    gpu: gpu
  });

  appendLog(observation);

  // LX-491 cube-aligned compute manifest pulse to omnidirectional calendar.
  // Compact summary, not the full observation. Includes only fields the
  // omni_processor scheduler needs to make dispatch decisions.
  tickCount++;
  if (tickCount % CALENDAR_INTERVAL_TICKS === 0) {
    try {
      const cpuIdle0 = cpuRam.cpu.per_core[0] ? cpuRam.cpu.per_core[0].idle_pct : null;
      const compute_pulse = {
        ts: ts,
        agent: 'cpu-gpu-watcher',
        surface: 'asolaria-acer',
        verb: 'know.compute_pulse',
        target: 'local_cpu_gpu_ram',
        dimensions_touched: ['D14_ENERGY', 'D15_DEVICE', 'D21_HARDWARE'],
        cube_values: [79507, 103823, 389017],
        duration_ms: 0,
        peers_notified: ['liris-rayssa'],
        result: 'ok',
        operator_witnessed: false,
        chain: ['LX-491'],
        evidence: 'logs/cpu-gpu-watcher.ndjson',
        manifest: {
          cpu_cores_logical: cpuRam.cpu.cores_logical,
          cpu_idle_pct_core0: cpuIdle0 != null ? Math.round(cpuIdle0 * 10) / 10 : null,
          ram_used_pct: cpuRam.ram.used_pct,
          ram_total_gb: cpuRam.ram.total_gb,
          ram_free_gb: cpuRam.ram.free_gb,
          gpu_available: !!gpu.available,
          gpu_name: gpu.available && gpu.gpus[0] ? gpu.gpus[0].name : null,
          gpu_util_pct: gpu.available && gpu.gpus[0] ? gpu.gpus[0].gpu_util_pct : null,
          gpu_mem_used_mib: gpu.available && gpu.gpus[0] ? gpu.gpus[0].mem_used_mib : null,
          gpu_mem_total_mib: gpu.available && gpu.gpus[0] ? gpu.gpus[0].mem_total_mib : null,
          uptime_sec: cpuRam.cpu.uptime_sec
        },
        note: 'compute manifest pulse for omni_processor scheduler discovery — LX-491 cube-alignment'
      };
      ensureDir(CALENDAR_FILE);
      fs.appendFileSync(CALENDAR_FILE, JSON.stringify(compute_pulse) + '\n');
    } catch (e) {
      // best-effort — never crash the watcher because of calendar append
    }
  }

  // Compact console line
  const cpuLoadHint = cpuRam.cpu.per_core[0] ? Math.round(100 - cpuRam.cpu.per_core[0].idle_pct) + '%' : 'n/a';
  const ramUsed = cpuRam.ram.used_pct + '%';
  const gpuLine = gpu.available && gpu.gpus[0]
    ? gpu.gpus[0].name + ' util=' + gpu.gpus[0].gpu_util_pct + '% temp=' + gpu.gpus[0].temperature_c + 'C mem=' + gpu.gpus[0].mem_used_mib + '/' + gpu.gpus[0].mem_total_mib + 'MB'
    : (gpu.reason || 'no_gpu');
  console.log('[' + ts + '] cpu0=' + cpuLoadHint + ' ram=' + ramUsed + ' gpu: ' + gpuLine);
}

console.log('cpu-gpu-watcher starting');
console.log('  cube:      D14 ENERGY (prime=43, cube=79507)');
console.log('  interval:  ' + INTERVAL_MS + 'ms');
console.log('  mode:      ' + (RUN_ONCE ? 'once' : 'persistent'));
console.log('  log:       ' + LOG_FILE);
console.log('  D mirror:  ' + D_MIRROR_FILE);
console.log('  nvidia-smi: ' + (findNvidiaSmi() || 'not found'));
console.log('');

tick();
if (RUN_ONCE) {
  console.log('cpu-gpu-watcher done (once)');
  process.exit(0);
}

const handle = setInterval(tick, INTERVAL_MS);

process.on('SIGINT', function() {
  console.log('\ncpu-gpu-watcher shutting down (SIGINT)');
  clearInterval(handle);
  // final tick on shutdown
  try { tick(); } catch (e) {}
  process.exit(0);
});
