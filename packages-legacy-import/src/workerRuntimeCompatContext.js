const fs = require("node:fs");
const path = require("node:path");
const { stats: getJobQueueStats } = require("./jobQueue");
const { getWorkerRouterStatus } = require("./connectors/workerRouter");
const { getAbacusIntegrationStatus, getAbacusOperatingStrategy } = require("./connectors/abacusConnector");
const { getSymphonyIntegrationStatus, fetchSymphonyLiveState } = require("./connectors/symphonyConnector");
const { getRemoteNodesSummary } = require("./remoteNodeRegistry");
const { buildCivilizationWorldBundle: buildBaseCivilizationWorldBundle } = require("./workerRuntimeCivilizationBundle");
const { buildSwarmDeskExportPayload } = require("./swarmDeskExport");
const {
  clone,
  cleanText,
  sanitizeCleanupSnapshot,
  buildPublicSymphonyPayload,
  buildPublicAbacusStatus,
  buildPublicWorkPayload,
  sanitizeWorkerRouter
} = require("./workerRuntimePublicShapes");

const WORKER_RUNTIME_FAST_ROUTE_TTL_MS = 4000;
const WORKER_RUNTIME_PANEL_TTL_MS = 6000;
const WORKER_RUNTIME_ABACUS_ROUTE_TTL_MS = 9000;
const SUPER_CODER_TTL_MS = 12000;
const CLEANUP_STALE_MS = 6 * 60 * 60 * 1000;

function readRuntimeSettings(repoRoot) {
  try {
    const filePath = path.join(repoRoot, "data", "runtime-settings.json");
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(String(fs.readFileSync(filePath, "utf8") || ""));
  } catch {
    return {};
  }
}

function buildCleanupSnapshot(repoRoot) {
  const root = path.join(repoRoot, "logs");
  if (!fs.existsSync(root)) {
    return { root, staleCount: 0, zeroLengthCount: 0, pidFiles: [] };
  }
  const now = Date.now();
  const pidFiles = fs.readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".pid"))
    .map((name) => {
      const filePath = path.join(root, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        path: filePath,
        size: Number(stat.size || 0),
        updatedAt: stat.mtime.toISOString(),
        stale: now - Number(stat.mtimeMs || 0) > CLEANUP_STALE_MS
      };
    });
  return {
    root,
    staleCount: pidFiles.filter((item) => item.stale).length,
    zeroLengthCount: pidFiles.filter((item) => item.size < 1).length,
    pidFiles
  };
}

function buildBrainLeader(settings = {}) {
  return {
    selectedProvider: cleanText(settings.brainPrimaryProvider || settings.selectedProvider || process.env.ASOLARIA_BRAIN_PROVIDER || "anthropic"),
    selectedModel: cleanText(settings.brainPrimaryModel || settings.selectedModel || settings.model || process.env.ASOLARIA_BRAIN_MODEL || ""),
    status: cleanText(settings.brainStatus || "standby"),
    loopStatus: cleanText(settings.loopStatus || "compat_proxy"),
    lastRunAt: cleanText(settings.lastBrainRunAt || ""),
    lastError: cleanText(settings.lastBrainError || "")
  };
}

function buildSettings(runtimeState = {}, runtimeSettings = {}) {
  const stateSettings = runtimeState.settings && typeof runtimeState.settings === "object" ? runtimeState.settings : {};
  return {
    approvalMode: cleanText(stateSettings.approvalMode || "smart"),
    voiceOutputMode: cleanText(stateSettings.voiceOutputMode || "text"),
    costMode: cleanText(runtimeSettings.costMode || "low"),
    bridgeAutoSyncEnabled: Boolean(runtimeSettings.bridgeAutoSyncEnabled),
    agentColonyWatchdogEnabled: runtimeSettings.agentColonyWatchdogEnabled === undefined ? true : Boolean(runtimeSettings.agentColonyWatchdogEnabled)
  };
}

function buildTrustedEntities(workerRouter = {}, remoteNodesSummary = {}) {
  const workers = Array.isArray(workerRouter.workers) ? workerRouter.workers : [];
  const workerEntities = workers.map((worker) => ({
    id: cleanText(worker.id || worker.title || "worker"),
    label: cleanText(worker.title || worker.id || "worker"),
    kind: "surface",
    connected: Boolean(worker.available || worker.dispatchable || worker.ready),
    provider: cleanText(worker.id || ""),
    trusted: true,
    owned: !["abacus", "claude_max"].includes(cleanText(worker.id || ""))
  }));
  const remoteEntities = Array.isArray(remoteNodesSummary.nodes)
    ? remoteNodesSummary.nodes.map((node) => ({
      id: cleanText(node.nodeId || "remote-node"),
      label: cleanText(node.nodeId || "remote node"),
      kind: "remote_mcp",
      connected: cleanText(node.status).toLowerCase() === "online",
      provider: "remote-node",
      trusted: true,
      owned: false
    }))
    : [];
  const entities = workerEntities.concat(remoteEntities);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    entities,
    summary: {
      total: entities.length,
      connected: entities.filter((item) => item.connected).length
    }
  };
}

function buildAgentColony(workerRouter = {}, phoneRuntime = {}, remoteNodesSummary = {}) {
  const workers = Array.isArray(workerRouter.workers) ? workerRouter.workers : [];
  const activeLeases = Array.isArray(workerRouter.leaseLedger?.activeLeases) ? workerRouter.leaseLedger.activeLeases : [];
  const queuedLeases = Array.isArray(workerRouter.leaseLedger?.queuedLeases) ? workerRouter.leaseLedger.queuedLeases : [];
  const activeByWorker = new Set(activeLeases.map((lease) => cleanText(lease.holderId)));
  const queuedByWorker = new Set(queuedLeases.map((lease) => cleanText(lease.holderId)));
  const agents = workers.map((worker) => {
    const id = cleanText(worker.id || "worker");
    const ready = Boolean(worker.available || worker.dispatchable || worker.ready);
    const state = !ready ? "offline" : activeByWorker.has(id) ? "active" : queuedByWorker.has(id) ? "idle" : "idle";
    return {
      id,
      name: cleanText(worker.title || id),
      role: cleanText((Array.isArray(worker.strengths) ? worker.strengths[0] : "") || "worker lane"),
      plane: "lane",
      running: ready,
      state,
      pid: 0,
      lastSeenSeconds: 0,
      icon: cleanText((worker.title || id).slice(0, 2)).toUpperCase()
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    room: "antigravity",
    counts: {
      total: agents.length,
      online: agents.filter((agent) => agent.running).length,
      active: agents.filter((agent) => agent.state === "active").length,
      adminTotal: 0,
      adminActive: 0
    },
    relay: { running: Boolean(agents.length) },
    tunnel: { running: Boolean(phoneRuntime.phoneTunnelMonitor?.running) },
    adminTerminals: { total: 0, active: 0 },
    federation: clone(remoteNodesSummary),
    agents
  };
}

function buildMistakes(workerRouter = {}) {
  const issues = Array.isArray(workerRouter.knownIssues) ? workerRouter.knownIssues : [];
  return issues.slice(0, 6);
}

function buildPublicAbacusCompatStatus() {
  const status = clone(getAbacusIntegrationStatus());
  const strategy = typeof getAbacusOperatingStrategy === "function" ? clone(getAbacusOperatingStrategy()) : {};
  const knownIssues = Array.from(new Set(
    []
      .concat(Array.isArray(status?.knownIssues) ? status.knownIssues : [])
      .concat(Array.isArray(strategy?.knownIssues) ? strategy.knownIssues : [])
      .map((value) => cleanText(value))
      .filter(Boolean)
  ));
  return buildPublicAbacusStatus({
    ...(status && typeof status === "object" ? status : {}),
    knownIssues
  });
}

function buildSuperCoderSnapshot(fullPayload = {}, worldBundle = {}) {
  const systems = [
    { label: "Local Codex", icon: "LC", status: fullPayload.workerRouter?.integrationSummary?.localCodexAvailable ? "online" : "offline", detail: "Primary local coding lane." },
    { label: "Claude Max", icon: "CM", status: fullPayload.workerRouter?.integrationSummary?.claudeMaxReady ? "online" : "offline", detail: "Review and advisory lane." },
    { label: "Symphony", icon: "SY", status: fullPayload.symphony?.status?.process?.running ? "online" : fullPayload.symphony?.status?.configured ? "warning" : "offline", detail: cleanText(fullPayload.symphony?.status?.workflowPath || "Workflow lane not configured.") },
    { label: "Abacus", icon: "AB", status: fullPayload.abacus?.browserReady || fullPayload.abacus?.desktop?.installed ? "online" : "warning", detail: cleanText(fullPayload.abacus?.accountEmail || "External worker surface.") }
  ];
  const blockers = [];
  const warnings = [];
  if (!fullPayload.workerRouter?.integrationSummary?.localCodexAvailable) blockers.push("Local Codex is not available.");
  if (!fullPayload.workerRouter?.integrationSummary?.claudeMaxReady) warnings.push("Claude Max review lane is not ready.");
  if (!fullPayload.symphony?.status?.configured) warnings.push("Symphony is not configured.");
  if (!(fullPayload.abacus?.browserReady || fullPayload.abacus?.desktop?.installed)) warnings.push("Abacus has no ready surface.");
  const readiness = blockers.length ? "blocked" : warnings.length ? "warning" : "ready";
  const worldEntities = Array.isArray(worldBundle.worldState?.entities) ? worldBundle.worldState.entities : [];
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    readiness,
    systems,
    blockers,
    warnings,
    summary: {
      status: readiness,
      totalSystems: systems.length,
      connectedSystems: systems.filter((item) => item.status === "online").length,
      colonyActive: Number(fullPayload.agentColony?.counts?.active || 0),
      colonyOnline: Number(fullPayload.agentColony?.counts?.online || 0),
      adminOnline: Number(fullPayload.agentColony?.adminTerminals?.active || 0),
      worldTowers: worldEntities.filter((entity) => cleanText(entity?.kind).toLowerCase() === "tower").length,
      worldRoutes: Number(worldBundle.worldState?.summary?.routes || 0)
    },
    links: {
      graphUrl: "/worker-runtime.html"
    }
  };
}

function createWorkerRuntimeCompatContext({ repoRoot, runtimeState, phoneBridgeKeeperStatus, phoneTunnelMonitorStatus }) {
  const workerRuntimeRouteCaches = { fast: {}, colony: {}, symphony: {}, superCoder: {}, abacus: {}, work: {} };
  const workerRuntimeSnapshotCache = {};

  async function resolveCachedRuntimePayload(cache, builder, options = {}) {
    const ttlMs = Math.max(1000, Number(options.ttlMs || WORKER_RUNTIME_PANEL_TTL_MS) || WORKER_RUNTIME_PANEL_TTL_MS);
    const now = Date.now();
    if (cache.payload && Number(cache.expiresAt || 0) > now) {
      return clone(cache.payload);
    }
    if (cache.refreshPromise) {
      return cache.payload ? clone(cache.payload) : cache.refreshPromise;
    }
    cache.refreshPromise = Promise.resolve()
      .then(builder)
      .then((payload) => {
        cache.payload = clone(payload);
        cache.expiresAt = Date.now() + ttlMs;
        cache.lastError = "";
        return clone(payload);
      })
      .catch((error) => {
        cache.lastError = cleanText(error?.message || error || "worker_runtime_refresh_failed");
        if (cache.payload) {
          return clone(cache.payload);
        }
        throw error;
      })
      .finally(() => {
        cache.refreshPromise = null;
      });
    return cache.refreshPromise;
  }

  async function buildFullPayload() {
    const runtimeSettings = readRuntimeSettings(repoRoot);
    const queue = clone(getJobQueueStats());
    const work = buildPublicWorkPayload({
      cachedPayload: workerRuntimeSnapshotCache.payload,
      includeDispatches: true,
      includeTasks: true
    });
    const workerRouter = clone(work.workerRouter);
    const symphonyStatus = getSymphonyIntegrationStatus();
    const symphonyLiveState = await fetchSymphonyLiveState({ status: symphonyStatus, timeoutMs: 2500 });
    const phoneRuntime = {
      phoneBridgeKeeper: phoneBridgeKeeperStatus(),
      phoneTunnelMonitor: phoneTunnelMonitorStatus()
    };
    const remoteNodesSummary = getRemoteNodesSummary();
    const agentColony = buildAgentColony(workerRouter, phoneRuntime, remoteNodesSummary);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      queue,
      brainLeader: buildBrainLeader(runtimeSettings),
      settings: buildSettings(runtimeState, runtimeSettings),
      phoneRuntime,
      cleanup: sanitizeCleanupSnapshot(buildCleanupSnapshot(repoRoot)),
      mistakes: buildMistakes(workerRouter),
      agentColony,
      symphony: buildPublicSymphonyPayload(symphonyStatus, symphonyLiveState),
      abacus: buildPublicAbacusCompatStatus(),
      taskLedger: clone(work.taskLedger),
      workerRouter
    };
  }

  function buildFastPayload() {
    const runtimeSettings = readRuntimeSettings(repoRoot);
    const queue = clone(getJobQueueStats());
    const work = buildPublicWorkPayload({
      cachedPayload: workerRuntimeSnapshotCache.payload,
      includeDispatches: false,
      includeTasks: false
    });
    const phoneRuntime = {
      phoneBridgeKeeper: phoneBridgeKeeperStatus(),
      phoneTunnelMonitor: phoneTunnelMonitorStatus()
    };
    const remoteNodesSummary = getRemoteNodesSummary();
    const workerRouter = clone(work.workerRouter);
    const agentColony = buildAgentColony(workerRouter, phoneRuntime, remoteNodesSummary);
    const cachedLiveState = Number(workerRuntimeSnapshotCache.expiresAt || 0) > Date.now()
      ? clone(workerRuntimeSnapshotCache.payload?.symphony?.liveState)
      : null;
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      queue,
      brainLeader: buildBrainLeader(runtimeSettings),
      settings: buildSettings(runtimeState, runtimeSettings),
      phoneRuntime,
      cleanup: sanitizeCleanupSnapshot(buildCleanupSnapshot(repoRoot)),
      mistakes: buildMistakes(workerRouter),
      agentColony,
      symphony: buildPublicSymphonyPayload(
        getSymphonyIntegrationStatus(),
        cachedLiveState && cachedLiveState.summary
          ? cachedLiveState
          : { ok: false, reason: "fast_snapshot_pending", summary: { running: 0, retrying: 0, totalTokens: 0, issueIdentifiers: [] }, state: { running: [], retrying: [] } }
      ),
      abacus: buildPublicAbacusCompatStatus(),
      taskLedger: clone(work.taskLedger),
      workerRouter: sanitizeWorkerRouter(workerRouter)
    };
  }

  return {
    WORKER_RUNTIME_FAST_ROUTE_TTL_MS,
    WORKER_RUNTIME_PANEL_TTL_MS,
    WORKER_RUNTIME_ABACUS_ROUTE_TTL_MS,
    SUPER_CODER_TTL_MS,
    emitWorkerRuntimeEvent: () => {},
    workerRuntimeRouteCaches,
    workerRuntimeSnapshotCache,
    resolveCachedRuntimePayload,
    withWorkerRuntimeCacheMeta: (payload, meta = {}) => ({ ...payload, cache: { ...(payload.cache || {}), ...meta } }),
    buildWorkerRuntimeFastPayload: () => buildFastPayload(),
    getCachedWorkerRuntimePayload: () => resolveCachedRuntimePayload(workerRuntimeSnapshotCache, buildFullPayload, { ttlMs: WORKER_RUNTIME_PANEL_TTL_MS }),
    buildWorkerRuntimeColonyPayload: async () => ({ ok: true, generatedAt: new Date().toISOString(), agentColony: (await buildFullPayload()).agentColony }),
    buildWorkerRuntimeSymphonyPayload: async () => ({ ok: true, generatedAt: new Date().toISOString(), symphony: (await buildFullPayload()).symphony }),
    buildWorkerRuntimeAbacusPayload: async () => ({ ok: true, generatedAt: new Date().toISOString(), abacus: buildPublicAbacusCompatStatus() }),
    buildWorkerRuntimeWorkPayload: () => buildPublicWorkPayload({
      cachedPayload: workerRuntimeSnapshotCache.payload,
      includeDispatches: true,
      includeTasks: true
    }),
    getCachedTrustedEcosystemEntitiesPayload: () => {
      const workerRouter = getWorkerRouterStatus();
      return buildTrustedEntities(workerRouter, getRemoteNodesSummary());
    },
    buildCivilizationWorldBundle: (options = {}) => {
      const workerRouter = getWorkerRouterStatus();
      const phoneRuntime = {
        phoneBridgeKeeper: phoneBridgeKeeperStatus(),
        phoneTunnelMonitor: phoneTunnelMonitorStatus()
      };
      const remoteNodesSummary = getRemoteNodesSummary();
      const trustedEntities = buildTrustedEntities(workerRouter, remoteNodesSummary);
      const agentColony = buildAgentColony(workerRouter, phoneRuntime, remoteNodesSummary);
      const symphonyStatus = getSymphonyIntegrationStatus();
      return buildBaseCivilizationWorldBundle({
        ...options,
        readers: {
          trustedEntities: () => trustedEntities,
          agentColony: () => agentColony,
          remoteNodes: () => clone(remoteNodesSummary.nodes || [])
        },
        worldInput: {
          ...(options.worldInput && typeof options.worldInput === "object" ? options.worldInput : {}),
          symphonyStatus,
          agentColony
        }
      });
    },
    buildSwarmDeskExportPayload,
    buildSuperCoderCockpitPayload: async () => {
      const fullPayload = await buildFullPayload();
      const worldBundle = buildBaseCivilizationWorldBundle({
        includeTrusted: true,
        includeAdminCockpit: false,
        taskLimit: 12,
        eventLimit: 12,
        worldInput: {
          symphonyStatus: fullPayload.symphony?.status,
          agentColony: fullPayload.agentColony
        },
        readers: {
          trustedEntities: () => buildTrustedEntities(fullPayload.workerRouter, getRemoteNodesSummary()),
          agentColony: () => fullPayload.agentColony,
          remoteNodes: () => clone(getRemoteNodesSummary().nodes || [])
        }
      });
      return buildSuperCoderSnapshot(fullPayload, worldBundle);
    }
  };
}

module.exports = {
  createWorkerRuntimeCompatContext
};
