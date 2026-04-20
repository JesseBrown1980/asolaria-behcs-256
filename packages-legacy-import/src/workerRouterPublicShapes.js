function asText(value, fallback = "") {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringList(value) {
  return Array.isArray(value) ? value.map((item) => asText(item)).filter(Boolean) : [];
}

function sanitizeLeaseSummary(summary = {}) {
  const source = summary && typeof summary === "object" ? summary : {};
  const statusCounts = source.statusCounts && typeof source.statusCounts === "object" ? source.statusCounts : {};
  return {
    activeLeases: asNumber(source.activeLeases, 0),
    queuedLeases: asNumber(source.queuedLeases, 0),
    totalLeases: asNumber(source.totalLeases, 0),
    statusCounts: {
      active: asNumber(statusCounts.active, 0),
      queued: asNumber(statusCounts.queued, 0)
    }
  };
}

function sanitizeWorkerSummary(worker = {}) {
  const source = worker && typeof worker === "object" ? worker : {};
  return {
    id: asText(source.id),
    title: asText(source.title || source.id),
    available: Boolean(source.available),
    dispatchable: Boolean(source.dispatchable),
    directDispatchSupported: Boolean(source.directDispatchSupported),
    strengths: asStringList(source.strengths),
    limitations: asStringList(source.limitations),
    mistakes: asStringList(source.mistakes)
  };
}

function sanitizeDispatchSummary(dispatch = {}) {
  const source = dispatch && typeof dispatch === "object" ? dispatch : {};
  const taskType = asText(source.taskType || source.recommendation?.input?.taskType);
  const resultSummary = asText(source.resultSummary || source.result?.resultSummary || source.error);
  return {
    id: asText(source.id),
    title: asText(source.title || source.id),
    workerId: asText(source.workerId),
    taskId: asText(source.taskId),
    leaseId: asText(source.leaseId),
    leaseStatus: asText(source.leaseStatus || source.lease?.status),
    createdAt: asText(source.createdAt),
    completedAt: asText(source.completedAt),
    failedAt: asText(source.failedAt),
    taskType,
    resultSummary,
    error: asText(source.error)
  };
}

function sanitizeWorkerRouterStatus(status = {}) {
  const source = status && typeof status === "object" ? status : {};
  return {
    generatedAt: asText(source.generatedAt),
    defaultWorker: asText(source.defaultWorker),
    workers: Array.isArray(source.workers) ? source.workers.map((worker) => sanitizeWorkerSummary(worker)) : [],
    leaseLedger: {
      summary: sanitizeLeaseSummary(source.leaseLedger?.summary)
    },
    knownIssues: asStringList(source.knownIssues)
  };
}

function sanitizeWorkerRouterDispatches(dispatches = []) {
  return Array.isArray(dispatches) ? dispatches.map((dispatch) => sanitizeDispatchSummary(dispatch)) : [];
}

module.exports = {
  sanitizeWorkerRouterStatus,
  sanitizeWorkerRouterDispatches,
  sanitizeWorkerRouterDispatchSummary: sanitizeDispatchSummary
};
