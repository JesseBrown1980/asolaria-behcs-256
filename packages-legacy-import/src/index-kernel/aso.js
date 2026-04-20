/** ASO Language Runtime — Typed ops against stable vocabulary entries.
 * LX chain: LX-153, LX-154, LX-170, LX-015 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cleanLine, tokenizeQuery, buildSnippet } = require("./textIds");
const { instanceRoot } = require("../runtimePaths");

const ASO_DATA_DIR = path.join(instanceRoot, "data", "aso");
const TABLES_DIR = path.join(ASO_DATA_DIR, "tables");
const OPS_LOG_PATH = path.join(ASO_DATA_DIR, "ops-log.ndjson");
const CROSSWALK_PATH = path.join(ASO_DATA_DIR, "crosswalk.json");

const VALID_TYPES = [
  "identity", "topic", "skill", "tool", "mistake", "pattern", "rule", "plan"
];
const VALID_VERBS = [
  "depends_on", "corrects", "supersedes", "proves",
  "observed_on", "part_of", "same_as", "runs_on", "blocks", "caused", "contradicts"
];
const RELATION_VERB_ALIASES = Object.freeze({
  requires: { verb: "depends_on", swapEndpoints: false },
  fixes: { verb: "corrects", swapEndpoints: false },
  proven_by: { verb: "proves", swapEndpoints: true },
  evolved: { verb: "supersedes", swapEndpoints: false }
});
const VALID_TIERS = ["boot", "foundational", "operational", "ephemeral"];
const VALID_STATUSES = ["open", "active", "resolved", "obsolete", "contradicted"];
const VALID_SCOPES = ["global", "gaia-local", "liris-local", "falcon-local"];

// --- ID generation ---
let _nextSeq = 0;
function generateAsoId() {
  _nextSeq += 1;
  const seq = String(_nextSeq).padStart(4, "0");
  const hash = crypto.createHash("sha1")
    .update(`${Date.now()}:${seq}:${process.pid}`, "utf8").digest("hex").slice(0, 6);
  return `ASO-${hash}${seq}`;
}
function generateRowId(prefix) {
  _nextSeq += 1;
  const hash = crypto.createHash("sha1")
    .update(`${prefix}:${Date.now()}:${_nextSeq}:${process.pid}`, "utf8").digest("hex").slice(0, 8);
  return `${prefix}-${hash}`;
}

// --- Atomic file I/O ---
function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(String(fs.readFileSync(filePath, "utf8") || "{}"));
}
function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  fs.renameSync(tmp, filePath);
}
function appendNdjson(filePath, record) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
}

function normalizeStringList(values = []) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const rows = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(text);
  }
  return rows;
}

function toCanonicalKeySegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\\/:]+/g, ".")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/(^[.-]+|[.-]+$)/g, "");
}

function buildCanonicalKey(type, name) {
  const typeKey = toCanonicalKeySegment(type || "topic");
  const nameKey = toCanonicalKeySegment(name || "");
  return [typeKey, nameKey].filter(Boolean).join(".");
}

function normalizeCanonicalKey(input, type, name) {
  const raw = String(input || "").trim();
  return raw ? toCanonicalKeySegment(raw) : buildCanonicalKey(type, name);
}

function normalizeRelationVerb(input) {
  const verb = String(input || "").trim().toLowerCase();
  return RELATION_VERB_ALIASES[verb]?.verb || verb;
}

function shouldSwapRelationEndpoints(input) {
  const verb = String(input || "").trim().toLowerCase();
  return Boolean(RELATION_VERB_ALIASES[verb]?.swapEndpoints);
}

function normalizeFieldValue(value, validValues, fieldName, fallback) {
  const normalized = String(value ?? fallback ?? "").trim().toLowerCase();
  if (!validValues.includes(normalized)) {
    return { ok: false, error: `invalid_${fieldName}:${normalized}` };
  }
  return { ok: true, value: normalized };
}

function isStructuredTopicRef(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^(ASO|LX|IX)-/i.test(text) || text.includes(".");
}

// --- Write event emitter (opt-in, zero overhead if no listeners) ---
const _writeListeners = [];

function onWrite(cb) {
  if (typeof cb === "function") _writeListeners.push(cb);
}

function _emitWrite(evt) {
  if (_writeListeners.length === 0) return;
  for (const cb of _writeListeners) {
    try { cb(evt); } catch (_) { /* listener errors never break mutations */ }
  }
}

// --- Ops log ---
function logOp(op, payload, result) {
  appendNdjson(OPS_LOG_PATH, {
    op,
    at: new Date().toISOString(),
    pid: process.pid,
    payload,
    result: { ok: result.ok, id: result.id || "", error: result.error || "" }
  });
}

// --- Table I/O ---
function tablePath(tableName) {
  return path.join(TABLES_DIR, `${tableName}.json`);
}

function readTable(tableName) {
  const data = readJsonFile(tablePath(tableName));
  if (!data || !Array.isArray(data.rows)) {
    return { tableName, rows: [], updatedAt: "" };
  }
  return data;
}

function writeTable(tableName, table) {
  table.updatedAt = new Date().toISOString();
  writeJsonAtomic(tablePath(tableName), table);
  return table;
}

function getTopicByAsoId(asoId) {
  const table = readTable("topics");
  return table.rows.find((r) => r.asoId === asoId) || null;
}

function findTopicByCanonicalKey(canonicalKey) {
  const key = String(canonicalKey || "").trim().toLowerCase();
  if (!key) return null;
  const table = readTable("topics");
  return table.rows.find((r) => String(r.canonicalKey || "").trim().toLowerCase() === key) || null;
}

function findTopicByName(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const table = readTable("topics");
  return table.rows.find((r) => String(r.name || "").trim().toLowerCase() === key) || null;
}

// --- Topics (stable vocabulary) ---
function addTopic(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) {
    return { ok: false, error: "name_required" };
  }
  const type = String(input.type || "topic").toLowerCase();
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: `invalid_type:${type}` };
  }
  const tier = String(input.tier || "operational").toLowerCase();
  if (!VALID_TIERS.includes(tier)) {
    return { ok: false, error: `invalid_tier:${tier}` };
  }
  const status = normalizeFieldValue(input.status, VALID_STATUSES, "status", "active");
  if (!status.ok) return status;
  const scope = normalizeFieldValue(input.scope, VALID_SCOPES, "scope", "global");
  if (!scope.ok) return scope;
  const canonicalKey = normalizeCanonicalKey(input.canonicalKey, type, name);
  if (!canonicalKey) {
    return { ok: false, error: "canonicalKey_required" };
  }
  const table = readTable("topics");
  const duplicate = table.rows.find(
    (r) => String(r.name || "").toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return { ok: false, error: `duplicate_name:${duplicate.asoId}`, existingId: duplicate.asoId };
  }
  const duplicateCanonical = table.rows.find(
    (r) => String(r.canonicalKey || "").toLowerCase() === canonicalKey
  );
  if (duplicateCanonical) {
    return {
      ok: false,
      error: `duplicate_canonicalKey:${duplicateCanonical.asoId}`,
      existingId: duplicateCanonical.asoId
    };
  }
  const crosswalk = readJsonFile(CROSSWALK_PATH) || { mappings: {} };
  for (const legacyId of normalizeStringList(input.legacyIds)) {
    if (crosswalk.mappings[legacyId] && crosswalk.mappings[legacyId] !== input.asoId) {
      return {
        ok: false,
        error: `crosswalk_collision:${legacyId}:${crosswalk.mappings[legacyId]}`,
        existingId: crosswalk.mappings[legacyId]
      };
    }
  }
  const asoId = input.asoId || generateAsoId();
  const row = {
    asoId, canonicalKey, name, type,
    domains: normalizeStringList(input.domains),
    legacyIds: normalizeStringList(input.legacyIds),
    tier,
    status: status.value,
    scope: scope.value,
    body: String(input.body || ""),
    summary: String(input.summary || ""),
    tags: normalizeStringList(input.tags),
    chain: normalizeStringList(input.chain),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: String(input.createdBy || process.env.ASOLARIA_AGENT_NAME || "unknown")
  };
  table.rows.push(row);
  writeTable("topics", table);
  if (row.legacyIds.length > 0) {
    for (const legacyId of row.legacyIds) {
      crosswalk.mappings[legacyId] = asoId;
    }
    writeJsonAtomic(CROSSWALK_PATH, crosswalk);
  }
  const result = { ok: true, id: asoId, op: "add-topic" };
  logOp("add-topic", { name, type, tier, asoId }, result);
  _emitWrite(result);
  return result;
}

function reviseTopic(input = {}) {
  const asoId = String(input.asoId || "").trim();
  if (!asoId) {
    return { ok: false, error: "asoId_required" };
  }
  const table = readTable("topics");
  const row = table.rows.find((r) => r.asoId === asoId);
  if (!row) {
    return { ok: false, error: `not_found:${asoId}` };
  }
  const updatable = ["name", "type", "canonicalKey", "domains", "tier", "status", "scope", "body", "summary", "tags", "chain"];
  const changes = {};
  for (const key of updatable) {
    if (key in input && input[key] !== undefined) {
      if (key === "name") {
        const nextName = String(input[key] || "").trim();
        const duplicateName = table.rows.find(
          (candidate) => candidate.asoId !== asoId &&
            String(candidate.name || "").toLowerCase() === nextName.toLowerCase()
        );
        if (!nextName) return { ok: false, error: "name_required" };
        if (duplicateName) {
          return {
            ok: false,
            error: `duplicate_name:${duplicateName.asoId}`,
            existingId: duplicateName.asoId
          };
        }
      }
      if (key === "type" && !VALID_TYPES.includes(String(input[key]).toLowerCase())) {
        return { ok: false, error: `invalid_type:${input[key]}` };
      }
      if (key === "tier" && !VALID_TIERS.includes(String(input[key]).toLowerCase())) {
        return { ok: false, error: `invalid_tier:${input[key]}` };
      }
      if (key === "status") {
        const status = normalizeFieldValue(input[key], VALID_STATUSES, "status", row.status);
        if (!status.ok) return status;
        changes[key] = status.value;
        row[key] = status.value;
        continue;
      }
      if (key === "scope") {
        const scope = normalizeFieldValue(input[key], VALID_SCOPES, "scope", row.scope);
        if (!scope.ok) return scope;
        changes[key] = scope.value;
        row[key] = scope.value;
        continue;
      }
      if (key === "canonicalKey") {
        const canonicalKey = normalizeCanonicalKey(input[key], row.type, row.name);
        const duplicateCanonical = table.rows.find(
          (candidate) => candidate.asoId !== asoId &&
            String(candidate.canonicalKey || "").toLowerCase() === canonicalKey
        );
        if (duplicateCanonical) {
          return {
            ok: false,
            error: `duplicate_canonicalKey:${duplicateCanonical.asoId}`,
            existingId: duplicateCanonical.asoId
          };
        }
        changes[key] = canonicalKey;
        row[key] = canonicalKey;
        continue;
      }
      if (key === "domains" || key === "tags" || key === "chain") {
        changes[key] = normalizeStringList(input[key]);
        row[key] = changes[key];
        continue;
      }
      changes[key] = input[key];
      row[key] = input[key];
    }
  }
  if (!("canonicalKey" in row) || !String(row.canonicalKey || "").trim()) {
    row.canonicalKey = buildCanonicalKey(row.type, row.name);
  }
  row.updatedAt = new Date().toISOString();
  row.revisedBy = String(input.revisedBy || process.env.ASOLARIA_AGENT_NAME || "unknown");
  writeTable("topics", table);
  const result = { ok: true, id: asoId, op: "revise-topic", changes: Object.keys(changes) };
  logOp("revise-topic", { asoId, changes: Object.keys(changes) }, result);
  _emitWrite(result);
  return result;
}

function getTopic(asoId) {
  const resolvedId = resolveId(asoId);
  return getTopicByAsoId(resolvedId);
}

function findTopicByLegacyId(legacyId) {
  const asoId = resolveId(legacyId);
  if (!asoId || asoId === legacyId) { return null; }
  return getTopicByAsoId(asoId);
}

function listTopics(filter = {}) {
  const table = readTable("topics");
  let rows = table.rows;
  if (filter.type) { rows = rows.filter((r) => r.type === String(filter.type).toLowerCase()); }
  if (filter.tier) { rows = rows.filter((r) => r.tier === String(filter.tier).toLowerCase()); }
  if (filter.status) { rows = rows.filter((r) => r.status === String(filter.status).toLowerCase()); }
  if (filter.scope) { rows = rows.filter((r) => r.scope === String(filter.scope).toLowerCase()); }
  if (filter.canonicalKey) {
    const canonicalKey = String(filter.canonicalKey).trim().toLowerCase();
    rows = rows.filter((r) => String(r.canonicalKey || "").toLowerCase() === canonicalKey);
  }
  const tagFilters = normalizeStringList([
    ...(Array.isArray(filter.tags) ? filter.tags : []),
    ...(filter.tag ? [filter.tag] : [])
  ]).map((value) => value.toLowerCase());
  if (tagFilters.length > 0) {
    rows = rows.filter((r) => {
      const tags = normalizeStringList(r.tags).map((value) => value.toLowerCase());
      return tagFilters.some((value) => tags.includes(value));
    });
  }
  const chainFilters = normalizeStringList([
    ...(Array.isArray(filter.chains) ? filter.chains : []),
    ...(filter.chain ? [filter.chain] : [])
  ]).map((value) => value.toLowerCase());
  if (chainFilters.length > 0) {
    rows = rows.filter((r) => {
      const chain = normalizeStringList(r.chain).map((value) => value.toLowerCase());
      return chainFilters.some((value) => chain.includes(value));
    });
  }
  return rows;
}

// --- Crosswalk (IX/LX -> ASO) ---
function getCrosswalk() {
  return readJsonFile(CROSSWALK_PATH) || { mappings: {} };
}

function resolveId(id) {
  const raw = String(id || "").trim();
  if (!raw) return "";
  if (getTopicByAsoId(raw)) return raw;
  const crosswalk = getCrosswalk();
  const mapped = crosswalk.mappings[raw];
  if (mapped) return mapped;
  const byCanonicalKey = findTopicByCanonicalKey(raw);
  if (byCanonicalKey) return byCanonicalKey.asoId;
  const byName = findTopicByName(raw);
  if (byName) return byName.asoId;
  return raw;
}

// --- Table ops from asoTables.js (factory injection, no circular deps) ---
const createTableOps = require("./asoTables");
const _tableOps = createTableOps({
  readTable, writeTable, generateRowId, logOp,
  getCrosswalk, VALID_VERBS, VALID_STATUSES, VALID_SCOPES, resolveId, getTopic,
  normalizeRelationVerb, shouldSwapRelationEndpoints, isStructuredTopicRef, ASO_DATA_DIR, _emitWrite
});

// --- Search (mirrors query.js scoreDocument pattern for ASO topics) ---
function scoreAsoTopic(row, query, tokens, filters) {
  const lo = (v) => String(v || "").toLowerCase();
  const nameLo = lo(row.name), typeLo = lo(row.type), tierLo = lo(row.tier), scopeLo = lo(row.scope);
  const tagLo = (row.tags || []).map(lo), chainLo = (row.chain || []).map(lo);
  const legacyLo = (row.legacyIds || []).map(lo);
  const canonicalKeyLo = lo(row.canonicalKey);
  const statusLo = lo(row.status);
  const summLo = lo(row.summary), bodyLo = lo(row.body);
  if (filters.type && typeLo !== lo(filters.type)) { return 0; }
  if (filters.tier && tierLo !== lo(filters.tier)) { return 0; }
  if (filters.status && statusLo !== lo(filters.status)) { return 0; }
  if (filters.scope && scopeLo !== lo(filters.scope)) { return 0; }
  if (filters.tags && filters.tags.length > 0 &&
      !filters.tags.map(lo).some((n) => tagLo.includes(n))) { return 0; }
  if (filters.chain && !chainLo.includes(lo(filters.chain))) { return 0; }
  let score = 0;
  const qLo = query.toLowerCase();
  if (nameLo === qLo) { score += 48; }
  if (canonicalKeyLo === qLo) { score += 44; }
  if (legacyLo.includes(qLo)) { score += 40; }
  if (nameLo.includes(qLo)) { score += 24; }
  if (canonicalKeyLo.includes(qLo)) { score += 20; }
  for (const tk of tokens) {
    if (!tk) { continue; }
    if (nameLo.includes(tk)) { score += 18; }
    if (canonicalKeyLo.includes(tk)) { score += 16; }
    if (legacyLo.some((v) => v.includes(tk))) { score += 14; }
    if (tagLo.some((v) => v.includes(tk))) { score += 12; }
    if (typeLo === tk) { score += 10; }
    if (chainLo.some((v) => v.includes(tk))) { score += 8; }
    if (summLo.includes(tk)) { score += 6; }
    if (bodyLo.includes(tk)) { score += 4; }
  }
  return score;
}

function searchTopics(query, options = {}) {
  const text = cleanLine(query);
  if (!text) { return { query: "", tokens: [], count: 0, matches: [] }; }
  const tokens = tokenizeQuery(text);
  const filters = {
    type: options.type || "",
    tier: options.tier || "",
    status: options.status || "",
    scope: options.scope || "",
    tags: normalizeStringList([
      ...(Array.isArray(options.tags) ? options.tags : []),
      ...(options.tag ? [options.tag] : [])
    ]),
    chain: options.chain || ""
  };
  const lim = Math.max(1, Math.min(30, Number(options.limit) || 10));
  const snipMax = Math.max(80, Math.min(420, Number(options.maxSnippetChars) || 220));
  const matches = readTable("topics").rows
    .map((row) => ({ row, score: scoreAsoTopic(row, text, tokens, filters) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score ||
      String(b.row.updatedAt || "").localeCompare(String(a.row.updatedAt || "")))
    .slice(0, lim)
    .map((r) => ({
      kind: "aso-topic", asoId: r.row.asoId, name: r.row.name,
      canonicalKey: r.row.canonicalKey || "",
      type: r.row.type, tier: r.row.tier, status: r.row.status, scope: r.row.scope,
      tags: (r.row.tags || []).slice(0, 12), chain: (r.row.chain || []).slice(0, 8),
      legacyIds: (r.row.legacyIds || []).slice(0, 8),
      score: r.score, updatedAt: r.row.updatedAt,
      snippet: buildSnippet([r.row.summary, r.row.body].filter(Boolean).join(" "), tokens, snipMax)
    }));
  return { query: text, tokens, count: matches.length, matches };
}

module.exports = {
  onWrite,
  addTopic, reviseTopic, getTopic, findTopicByLegacyId, listTopics,
  searchTopics,
  getCrosswalk, resolveId,
  ..._tableOps,
  VALID_TYPES, VALID_VERBS, VALID_TIERS, VALID_STATUSES, VALID_SCOPES,
  RELATION_VERB_ALIASES, shouldSwapRelationEndpoints,
  ASO_DATA_DIR
};
