const fs = require("node:fs");
const path = require("node:path");
const { getWorkerRouterStatus } = require("./connectors/workerRouter");
const { getTaskLedgerSummary, taskLedgerPath } = require("./taskLedgerStore");
const { taskLeaseLedgerPath } = require("./taskLeaseLedgerStore");
const { buildWorkerRuntimeWorkBundle } = require("./workerRuntimeWorkBundle");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeIso(value) {
  const text = cleanText(value);
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function safeCount(value) {
  return Number(value || 0) || 0;
}

function safeEmail(value) {
  const text = cleanText(value);
  if (!text || !text.includes("@")) return text;
  const [local, domain] = text.split("@");
  if (!local || !domain) return text;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

function safeBasePath(value, fallback = "") {
  const text = cleanText(value);
  if (!text) return fallback;
  const normalized = text.replace(/[\\/]+$/, "");
  const base = path.basename(normalized);
  return base || fallback || normalized;
}

function sanitizeCleanupSnapshot(snapshot = {}) {
  return {
    root: safeBasePath(snapshot.root, "logs"),
    staleCount: safeCount(snapshot.staleCount),
    zeroLengthCount: safeCount(snapshot.zeroLengthCount),
    pidFiles: asArray(snapshot.pidFiles).map((item) => ({
      name: safeBasePath(item?.name || item?.path, "pid"),
      size: safeCount(item?.size),
      updatedAt: safeIso(item?.updatedAt),
      stale: Boolean(item?.stale)
    }))
  };
}

function sanitizeSymphonyStatus(status = {}) {
  return {
    configured: Boolean(status.configured),
    port: safeCount(status.port),
    linearProjectSlug: cleanText(status.linearProjectSlug),
    workflowPath: safeBasePath(status.workflowPath, ""),
    process: {
      running: Boolean(status.process?.running)
    }
  };
}

function sanitizeSymphonySession(item = {}) {
  return {
    issue_identifier: cleanText(item.issue_identifier || item.issue_id),
    issue_id: cleanText(item.issue_id || item.issue_identifier),
    state: cleanText(item.state),
    last_message: cleanText(item.last_message || item.last_event),
    last_event: cleanText(item.last_event),
    last_event_at: safeIso(item.last_event_at),
    started_at: safeIso(item.started_at),
    turn_count: safeCount(item.turn_count),
    tokens: {
      total_tokens: safeCount(item.tokens?.total_tokens)
    }
  };
}

function sanitizeSymphonyLiveState(liveState = {}) {
  return {
    ok: Boolean(liveState.ok),
    port: safeCount(liveState.port),
    fetchedAt: safeIso(liveState.fetchedAt),
    reason: cleanText(liveState.reason),
    error: cleanText(liveState.error),
    summary: {
      running: safeCount(liveState.summary?.running),
      retrying: safeCount(liveState.summary?.retrying),
      totalTokens: safeCount(liveState.summary?.totalTokens || liveState.summary?.total_tokens),
      issueIdentifiers: asArray(liveState.summary?.issueIdentifiers).map((value) => cleanText(value)).filter(Boolean)
    },
    state: {
      running: asArray(liveState.state?.running).map(sanitizeSymphonySession),
      retrying: asArray(liveState.state?.retrying).map(sanitizeSymphonySession)
    }
  };
}

function buildPublicSymphonyPayload(status = {}, liveState = {}) {
  return {
    status: sanitizeSymphonyStatus(status),
    liveState: sanitizeSymphonyLiveState(liveState)
  };
}

function buildPublicAbacusStatus(status = {}) {
  const capabilities = status.capabilities || {};
  const surfaces = status.surfaces || {};
  const desktopRunning = asArray(surfaces.desktop?.running);
  const desktopListening = asArray(surfaces.desktop?.listening);
  const listenerRunning = asArray(surfaces.listener?.running);
  const listenerListening = asArray(surfaces.listener?.listening);
  return {
    browserReady: Boolean(status.browserReady ?? capabilities.browser?.ready),
    browserMode: cleanText(status.browserMode),
    browserAuthenticatedLikely: Boolean(status.browserAuthenticatedLikely ?? capabilities.browser?.authenticatedLikely),
    accountEmail: safeEmail(status.accountEmail),
    workerLane: {
      tier: cleanText(status.workerLane?.tier || capabilities.workerLane?.tier || "unknown") || "unknown",
      totalPackets: safeCount(status.workerLane?.totalPackets || status.workerLane?.packetCount || capabilities.workerLane?.packetCount)
    },
    desktop: {
      installed: Boolean(status.desktop?.installed ?? surfaces.desktop?.installed ?? capabilities.desktop?.installed),
      runningCount: safeCount(status.desktop?.runningCount || desktopRunning.length),
      listeningCount: safeCount(status.desktop?.listeningCount || desktopListening.length),
      cliExists: Boolean(status.desktop?.cliExists ?? surfaces.desktop?.cliExists),
      mainWindowTitles: asArray(status.desktop?.mainWindowTitles).map((value) => cleanText(value)).filter(Boolean).slice(0, 3)
    },
    listener: {
      installed: Boolean(status.listener?.installed ?? surfaces.listener?.installed ?? capabilities.desktop?.listenerInstalled),
      runningCount: safeCount(status.listener?.runningCount || listenerRunning.length),
      listeningCount: safeCount(status.listener?.listeningCount || listenerListening.length)
    },
    cli: {
      mcpReady: Boolean(status.cli?.mcpReady ?? capabilities.cli?.mcpReady),
      printReady: Boolean(status.cli?.printReady ?? capabilities.cli?.printReady),
      interactiveFallbackDetected: Boolean(status.cli?.interactiveFallbackDetected ?? capabilities.cli?.interactiveFallbackDetected),
      brokenResourcePathsDetected: Boolean(status.cli?.brokenResourcePathsDetected ?? capabilities.cli?.brokenResourcePathsDetected)
    },
    knownIssues: asArray(status.knownIssues).map((value) => cleanText(value)).filter(Boolean)
  };
}

function sanitizeWorker(worker = {}) {
  return {
    id: cleanText(worker.id),
    title: cleanText(worker.title),
    ready: Boolean(worker.ready),
    available: Boolean(worker.available),
    dispatchable: Boolean(worker.dispatchable),
    strengths: asArray(worker.strengths).map((value) => cleanText(value)).filter(Boolean)
  };
}

function sanitizeLease(lease = {}) {
  return {
    leaseId: cleanText(lease.leaseId),
    holderId: cleanText(lease.holderId),
    status: cleanText(lease.status),
    taskId: cleanText(lease.taskId)
  };
}

function sanitizeDispatch(dispatch = {}) {
  const issueIdentifier = cleanText(
    dispatch.result?.issue?.identifier || dispatch.result?.issueIdentifier || dispatch.issueIdentifier
  );
  return {
    id: cleanText(dispatch.id),
    title: cleanText(dispatch.title),
    workerId: cleanText(dispatch.workerId),
    dispatchMode: cleanText(dispatch.result?.dispatchMode || dispatch.dispatchMode),
    taskType: cleanText(dispatch.recommendation?.input?.taskType || dispatch.taskType),
    resultSummary: cleanText(dispatch.result?.resultSummary || dispatch.resultSummary),
    issueIdentifier,
    leaseId: cleanText(dispatch.leaseId),
    leaseStatus: cleanText(dispatch.leaseStatus || dispatch.lease?.status),
    error: cleanText(dispatch.error)
  };
}

function sanitizeTask(task = {}) {
  return {
    id: cleanText(task.id),
    title: cleanText(task.title),
    description: cleanText(task.description),
    status: cleanText(task.status),
    owner: cleanText(task.owner),
    assigneeId: cleanText(task.assigneeId),
    projectScope: cleanText(task.projectScope),
    lastLeaseId: cleanText(task.lastLeaseId),
    leaseContext: task.leaseContext && typeof task.leaseContext === "object"
      ? {
        leaseId: cleanText(task.leaseContext.leaseId),
        holderId: cleanText(task.leaseContext.holderId),
        status: cleanText(task.leaseContext.status)
      }
      : null
  };
}

function sanitizeTaskLedgerSummary(summary = {}) {
  return {
    totalTasks: safeCount(summary.totalTasks),
    openTasks: safeCount(summary.openTasks),
    activeTasks: safeCount(summary.activeTasks),
    archivedTasks: safeCount(summary.archivedTasks),
    eventsCount: safeCount(summary.eventsCount),
    latestTaskUpdatedAt: safeIso(summary.latestTaskUpdatedAt),
    latestEventAt: safeIso(summary.latestEventAt)
  };
}

function sanitizeWorkerRouter(status = {}, options = {}) {
  const includeDispatches = Boolean(options.includeDispatches);
  return {
    generatedAt: safeIso(status.generatedAt) || new Date().toISOString(),
    defaultWorker: cleanText(status.defaultWorker),
    workers: asArray(status.workers).map(sanitizeWorker),
    leaseLedger: {
      summary: {
        totalLeases: safeCount(status.leaseLedger?.summary?.totalLeases),
        activeLeases: safeCount(status.leaseLedger?.summary?.activeLeases),
        eventsCount: safeCount(status.leaseLedger?.summary?.eventsCount)
      },
      activeLeases: asArray(status.leaseLedger?.activeLeases).map(sanitizeLease),
      queuedLeases: asArray(status.leaseLedger?.queuedLeases).map(sanitizeLease)
    },
    integrationSummary: clone(status.integrationSummary || {}),
    coordinationSurfaces: asArray(status.coordinationSurfaces).map((item) => ({
      id: cleanText(item.id),
      role: cleanText(item.role),
      ready: Boolean(item.ready),
      writeCapable: Boolean(item.writeCapable)
    })),
    knownIssues: asArray(status.knownIssues).map((value) => cleanText(value)).filter(Boolean),
    dispatches: includeDispatches ? asArray(status.dispatches).map(sanitizeDispatch) : []
  };
}

function buildEmptyWorkPayload() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    workerRouter: sanitizeWorkerRouter({}, { includeDispatches: true }),
    taskLedger: {
      summary: sanitizeTaskLedgerSummary({}),
      openTasks: []
    }
  };
}

function hasPublicLedgerFiles() {
  return fs.existsSync(taskLedgerPath) && fs.existsSync(taskLeaseLedgerPath);
}

function buildPublicWorkPayload(options = {}) {
  if (!hasPublicLedgerFiles()) {
    const cached = options.cachedPayload && typeof options.cachedPayload === "object" ? options.cachedPayload : null;
    if (cached?.workerRouter || cached?.taskLedger) {
      return {
        ok: true,
        generatedAt: safeIso(cached.generatedAt) || new Date().toISOString(),
        workerRouter: sanitizeWorkerRouter(cached.workerRouter || {}, { includeDispatches: Boolean(options.includeDispatches) }),
        taskLedger: {
          summary: sanitizeTaskLedgerSummary(cached.taskLedger?.summary || {}),
          openTasks: Boolean(options.includeTasks) ? asArray(cached.taskLedger?.openTasks).map(sanitizeTask) : []
        }
      };
    }
    return buildEmptyWorkPayload();
  }
  const bundle = options.includeTasks || options.includeDispatches
    ? buildWorkerRuntimeWorkBundle()
    : {
      ok: true,
      generatedAt: new Date().toISOString(),
      workerRouter: getWorkerRouterStatus(),
      taskLedger: { summary: getTaskLedgerSummary(), openTasks: [] }
    };
  return {
    ok: true,
    generatedAt: safeIso(bundle.generatedAt) || new Date().toISOString(),
    workerRouter: sanitizeWorkerRouter(bundle.workerRouter || {}, { includeDispatches: Boolean(options.includeDispatches) }),
    taskLedger: {
      summary: sanitizeTaskLedgerSummary(bundle.taskLedger?.summary || {}),
      openTasks: Boolean(options.includeTasks) ? asArray(bundle.taskLedger?.openTasks).map(sanitizeTask) : []
    }
  };
}

module.exports = {
  clone,
  cleanText,
  sanitizeCleanupSnapshot,
  buildPublicSymphonyPayload,
  buildPublicAbacusStatus,
  buildPublicWorkPayload,
  sanitizeWorkerRouter
};
