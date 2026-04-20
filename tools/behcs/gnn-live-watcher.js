#!/usr/bin/env node
/**
 * gnn-live-watcher.js — REAL GNN node/edge tracker
 *
 * Watches the BEHCS inbox and builds a LIVE graph of:
 *   WHO (device PID + agent name)
 *   WHAT (verb)
 *   WHERE (IP + port + transport)
 *   WHEN (timestamp — used for recency weighting)
 *   HOW (adb-reverse, ethernet, wifi, keyboard)
 *   WHY (intent from D24)
 *
 * Outputs:
 *   data/behcs/gnn-live-nodes.json — all active nodes with last-seen
 *   data/behcs/gnn-live-edges.ndjson — weighted edges (decay over time)
 *   data/behcs/gnn-active-report.json — current active node summary
 *
 * The cascade reads gnn-active-report.json to make REAL decisions.
 * Stale nodes (>120s) get weight 0. Dead nodes (>300s) get removed.
 *
 * Cube: D8 CHAIN (6859) + D30 ASYMMETRIC (1442897) + D44 HEARTBEAT
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  normalizeDeviceId,
  parseMeminfoLines,
  classifyPressure,
} = require('../../sovereignty/src/resourceBudgetSnapshot');

const ROOT = 'C:/Users/acer/Asolaria';
const BEHCS_DIR = path.join(ROOT, 'data/behcs');
const INBOX = path.join(BEHCS_DIR, 'inbox.ndjson');
const NODES_FILE = path.join(BEHCS_DIR, 'gnn-live-nodes.json');
const EDGES_FILE = path.join(BEHCS_DIR, 'gnn-live-edges.ndjson');
const REPORT_FILE = path.join(BEHCS_DIR, 'gnn-active-report.json');
const D_DEST = 'D:/safety-backups/session-20260412';
const NODE_RETENTION_MS = 1800000;

const now = () => new Date().toISOString();
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirror(src) {
  try { const rel = path.relative(ROOT, src).replace(/\\/g, '/'); const dest = path.join(D_DEST, rel); ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); } catch (_) {}
}
function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
function inferDeviceKind(deviceId) {
  if (deviceId === 'acer') return 'desktop';
  if (deviceId === 'liris') return 'peer';
  if (deviceId === 'falcon' || deviceId === 'felipe') return 'phone';
  return 'device';
}
function extractHardwareMetrics(msg, previousNode = {}) {
  const payload = msg.payload || {};
  const hw = payload.hw && typeof payload.hw === 'object' ? payload.hw : null;
  const cpu = payload.cpu && typeof payload.cpu === 'object' ? payload.cpu : {};
  const ram = payload.ram && typeof payload.ram === 'object' ? payload.ram : {};
  const gpu = payload.gpu && typeof payload.gpu === 'object' ? payload.gpu : {};
  const verb = String(payload.verb || msg.type || '').toLowerCase();
  const hasSignal = Boolean(payload.cpu || payload.ram || payload.gpu || hw || verb.includes('compute_pulse') || verb.includes('behcs.pulse') || verb.includes('node_boot'));
  if (!hasSignal) return null;

  const meminfo = hw ? parseMeminfoLines(hw.ram) : {};
  const cpuLoadArray = Array.isArray(cpu.load) ? cpu.load.map((value) => toNumber(value)).filter((value) => value !== null) : [];
  const cpuLoad1 = cpuLoadArray.length > 0 ? cpuLoadArray[0] : toNumber(cpu.load_1 ?? cpu.load1 ?? previousNode.cpuLoad1);
  const cpuCores = toNumber(cpu.cores ?? cpu.cores_logical ?? hw?.cores ?? previousNode.cpuCores);
  let cpuPct = toNumber(cpu.util_pct ?? cpu.cpu_pct ?? cpu.usage_pct ?? previousNode.cpuPct);
  if (cpuPct === null && cpuLoad1 !== null && cpuCores !== null && cpuCores > 0 && cpuLoad1 <= cpuCores * 2) {
    cpuPct = round((cpuLoad1 / cpuCores) * 100, 1);
  }

  const totalGb = toNumber(ram.total_gb ?? ram.totalGB);
  const freeGb = toNumber(ram.free_gb ?? ram.freeGB);
  const ramTotalMb = totalGb !== null ? round(totalGb * 1024, 1) : toNumber(ram.total_mb ?? ram.totalMb ?? meminfo.ramTotalMb ?? previousNode.ramTotalMb);
  const ramFreeMb = freeGb !== null ? round(freeGb * 1024, 1) : toNumber(ram.free_mb ?? ram.freeMb ?? meminfo.ramFreeMb ?? previousNode.ramFreeMb);
  let ramUsedPct = toNumber(ram.used_pct ?? ram.usedPct ?? meminfo.ramUsedPct ?? previousNode.ramUsedPct);
  if (ramUsedPct === null && ramTotalMb !== null && ramFreeMb !== null && ramTotalMb > 0) {
    ramUsedPct = round((1 - (ramFreeMb / ramTotalMb)) * 100, 1);
  }

  const gpuUtilPct = toNumber(gpu.util_pct ?? gpu.gpu_util_pct ?? gpu.utilization_pct ?? previousNode.gpuUtilPct);
  const gpuTempC = toNumber(gpu.temp_c ?? gpu.temperature_c ?? gpu.temp ?? previousNode.gpuTempC);
  const metrics = [];
  if (cpuPct !== null) metrics.push(cpuPct);
  if (ramUsedPct !== null) metrics.push(ramUsedPct);
  if (gpuUtilPct !== null) metrics.push(gpuUtilPct);
  if (gpuTempC !== null) metrics.push(round((gpuTempC / 90) * 100, 1));
  const pressure = metrics.length > 0 ? classifyPressure(Math.max(...metrics)) : hw ? { score: 25, level: 'low' } : { score: null, level: 'unknown' };

  const deviceId = normalizeDeviceId(payload.device || hw?.device || hw?.name || msg.from);
  return {
    deviceId,
    kind: inferDeviceKind(deviceId),
    cpuCores,
    cpuPct,
    cpuLoad1,
    ramTotalMb,
    ramFreeMb,
    ramUsedPct,
    gpuUtilPct,
    gpuTempC,
    pressure,
    watchers: {
      cpu: Boolean(payload.cpu || hw),
      gpu: Boolean(payload.gpu),
      device: Boolean(hw || verb.includes('pulse') || verb.includes('boot')),
    },
  };
}

// ═══════════════════════════════════════════════════════════
// LIVE NODE REGISTRY
// ═══════════════════════════════════════════════════════════

class LiveNodeRegistry {
  constructor() {
    this.nodes = {};  // keyed by "from" field
    this.edges = [];  // { from, to, verb, weight, ts, wh }
    this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(NODES_FILE)) {
        this.nodes = JSON.parse(fs.readFileSync(NODES_FILE, 'utf8'));
      }
    } catch (_) { this.nodes = {}; }
  }

  saveState() {
    ensureDir(BEHCS_DIR);
    fs.writeFileSync(NODES_FILE, JSON.stringify(this.nodes, null, 2));
    mirror(NODES_FILE);
  }

  // Process a single inbox message
  processMessage(msg, options = {}) {
    const from = msg.from || 'unknown';
    const ts = msg.ts || msg.received_at || now();
    const to = msg.to || 'unknown';
    const verb = msg.payload?.verb || msg.type || 'unknown';
    const devicePid = msg.device_pid || msg.payload?.device_pid || null;
    const receivedBy = msg.received_by || 'unknown';

    // Determine transport
    let transport = 'unknown';
    if (from.includes('aether') || from.includes('trixie') || from.includes('debora')) transport = 'adb-reverse';
    else if (from.includes('liris')) transport = 'ethernet';
    else if (from.includes('asolaria') || from.includes('acer')) transport = 'local';
    else if (from.includes('falcon')) transport = 'wifi-adb';

    // Determine IP from device registry or message
    let ip = 'unknown';
    if (from.includes('liris')) ip = '192.168.100.2';
    else if (from.includes('aether')) ip = '192.168.1.10';  // Felipe WiFi
    else if (from.includes('acer') || from.includes('asolaria')) ip = '127.0.0.1';

    // Build Wh-chain
    const wh = {
      who: { from, devicePid, agent: msg.payload?.agent || from },
      what: verb,
      where: { ip, port: 4947, transport, receivedBy },
      when: ts,
      how: transport,
      why: msg.payload?.focus || msg.payload?.reason || msg.type || 'routine',
    };

    // Update node
    const prevSeen = this.nodes[from]?.lastSeen || null;
    const timeSinceLast = prevSeen ? (new Date(ts).getTime() - new Date(prevSeen).getTime()) / 1000 : 999;

    const hardware = extractHardwareMetrics(msg, this.nodes[from] || {});

    this.nodes[from] = {
      ...this.nodes[from],
      lastSeen: ts,
      messageCount: (this.nodes[from]?.messageCount || 0) + 1,
      lastVerb: verb,
      devicePid: devicePid || this.nodes[from]?.devicePid || null,
      transport,
      ip,
      timeSinceLastMsg: timeSinceLast,
      alive: true,
      wh,
      deviceId: hardware?.deviceId || this.nodes[from]?.deviceId || normalizeDeviceId(from),
      kind: hardware?.kind || this.nodes[from]?.kind || inferDeviceKind(normalizeDeviceId(from)),
      cpuCores: hardware?.cpuCores ?? this.nodes[from]?.cpuCores ?? null,
      cpuPct: hardware?.cpuPct ?? this.nodes[from]?.cpuPct ?? null,
      cpuLoad1: hardware?.cpuLoad1 ?? this.nodes[from]?.cpuLoad1 ?? null,
      ramTotalMb: hardware?.ramTotalMb ?? this.nodes[from]?.ramTotalMb ?? null,
      ramFreeMb: hardware?.ramFreeMb ?? this.nodes[from]?.ramFreeMb ?? null,
      ramUsedPct: hardware?.ramUsedPct ?? this.nodes[from]?.ramUsedPct ?? null,
      gpuUtilPct: hardware?.gpuUtilPct ?? this.nodes[from]?.gpuUtilPct ?? null,
      gpuTempC: hardware?.gpuTempC ?? this.nodes[from]?.gpuTempC ?? null,
      watchers: hardware?.watchers || this.nodes[from]?.watchers || { cpu: false, gpu: false, device: false },
      pressure: hardware?.pressure || this.nodes[from]?.pressure || { score: null, level: 'unknown' },
      lastHardwareTs: hardware ? ts : (this.nodes[from]?.lastHardwareTs || null),
    };

    // Compute edge weight based on recency + frequency
    const ageSeconds = (Date.now() - new Date(ts).getTime()) / 1000;
    const recencyWeight = Math.max(0, 1 - (ageSeconds / 300)); // decays to 0 over 5min
    const frequencyBoost = Math.min(0.3, (this.nodes[from]?.messageCount || 1) * 0.01);
    const weight = Math.min(1.0, recencyWeight + frequencyBoost);

    // Record edge
    const edge = { from, to, verb, weight: parseFloat(weight.toFixed(3)), ts, wh };
    if (options.writeEdge !== false) fs.appendFileSync(EDGES_FILE, JSON.stringify(edge) + '\n');

    return { from, weight, alive: true };
  }

  // Mark stale/dead nodes
  sweepNodes() {
    const cutoffStale = 120000;  // 2 min
    const cutoffDead = 300000;   // 5 min
    const nowMs = Date.now();
    let pruned = 0;

    for (const [name, node] of Object.entries(this.nodes)) {
      const age = nowMs - new Date(node.lastSeen).getTime();
      if (age > NODE_RETENTION_MS) {
        delete this.nodes[name];
        pruned += 1;
        continue;
      }
      if (age > cutoffDead) {
        node.alive = false;
        node.status = 'DEAD';
      } else if (age > cutoffStale) {
        node.alive = false;
        node.status = 'STALE';
      } else {
        node.alive = true;
        node.status = 'ALIVE';
      }
      node.ageSeconds = Math.round(age / 1000);
    }
    this.prunedNodes = pruned;
  }

  // Generate active report for cascade to read
  generateReport() {
    this.sweepNodes();

    const alive = Object.entries(this.nodes).filter(([, n]) => n.alive);
    const stale = Object.entries(this.nodes).filter(([, n]) => n.status === 'STALE');
    const dead = Object.entries(this.nodes).filter(([, n]) => n.status === 'DEAD');

    const report = {
      ts: now(),
      summary: {
        total: Object.keys(this.nodes).length,
        alive: alive.length,
        stale: stale.length,
        dead: dead.length,
        pruned: this.prunedNodes || 0,
        constrained: alive.filter(([, n]) => ['high', 'critical'].includes(n.pressure?.level)).length,
        hardwareSignals: alive.filter(([, n]) => Boolean(n.lastHardwareTs)).length,
      },
      aliveNodes: alive.map(([name, n]) => ({
        name, lastSeen: n.lastSeen, age: n.ageSeconds + 's',
        verb: n.lastVerb, transport: n.transport, ip: n.ip,
        msgs: n.messageCount, pid: n.devicePid,
        deviceId: n.deviceId || normalizeDeviceId(name),
        kind: n.kind || inferDeviceKind(normalizeDeviceId(name)),
        cpuPct: n.cpuPct ?? null,
        ramUsedPct: n.ramUsedPct ?? null,
        gpuUtilPct: n.gpuUtilPct ?? null,
        gpuTempC: n.gpuTempC ?? null,
        pressure: n.pressure?.level || 'unknown',
      })),
      staleNodes: stale.map(([name, n]) => ({ name, age: n.ageSeconds + 's', lastVerb: n.lastVerb })),
      deadNodes: dead.map(([name, n]) => ({ name, age: n.ageSeconds + 's', lastVerb: n.lastVerb })),
      conversations: this._buildConversationGraph(alive),
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    mirror(REPORT_FILE);
    return report;
  }

  _buildConversationGraph(aliveNodes) {
    // Who has talked to whom recently?
    const pairs = {};
    const aliveNames = new Set(aliveNodes.map(([n]) => n));

    // Read recent edges
    try {
      const lines = fs.readFileSync(EDGES_FILE, 'utf8').split('\n').filter(l => l.trim()).slice(-200);
      for (const l of lines) {
        try {
          const e = JSON.parse(l);
          const key = `${e.from}→${e.to}`;
          if (!pairs[key]) pairs[key] = { from: e.from, to: e.to, count: 0, lastTs: e.ts, weight: 0 };
          pairs[key].count++;
          pairs[key].lastTs = e.ts;
          pairs[key].weight = Math.max(pairs[key].weight, e.weight);
        } catch (_) {}
      }
    } catch (_) {}

    return Object.values(pairs).sort((a, b) => b.weight - a.weight).slice(0, 20);
  }
}

// ═══════════════════════════════════════════════════════════
// SCAN INBOX + BUILD GRAPH
// ═══════════════════════════════════════════════════════════

function scanInbox(registry, lastOffset = 0) {
  if (!fs.existsSync(INBOX)) return lastOffset;
  const lines = fs.readFileSync(INBOX, 'utf8').split('\n').filter(l => l.trim());
  let processed = 0;

  for (let i = lastOffset; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]);
      registry.processMessage(msg);
      processed++;
    } catch (_) {}
  }

  if (processed > 0) {
    registry.saveState();
  }

  return lines.length;
}

function refreshLiveReportFromMessage(message) {
  const registry = new LiveNodeRegistry();
  ensureDir(BEHCS_DIR);
  registry.processMessage(message, { writeEdge: false });
  registry.saveState();
  return registry.generateReport();
}

function generateReportOnce() {
  const registry = new LiveNodeRegistry();
  ensureDir(BEHCS_DIR);
  scanInbox(registry);
  return registry.generateReport();
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const registry = new LiveNodeRegistry();

  ensureDir(BEHCS_DIR);

  if (args.includes('--once')) {
    // Single scan + report
    const offset = scanInbox(registry);
    const report = registry.generateReport();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Persistent watcher mode
  console.log(`[GNN] Live watcher started at ${now()}`);
  console.log(`[GNN] Scanning inbox every 15s. Sweep every 30s.`);

  let lastOffset = 0;

  // Scan loop
  setInterval(() => {
    lastOffset = scanInbox(registry, lastOffset);
  }, 15000);

  // Sweep + report loop
  setInterval(() => {
    const report = registry.generateReport();
    const a = report.summary.alive;
    const s = report.summary.stale;
    const d = report.summary.dead;
    console.log(`[GNN] nodes: ${a} alive, ${s} stale, ${d} dead | total edges: ${registry.edges.length}`);
  }, 30000);

  // Initial scan
  lastOffset = scanInbox(registry);
  const report = registry.generateReport();
  console.log(`[GNN] Initial scan: ${report.summary.total} nodes, ${report.summary.alive} alive`);

  process.on('SIGINT', () => {
    registry.saveState();
    registry.generateReport();
    console.log(`[GNN] Stopped. State saved.`);
    process.exit(0);
  });
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    LiveNodeRegistry,
    scanInbox,
    refreshLiveReportFromMessage,
    generateReportOnce,
  };
}
