const { getTaskLease } = require("./taskLeaseLedgerStore");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildTaskLeaseContext(task = {}) {
  const leaseId = String(task?.lastLeaseId || "").trim();
  if (!leaseId) {
    return null;
  }
  const lease = getTaskLease(leaseId);
  if (!lease) {
    return {
      leaseId,
      status: "missing",
      holderId: "",
      holderType: "",
      dispatchId: "",
      runId: "",
      heartbeatAt: "",
      expiresAt: "",
      releasedAt: "",
      artifactRef: ""
    };
  }
  return {
    leaseId: String(lease.leaseId || "").trim(),
    status: String(lease.status || "").trim(),
    holderId: String(lease.holderId || "").trim(),
    holderType: String(lease.holderType || "").trim(),
    dispatchId: String(lease.dispatchId || "").trim(),
    runId: String(lease.runId || "").trim(),
    heartbeatAt: String(lease.heartbeatAt || "").trim(),
    expiresAt: String(lease.expiresAt || "").trim(),
    releasedAt: String(lease.releasedAt || "").trim(),
    artifactRef: String(lease.artifactRef || "").trim()
  };
}

function decorateTaskLeaseContext(task = {}) {
  const next = clone(task || {});
  const leaseContext = buildTaskLeaseContext(next);
  if (leaseContext) {
    next.leaseContext = leaseContext;
  }
  return next;
}

function decorateTaskLeaseContextList(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => decorateTaskLeaseContext(task));
}

module.exports = {
  buildTaskLeaseContext,
  decorateTaskLeaseContext,
  decorateTaskLeaseContextList
};
