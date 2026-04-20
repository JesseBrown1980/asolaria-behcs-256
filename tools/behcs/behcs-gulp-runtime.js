#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
process.env.ASOLARIA_INSTANCE_ROOT = process.env.ASOLARIA_INSTANCE_ROOT || ROOT;
process.env.ASOLARIA_INDEX_ROOT = process.env.ASOLARIA_INDEX_ROOT || path.join(ROOT, 'data', 'agent-index');
process.env.ASOLARIA_MISTAKE_LEDGER_PATH = process.env.ASOLARIA_MISTAKE_LEDGER_PATH || path.join(ROOT, 'data', 'mistake-ledger.ndjson');

const BEHCS_DIR = path.join(ROOT, 'data', 'behcs');
const INBOX = path.join(BEHCS_DIR, 'inbox.ndjson');
const QUEUE = path.join(BEHCS_DIR, 'rehydration-queue.ndjson');
const GNN_EDGES = path.join(BEHCS_DIR, 'gnn-edges.ndjson');
const D0_LOG = path.join(BEHCS_DIR, 'd0-runtime', 'sidecar-d0-events.ndjson');
const GC_DIR = path.join(BEHCS_DIR, 'garbage-collector');
const GC_STATE_PATH = path.join(GC_DIR, 'collector-state.json');
const GC_BUFFER_PATH = path.join(GC_DIR, 'message-paths.ndjson');
const GC_REPORTS_DIR = path.join(GC_DIR, 'reports');
const GC_ARCHIVES_DIR = path.join(GC_DIR, 'archives');
const GC_LATEST_PATH = path.join(GC_DIR, 'gulp-latest.json');

const GC_TRIGGER_MESSAGES = Math.max(1, parseInt(process.env.BEHCS_GC_TRIGGER_MESSAGES || '2000', 10) || 2000);
const GC_BUFFER_MAX = Math.max(GC_TRIGGER_MESSAGES + 500, 2500);
const GC_RETAIN_RAW = Math.max(32, parseInt(process.env.BEHCS_GC_RETAIN_RAW || '64', 10) || 64);
const GC_RETAIN_D0 = Math.max(64, parseInt(process.env.BEHCS_GC_RETAIN_D0 || '128', 10) || 128);
const GC_PATTERN_LIMIT = 256;
const MAX_EDGES = 1000;
const GC_MATRIX_SHAPE = '6x6x6x6x6x12';
const GC_MATRIX_STACK = 'omnishannon × GNN';

const { appendMistakeLedgerBatch } = require('../../src/mistakeLedgerStore');
const {
  listMistakePatterns,
  getMistakePatternSummary,
  pruneObsoleteMistakePatterns,
} = require('../../src/mistakePatternStore');
const mistakeLearn = require('../../data/behcs/sovereignty/ix/chains/mistake-learn');
const {
  loadFileCapPolicy,
  evaluateFileCap,
  summarizeFileCapStatus,
} = require('./behcs-file-cap');

const FILE_CAP_POLICY = loadFileCapPolicy(ROOT);

let codex;
try {
  codex = require('./codex-bridge');
} catch (error) {
  let catalogs = [];
  try {
    const fallback = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'hilbert-omni-47D.json'), 'utf8'));
    catalogs = Array.isArray(fallback.dimensions) ? fallback.dimensions.map((item) => ({
      D: item.D,
      name: item.name,
      cube: item.cube,
      values: item.values,
    })) : [];
  } catch (_) {}
  codex = {
    catalogs: { catalogs },
    hilbertAddress: (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16),
  };
}

const DIMS = Array.isArray(codex.catalogs?.catalogs) ? codex.catalogs.catalogs : [];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function clipText(value, max = 160) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, Math.max(1, max));
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try { return JSON.parse(line); } catch (_) { return null; }
    })
    .filter(Boolean);
}

function appendNdjson(file, row) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8');
}

function writeNdjson(file, rows) {
  ensureDir(path.dirname(file));
  const body = (Array.isArray(rows) ? rows : []).map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(file, body ? `${body}\n` : '', 'utf8');
}

function truncateNdjson(file, maxLines) {
  if (!fs.existsSync(file)) return;
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim());
  if (rows.length > maxLines) fs.writeFileSync(file, `${rows.slice(-maxLines).join('\n')}\n`, 'utf8');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key) {
  return /(secret|token|password|apikey|api_key|auth|cookie|session|credential|bearer|private)/i.test(String(key || ''));
}

function redactSecrets(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[redacted-service-key]')
    .replace(/Bearer\s+[A-Za-z0-9._=-]{16,}/gi, 'Bearer [redacted]');
}

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => sanitizeValue(item, depth + 1));
  if (isPlainObject(value)) return depth > 1 ? clipText(redactSecrets(JSON.stringify(value)), 160) : sanitizeObject(value, depth + 1);
  return clipText(redactSecrets(value), 160);
}

function sanitizeObject(input, depth = 0) {
  if (!isPlainObject(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input).slice(0, 24)) {
    if (isSensitiveKey(key)) continue;
    out[clipText(key, 80)] = sanitizeValue(value, depth);
  }
  return out;
}

function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value;
    if (value !== null && value !== undefined && String(value).trim()) return value;
  }
  return '';
}

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function collectFileCap(reason, plannedCreates = 0, surfaceIds = null) {
  const status = evaluateFileCap({
    rootDir: ROOT,
    reason,
    plannedCreates,
    surfaceIds,
  });
  return summarizeFileCapStatus(status);
}

function fileCapStatePatch(fileCap) {
  if (!fileCap) return {};
  return {
    fileCapMax: safeInt(fileCap.maxTrackedFiles, safeInt(FILE_CAP_POLICY.maxTrackedFiles, 2000)),
    fileCapWarnAt: safeInt(fileCap.warnAt, safeInt(FILE_CAP_POLICY.warnAt, 1800)),
    lastFileCapStatus: fileCap.status || 'pass',
    lastFileCapTrackedFiles: safeInt(fileCap.trackedFiles, 0),
    lastFileCapProjectedFiles: safeInt(fileCap.projectedFiles, 0),
    lastFileCapReason: clipText(fileCap.reason, 120),
    lastFileCapAt: new Date().toISOString(),
  };
}

function normalizeTupleValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const normalized = redactSecrets(String(value === null || value === undefined ? '' : value))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:+-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
}

function normalizeIp(ip) {
  const value = String(ip || '').trim();
  return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function inferSubnet(ip) {
  const value = normalizeIp(ip);
  if (!value) return '';
  if (value.startsWith('127.')) return '127.0.0.0/8';
  if (value.startsWith('192.168.100.')) return '192.168.100.0/24';
  if (value.startsWith('192.168.1.')) return '192.168.1.0/24';
  const parts = value.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : value;
}

function inferNetwork(ip) {
  const value = normalizeIp(ip);
  if (!value) return 'unknown';
  if (value.startsWith('127.') || value === '::1') return 'loopback';
  if (value.startsWith('192.168.100.')) return 'ethernet_direct';
  if (value.startsWith('192.168.1.')) return 'wifi_lan';
  return 'lan';
}

function summarizeMessageText(msg) {
  const safePayload = sanitizeObject(msg.payload || {});
  return clipText(redactSecrets(pickFirst(msg.text, msg.payload?.text, JSON.stringify(safePayload), msg.type, 'message')), 220);
}

function severityToRisk(value) {
  const normalized = normalizeTupleValue(value);
  if (normalized === 'critical') return 9;
  if (normalized === 'high') return 7;
  if (normalized === 'medium') return 4;
  if (normalized === 'low') return 2;
  return 1;
}

function catalogMode(catalog, normalizedValue) {
  if (Array.isArray(catalog?.values)) return catalog.values.map((item) => normalizeTupleValue(item)).includes(normalizedValue) ? 'catalog' : 'fallback';
  return isPlainObject(catalog?.values) ? 'object' : 'derived';
}

function buildDimensionEntry(catalog, rawValue, data = null, source = 'derived') {
  const value = rawValue === null || rawValue === undefined || rawValue === '' ? 'not_applicable' : rawValue;
  const normalizedValue = normalizeTupleValue(value);
  const tupleKey = `D${catalog.D}:${normalizedValue}`;
  const entry = {
    D: catalog.D,
    name: catalog.name,
    cube: catalog.cube,
    value,
    normalizedValue,
    tupleKey,
    glyph: codex.hilbertAddress(tupleKey),
    mode: catalogMode(catalog, normalizedValue),
    source,
  };
  if (data && Object.keys(data).length > 0) entry.data = data;
  return entry;
}

function defaultState() {
  return {
    version: 1,
    gcEveryMessages: GC_TRIGGER_MESSAGES,
    fileCapMax: safeInt(FILE_CAP_POLICY.maxTrackedFiles, 2000),
    fileCapWarnAt: safeInt(FILE_CAP_POLICY.warnAt, 1800),
    totalReceived: 0,
    sinceLastGulp: 0,
    lastReceivedAt: '',
    lastGulpAt: '',
    lastGulpReason: '',
    lastGulpId: '',
    lastGulpSequence: 0,
    lastPathGlyph: '',
    lastMessageGlyph: '',
    lastPeerSignalAt: '',
    lastPeerActors: [],
    lastPeerPathRef: '',
    runs: 0,
    lastFileCapStatus: 'pass',
    lastFileCapTrackedFiles: 0,
    lastFileCapProjectedFiles: 0,
    lastFileCapReason: '',
    lastFileCapAt: '',
    lastError: '',
  };
}

let stateCache = null;
let gcRunning = false;

function extractPeerSignal(source = {}, fallbackTs = '') {
  const from = String(pickFirst(source.from, source.summary?.from, '')).toLowerCase();
  const to = String(pickFirst(source.to, source.summary?.to, '')).toLowerCase();
  const type = String(pickFirst(source.type, source.summary?.type, source.payload?.verb, '')).toLowerCase();
  const actors = new Set();
  if (from.includes('liris') || from.includes('rayssa')) actors.add(from);
  if (to.includes('liris') || to.includes('rayssa')) actors.add(to);
  if (type.includes('packet_burst') && from) actors.add(from);
  if (actors.size < 1) return null;
  return {
    at: pickFirst(source.generatedAt, source.received_at, source.ts, fallbackTs),
    actors: Array.from(actors).sort(),
    pathRef: pickFirst(source.pathRef, source.messageId, ''),
  };
}

function applyPeerSignal(current, signal) {
  if (!signal || !signal.at) return current;
  return {
    ...current,
    lastPeerSignalAt: signal.at,
    lastPeerActors: signal.actors,
    lastPeerPathRef: signal.pathRef || current.lastPeerPathRef || '',
  };
}

function backfillPeerSignal(current) {
  if (current.lastPeerSignalAt) return current;
  const candidates = [
    ...readNdjson(GC_BUFFER_PATH).slice(-Math.min(GC_BUFFER_MAX, 512)),
    ...readNdjson(INBOX).slice(-200),
  ];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const signal = extractPeerSignal(candidates[index]);
    if (signal) return applyPeerSignal(current, signal);
  }
  return current;
}

function loadState() {
  const raw = readJson(GC_STATE_PATH, null);
  stateCache = backfillPeerSignal({ ...defaultState(), ...(isPlainObject(raw) ? raw : {}), gcEveryMessages: GC_TRIGGER_MESSAGES });
  writeJson(GC_STATE_PATH, stateCache);
  return stateCache;
}

function saveState(nextState = {}) {
  stateCache = { ...defaultState(), ...nextState, gcEveryMessages: GC_TRIGGER_MESSAGES };
  writeJson(GC_STATE_PATH, stateCache);
  return stateCache;
}

function d0log(event, data) {
  appendNdjson(D0_LOG, { ts: new Date().toISOString(), event, ...data });
  truncateNdjson(D0_LOG, 500);
}

function inferLayer(msg) {
  if (msg.payload?.layer) return msg.payload.layer;
  if (msg.type === 'heartbeat') return 'runtime';
  if (msg.payload?.cursor || msg.payload?.position) return 'app';
  if (String(msg.to || '').includes('triad')) return 'colony';
  return 'agent';
}

function inferState(msg, context = {}) {
  if (context.gateDenied) return 'blocked';
  if (msg.payload?.state) return msg.payload.state;
  if (context.reflex?.staleFlag) return 'failed';
  if (context.d0result && context.d0result.gatePass === false) return 'blocked';
  if (msg.type === 'heartbeat') return 'completed';
  if (context.reflex?.action && context.reflex.action !== 'process') return 'executing';
  return 'queued';
}

function inferChain(msg, context = {}) {
  if (msg.payload?.chain) return msg.payload.chain;
  if (context.reason && String(context.reason).includes('gulp')) return 'feeds';
  if (context.gateDenied) return 'blocks';
  if (String(msg.to || '').includes('+') || String(msg.to || '').includes('triad')) return 'relay';
  return 'feeds';
}

function inferSurface(msg) {
  if (msg.payload?.surface) return msg.payload.surface;
  const text = `${msg.from || ''} ${msg.to || ''} ${msg.type || ''}`.toLowerCase();
  if (text.includes('falcon')) return 'falcon-gw';
  if (text.includes('liris')) return 'agent-keyboard-4820';
  if (text.includes('screen')) return 'omnipane-4824';
  return 'hookwall';
}

function inferIntent(msg, context = {}) {
  if (msg.payload?.intent) return msg.payload.intent;
  if (context.reason && String(context.reason).includes('gulp')) return 'cascade';
  if (msg.type === 'heartbeat') return 'scheduled';
  if (msg.payload?.text || msg.text) return 'command';
  return 'reactive';
}

function inferCrossColony(msg, context = {}) {
  if (msg.payload?.cross_colony) return msg.payload.cross_colony;
  const network = inferNetwork(context.remoteMeta?.ip);
  if (String(msg.payload?.verb || '').toLowerCase() === 'omni_submit') return 'omni_submit';
  if (String(msg.to || '').includes('falcon') || String(msg.to || '').includes('liris') || network === 'ethernet_direct' || network === 'wifi_lan') return 'cross_host_lan';
  return 'local_only';
}

function inferMistakeState(msg, context = {}) {
  if (msg.payload?.mistake_state) return msg.payload.mistake_state;
  if (context.gateDenied) return 'operator_catch';
  if (context.reflex?.staleFlag) return 'self_catch';
  if (context.d0result && context.d0result.gatePass === false) return 'active_mistake';
  return 'not_applicable';
}

function buildDevice(msg, context = {}) {
  const payload = sanitizeObject(msg.payload?.device || {});
  const actor = normalizeTupleValue(pickFirst(msg.from, msg.payload?.actor, 'unknown'));
  const model = pickFirst(payload.model, msg.device_id, msg.payload?.device_id, actor.includes('falcon') ? 'sm-s721u1' : actor.includes('liris') ? 'liris-host' : 'acer-host');
  return {
    value: model,
    data: {
      serial: clipText(pickFirst(payload.serial, msg.payload?.serial), 60),
      model: clipText(model, 60),
      firmware: clipText(pickFirst(payload.firmware, msg.payload?.firmware), 60),
      hw_class: clipText(pickFirst(payload.hw_class, normalizeIp(context.remoteMeta?.ip).startsWith('192.168.100.') ? 'wired_peer' : 'runtime_surface'), 60),
      gpu: clipText(pickFirst(payload.gpu, msg.payload?.gpu), 60),
      form: clipText(pickFirst(payload.form, actor.includes('falcon') ? 'phone' : 'desktop'), 60),
    },
    source: 'derived.device',
  };
}

function buildPid(msg) {
  return {
    value: pickFirst(msg.pid, msg.payload?.pid, `${normalizeTupleValue(pickFirst(msg.from, 'unknown'))}-${process.pid}`),
    data: {
      surfaceId: clipText(pickFirst(msg.surface_id, msg.payload?.surfaceId, inferSurface(msg)), 80),
      profileId: clipText(pickFirst(msg.profile_id, msg.payload?.profileId, msg.payload?.profile, 'gaia-v1'), 80),
      pidVersion: clipText(pickFirst(msg.pid_version, msg.payload?.pidVersion, 'v1'), 40),
      spawnedBy: clipText(pickFirst(msg.spawned_by, msg.payload?.spawnedBy, msg.from, 'acer-sidecar'), 80),
      spawnChain: clipText(pickFirst(msg.spawn_chain, msg.payload?.spawnChain, msg.payload?.verb, msg.type, 'message'), 80),
    },
    source: 'derived.pid',
  };
}

function buildLocation(msg, context = {}) {
  const ip = normalizeIp(pickFirst(context.remoteMeta?.ip, msg.payload?.ip));
  return {
    value: pickFirst(ip, inferNetwork(ip), 'local'),
    data: {
      ip,
      subnet: inferSubnet(ip),
      geo: clipText(pickFirst(msg.payload?.geo, 'local'), 60),
      room: clipText(pickFirst(msg.payload?.room, context.reason && String(context.reason).includes('gulp') ? 'whiteroom' : ''), 60),
      network: inferNetwork(ip),
      hilbert_level: clipText(pickFirst(msg.payload?.hilbert_level, '47D'), 40),
    },
    source: 'derived.location',
  };
}

function buildTime(msg, context = {}) {
  const timestamp = pickFirst(msg.received_at, msg.ts, new Date().toISOString());
  return {
    value: timestamp,
    data: {
      timestamp,
      duration: safeInt(msg.payload?.duration, 0),
      sequence: safeInt(context.sequence, 0),
      epoch: Number(new Date(timestamp).getTime()) || 0,
      ttl: safeInt(msg.payload?.ttl, 0),
      cron: clipText(pickFirst(msg.payload?.cron, context.reason === 'sidecar_heartbeat' ? '30s' : ''), 40),
    },
    source: 'derived.time',
  };
}

function buildHardware(msg, context = {}) {
  return {
    value: pickFirst(msg.payload?.protocol, context.remoteMeta?.method, 'http'),
    data: {
      chip: clipText(pickFirst(msg.payload?.chip), 60),
      bus: clipText(pickFirst(msg.payload?.bus, context.reason === 'sidecar_heartbeat' ? 'loopback' : inferNetwork(context.remoteMeta?.ip)), 60),
      port: safeInt(pickFirst(msg.payload?.port, context.remoteMeta?.port, 4947), 4947),
      driver: clipText(pickFirst(msg.payload?.driver, 'node-http'), 60),
      protocol: clipText(pickFirst(msg.payload?.protocol, context.remoteMeta?.protocol, 'http'), 60),
      firmware_region: clipText(pickFirst(msg.payload?.firmware_region), 60),
    },
    source: 'derived.hardware',
  };
}

function buildFederation(msg, context = {}) {
  return {
    value: pickFirst(msg.payload?.origin_node, msg.from, 'acer-sidecar'),
    data: {
      origin_node: clipText(pickFirst(msg.payload?.origin_node, msg.from, 'acer-sidecar'), 80),
      merged_from: clipText(pickFirst(msg.payload?.merged_from, msg.from), 80),
      merge_count: safeInt(pickFirst(msg.payload?.merge_count, 1), 1),
      last_sync: pickFirst(msg.received_at, msg.ts, new Date().toISOString()),
      conflict_state: clipText(context.gateDenied ? 'blocked' : 'aligned', 40),
    },
    source: 'derived.federation',
  };
}

function inferDimension(catalog, msg, context = {}) {
  switch (catalog.D) {
    case 1: return { value: pickFirst(msg.payload?.actor, msg.from, 'external'), source: 'message.from' };
    case 2: return { value: pickFirst(msg.payload?.verb, msg.type, 'message'), source: 'message.verb' };
    case 3: return { value: pickFirst(msg.payload?.target, msg.to, 'local'), source: 'message.to' };
    case 4: return { value: safeInt(pickFirst(msg.payload?.risk, msg.risk, severityToRisk(msg.payload?.severity)), 1), source: 'message.risk' };
    case 5: return { value: inferLayer(msg), source: 'derived.layer' };
    case 6: return { value: pickFirst(msg.payload?.gate, 'hookwall'), source: 'derived.gate' };
    case 7: return { value: inferState(msg, context), source: 'derived.state' };
    case 8: return { value: inferChain(msg, context), source: 'derived.chain' };
    case 9: return { value: pickFirst(msg.payload?.wave, context.reason && String(context.reason).includes('gulp') ? GC_MATRIX_SHAPE : 'single'), source: 'derived.wave' };
    case 10: return { value: pickFirst(msg.payload?.dialect, msg.dialect, 'ASO'), source: 'derived.dialect' };
    case 11: return { value: pickFirst(msg.payload?.proof, msg.payload?.cursor ? 'live_probe' : 'log'), source: 'derived.proof' };
    case 12: return { value: pickFirst(msg.payload?.scope, msg.type === 'heartbeat' ? 'operational' : 'session'), source: 'derived.scope' };
    case 13: return { value: inferSurface(msg), source: 'derived.surface' };
    case 14: return { value: pickFirst(msg.payload?.energy, msg.type === 'heartbeat' ? 'light' : summarizeMessageText(msg).length > 180 ? 'medium' : 'light'), source: 'derived.energy' };
    case 15: return buildDevice(msg, context);
    case 16: return buildPid(msg);
    case 17: return { value: pickFirst(msg.profile_id, msg.payload?.profileId, msg.payload?.profile, 'gaia-v1'), source: 'derived.profile' };
    case 18: return { value: pickFirst(msg.ai_model, msg.payload?.ai_model, msg.payload?.model, 'local_llm'), source: 'derived.ai_model' };
    case 19: return buildLocation(msg, context);
    case 20: return buildTime(msg, context);
    case 21: return buildHardware(msg, context);
    case 22: return { value: pickFirst(msg.payload?.translation, 'glyph'), source: 'derived.translation' };
    case 23: return buildFederation(msg, context);
    case 24: return { value: inferIntent(msg, context), source: 'derived.intent' };
    case 25: return { value: pickFirst(msg.payload?.trinity, context.reason && String(context.reason).includes('gulp') ? 'LX-491_omni_GNN_inference' : msg.type === 'heartbeat' ? 'LX-489_compute' : 'LX-491_omni_GNN_inference'), source: 'derived.trinity' };
    case 26: return { value: pickFirst(msg.payload?.omnidirectional, context.gateDenied ? 'receive' : String(msg.to || '').includes('triad') ? 'relay' : 'receive'), source: 'derived.omnidirectional' };
    case 27: return { value: pickFirst(msg.payload?.auto_transition, context.reason && String(context.reason).includes('gulp') ? 'onDrift' : msg.type === 'heartbeat' ? 'onSpawn' : 'not_applicable'), source: 'derived.auto_transition' };
    case 28: return { value: pickFirst(msg.payload?.approval_box, context.gateDenied || (context.d0result && context.d0result.gatePass === false) ? 'hard_deny' : 'auto_approve'), source: 'derived.approval_box' };
    case 29: return { value: pickFirst(msg.payload?.twin_sync, 'sync_pending'), source: 'derived.twin_sync' };
    case 30: return { value: pickFirst(msg.payload?.cosign, msg.payload?.cosign_triple, 'not_applicable'), source: 'derived.cosign' };
    case 31: return { value: pickFirst(msg.payload?.shadow_mirror, String(msg.mode || '').toLowerCase() === 'shadow' ? 'shadow_E_drive' : 'live_C_drive'), source: 'derived.shadow_mirror' };
    case 32: return { value: pickFirst(msg.payload?.structural_invariant, context.gateDenied ? 'unverified' : 'single_run'), source: 'derived.structural_invariant' };
    case 33: return { value: pickFirst(msg.payload?.supreme_override, 'no_override'), source: 'derived.supreme_override' };
    case 34: return { value: inferCrossColony(msg, context), source: 'derived.cross_colony' };
    case 35: return { value: pickFirst(msg.payload?.hyperlanguage, '47D'), source: 'derived.hyperlanguage' };
    case 36: return { value: pickFirst(msg.payload?.inference_surface, context.reason && String(context.reason).includes('gulp') ? 'gnn_local' : msg.type === 'heartbeat' ? 'self_diagnosis' : context.d0result ? 'gnn_local' : 'webhook_response'), source: 'derived.inference_surface' };
    case 37: return { value: pickFirst(msg.payload?.authority_topology, String(msg.from || '').toLowerCase().includes('jesse') ? 'supreme_override' : String(msg.to || '').toLowerCase().includes('triad') ? 'sub_colony_bounded' : 'operator_local'), source: 'derived.authority_topology' };
    case 38: return { value: pickFirst(msg.payload?.encryption, String(msg.auth_type || '').toLowerCase() === 'crypto' ? 'sha256_attestation' : 'sha256_attestation'), source: 'derived.encryption' };
    case 39: return { value: pickFirst(msg.payload?.gnn_edge, context.reason && String(context.reason).includes('gulp') ? 'trains' : context.gateDenied ? 'blocks' : 'feeds'), source: 'derived.gnn_edge' };
    case 40: return { value: pickFirst(msg.payload?.hybrid_model, context.reason && String(context.reason).includes('gulp') ? 'gslgnn_v1_python' : pickFirst(msg.ai_model, msg.payload?.ai_model, msg.payload?.model, 'local_llm')), source: 'derived.hybrid_model' };
    case 41: return { value: pickFirst(msg.payload?.agent_tier, context.d0result?.tier, context.reason && String(context.reason).includes('gulp') ? 'medium' : 'micro'), source: 'derived.agent_tier' };
    case 42: return { value: pickFirst(msg.payload?.meeting_room, context.reason && String(context.reason).includes('gulp') ? 'federation_sync' : 'ad_hoc'), source: 'derived.meeting_room' };
    case 43: return { value: inferMistakeState(msg, context), source: 'derived.mistake_ledger' };
    case 44: return { value: pickFirst(msg.payload?.heartbeat, context.reflex?.staleFlag ? 'stale' : 'alive'), source: 'derived.heartbeat' };
    case 45: return { value: pickFirst(msg.payload?.omnicalendar, context.reason === 'sidecar_heartbeat' ? 'cron_hourly' : 'immediate'), source: 'derived.omnicalendar' };
    case 46: return { value: pickFirst(msg.payload?.vault, context.reason && String(context.reason).includes('gulp') ? 'hardened_secrets' : 'session_ephemeral'), source: 'derived.vault' };
    case 47: return { value: pickFirst(msg.payload?.boundary, String(msg.to || '').toLowerCase().includes('triad') ? 'boundary_typed' : 'transparent'), source: 'derived.boundary' };
    default: return { value: 'not_applicable', source: 'derived.default' };
  }
}

function buildPathRecord(msg, context = {}) {
  const generatedAt = pickFirst(msg.received_at, msg.ts, new Date().toISOString());
  const dimensions = DIMS.map((catalog) => {
    const inferred = inferDimension(catalog, msg, context);
    return buildDimensionEntry(catalog, inferred.value, inferred.data || null, inferred.source || 'derived');
  });
  const getDim = (id) => dimensions.find((item) => item.D === id) || null;
  const tuplePath = dimensions.map((item) => item.tupleKey);
  const pathGlyph = codex.hilbertAddress(tuplePath.join('|'));
  const messageGlyph = codex.hilbertAddress(`${pickFirst(msg.id, 'msg')}:${generatedAt}:${pathGlyph}`);
  return {
    pathRef: `${pickFirst(msg.id, 'msg')}:${safeInt(context.sequence, 0)}`,
    messageId: pickFirst(msg.id, ''),
    sequence: safeInt(context.sequence, 0),
    generatedAt,
    reason: clipText(pickFirst(context.reason, 'message_ingest'), 80),
    pathGlyph,
    messageGlyph,
    route: {
      actor: getDim(1),
      verb: getDim(2),
      target: getDim(3),
      state: getDim(7),
      wave: getDim(9),
      hyperlanguage: getDim(35),
      heartbeat: getDim(44),
    },
    transport: sanitizeObject({
      ip: normalizeIp(context.remoteMeta?.ip),
      port: safeInt(context.remoteMeta?.port, 0),
      method: context.remoteMeta?.method,
      protocol: context.remoteMeta?.protocol,
      network: inferNetwork(context.remoteMeta?.ip),
    }),
    flags: {
      gateDenied: !!context.gateDenied,
      d0GatePass: context.d0result ? !!context.d0result.gatePass : null,
      staleFlag: !!context.reflex?.staleFlag,
      reflexAction: clipText(pickFirst(context.reflex?.action, msg.reflex), 40),
      runInference: context.reflex ? context.reflex.runInference !== false : true,
    },
    summary: {
      from: clipText(msg.from, 80),
      to: clipText(msg.to, 80),
      type: clipText(msg.type, 80),
      mode: clipText(msg.mode, 40),
      text: summarizeMessageText(msg),
      d0: sanitizeObject(msg.d0 || {}),
      payload: sanitizeObject(msg.payload || {}),
    },
    tuplePath,
    dimensions,
  };
}

function attachBehcsPath(msg, context = {}) {
  const record = buildPathRecord(msg, context);
  msg.behcs = {
    spec: 'IX-700',
    hyperlanguage: '47D',
    pathRef: record.pathRef,
    pathGlyph: record.pathGlyph,
    messageGlyph: record.messageGlyph,
    route: {
      actor: record.route.actor?.normalizedValue || '',
      verb: record.route.verb?.normalizedValue || '',
      target: record.route.target?.normalizedValue || '',
      state: record.route.state?.normalizedValue || '',
      wave: record.route.wave?.normalizedValue || '',
      heartbeat: record.route.heartbeat?.normalizedValue || '',
    },
    routeGlyphs: {
      actor: record.route.actor?.glyph || '',
      verb: record.route.verb?.glyph || '',
      target: record.route.target?.glyph || '',
      state: record.route.state?.glyph || '',
      wave: record.route.wave?.glyph || '',
      heartbeat: record.route.heartbeat?.glyph || '',
      hyperlanguage: record.route.hyperlanguage?.glyph || '',
    },
    gcEveryMessages: GC_TRIGGER_MESSAGES,
  };
  return record;
}

function seedCollectorBuffer() {
  const buffer = readNdjson(GC_BUFFER_PATH);
  if (buffer.length > 0) return { seeded: 0, total: buffer.length };
  const backlog = readNdjson(QUEUE);
  const source = backlog.length > 0 ? backlog : readNdjson(INBOX);
  if (source.length < 1) return { seeded: 0, total: 0 };
  const current = loadState();
  let total = safeInt(current.totalReceived, 0);
  let pending = safeInt(current.sinceLastGulp, 0);
  let seededState = current;
  for (const msg of source.slice(-GC_BUFFER_MAX)) {
    total += 1;
    pending += 1;
    const record = buildPathRecord(msg, {
      reason: 'collector_seed',
      remoteMeta: { ip: '127.0.0.1', port: 4947, method: 'SEED', protocol: 'behcs' },
      sequence: total,
      reflex: { action: msg.reflex || 'seed', runInference: !!msg.d0 },
      d0result: msg.d0 ? { gatePass: msg.d0.gatePass !== false, tier: msg.d0.tier } : null,
    });
    appendNdjson(GC_BUFFER_PATH, record);
    seededState = applyPeerSignal(seededState, extractPeerSignal(record, record.generatedAt));
  }
  truncateNdjson(GC_BUFFER_PATH, GC_BUFFER_MAX);
  saveState({
    ...seededState,
    totalReceived: total,
    sinceLastGulp: pending,
    lastReceivedAt: source[source.length - 1]?.received_at || source[source.length - 1]?.ts || current.lastReceivedAt,
  });
  return { seeded: Math.min(source.length, GC_BUFFER_MAX), total: readNdjson(GC_BUFFER_PATH).length };
}

function recordCollectorMessage(msg, context = {}) {
  const current = loadState();
  const sequence = safeInt(current.totalReceived, 0) + 1;
  const record = attachBehcsPath(msg, { ...context, sequence });
  const fileCap = collectFileCap(pickFirst(context.reason, 'message_ingest'));
  if (msg.behcs) {
    msg.behcs.fileCap = {
      policyId: fileCap.policyId,
      status: fileCap.status,
      trackedFiles: fileCap.trackedFiles,
      maxTrackedFiles: fileCap.maxTrackedFiles,
      remaining: fileCap.remaining,
      labels: fileCap.labels,
    };
  }
  const peerSignal = extractPeerSignal(record, record.generatedAt);
  appendNdjson(GC_BUFFER_PATH, record);
  truncateNdjson(GC_BUFFER_PATH, GC_BUFFER_MAX);
  const state = saveState({
    ...applyPeerSignal(current, peerSignal),
    totalReceived: sequence,
    sinceLastGulp: safeInt(current.sinceLastGulp, 0) + 1,
    lastReceivedAt: record.generatedAt,
    lastPathGlyph: record.pathGlyph,
    lastMessageGlyph: record.messageGlyph,
    ...fileCapStatePatch(fileCap),
    lastError: '',
  });
  return { record, state, fileCap };
}

function collectorPendingRecords() {
  const current = loadState();
  const lastSequence = safeInt(current.lastGulpSequence, 0);
  return readNdjson(GC_BUFFER_PATH).filter((record) => safeInt(record.sequence, 0) > lastSequence);
}

function collectorStatus() {
  const current = loadState();
  const latest = readJson(GC_LATEST_PATH, null);
  const fileCap = collectFileCap('collector_status');
  return {
    ok: true,
    running: gcRunning,
    state: current,
    bufferDepth: readNdjson(GC_BUFFER_PATH).length,
    fileCap,
    latest: latest ? {
      gulpId: latest.gulpId,
      generatedAt: latest.generatedAt,
      processedMessages: latest.trigger?.processedMessages || 0,
      mistakesDetected: latest.mistakeLedger?.count || 0,
      reportPath: latest.reportPath || GC_LATEST_PATH,
    } : null,
  };
}

function summarizeMistakeSignals(record) {
  return [
    record.summary?.type,
    record.summary?.text,
    record.summary?.from,
    record.summary?.to,
    record.route?.state?.normalizedValue,
    record.route?.verb?.normalizedValue,
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function classifyMistakeRecord(record) {
  const text = summarizeMistakeSignals(record);
  const routeState = String(record.route?.state?.normalizedValue || '').toLowerCase();
  const reasons = [];
  if (record.flags?.gateDenied) reasons.push('hookwall_hard_deny');
  if (record.flags?.d0GatePass === false) reasons.push('d0_gate_block');
  if (record.flags?.staleFlag || routeState === 'stale' || text.includes('stale')) reasons.push('stale_capture');
  if (!record.flags?.gateDenied && record.flags?.d0GatePass !== false && (routeState === 'failed' || /error|failed|timeout|exception|retry/.test(text))) {
    reasons.push('runtime_failure');
  }
  if (reasons.length < 1) return null;
  const type = reasons[0];
  const severity = type === 'hookwall_hard_deny' || type === 'd0_gate_block' ? 'high' : type === 'runtime_failure' ? 'medium' : 'low';
  const classificationCode = type === 'hookwall_hard_deny' ? '43.6.28' : type === 'd0_gate_block' ? '43.6.7' : type === 'stale_capture' ? '43.44.13' : '43.36.39';
  const operation = record.route?.verb?.normalizedValue || 'message';
  return {
    at: record.generatedAt,
    feature: 'behcs_sidecar',
    operation,
    type,
    severity,
    actor: record.route?.actor?.normalizedValue || 'unknown',
    laneId: record.pathRef || record.messageId || 'unknown',
    message: clipText(`${record.summary?.from || '?'}→${record.summary?.to || '?'} ${record.summary?.text || record.summary?.type || type}`, 220),
    classificationCode,
    activityType: operation,
    skillId: 'behcs_gulp',
    toolId: 'behcs_sidecar',
    rootCause: clipText(record.flags?.gateDenied ? 'Hookwall denied the message before relay.' : record.flags?.staleFlag ? 'Repeated stale capture bytes were observed.' : 'D0 gate heuristics marked the message as unsafe or incomplete.', 220),
    avoidance: clipText(record.flags?.gateDenied ? 'Keep the message in draft or local analysis mode before relay.' : record.flags?.staleFlag ? 'Refresh the capture source before rehydration and archive stale frames.' : 'Route the message through the 47D glyph path and re-run after gate conditions are satisfied.', 220),
    context: sanitizeObject({
      messageId: record.messageId,
      pathGlyph: record.pathGlyph,
      messageGlyph: record.messageGlyph,
      from: record.summary?.from,
      to: record.summary?.to,
      state: record.route?.state?.normalizedValue,
      wave: record.route?.wave?.normalizedValue,
      hyperlanguage: record.route?.hyperlanguage?.normalizedValue,
      gateDenied: record.flags?.gateDenied,
      d0GatePass: record.flags?.d0GatePass,
      staleFlag: record.flags?.staleFlag,
    }),
  };
}

function buildGnnEdge(entry, index, gulpId) {
  return {
    from: clipText(pickFirst(entry.source, 'mistake'), 120),
    to: clipText(pickFirst(entry.target, 'gap'), 120),
    verb: clipText(pickFirst(entry.action, 'trains'), 80),
    weight: Number((safeInt(pickFirst(entry.riskScore, entry.count, 1), 1) * 0.1).toFixed(2)),
    ts: new Date().toISOString(),
    id: `${gulpId}-edge-${index + 1}`,
  };
}

function buildPatternCatalogEntries(patterns = [], sequenceBase = 0) {
  return patterns.map((pattern, index) => {
    const synthetic = {
      id: `pattern-${pattern.id}`,
      ts: new Date().toISOString(),
      from: 'behcs-gc',
      to: 'omnishannon',
      mode: 'shadow',
      type: 'mistake_pattern',
      payload: {
        verb: 'mistake_catalog',
        text: pattern.title,
        risk: severityToRisk(pattern.severity),
        layer: 'agent',
        gate: 'gnn',
        state: pattern.status === 'active' ? 'queued' : 'completed',
        chain: 'feeds',
        wave: GC_MATRIX_SHAPE,
        dialect: 'IX',
        proof: 'log',
        scope: 'persistent',
        surface: 'gnn',
        energy: 'medium',
        profile: 'omnishannon-wave-v1',
        ai_model: 'gslgnn_v1_python',
        intent: 'cascade',
        trinity: 'LX-491_omni_GNN_inference',
        omnidirectional: 'relay',
        auto_transition: 'onDrift',
        approval_box: 'auto_approve',
        twin_sync: 'sync_pending',
        shadow_mirror: 'local_cache_snapshot',
        structural_invariant: 'single_run',
        supreme_override: 'no_override',
        cross_colony: 'local_only',
        hyperlanguage: '47D',
        inference_surface: 'gnn_local',
        authority_topology: 'sub_colony_bounded',
        encryption: 'sha256_attestation',
        gnn_edge: pattern.linkedSkills?.length ? 'trains' : 'feeds',
        hybrid_model: 'gslgnn_v1_python',
        agent_tier: 'medium',
        meeting_room: 'federation_sync',
        mistake_state: pattern.status === 'active' ? 'became_law' : pattern.status,
        heartbeat: 'alive',
        omnicalendar: 'cron_hourly',
        vault: 'hardened_secrets',
        boundary: 'boundary_typed',
        activityType: pattern.linkedActivities?.[0] || 'mistake_catalog',
        toolId: pattern.linkedTools?.[0] || 'behcs_sidecar',
        skillId: pattern.linkedSkills?.[0] || 'behcs_gulp',
        rootCause: pattern.rootCause,
        avoidance: pattern.avoidance,
        room: 'whiteroom',
      },
    };
    const pathRecord = buildPathRecord(synthetic, {
      reason: 'gulp_pattern_catalog',
      remoteMeta: { ip: '127.0.0.1', port: 4947, method: 'INTERNAL', protocol: 'behcs' },
      sequence: sequenceBase + index + 1,
    });
    return {
      patternId: pattern.id,
      code: pattern.code,
      title: pattern.title,
      severity: pattern.severity,
      occurrences: safeInt(pattern.occurrences, 0),
      linkedSkills: Array.isArray(pattern.linkedSkills) ? pattern.linkedSkills : [],
      linkedTools: Array.isArray(pattern.linkedTools) ? pattern.linkedTools : [],
      linkedActivities: Array.isArray(pattern.linkedActivities) ? pattern.linkedActivities : [],
      rootCause: clipText(pattern.rootCause, 220),
      avoidance: clipText(pattern.avoidance, 220),
      lastSeenAt: clipText(pattern.lastSeenAt, 40),
      pathRef: pathRecord.pathRef,
      pathGlyph: pathRecord.pathGlyph,
      messageGlyph: pathRecord.messageGlyph,
      route: pathRecord.route,
      dimensions: pathRecord.dimensions,
    };
  });
}

function archiveAndTrim(file, retain, label, gulpId) {
  const rows = readNdjson(file);
  if (rows.length <= retain) {
    return { label, file, archivePath: '', archivedCount: 0, retainedCount: rows.length };
  }
  const archivePath = path.join(GC_ARCHIVES_DIR, `${gulpId}-${label}.ndjson`);
  const archived = rows.slice(0, rows.length - retain);
  const kept = rows.slice(-retain);
  writeNdjson(archivePath, archived);
  writeNdjson(file, kept);
  return { label, file, archivePath, archivedCount: archived.length, retainedCount: kept.length };
}

function planGulpFileCreates(gulpId, retainBuffer) {
  const archivePlans = [
    { file: INBOX, retain: GC_RETAIN_RAW, label: 'inbox' },
    { file: QUEUE, retain: GC_RETAIN_RAW, label: 'queue' },
    { file: GNN_EDGES, retain: MAX_EDGES, label: 'gnn-edges' },
    { file: D0_LOG, retain: GC_RETAIN_D0, label: 'd0-log' },
    { file: GC_BUFFER_PATH, retain: retainBuffer, label: 'message-paths' },
  ].map((plan) => {
    const rowCount = readNdjson(plan.file).length;
    return {
      ...plan,
      rowCount,
      createsFile: rowCount > plan.retain,
    };
  });

  const reportPath = path.join(GC_REPORTS_DIR, `${gulpId}.json`);
  const reportCreatesFile = !fs.existsSync(reportPath);
  const plannedCreates = archivePlans.filter((plan) => plan.createsFile).length + (reportCreatesFile ? 1 : 0);
  return { plannedCreates, reportPath, reportCreatesFile, archivePlans };
}

async function runGulpRehydration(options = {}) {
  seedCollectorBuffer();
  const force = options.force === true;
  const reason = clipText(pickFirst(options.reason, force ? 'manual_force' : 'message_threshold'), 80);
  const before = loadState();
  const pending = collectorPendingRecords();
  if (!force && pending.length < GC_TRIGGER_MESSAGES) return { ok: true, skipped: true, reason: 'threshold_not_met', pending: pending.length, threshold: GC_TRIGGER_MESSAGES };
  if (pending.length < 1) return { ok: true, skipped: true, reason: 'no_pending_messages', pending: 0, threshold: GC_TRIGGER_MESSAGES };

  const gulpId = `gulp-${new Date().toISOString().replace(/[:.]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const generatedAt = new Date().toISOString();
  const mistakeRows = pending.map((record) => classifyMistakeRecord(record)).filter(Boolean);
  const ledgerResult = mistakeRows.length > 0 ? appendMistakeLedgerBatch(mistakeRows) : { ok: true, path: process.env.ASOLARIA_MISTAKE_LEDGER_PATH, count: 0 };

  let learnResult = {
    ok: true,
    chain: 'mistake-learn',
    ledger: { total: 0, patterns: 0, recurring: 0 },
    gaps: [],
    covered: [],
    gnnEdges: [],
    summary: 'no_mistakes_detected',
  };
  try {
    learnResult = await mistakeLearn();
  } catch (error) {
    learnResult = {
      ok: false,
      chain: 'mistake-learn',
      error: clipText(error.message, 200),
      ledger: { total: 0, patterns: 0, recurring: 0 },
      gaps: [],
      covered: [],
      gnnEdges: [],
      summary: 'mistake_learn_failed',
    };
  }

  const patternSummaryBeforePrune = getMistakePatternSummary();
  const prunePatternResult = pruneObsoleteMistakePatterns({ maxIdleDays: 90 });
  const patternSummary = getMistakePatternSummary();
  const activePatterns = listMistakePatterns({ status: 'active', limit: GC_PATTERN_LIMIT });
  const gnnEdges = Array.isArray(learnResult.gnnEdges) ? learnResult.gnnEdges.map((entry, index) => buildGnnEdge(entry, index, gulpId)) : [];
  for (const edge of gnnEdges) appendNdjson(GNN_EDGES, edge);

  const fresh = loadState();
  const lastSequence = safeInt(pending[pending.length - 1]?.sequence, safeInt(fresh.lastGulpSequence, 0));
  const after = saveState({
    ...fresh,
    sinceLastGulp: Math.max(0, safeInt(fresh.totalReceived, 0) - lastSequence),
    lastGulpAt: generatedAt,
    lastGulpReason: reason,
    lastGulpId: gulpId,
    lastGulpSequence: lastSequence,
    runs: safeInt(fresh.runs, 0) + 1,
    lastError: '',
  });

  const retainBuffer = Math.max(500, safeInt(after.sinceLastGulp, 0) + 64);
  const gulpFilePlan = planGulpFileCreates(gulpId, retainBuffer);
  const fileCap = collectFileCap(reason, gulpFilePlan.plannedCreates);
  if (fileCap.status === 'deny') {
    const deniedState = saveState({
      ...after,
      ...fileCapStatePatch(fileCap),
      lastError: clipText(`file_cap_exceeded ${fileCap.projectedFiles}/${fileCap.maxTrackedFiles}`, 200),
    });
    if (fs.existsSync(GC_LATEST_PATH)) {
      writeJson(GC_LATEST_PATH, {
        ok: false,
        denied: true,
        generatedAt,
        gulpId,
        reason: 'file_cap_exceeded',
        trigger: {
          reason,
          forced: force,
          processedMessages: pending.length,
          messageRange: { start: safeInt(pending[0]?.sequence, 0), end: lastSequence },
        },
        stateAfter: deniedState,
        fileCap,
      });
    }
    d0log('GULP_FILE_CAP_DENY', {
      gulpId,
      reason,
      trackedFiles: fileCap.trackedFiles,
      projectedFiles: fileCap.projectedFiles,
      maxFiles: fileCap.maxTrackedFiles,
    });
    return {
      ok: false,
      denied: true,
      reason: 'file_cap_exceeded',
      gulpId,
      processedMessages: pending.length,
      fileCap,
    };
  }
  if (fileCap.status === 'warn') {
    d0log('GULP_FILE_CAP_WARN', {
      gulpId,
      reason,
      trackedFiles: fileCap.trackedFiles,
      projectedFiles: fileCap.projectedFiles,
      maxFiles: fileCap.maxTrackedFiles,
    });
  }
  const afterWithFileCap = saveState({
    ...after,
    ...fileCapStatePatch(fileCap),
    lastError: '',
  });

  const prunedFiles = [
    archiveAndTrim(INBOX, GC_RETAIN_RAW, 'inbox', gulpId),
    archiveAndTrim(QUEUE, GC_RETAIN_RAW, 'queue', gulpId),
    archiveAndTrim(GNN_EDGES, MAX_EDGES, 'gnn-edges', gulpId),
    archiveAndTrim(D0_LOG, GC_RETAIN_D0, 'd0-log', gulpId),
    archiveAndTrim(GC_BUFFER_PATH, retainBuffer, 'message-paths', gulpId),
  ];

  const reportPath = gulpFilePlan.reportPath;
  const report = {
    ok: true,
    gulpId,
    reportPath,
    generatedAt,
    spec: 'IX-700',
    hyperlanguage: '47D',
    matrix: {
      waveShape: GC_MATRIX_SHAPE,
      stack: GC_MATRIX_STACK,
      gcEveryMessages: GC_TRIGGER_MESSAGES,
      room: 'whiteroom',
    },
    guard: fileCap,
    trigger: {
      reason,
      forced: force,
      processedMessages: pending.length,
      messageRange: { start: safeInt(pending[0]?.sequence, 0), end: lastSequence },
    },
    stateBefore: before,
    stateAfter: afterWithFileCap,
    mistakeLedger: { ok: ledgerResult.ok !== false, count: mistakeRows.length, path: ledgerResult.path || process.env.ASOLARIA_MISTAKE_LEDGER_PATH },
    learning: {
      ok: learnResult.ok !== false,
      summary: learnResult.summary,
      recurring: safeInt(learnResult.ledger?.recurring, 0),
      gaps: Array.isArray(learnResult.gaps) ? learnResult.gaps.slice(0, 32) : [],
      covered: Array.isArray(learnResult.covered) ? learnResult.covered.slice(0, 32) : [],
      gnnEdges: gnnEdges.length,
    },
    patterns: {
      beforePrune: patternSummaryBeforePrune,
      afterPrune: patternSummary,
      prune: prunePatternResult,
      activeCount: activePatterns.total,
    },
    pruning: prunedFiles,
    cubeCatalog: {
      id: 'behcs.cube-language.mistakes.v1',
      glyph: codex.hilbertAddress(`mistake-catalog:${gulpId}:${activePatterns.total}`),
      entryCount: activePatterns.total,
      entries: buildPatternCatalogEntries(activePatterns.patterns || [], safeInt(afterWithFileCap.totalReceived, 0)),
    },
  };
  writeJson(reportPath, report);
  writeJson(GC_LATEST_PATH, report);
  d0log('GULP_REHYDRATION', { gulpId, reason, processed: pending.length, mistakes: mistakeRows.length, patterns: safeInt(patternSummary.counts?.total, 0), gnnEdges: gnnEdges.length });
  return {
    ok: true,
    gulpId,
    reportPath,
    processedMessages: pending.length,
    mistakesDetected: mistakeRows.length,
    activePatterns: activePatterns.total,
    gnnEdges: gnnEdges.length,
    reason,
    fileCap,
  };
}

function scheduleGulp(reason = 'message_threshold') {
  const current = loadState();
  const fileCap = collectFileCap(`schedule_${reason}`);
  if (gcRunning || safeInt(current.sinceLastGulp, 0) < GC_TRIGGER_MESSAGES) {
    return {
      scheduled: false,
      running: gcRunning,
      pending: safeInt(current.sinceLastGulp, 0),
      threshold: GC_TRIGGER_MESSAGES,
      fileCap,
    };
  }
  gcRunning = true;
  setImmediate(async () => {
    try {
      await runGulpRehydration({ reason });
    } catch (error) {
      const fresh = loadState();
      saveState({ ...fresh, lastError: clipText(error.message, 200) });
      d0log('GULP_REHYDRATION_ERROR', { reason, error: clipText(error.message, 200) });
    } finally {
      gcRunning = false;
    }
  });
  return {
    scheduled: true,
    running: true,
    pending: safeInt(current.sinceLastGulp, 0),
    threshold: GC_TRIGGER_MESSAGES,
    fileCap,
  };
}

loadState();

module.exports = {
  GC_TRIGGER_MESSAGES,
  attachBehcsPath,
  collectorStatus,
  recordCollectorMessage,
  runGulpRehydration,
  scheduleGulp,
  seedCollectorBuffer,
};

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--status')) {
    console.log(JSON.stringify(collectorStatus(), null, 2));
  } else if (args.has('--run')) {
    runGulpRehydration({ force: true, reason: 'cli_manual' })
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok === false ? 1 : 0);
      })
      .catch((error) => {
        console.error(JSON.stringify({ ok: false, error: clipText(error.message, 200) }, null, 2));
        process.exit(1);
      });
  } else {
    console.log('Usage: --status | --run');
  }
}
