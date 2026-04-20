const path = require("path");
const { dataDir } = require("../runtimePaths");
const {
  createTaskLease,
  updateTaskLease,
  getTaskLease
} = require("../taskLeaseLedgerStore");

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function toDataArtifactRef(filePath) {
  const target = cleanText(filePath);
  if (!target) return "";
  const relative = path.relative(dataDir, target).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    return target.replace(/\\/g, "/");
  }
  return relative;
}

function buildLeaseSummary(lease = null) {
  if (!lease || typeof lease !== "object") return null;
  return {
    leaseId: cleanText(lease.leaseId || ""),
    taskId: cleanText(lease.taskId || ""),
    holderId: cleanText(lease.holderId || ""),
    holderType: cleanText(lease.holderType || ""),
    status: cleanText(lease.status || ""),
    acquiredAt: cleanText(lease.acquiredAt || ""),
    heartbeatAt: cleanText(lease.heartbeatAt || ""),
    expiresAt: cleanText(lease.expiresAt || ""),
    releasedAt: cleanText(lease.releasedAt || ""),
    dispatchId: cleanText(lease.dispatchId || ""),
    runId: cleanText(lease.runId || ""),
    artifactRef: cleanText(lease.artifactRef || "")
  };
}

function getDispatchLeaseSummary(leaseId) {
  const id = cleanText(leaseId);
  return id ? buildLeaseSummary(getTaskLease(id)) : null;
}

function hydrateDispatchRecord(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const dispatch = JSON.parse(JSON.stringify(raw));
  const result = dispatch.result && typeof dispatch.result === "object" ? dispatch.result : {};
  const input = dispatch.recommendation && typeof dispatch.recommendation === "object"
    ? dispatch.recommendation.input || {}
    : {};
  const leaseId = cleanText(dispatch.leaseId || result.leaseId || dispatch.lease?.leaseId || "");
  const lease = leaseId ? getDispatchLeaseSummary(leaseId) : buildLeaseSummary(dispatch.lease);
  return {
    ...dispatch,
    leaseId,
    lease,
    leaseStatus: cleanText(lease?.status || dispatch.leaseStatus || result.leaseStatus || ""),
    dispatchMode: cleanText(dispatch.dispatchMode || result.dispatchMode || ""),
    resultSummary: cleanText(dispatch.resultSummary || result.resultSummary || dispatch.error || ""),
    taskType: cleanText(dispatch.taskType || input.taskType || ""),
    issueIdentifier: cleanText(dispatch.issueIdentifier || result.issue?.identifier || result.issueIdentifier || "")
  };
}

function createDispatchContext({ createdAt, dispatchId, dispatchFolder, task, workerId, initialLeaseStatus = "queued" }) {
  const dispatchPath = path.join(dispatchFolder, "dispatch.json");
  const leaseRecord = createTaskLease({
    taskId: task.id,
    holderId: workerId,
    holderType: "manager",
    status: initialLeaseStatus,
    dispatchId,
    artifactRef: toDataArtifactRef(dispatchPath),
    actor: "worker-router",
    source: "worker-router",
    note: `Created ${initialLeaseStatus} lease for ${workerId}.`
  });
  return {
    createdAt,
    dispatchId,
    dispatchFolder,
    dispatchPath,
    task,
    workerId,
    leaseId: leaseRecord.lease.leaseId,
    leaseStatus: leaseRecord.lease.status,
    leaseTerminal: false,
    failureRecorded: false
  };
}

function updateDispatchLease(context, patch = {}, options = {}) {
  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, "artifactPath")) {
    nextPatch.artifactRef = toDataArtifactRef(nextPatch.artifactPath);
    delete nextPatch.artifactPath;
  }
  const result = updateTaskLease(context.leaseId, nextPatch, {
    actor: options.actor || "worker-router",
    source: options.source || "worker-router",
    note: options.note,
    type: options.type
  });
  if (result?.lease?.status) {
    context.leaseStatus = result.lease.status;
    context.leaseTerminal = !["queued", "active"].includes(result.lease.status);
  }
  return result;
}

module.exports = {
  toDataArtifactRef,
  buildLeaseSummary,
  getDispatchLeaseSummary,
  hydrateDispatchRecord,
  createDispatchContext,
  updateDispatchLease
};
