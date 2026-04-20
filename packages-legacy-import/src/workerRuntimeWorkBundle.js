const { getWorkerRouterStatus, listWorkerDispatches } = require("./connectors/workerRouter");
const { getTaskLedgerSummary, listTaskLedgerTasks } = require("./taskLedgerStore");
const { decorateTaskLeaseContextList } = require("./taskLeaseView");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isOpenTask(task = {}) {
  const status = normalizeText(task.status);
  if (!status) return false;
  if (Boolean(task.archived)) return false;
  return !["done", "canceled", "archived"].includes(status);
}

function buildOpenTaskProjection(options = {}) {
  const taskLimit = clampInt(options.taskLimit, 80, 1, 1000);
  const poolLimit = clampInt(options.poolLimit, Math.max(200, taskLimit * 4), taskLimit, 1000);
  const tasks = listTaskLedgerTasks({
    includeArchived: false,
    status: "all",
    priority: "all",
    query: options.taskQuery || "",
    projectScope: options.projectScope || "",
    projectMarker: options.projectMarker || "",
    limit: poolLimit
  })
    .filter((task) => isOpenTask(task))
    .slice(0, taskLimit);

  return decorateTaskLeaseContextList(tasks);
}

function buildWorkerRuntimeWorkBundle(options = {}) {
  const taskLimit = clampInt(options.taskLimit, 80, 1, 1000);
  const dispatchLimit = clampInt(options.dispatchLimit, 20, 1, 100);
  const workerRouter = clone(getWorkerRouterStatus());
  const openTasks = buildOpenTaskProjection({
    taskLimit,
    poolLimit: options.poolLimit,
    taskQuery: options.taskQuery,
    projectScope: options.projectScope,
    projectMarker: options.projectMarker
  });

  return {
    ok: true,
    generatedAt: workerRouter.generatedAt || new Date().toISOString(),
    workerRouter: {
      ...workerRouter,
      dispatches: clone(listWorkerDispatches(dispatchLimit))
    },
    taskLedger: {
      summary: clone(getTaskLedgerSummary()),
      openTasks
    }
  };
}

module.exports = {
  buildWorkerRuntimeWorkBundle,
  buildOpenTaskProjection,
  isOpenTask
};
