/** ASO Client — thin wrapper around ASO typed ops (local or remote).
 *  LX chain: LX-153, LX-154, LX-170 */
const path = require("path");
const fs = require("fs");

const GATEWAY_URL = (process.env.ASOLARIA_GATEWAY_URL || "").replace(/\/+$/, "");
const IS_REMOTE = Boolean(GATEWAY_URL);

// --- Token loading (remote mode only) ---
function loadToken() {
  if (process.env.ASOLARIA_GATEWAY_TOKEN) return process.env.ASOLARIA_GATEWAY_TOKEN;
  const tokenPath = path.resolve(__dirname, "..", "data", "vault", "owner", "gateway", "gateway.token.txt");
  try { return fs.readFileSync(tokenPath, "utf8").trim(); } catch (_) { return ""; }
}

// --- Remote HTTP helper (Node built-in) ---
function httpPost(urlPath, body) {
  const url = new URL(urlPath, GATEWAY_URL);
  const payload = JSON.stringify(body);
  const mod = url.protocol === "https:" ? require("https") : require("http");
  const token = loadToken();
  return new Promise((resolve, reject) => {
    const req = mod.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ ok: false, error: "parse_error", raw: data }); }
      });
    });
    req.on("error", (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

function httpGet(urlPath, query) {
  const url = new URL(urlPath, GATEWAY_URL);
  if (query) Object.entries(query).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, v); });
  const mod = url.protocol === "https:" ? require("https") : require("http");
  const token = loadToken();
  return new Promise((resolve, reject) => {
    const req = mod.request(url, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ ok: false, error: "parse_error", raw: data }); }
      });
    });
    req.on("error", (e) => reject(e));
    req.end();
  });
}

// --- Local kernel (lazy-loaded) ---
let _aso = null;
function aso() {
  if (!_aso) _aso = require("./index-kernel/aso");
  return _aso;
}

// --- Remote op dispatcher ---
function remoteOp(op, payload) { return httpPost("/api/aso/op", { op, payload }); }

function unwrapRemoteRows(result) {
  if (!result || result.ok === false) return result;
  return Array.isArray(result.rows) ? result.rows : [];
}

function unwrapRemoteTopic(result) {
  if (!result || result.ok === false) return result;
  return result.topic || null;
}

function unwrapRemoteSearch(result) {
  if (!result || result.ok === false) return result;
  return {
    query: String(result.query || ""),
    tokens: Array.isArray(result.tokens) ? result.tokens : [],
    count: Number(result.count) || 0,
    matches: Array.isArray(result.matches) ? result.matches : []
  };
}

function unwrapRemoteStatus(result) {
  return result;
}

// --- Convenience methods ---
function observe(topicId, summary, opts = {}) {
  const payload = { topicId, summary, ...opts };
  return IS_REMOTE ? remoteOp("add-observation", payload) : aso().addObservation(payload);
}

function relate(from, verb, to, opts = {}) {
  const payload = { from, verb, to, ...opts };
  return IS_REMOTE ? remoteOp("add-relation", payload) : aso().addRelation(payload);
}

function outcome(topicId, trigger, result, opts = {}) {
  const payload = { topicId, trigger, result, ...opts };
  return IS_REMOTE ? remoteOp("add-outcome", payload) : aso().addOutcome(payload);
}

function surface(topicId, host, port, opts = {}) {
  const payload = { topicId, host, port, ...opts };
  return IS_REMOTE ? remoteOp("add-surface", payload) : aso().addSurface(payload);
}

function evidence(topicId, sourceKind, sourceRef, opts = {}) {
  const payload = { topicId, sourceKind, sourceRef, ...opts };
  return IS_REMOTE ? remoteOp("add-evidence", payload) : aso().addEvidence(payload);
}

function conflict(topicId, entryA, entryB, opts = {}) {
  const payload = { topicId, entryA, entryB, ...opts };
  return IS_REMOTE ? remoteOp("add-conflict", payload) : aso().addConflict(payload);
}

function topic(name, type, opts = {}) {
  const payload = { name, type, ...opts };
  return IS_REMOTE ? remoteOp("add-topic", payload) : aso().addTopic(payload);
}

function revise(asoId, changes = {}) {
  const payload = { asoId, ...changes };
  return IS_REMOTE ? remoteOp("revise-topic", payload) : aso().reviseTopic(payload);
}

function search(query, opts = {}) {
  if (IS_REMOTE) return httpGet("/api/aso/search", { q: query, ...opts }).then(unwrapRemoteSearch);
  return aso().searchTopics(query, opts);
}

function status() {
  if (IS_REMOTE) return httpGet("/api/aso/status").then(unwrapRemoteStatus);
  return aso().getAsoStatus();
}

function resolve(id) {
  return IS_REMOTE
    ? search(id).then((r) => r?.matches?.[0]?.asoId || id)
    : aso().resolveId(id);
}

function resolveConflict(conflictId, resolution, opts = {}) {
  const payload = { conflictId, resolution, ...opts };
  return IS_REMOTE ? remoteOp("resolve-conflict", payload) : aso().resolveConflict(payload);
}

function list(filter = {}) {
  if (IS_REMOTE) return httpGet("/api/aso/topics", filter).then(unwrapRemoteRows);
  return aso().listTopics(filter);
}

function get(asoId) {
  if (IS_REMOTE) return httpGet(`/api/aso/topics/${encodeURIComponent(asoId)}`).then(unwrapRemoteTopic);
  return aso().getTopic(asoId);
}

module.exports = { observe, relate, outcome, surface, evidence, conflict, topic, revise, search, status, resolve, resolveConflict, list, get };
