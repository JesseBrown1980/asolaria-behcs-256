const { searchAgentIndex } = require("./agentIndexStore");
const { listTaskLedgerTasks, getTaskLedgerTask } = require("./taskLedgerStore");
const { createTaskLease } = require("./taskLeaseLedgerStore");
const { decorateTaskLeaseContext, decorateTaskLeaseContextList } = require("./taskLeaseView");

function cleanTaskText(value) {
  return String(value || "").trim();
}

function isOpenLedgerTask(task = {}) {
  const status = cleanTaskText(task.status).toLowerCase();
  if (!status) {
    return false;
  }
  if (Boolean(task.archived)) {
    return false;
  }
  return !["done", "canceled", "archived"].includes(status);
}

function buildTaskStatusFromText(text = "") {
  const snippet = cleanTaskText(text).toLowerCase();
  const match = snippet.match(/status:\s*([a-z_]+)/);
  return match ? match[1] : "";
}

function queryIndexedTasksForRole(role, config = {}, runtime = {}) {
  if (!config || typeof config !== "object") {
    return [];
  }

  const query = runtime.searchAgentIndex || searchAgentIndex;
  const taskQuery = `${(config.taskKeywords || [role]).join(" ")} task`;
  const taskResults = query(taskQuery, { limit: 10, force: true });
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return (taskResults.matches || []).filter((match) => {
    if (match.type !== "task") {
      return false;
    }
    const snippet = String(match.snippet || "").toLowerCase();
    if (snippet.includes("status: archived")) {
      return false;
    }
    if (snippet.includes("status: done")) {
      const completedMatch = snippet.match(/completedat:\s*(\S+)/);
      if (completedMatch) {
        const completedAt = new Date(completedMatch[1]).getTime();
        if (completedAt && (now - completedAt) > oneDayMs) {
          return false;
        }
      }
    }
    return true;
  }).map((match) => ({
    id: cleanTaskText(match.id || match.ix || match.lx),
    ix: cleanTaskText(match.ix),
    lx: cleanTaskText(match.lx || match.id || match.ix),
    title: cleanTaskText(match.title),
    source: "index",
    status: buildTaskStatusFromText(match.snippet || match.summary || match.body || "") || "indexed",
    assigneeId: "",
    owner: "",
    projectScope: "",
    leaseContext: null,
    updatedAt: cleanTaskText(match.updatedAt)
  }));
}

function buildLiveTaskRoleScore(task = {}, role = "", config = {}) {
  const normalizedRole = cleanTaskText(role).toLowerCase();
  const assigneeId = cleanTaskText(task.assigneeId).toLowerCase();
  const owner = cleanTaskText(task.owner).toLowerCase();
  const leaseHolderId = cleanTaskText(task.leaseContext?.holderId).toLowerCase();
  const leaseStatus = cleanTaskText(task.leaseContext?.status).toLowerCase();
  const haystack = [
    task.title,
    task.description,
    task.projectScope,
    ...(Array.isArray(task.tags) ? task.tags : [])
  ].join("\n").toLowerCase();
  const probes = Array.from(new Set([
    normalizedRole,
    ...(Array.isArray(config.taskKeywords) ? config.taskKeywords : [])
  ].map((term) => cleanTaskText(term).toLowerCase()).filter(Boolean)));

  let score = 0;
  if (assigneeId === normalizedRole) {
    score += 120;
  }
  if (owner === normalizedRole) {
    score += 80;
  }
  if (leaseHolderId === normalizedRole) {
    score += 140;
  }
  if (leaseStatus === "active") {
    score += 12;
  } else if (leaseStatus === "queued") {
    score += 8;
  }
  for (const probe of probes) {
    if (probe && haystack.includes(probe)) {
      score += 4;
    }
  }
  return score;
}

function formatLiveTaskForPacket(task = {}) {
  const lease = task.leaseContext && typeof task.leaseContext === "object"
    ? {
        leaseId: cleanTaskText(task.leaseContext.leaseId),
        holderId: cleanTaskText(task.leaseContext.holderId),
        status: cleanTaskText(task.leaseContext.status),
        holderType: cleanTaskText(task.leaseContext.holderType),
        dispatchId: cleanTaskText(task.leaseContext.dispatchId),
        runId: cleanTaskText(task.leaseContext.runId),
        heartbeatAt: cleanTaskText(task.leaseContext.heartbeatAt),
        expiresAt: cleanTaskText(task.leaseContext.expiresAt)
      }
    : null;

  return {
    id: cleanTaskText(task.id),
    ix: "",
    lx: "",
    title: cleanTaskText(task.title),
    source: "task-ledger",
    status: cleanTaskText(task.status),
    assigneeId: cleanTaskText(task.assigneeId),
    owner: cleanTaskText(task.owner),
    projectScope: cleanTaskText(task.projectScope),
    leaseContext: lease,
    updatedAt: cleanTaskText(task.updatedAt || task.createdAt)
  };
}

function compareRoleTasks(left = {}, right = {}) {
  const leaseWeight = (task) => {
    const status = cleanTaskText(task.leaseContext?.status).toLowerCase();
    if (status === "active") return 2;
    if (status === "queued") return 1;
    return 0;
  };
  const leaseDelta = leaseWeight(right) - leaseWeight(left);
  if (leaseDelta !== 0) {
    return leaseDelta;
  }
  const updatedDelta = Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "");
  if (Number.isFinite(updatedDelta) && updatedDelta !== 0) {
    return updatedDelta;
  }
  return cleanTaskText(left.id).localeCompare(cleanTaskText(right.id));
}

function queryLiveTasksForRole(role, config = {}, runtime = {}) {
  if (!config || typeof config !== "object") {
    return [];
  }

  const listTasks = runtime.listTaskLedgerTasks || listTaskLedgerTasks;
  const decorateList = runtime.decorateTaskLeaseContextList || decorateTaskLeaseContextList;
  const pool = decorateList(listTasks({
    includeArchived: false,
    status: "all",
    priority: "all",
    limit: 60
  })).filter((task) => isOpenLedgerTask(task));

  return pool
    .map((task) => ({
      task,
      score: buildLiveTaskRoleScore(task, role, config)
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || compareRoleTasks(left.task, right.task))
    .slice(0, 6)
    .map((row) => formatLiveTaskForPacket(row.task));
}

function queryTasksForRole(role, config = {}, runtime = {}) {
  const liveTasks = queryLiveTasksForRole(role, config, runtime);
  if (liveTasks.length > 0) {
    return liveTasks;
  }
  return queryIndexedTasksForRole(role, config, runtime);
}

function buildTaskActivationResult(overrides = {}) {
  return {
    requested: false,
    ok: false,
    action: "skipped",
    reason: "",
    taskId: "",
    leaseId: "",
    status: "",
    ...overrides
  };
}

function activateOwnedTaskForRole(role, activeTasks = [], options = {}, runtime = {}) {
  const normalizedRole = cleanTaskText(role).toLowerCase();
  const candidate = (Array.isArray(activeTasks) ? activeTasks : []).find((task) =>
    task?.source === "task-ledger"
    && (
      cleanTaskText(task.assigneeId).toLowerCase() === normalizedRole
      || cleanTaskText(task.owner).toLowerCase() === normalizedRole
    )
  );

  if (!candidate) {
    return buildTaskActivationResult({
      requested: true,
      action: "none",
      reason: "no_owned_live_task"
    });
  }

  const leaseStatus = cleanTaskText(candidate.leaseContext?.status).toLowerCase();
  if (candidate.leaseContext?.leaseId && ["queued", "active"].includes(leaseStatus)) {
    return buildTaskActivationResult({
      requested: true,
      ok: true,
      action: "reused",
      taskId: candidate.id,
      leaseId: cleanTaskText(candidate.leaseContext.leaseId),
      status: leaseStatus || "active"
    });
  }

  const createLease = runtime.createTaskLease || createTaskLease;
  const getTask = runtime.getTaskLedgerTask || getTaskLedgerTask;
  const decorateTask = runtime.decorateTaskLeaseContext || decorateTaskLeaseContext;

  try {
    const spawnPid = cleanTaskText(options.spawnPid);
    const created = createLease({
      taskId: candidate.id,
      holderId: normalizedRole,
      holderType: "lane",
      status: "active",
      runId: spawnPid,
      dispatchId: spawnPid ? `spawn:${normalizedRole}:${spawnPid}` : `spawn:${normalizedRole}`,
      actor: cleanTaskText(options.actor || "spawn-context-builder") || "spawn-context-builder",
      source: cleanTaskText(options.source || "spawn-context-builder") || "spawn-context-builder",
      note: cleanTaskText(options.note || `Activated owned task for ${normalizedRole} during spawn.`)
    });
    const refreshed = decorateTask(getTask(candidate.id) || {});
    return buildTaskActivationResult({
      requested: true,
      ok: true,
      action: "claimed",
      taskId: candidate.id,
      leaseId: cleanTaskText(created.lease?.leaseId),
      status: cleanTaskText(created.lease?.status),
      task: formatLiveTaskForPacket(refreshed)
    });
  } catch (error) {
    return buildTaskActivationResult({
      requested: true,
      action: "blocked",
      reason: cleanTaskText(error?.message || "task_activation_failed"),
      taskId: candidate.id
    });
  }
}

module.exports = {
  isOpenLedgerTask,
  buildTaskStatusFromText,
  queryIndexedTasksForRole,
  buildLiveTaskRoleScore,
  formatLiveTaskForPacket,
  compareRoleTasks,
  queryLiveTasksForRole,
  queryTasksForRole,
  buildTaskActivationResult,
  activateOwnedTaskForRole
};
