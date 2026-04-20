const fs = require("fs");
const path = require("path");

const {
  readTaskLedgerDocument,
  writeTaskLedgerDocument,
  updateTaskLedgerTask
} = require("./taskLedgerStore");
const {
  readTaskLeaseLedgerDocument,
  writeTaskLeaseLedgerDocument
} = require("./taskLeaseLedgerStore");
const { decorateTaskLeaseContextList } = require("./taskLeaseView");

const ACTIVE_LEASE_STATUSES = new Set(["queued", "active"]);
const OPEN_TASK_STATUSES = new Set(["planned", "ready", "in_progress", "blocked", "review"]);
const OPEN_WORK_START = "<!-- ASOLARIA OPEN WORK START -->";
const OPEN_WORK_END = "<!-- ASOLARIA OPEN WORK END -->";

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toMillis(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestIso(values = [], fallback = "") {
  let best = fallback;
  let bestMs = toMillis(fallback);
  for (const value of values) {
    const ms = toMillis(value);
    if (ms >= bestMs) {
      best = String(value || "").trim();
      bestMs = ms;
    }
  }
  return best || fallback;
}

function normalizeScopeId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMarker(value) {
  return cleanText(value).slice(0, 80).toUpperCase();
}

function taskMatchesScope(task = {}, projectScope = "", projectMarker = "") {
  const normalizedScope = normalizeScopeId(projectScope);
  const normalizedMarker = normalizeMarker(projectMarker);
  if (!normalizedScope && !normalizedMarker) {
    return true;
  }
  const taskScope = normalizeScopeId(task.projectScope || task.scope || task.projectId || "");
  if (normalizedScope && taskScope === normalizedScope) {
    return true;
  }
  if (normalizedMarker) {
    const haystack = `${task.title || ""}\n${task.description || ""}`.toUpperCase();
    return haystack.includes(normalizedMarker);
  }
  return false;
}

function isOpenTask(task = {}) {
  const status = String(task.status || "").trim().toLowerCase();
  return !task.archived && !["done", "canceled", "archived"].includes(status) && OPEN_TASK_STATUSES.has(status);
}

function priorityWeight(priority = "") {
  switch (String(priority || "").trim().toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function compareOpenTasks(left, right) {
  const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const updatedDelta = toMillis(right.updatedAt || right.createdAt) - toMillis(left.updatedAt || left.createdAt);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function collectLatestTaskTimestamps(doc) {
  const values = [];
  for (const task of Array.isArray(doc?.tasks) ? doc.tasks : []) {
    values.push(task.updatedAt, task.createdAt);
  }
  for (const event of Array.isArray(doc?.events) ? doc.events : []) {
    values.push(event.at);
  }
  return latestIso(values, doc?.createdAt || "");
}

function collectLatestLeaseTimestamps(doc) {
  const values = [];
  for (const lease of Array.isArray(doc?.leases) ? doc.leases : []) {
    values.push(lease.heartbeatAt, lease.acquiredAt, lease.releasedAt);
  }
  for (const event of Array.isArray(doc?.events) ? doc.events : []) {
    values.push(event.at);
  }
  return latestIso(values, doc?.createdAt || "");
}

function pickLiveLease(taskId, leases = []) {
  return leases
    .filter((lease) => String(lease.taskId || "") === String(taskId || "") && ACTIVE_LEASE_STATUSES.has(String(lease.status || "").trim().toLowerCase()))
    .sort((left, right) => toMillis(right.heartbeatAt || right.acquiredAt) - toMillis(left.heartbeatAt || left.acquiredAt))[0] || null;
}

function formatOwnership(task = {}) {
  const lease = task.leaseContext || {};
  const leaseId = cleanText(lease.leaseId || "");
  const holderId = cleanText(lease.holderId || task.assigneeId || task.owner || "");
  if (!leaseId && !holderId) {
    return "unassigned";
  }
  if (!leaseId) {
    return holderId || "unassigned";
  }
  if (!holderId) {
    return `${leaseId} (${lease.status || "missing"})`;
  }
  return `${holderId} via ${leaseId} (${lease.status || "missing"})`;
}

function describeNormalizedLedgers(summary = {}) {
  const updated = [];
  if (summary.normalizedTaskLedger) {
    updated.push("task-ledger");
  }
  if (summary.normalizedLeaseLedger) {
    updated.push("task-lease-ledger");
  }
  return updated.length > 0 ? updated.join(", ") : "none";
}

function renderOpenWorkBlock(tasks = [], summary = {}, generatedAt = new Date().toISOString()) {
  const rows = (Array.isArray(tasks) ? tasks : [])
    .slice()
    .sort(compareOpenTasks)
    .map((task) => {
      const lease = task.leaseContext || {};
      return {
        id: cleanText(task.id || ""),
        title: String(task.title || "").replace(/\|/g, "\\|"),
        taskLabel: [cleanText(task.id || ""), String(task.title || "").replace(/\|/g, "\\|")].filter(Boolean).join(" — "),
        status: String(task.status || "").trim(),
        ownership: formatOwnership(task).replace(/\|/g, "\\|"),
        assigneeId: cleanText(task.assigneeId || task.owner || ""),
        leaseStatus: cleanText(lease.status || "none") || "none",
        leaseId: cleanText(lease.leaseId || task.lastLeaseId || ""),
        updatedAt: cleanText(task.updatedAt || task.createdAt || "")
      };
    });

  const lines = [
    OPEN_WORK_START,
    "## Open Work",
    `Generated: ${generatedAt}`,
    `Source: task-ledger.json + task-lease-ledger.json`,
    `Open tasks total: ${summary.openTaskCount ?? rows.length}`,
    `Open tasks shown: ${rows.length}`,
    `Reconciled tasks: ${summary.reconciledTaskCount || 0}`,
    `Updated ledger timestamps: ${describeNormalizedLedgers(summary)}`,
    "",
    `| Task | Status | Ownership | Assignee | Lease | Updated |`,
    `|----|----|----|----|----|----|`,
    ...rows.map((row) => `| ${row.taskLabel || row.id || "?"} | ${row.status || "?"} | ${row.ownership || "unassigned"} | ${row.assigneeId || "unassigned"} | ${row.leaseId ? `${row.leaseId} (${row.leaseStatus})` : row.leaseStatus} | ${row.updatedAt || ""} |`),
    OPEN_WORK_END
  ];
  return lines.join("\n");
}

function upsertOpenWorkBlock(memoryText, block) {
  const source = String(memoryText || "");
  const rendered = String(block || "").trim();
  const pattern = new RegExp(`${escapeRegExp(OPEN_WORK_START)}[\\s\\S]*?${escapeRegExp(OPEN_WORK_END)}`, "m");
  if (pattern.test(source)) {
    return source.replace(pattern, rendered);
  }
  const trimmed = source.replace(/\s+$/g, "");
  return `${trimmed}\n\n${rendered}\n`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyOpenWorkBlockToMemory(memoryPath, block) {
  const targetPath = cleanText(memoryPath);
  if (!targetPath) {
    return { ok: false, written: false, reason: "missing_memory_path" };
  }
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  const next = upsertOpenWorkBlock(current, block);
  if (next === current) {
    return { ok: true, written: false, path: targetPath };
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, next, "utf8");
  fs.renameSync(tempPath, targetPath);
  return { ok: true, written: true, path: targetPath };
}

function reconcileTaskBacklog(options = {}) {
  const projectScope = normalizeScopeId(options.projectScope || options.scope || "");
  const projectMarker = normalizeMarker(options.projectMarker || "");
  const taskLedgerDoc = readTaskLedgerDocument();
  const leaseLedgerDoc = readTaskLeaseLedgerDocument();
  const openWorkLimit = Number.isFinite(options.openWorkLimit)
    ? Math.max(1, Math.round(options.openWorkLimit))
    : 20;
  const activeLeases = (Array.isArray(leaseLedgerDoc.leases) ? leaseLedgerDoc.leases : [])
    .filter((lease) => ACTIVE_LEASE_STATUSES.has(String(lease.status || "").trim().toLowerCase()))
    .sort((left, right) => toMillis(right.heartbeatAt || right.acquiredAt) - toMillis(left.heartbeatAt || left.acquiredAt));

  const openTasks = (Array.isArray(taskLedgerDoc.tasks) ? taskLedgerDoc.tasks : [])
    .filter((task) => isOpenTask(task) && taskMatchesScope(task, projectScope, projectMarker))
    .sort(compareOpenTasks);
  const changedTasks = [];

  for (const task of openTasks) {
    const liveLease = pickLiveLease(task.id, activeLeases);
    if (!liveLease) {
      continue;
    }

    const patch = {};
    if (cleanText(liveLease.leaseId || "") && cleanText(task.lastLeaseId || "") !== cleanText(liveLease.leaseId || "")) {
      patch.lastLeaseId = liveLease.leaseId;
    }

    if (Object.keys(patch).length > 0) {
      const result = updateTaskLedgerTask(task.id, patch, {
        actor: cleanText(options.actor || options.by || "task-backlog-reconciler") || "task-backlog-reconciler",
        source: cleanText(options.source || "task-backlog-reconciler") || "task-backlog-reconciler",
        type: "task_backlog_reconciled",
        note: `Reconciled visible ownership from lease ${liveLease.leaseId}.`
      });
      changedTasks.push({
        id: task.id,
        patch,
        updatedAt: result.task.updatedAt
      });
    }

  }

  const normalizedTaskDoc = readTaskLedgerDocument();
  const desiredTaskUpdatedAt = collectLatestTaskTimestamps(normalizedTaskDoc);
  let normalizedTaskLedger = false;
  if (desiredTaskUpdatedAt && cleanText(normalizedTaskDoc.updatedAt || "") !== desiredTaskUpdatedAt) {
    normalizedTaskDoc.updatedAt = desiredTaskUpdatedAt;
    writeTaskLedgerDocument(normalizedTaskDoc);
    normalizedTaskLedger = true;
  }

  const normalizedLeaseDoc = readTaskLeaseLedgerDocument();
  const desiredLeaseUpdatedAt = collectLatestLeaseTimestamps(normalizedLeaseDoc);
  let normalizedLeaseLedger = false;
  if (desiredLeaseUpdatedAt && cleanText(normalizedLeaseDoc.updatedAt || "") !== desiredLeaseUpdatedAt) {
    normalizedLeaseDoc.updatedAt = desiredLeaseUpdatedAt;
    writeTaskLeaseLedgerDocument(normalizedLeaseDoc);
    normalizedLeaseLedger = true;
  }

  const refreshedOpenTasks = decorateTaskLeaseContextList(
    (Array.isArray(normalizedTaskDoc.tasks) ? normalizedTaskDoc.tasks : [])
      .filter((task) => isOpenTask(task) && taskMatchesScope(task, projectScope, projectMarker))
      .sort(compareOpenTasks)
  );
  const openWorkTasks = refreshedOpenTasks.slice(0, openWorkLimit);

  const openWorkBlock = renderOpenWorkBlock(
    openWorkTasks,
    {
      openTaskCount: openTasks.length,
      reconciledTaskCount: changedTasks.length,
      normalizedTaskLedger,
      normalizedLeaseLedger
    },
    new Date().toISOString()
  );

  const result = {
    ok: true,
    projectScope: projectScope || "",
    projectMarker: projectMarker || "",
    openTaskCount: openTasks.length,
    reconciledTaskCount: changedTasks.length,
    normalizedTaskLedger,
    normalizedLeaseLedger,
    changedTasks,
    openTasks: refreshedOpenTasks.map((task) => ({
      id: cleanText(task.id || ""),
      title: cleanText(task.title || ""),
      status: cleanText(task.status || ""),
      assigneeId: cleanText(task.assigneeId || ""),
      leaseId: cleanText(task.lastLeaseId || ""),
      leaseStatus: cleanText(task.leaseContext?.status || "missing"),
      ownership: formatOwnership(task),
      updatedAt: cleanText(task.updatedAt || "")
    })),
    openWorkTasks: openWorkTasks.map((task) => ({
      id: cleanText(task.id || ""),
      title: cleanText(task.title || ""),
      status: cleanText(task.status || ""),
      assigneeId: cleanText(task.assigneeId || ""),
      leaseId: cleanText(task.lastLeaseId || ""),
      leaseStatus: cleanText(task.leaseContext?.status || "missing"),
      ownership: formatOwnership(task),
      updatedAt: cleanText(task.updatedAt || "")
    })),
    openWorkBlock
  };

  if (options.memoryPath && options.writeMemory !== false) {
    result.memory = applyOpenWorkBlockToMemory(options.memoryPath, openWorkBlock);
  }

  return result;
}

module.exports = {
  OPEN_WORK_START,
  OPEN_WORK_END,
  reconcileTaskBacklog,
  renderOpenWorkBlock,
  upsertOpenWorkBlock,
  applyOpenWorkBlockToMemory
};
