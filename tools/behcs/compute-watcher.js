#!/usr/bin/env node
/**
 * compute-watcher.js — BEHCS CPU+GPU watcher.
 * Pulses CPU load + RAM + GPU stats to BEHCS bus every 30s.
 * Cube: D14 ENERGY (79507) + D21 HARDWARE (389017) + D44 HEARTBEAT (7189057)
 */
'use strict';
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

const BEHCS_PORT = 4947;
const INTERVAL = 30000;
let cycle = 0;

function getGpuStats() {
  try {
    const out = execSync('nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', { encoding: 'utf8', timeout: 5000 });
    const [temp, util, memUsed, memTotal] = out.trim().split(',').map(s => s.trim());
    return { temp: parseInt(temp), util: parseInt(util), memUsed: parseInt(memUsed), memTotal: parseInt(memTotal), ok: true };
  } catch (_) {
    return { ok: false, reason: 'nvidia-smi unavailable' };
  }
}

function pulse() {
  cycle++;
  const cpus = os.cpus();
  const load = os.loadavg();
  const ramTotal = (os.totalmem() / 1073741824).toFixed(1);
  const ramFree = (os.freemem() / 1073741824).toFixed(1);
  const ramUsedPct = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(0);
  const gpu = getGpuStats();

  const payload = {
    verb: 'behcs.compute_pulse',
    device: 'acer',
    cycle,
    cpu: { model: cpus[0]?.model, cores: cpus.length, load, speed_mhz: cpus[0]?.speed },
    ram: { total_gb: ramTotal, free_gb: ramFree, used_pct: ramUsedPct },
    gpu: gpu.ok ? { model: 'GTX 1050', temp_c: gpu.temp, util_pct: gpu.util, mem_used_mb: gpu.memUsed, mem_total_mb: gpu.memTotal } : { model: 'GTX 1050', status: gpu.reason },
    uptime_h: (os.uptime() / 3600).toFixed(1),
  };

  const env = JSON.stringify({
    from: 'acer', to: 'triad', mode: 'shadow', type: 'compute_pulse',
    id: 'cw-' + cycle, ts: new Date().toISOString(),
    tuple: '(acer,behcs.compute_pulse,triad,0,hardware,hookwall,pulsing,[D14+D21+D44],pulse,IX,signed,session,behcs-bus,light)',
    payload,
  });

  const req = http.request({
    hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(env) },
  });
  req.on('error', () => {});
  req.write(env);
  req.end();

  if (cycle % 4 === 1) {
    const gpuStr = gpu.ok ? `GPU=${gpu.temp}C ${gpu.util}% ${gpu.memUsed}/${gpu.memTotal}MB` : 'GPU=N/A';
    console.log(`[compute] #${cycle} CPU=${load[0].toFixed(1)} RAM=${ramUsedPct}% ${gpuStr}`);
  }
}

console.log('[compute-watcher] BEHCS compute pulse starting — CPU+GPU every 30s');
pulse();
setInterval(pulse, INTERVAL);
