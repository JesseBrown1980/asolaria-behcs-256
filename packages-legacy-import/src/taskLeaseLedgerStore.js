const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { getTaskLedgerTask, updateTaskLedgerTask } = require("./taskLedgerStore");

const taskLeaseLedgerPath = resolveDataPath("task-lease-ledger.json");
const maxLeases = Math.max(100, Number(process.env.ASOLARIA_TASK_LEASE_LEDGER_MAX_LEASES || 6000));
const maxEvents = Math.max(200, Number(process.env.ASOLARIA_TASK_LEASE_LEDGER_MAX_EVENTS || 16000));
const LEASE_STATUSES = ["queued", "active", "completed", "failed", "released", "expired", "handed_off", "abandoned"];
const HOLDER_TYPES = ["manager", "worker", "agent", "human", "system", "lane"];
const ACTIVE_LEASE_STATUSES = new Set(["queued", "active"]);
const LEASE_LEDGER_VERSION = 1;
let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(taskLeaseLedgerPath), { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function hasField(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStatus(value, fallback = "active", strict = false) {
  const normalized = cleanText(value).toLowerCase();
  if (LEASE_STATUSES.includes(normalized)) return normalized;
  if (strict && normalized) throw new Error(`Invalid lease status. Allowed: ${LEASE_STATUSES.join(", ")}.`);
  return fallback;
}

function normalizeHolderType(value, fallback = "manager", strict = false) {
  const normalized = cleanText(value).toLowerCase();
  if (HOLDER_TYPES.includes(normalized)) return normalized;
  if (strict && normalized) throw new Error(`Invalid holder type. Allowed: ${HOLDER_TYPES.join(", ")}.`);
  return fallback;
}

function computeExpiry(baseIso, ttlSeconds, fallback = "") {
  const baseMs = Date.parse(baseIso || "");
  if (!Number.isFinite(baseMs)) return fallback;
  return new Date(baseMs + (Math.max(5, ttlSeconds) * 1000)).toISOString();
}

function createInitialDoc() {
  const now = new Date().toISOString();
  return { version: LEASE_LEDGER_VERSION, createdAt: now, updatedAt: now, leases: [], events: [] };
}

function normalizeLease(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  const acquiredAt = toIsoDate(source.acquiredAt, nowIso);
  const status = normalizeStatus(source.status, "active", false);
  const ttlSeconds = clampInt(source.ttlSeconds, 120, 5, 86400);
  const heartbeatAt = toIsoDate(source.heartbeatAt, status === "active" ? acquiredAt : "");
  const baseExpiry = heartbeatAt || acquiredAt;
  return {
    leaseId: cleanText(source.leaseId || source.id || "").slice(0, 80) || makeId("lease"),
    taskId: cleanText(source.taskId || "").slice(0, 80),
    holderId: cleanText(source.holderId || "").slice(0, 120),
    holderType: normalizeHolderType(source.holderType, "manager", false),
    status,
    acquiredAt,
    heartbeatAt,
    ttlSeconds,
    expiresAt: toIsoDate(source.expiresAt, computeExpiry(baseExpiry, ttlSeconds, "")),
    releasedAt: toIsoDate(source.releasedAt, ""),
    attempt: clampInt(source.attempt, 1, 1, 999999),
    dispatchId: cleanText(source.dispatchId || "").slice(0, 120),
    runId: cleanText(source.runId || "").slice(0, 120),
    handoffFromLeaseId: cleanText(source.handoffFromLeaseId || "").slice(0, 80),
    handoffReason: cleanText(source.handoffReason || "").slice(0, 400),
    artifactRef: cleanText(source.artifactRef || "").slice(0, 260)
  };
}

function normalizeEvent(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: cleanText(source.id || "").slice(0, 80) || makeId("lease_evt"),
    leaseId: cleanText(source.leaseId || "").slice(0, 80),
    taskId: cleanText(source.taskId || "").slice(0, 80),
    type: cleanText(source.type || "lease_event").toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 80) || "lease_event",
    actor: cleanText(source.actor || source.by || "system").slice(0, 120) || "system",
    source: cleanText(source.source || "api").slice(0, 80) || "api",
    note: cleanText(source.note || source.message || "").slice(0, 6000),
    at: toIsoDate(source.at, nowIso),
    detail: source.detail && typeof source.detail === "object" ? source.detail : {}
  };
}

function normalizeDoc(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const leases = (Array.isArray(source.leases) ? source.leases : [])
    .map((lease) => normalizeLease(lease, now))
    .filter((lease) => Boolean(lease.taskId && lease.holderId))
    .sort((a, b) => new Date(a.acquiredAt || 0).getTime() - new Date(b.acquiredAt || 0).getTime())
    .slice(-maxLeases);
  const events = (Array.isArray(source.events) ? source.events : [])
    .map((event) => normalizeEvent(event, now))
    .filter((event) => Boolean(event.leaseId))
    .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())
    .slice(-maxEvents);
  const createdAt = toIsoDate(source.createdAt, now);
  const latestLeaseAt = leases.length ? leases[leases.length - 1].heartbeatAt || leases[leases.length - 1].acquiredAt || createdAt : createdAt;
  const latestEventAt = events.length ? events[events.length - 1].at || createdAt : createdAt;
  return {
    version: LEASE_LEDGER_VERSION,
    createdAt,
    updatedAt: toIsoDate(source.updatedAt, new Date(latestLeaseAt).getTime() >= new Date(latestEventAt).getTime() ? latestLeaseAt : latestEventAt),
    leases,
    events
  };
}

function writeDoc(doc) {
  ensureDir();
  const normalized = normalizeDoc(doc);
  const tempPath = `${taskLeaseLedgerPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, taskLeaseLedgerPath);
  cache = normalized;
  return normalized;
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(taskLeaseLedgerPath)) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
  try {
    cache = normalizeDoc(JSON.parse(fs.readFileSync(taskLeaseLedgerPath, "utf8")));
    return cache;
  } catch (_error) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
}

function summarizeDoc(doc) {
  const source = doc && typeof doc === "object" ? doc : loadDoc();
  const statusCounts = {};
  const holderCounts = {};
  let activeLeases = 0;
  let latestLeaseAt = "";
  let latestHeartbeatAt = "";
  for (const lease of source.leases) {
    statusCounts[lease.status] = (statusCounts[lease.status] || 0) + 1;
    holderCounts[lease.holderId] = (holderCounts[lease.holderId] || 0) + 1;
    if (ACTIVE_LEASE_STATUSES.has(lease.status)) activeLeases += 1;
    const leaseStamp = toIsoDate(lease.acquiredAt, "");
    const heartbeatStamp = toIsoDate(lease.heartbeatAt, "");
    if (leaseStamp && (!latestLeaseAt || Date.parse(leaseStamp) >= Date.parse(latestLeaseAt))) latestLeaseAt = leaseStamp;
    if (heartbeatStamp && (!latestHeartbeatAt || Date.parse(heartbeatStamp) >= Date.parse(latestHeartbeatAt))) latestHeartbeatAt = heartbeatStamp;
  }
  return { totalLeases: source.leases.length, activeLeases, eventsCount: source.events.length, latestLeaseAt, latestHeartbeatAt, statusCounts, holderCounts };
}

function listTaskLeases(options = {}) {
  const doc = loadDoc();
  const limit = clampInt(options.limit, 100, 1, Math.max(1000, maxLeases));
  const taskId = cleanText(options.taskId || "");
  const holderId = cleanText(options.holderId || "");
  const status = cleanText(options.status || "all").toLowerCase();
  return doc.leases
    .filter((lease) => (!taskId || lease.taskId === taskId) && (!holderId || lease.holderId === holderId) && (status === "all" || lease.status === status))
    .sort((a, b) => Date.parse(b.heartbeatAt || b.acquiredAt || 0) - Date.parse(a.heartbeatAt || a.acquiredAt || 0))
    .slice(0, limit)
    .map((lease) => JSON.parse(JSON.stringify(lease)));
}

function listTaskLeaseEvents(options = {}) {
  const doc = loadDoc();
  const limit = clampInt(options.limit, 120, 1, Math.max(2000, maxEvents));
  const leaseId = cleanText(options.leaseId || "");
  const taskId = cleanText(options.taskId || "");
  const type = cleanText(options.type || "").toLowerCase();
  const actor = cleanText(options.actor || "").toLowerCase();
  return doc.events
    .filter((event) => (!leaseId || event.leaseId === leaseId) && (!taskId || event.taskId === taskId) && (!type || type === "all" || event.type === type) && (!actor || String(event.actor || "").toLowerCase() === actor))
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, limit)
    .map((event) => JSON.parse(JSON.stringify(event)));
}

function getTaskLease(leaseId, options = {}) {
  const id = cleanText(leaseId);
  if (!id) return null;
  const lease = loadDoc().leases.find((row) => row.leaseId === id);
  if (!lease) return null;
  const clone = JSON.parse(JSON.stringify(lease));
  if (Boolean(options.includeEvents)) clone.events = listTaskLeaseEvents({ leaseId: id, limit: clampInt(options.eventLimit, 80, 1, 2000) });
  return clone;
}

function findActiveLease(doc, taskId, excludeLeaseId = "") {
  return doc.leases.find((lease) => lease.taskId === taskId && lease.leaseId !== excludeLeaseId && ACTIVE_LEASE_STATUSES.has(lease.status));
}

function appendEvent(doc, input = {}) {
  const nowIso = toIsoDate(input.at, new Date().toISOString());
  const event = normalizeEvent({ id: input.id || makeId("lease_evt"), ...input, at: nowIso }, nowIso);
  doc.events.push(event);
  if (doc.events.length > maxEvents) doc.events = doc.events.slice(-maxEvents);
  doc.updatedAt = nowIso;
  return event;
}

function linkTaskLease(taskId, leaseId, actor, source) {
  try {
    const result = updateTaskLedgerTask(taskId, { lastLeaseId: leaseId }, { actor, source, type: "task_lease_linked", note: `Linked lease ${leaseId}.` });
    return { ok: true, task: result.task, event: result.event };
  } catch (error) {
    return { ok: false, error: String(error?.message || "task_link_failed") };
  }
}

function createTaskLease(input = {}) {
  const taskId = cleanText(input.taskId || "");
  if (!taskId) throw new Error("Task id is required.");
  if (!getTaskLedgerTask(taskId)) throw new Error("Task not found.");
  const doc = loadDoc();
  if (!Boolean(input.allowParallel) && findActiveLease(doc, taskId)) throw new Error("Task already has an active lease.");
  const nowIso = new Date().toISOString();
  const lease = normalizeLease({ leaseId: makeId("lease"), taskId, holderId: input.holderId, holderType: input.holderType, status: hasField(input, "status") ? input.status : "active", acquiredAt: nowIso, heartbeatAt: hasField(input, "heartbeatAt") ? input.heartbeatAt : nowIso, ttlSeconds: input.ttlSeconds, attempt: input.attempt, dispatchId: input.dispatchId, runId: input.runId, handoffFromLeaseId: input.handoffFromLeaseId, handoffReason: input.handoffReason, artifactRef: input.artifactRef }, nowIso);
  doc.leases.push(lease);
  if (doc.leases.length > maxLeases) doc.leases = doc.leases.slice(-maxLeases);
  const event = appendEvent(doc, { leaseId: lease.leaseId, taskId, type: "lease_created", actor: cleanText(input.actor || lease.holderId || "api"), source: cleanText(input.source || "api"), note: cleanText(input.note || `Created lease "${lease.leaseId}".`), detail: { status: lease.status, holderId: lease.holderId, dispatchId: lease.dispatchId, runId: lease.runId } });
  writeDoc(doc);
  return { lease: JSON.parse(JSON.stringify(lease)), event: JSON.parse(JSON.stringify(event)), taskLink: linkTaskLease(taskId, lease.leaseId, cleanText(input.actor || lease.holderId || "api"), cleanText(input.source || "lease-ledger") || "lease-ledger"), summary: summarizeDoc(doc) };
}

function updateTaskLease(leaseId, patch = {}, options = {}) {
  const id = cleanText(leaseId);
  if (!id) throw new Error("Lease id is required.");
  const doc = loadDoc();
  const index = doc.leases.findIndex((lease) => lease.leaseId === id);
  if (index < 0) throw new Error("Lease not found.");
  const current = doc.leases[index];
  const taskId = current.taskId;
  const nextInput = {
    ...current,
    holderId: hasField(patch, "holderId") ? patch.holderId : current.holderId,
    holderType: hasField(patch, "holderType") ? patch.holderType : current.holderType,
    status: hasField(patch, "status") ? patch.status : current.status,
    heartbeatAt: hasField(patch, "heartbeatAt") ? patch.heartbeatAt : current.heartbeatAt,
    ttlSeconds: hasField(patch, "ttlSeconds") ? patch.ttlSeconds : current.ttlSeconds,
    expiresAt: hasField(patch, "expiresAt") ? patch.expiresAt : current.expiresAt,
    releasedAt: hasField(patch, "releasedAt") ? patch.releasedAt : current.releasedAt,
    attempt: hasField(patch, "attempt") ? patch.attempt : current.attempt,
    dispatchId: hasField(patch, "dispatchId") ? patch.dispatchId : current.dispatchId,
    runId: hasField(patch, "runId") ? patch.runId : current.runId,
    handoffFromLeaseId: hasField(patch, "handoffFromLeaseId") ? patch.handoffFromLeaseId : current.handoffFromLeaseId,
    handoffReason: hasField(patch, "handoffReason") ? patch.handoffReason : current.handoffReason,
    artifactRef: hasField(patch, "artifactRef") ? patch.artifactRef : current.artifactRef,
    acquiredAt: current.acquiredAt
  };
  if (!hasField(patch, "expiresAt") && (hasField(patch, "heartbeatAt") || hasField(patch, "ttlSeconds"))) {
    nextInput.expiresAt = computeExpiry(
      nextInput.heartbeatAt || nextInput.acquiredAt,
      nextInput.ttlSeconds,
      current.expiresAt
    );
  }
  const next = normalizeLease(nextInput, new Date().toISOString());
  if (ACTIVE_LEASE_STATUSES.has(next.status) && findActiveLease(doc, taskId, id)) throw new Error("Task already has an active lease.");
  if (["completed", "failed", "released", "expired", "handed_off", "abandoned"].includes(next.status) && !next.releasedAt) next.releasedAt = new Date().toISOString();
  doc.leases[index] = next;
  const changedFields = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]));
  const event = appendEvent(doc, { leaseId: id, taskId, type: cleanText(options.type || "") || (changedFields.includes("heartbeatAt") && changedFields.length === 1 ? "lease_heartbeat" : "lease_updated"), actor: cleanText(options.actor || options.by || "api"), source: cleanText(options.source || "api"), note: cleanText(options.note || "") || `Updated fields: ${changedFields.join(", ") || "none"}.`, detail: { changedFields } });
  writeDoc(doc);
  return { lease: JSON.parse(JSON.stringify(next)), event: JSON.parse(JSON.stringify(event)), changedFields, summary: summarizeDoc(doc) };
}

function heartbeatTaskLease(leaseId, input = {}) {
  const patch = {
    heartbeatAt: new Date().toISOString(),
    status: "active"
  };
  if (hasField(input, "ttlSeconds")) {
    patch.ttlSeconds = input.ttlSeconds;
  }
  return updateTaskLease(leaseId, patch, { actor: input.actor, by: input.by, source: input.source || "lease-ledger", type: "lease_heartbeat", note: input.note || "Lease heartbeat recorded." });
}

function releaseTaskLease(leaseId, input = {}) {
  const status = hasField(input, "status") ? normalizeStatus(input.status, "released", true) : "released";
  return updateTaskLease(leaseId, { status, releasedAt: new Date().toISOString(), handoffFromLeaseId: input.handoffFromLeaseId, handoffReason: input.handoffReason }, { actor: input.actor, by: input.by, source: input.source || "lease-ledger", type: `lease_${status}`, note: input.note || `Lease marked ${status}.` });
}

function getTaskLeaseLedgerSummary() {
  return summarizeDoc(loadDoc());
}

function getTaskLeaseLedgerState(options = {}) {
  const doc = loadDoc();
  const leaseLimit = clampInt(options.leaseLimit ?? options.limit, 80, 1, Math.max(1000, maxLeases));
  const eventLimit = clampInt(options.eventLimit, 120, 1, Math.max(2000, maxEvents));
  const filteredLeases = listTaskLeases({
    taskId: options.taskId,
    holderId: options.holderId,
    status: options.status,
    limit: maxLeases
  });
  const filteredEvents = listTaskLeaseEvents({
    leaseId: options.leaseId,
    taskId: options.taskId,
    type: options.eventType,
    actor: options.eventActor,
    limit: maxEvents
  });
  return {
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    summary: summarizeDoc({ ...doc, leases: filteredLeases, events: filteredEvents }),
    leases: filteredLeases.slice(0, leaseLimit),
    events: filteredEvents.slice(0, eventLimit)
  };
}

function readTaskLeaseLedgerDocument() {
  return JSON.parse(JSON.stringify(loadDoc()));
}

function writeTaskLeaseLedgerDocument(doc) {
  return writeDoc(doc);
}

module.exports = {
  LEASE_STATUSES,
  HOLDER_TYPES,
  taskLeaseLedgerPath,
  getTaskLeaseLedgerSummary,
  getTaskLeaseLedgerState,
  readTaskLeaseLedgerDocument,
  writeTaskLeaseLedgerDocument,
  listTaskLeases,
  listTaskLeaseEvents,
  getTaskLease,
  createTaskLease,
  updateTaskLease,
  heartbeatTaskLease,
  releaseTaskLease
};
