const fs = require("node:fs");
const path = require("node:path");
const { resolveDataPath } = require("../runtimePaths");
const {
  sanitizeWorkerRouterStatus,
  sanitizeWorkerRouterDispatches,
  sanitizeWorkerRouterDispatchSummary
} = require("../workerRouterPublicShapes");

const DISPATCH_ROOT = resolveDataPath("integrations", "worker-router", "dispatches");
const LEASE_LEDGER_PATH = resolveDataPath("task-lease-ledger.json");
const PUBLIC_KNOWN_ISSUES = [
  "Public compat surface is read-only.",
  "Dispatch inspection uses sanitized snapshots only.",
  "Live readiness probes are intentionally omitted on the public route."
];
const PUBLIC_WORKERS = [
  worker("local_codex", "Local Codex", true),
  worker("claude_max", "Claude Max", false),
  worker("abacus", "Abacus", false),
  worker("symphony", "Symphony", false)
];

function worker(id, title, directDispatchSupported) {
  return {
    id,
    title,
    available: true,
    dispatchable: true,
    directDispatchSupported,
    strengths: [directDispatchSupported ? "Best fit for direct local execution." : "Best fit for recorded handoff and review lanes."],
    limitations: [directDispatchSupported ? "Local quota and machine load still apply." : "Public compat view does not expose live tool readiness."],
    mistakes: ["Do not treat the compat read-only surface as an execution authority."]
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function pickRouterSource(input = {}) {
  if (!input || typeof input !== "object") return {};
  if (input.workerRouter && typeof input.workerRouter === "object") return input.workerRouter;
  if (input.status && typeof input.status === "object") return input.status;
  return input;
}

function summarizeLeaseLedger(doc = {}) {
  const leases = Array.isArray(doc.leases) ? doc.leases : [];
  const statusCounts = { active: 0, queued: 0 };
  let activeLeases = 0;
  let queuedLeases = 0;
  for (const lease of leases) {
    const status = cleanText(lease?.status).toLowerCase();
    if (status === "active") {
      activeLeases += 1;
      statusCounts.active += 1;
    } else if (status === "queued") {
      queuedLeases += 1;
      statusCounts.queued += 1;
    }
  }
  return {
    totalLeases: leases.length,
    activeLeases,
    queuedLeases,
    statusCounts,
    generatedAt: cleanText(doc.updatedAt || doc.createdAt)
  };
}

function dispatchSortStamp(dispatch = {}) {
  return cleanText(dispatch.completedAt || dispatch.failedAt || dispatch.createdAt || "");
}

function listDispatchDocs(limit = 20) {
  if (!fs.existsSync(DISPATCH_ROOT)) return [];
  return fs.readdirSync(DISPATCH_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => safeReadJson(path.join(DISPATCH_ROOT, entry.name, "dispatch.json"), null))
    .filter(Boolean)
    .sort((a, b) => dispatchSortStamp(b).localeCompare(dispatchSortStamp(a)))
    .slice(0, clampInt(limit, 20, 1, 200));
}

function getDispatchDoc(dispatchId) {
  const id = cleanText(dispatchId);
  if (!id) return null;
  return safeReadJson(path.join(DISPATCH_ROOT, id, "dispatch.json"), null);
}

function buildDiskStatus() {
  const leaseSummary = summarizeLeaseLedger(safeReadJson(LEASE_LEDGER_PATH, {}));
  const latestDispatch = listDispatchDocs(1)[0] || {};
  const generatedAt = cleanText(leaseSummary.generatedAt || dispatchSortStamp(latestDispatch) || new Date().toISOString());
  return sanitizeWorkerRouterStatus({
    generatedAt,
    defaultWorker: "local_codex",
    workers: PUBLIC_WORKERS,
    leaseLedger: {
      summary: leaseSummary
    },
    knownIssues: PUBLIC_KNOWN_ISSUES
  });
}

function readPublicWorkerRouterStatus(input = {}) {
  const source = pickRouterSource(input);
  if (source && (source.defaultWorker || source.workers || source.leaseLedger || source.knownIssues)) {
    return sanitizeWorkerRouterStatus(source);
  }
  return buildDiskStatus();
}

function listPublicWorkerRouterDispatches(limit = 20, input = {}) {
  const source = pickRouterSource(input);
  const dispatchLimit = clampInt(limit, 20, 1, 200);
  if (Array.isArray(source.dispatches)) {
    return sanitizeWorkerRouterDispatches(source.dispatches).slice(0, dispatchLimit);
  }
  return sanitizeWorkerRouterDispatches(listDispatchDocs(dispatchLimit));
}

function getPublicWorkerRouterDispatch(dispatchId, input = {}) {
  const source = pickRouterSource(input);
  const id = cleanText(dispatchId);
  if (!id) return null;
  if (Array.isArray(source.dispatches)) {
    const match = source.dispatches.find((dispatch) => cleanText(dispatch?.id) === id);
    return match ? sanitizeWorkerRouterDispatchSummary(match) : null;
  }
  const dispatch = getDispatchDoc(id);
  return dispatch ? sanitizeWorkerRouterDispatchSummary(dispatch) : null;
}

function buildWorkerRouterPublicReadSource(input = {}, options = {}) {
  const dispatchLimit = clampInt(options.dispatchLimit, 12, 1, 100);
  const workerRouter = readPublicWorkerRouterStatus(input);
  const dispatches = listPublicWorkerRouterDispatches(dispatchLimit, input);
  return {
    ok: true,
    sourceContract: "public-worker-router-read",
    generatedAt: cleanText(input.generatedAt) || workerRouter.generatedAt || new Date().toISOString(),
    workerRouter: {
      ...workerRouter,
      dispatches
    },
    dispatches
  };
}

function readPublicWorkerRouterDispatches(input = {}, options = {}) {
  return buildWorkerRouterPublicReadSource(input, options).dispatches;
}

module.exports = {
  buildWorkerRouterPublicReadSource,
  readPublicWorkerRouterStatus,
  listPublicWorkerRouterDispatches,
  getPublicWorkerRouterDispatch,
  readPublicWorkerRouterDispatches
};
