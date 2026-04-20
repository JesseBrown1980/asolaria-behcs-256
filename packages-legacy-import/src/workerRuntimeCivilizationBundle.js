const { buildCivilizationWorldState } = require("./civilizationWorld");
const { buildGraphRuntimeSnapshot } = require("./graphRuntimeQuery");
const { getTaskLedgerState } = require("./taskLedgerStore");
const { getTaskLeaseLedgerState } = require("./taskLeaseLedgerStore");
const { decorateTaskLeaseContextList } = require("./taskLeaseView");
const { normalizeColonyCapabilities } = require("./colonyCapabilitySchema");

const DEFAULT_OPTIONS = {
  includeTrusted: false,
  includeAdminCockpit: true,
  taskLimit: 24,
  eventLimit: 30,
  windowMinutes: 240,
  maxNodes: 72,
  maxEdges: 120,
  includeLowRisk: true
};

function cloneValue(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeOptions(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...DEFAULT_OPTIONS,
    ...source,
    includeTrusted: Boolean(source.includeTrusted),
    includeAdminCockpit: source.includeAdminCockpit === undefined ? DEFAULT_OPTIONS.includeAdminCockpit : Boolean(source.includeAdminCockpit),
    taskLimit: clampInt(source.taskLimit, DEFAULT_OPTIONS.taskLimit, 1, 1000),
    eventLimit: clampInt(source.eventLimit, DEFAULT_OPTIONS.eventLimit, 1, 2000),
    windowMinutes: clampInt(source.windowMinutes, DEFAULT_OPTIONS.windowMinutes, 1, 7 * 24 * 60),
    maxNodes: clampInt(source.maxNodes, DEFAULT_OPTIONS.maxNodes, 1, 500),
    maxEdges: clampInt(source.maxEdges, DEFAULT_OPTIONS.maxEdges, 1, 1000),
    includeLowRisk: source.includeLowRisk === undefined ? DEFAULT_OPTIONS.includeLowRisk : Boolean(source.includeLowRisk)
  };
}

function normalizeEntityCollection(value) {
  const source = value && typeof value === "object" ? value : {};
  const entities = Array.isArray(source.entities) ? source.entities.slice() : [];
  return {
    ...cloneValue(source),
    entities
  };
}

function normalizeAgentColony(value) {
  const source = value && typeof value === "object" ? value : {};
  const agents = Array.isArray(source.agents) ? source.agents.slice() : [];
  return {
    ...cloneValue(source),
    agents
  };
}

function normalizeAdminCockpit(value) {
  const source = value && typeof value === "object" ? value : {};
  const terminals = Array.isArray(source.terminals) ? source.terminals.slice() : [];
  return {
    ...cloneValue(source),
    terminals
  };
}

function normalizeRemoteNodes(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => {
      const source = row && typeof row === "object" ? cloneValue(row) : null;
      if (!source) return null;
      return {
        ...source,
        capabilities: normalizeColonyCapabilities(source.capabilities || source.colony || source, {
          nodeId: source.nodeId || source.id,
          defaultRole: "sub_colony"
        })
      };
    })
    .filter(Boolean);
}

function resolveReader(readers, key, fallback) {
  const fn = readers && typeof readers[key] === "function" ? readers[key] : null;
  if (!fn) return cloneValue(typeof fallback === "function" ? fallback() : fallback);
  return cloneValue(fn());
}

function buildBundleSummary(worldState, graphSnapshot, taskLedger, leaseLedger) {
  const graph = graphSnapshot?.graph || {};
  const taskSummary = taskLedger?.summary || {};
  const leaseSummary = leaseLedger?.summary || {};
  const worldSummary = worldState?.summary || {};

  return {
    graph: {
      nodes: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
      edges: Array.isArray(graph.edges) ? graph.edges.length : 0,
      events: Array.isArray(graphSnapshot?.records?.events) ? graphSnapshot.records.events.length : 0,
      manifests: Array.isArray(graphSnapshot?.records?.manifests) ? graphSnapshot.records.manifests.length : 0
    },
    taskLedger: {
      totalTasks: Number(taskSummary.totalTasks || 0),
      openTasks: Number(taskSummary.openTasks || 0),
      activeTasks: Number(taskSummary.activeTasks || 0),
      archivedTasks: Number(taskSummary.archivedTasks || 0),
      eventsCount: Number(taskSummary.eventsCount || 0)
    },
    leaseLedger: {
      totalLeases: Number(leaseSummary.totalLeases || 0),
      activeLeases: Number(leaseSummary.activeLeases || 0),
      eventsCount: Number(leaseSummary.eventsCount || 0)
    },
    world: {
      entities: Number(worldSummary.entities || 0),
      routes: Number(worldSummary.routes || 0),
      packets: Number(worldSummary.packets || 0),
      tasks: Number(worldSummary.tasks || 0),
      projectedTasks: Number(worldSummary.projectedTasks || 0),
      hotEntities: Number(worldSummary.hotEntities || 0)
    }
  };
}

function buildCivilizationWorldBundle(input = {}, readers = {}) {
  const options = normalizeOptions(input);
  const readerOverrides = {
    ...(input && typeof input.readers === "object" ? input.readers : {}),
    ...(readers && typeof readers === "object" ? readers : {})
  };
  const generatedAt = new Date().toISOString();

  const graphSnapshot = resolveReader(readerOverrides, "graphSnapshot", () =>
    buildGraphRuntimeSnapshot({
      windowMinutes: options.windowMinutes,
      includeLowRisk: options.includeLowRisk
    })
  );
  const taskLedger = resolveReader(readerOverrides, "taskLedger", () =>
    getTaskLedgerState({
      taskLimit: options.taskLimit,
      eventLimit: options.eventLimit,
      includeArchived: true,
      projectScope: options.projectScope,
      projectMarker: options.projectMarker
    })
  );
  const leaseLedger = resolveReader(readerOverrides, "leaseLedger", () =>
    getTaskLeaseLedgerState({
      leaseLimit: options.taskLimit,
      eventLimit: options.eventLimit
    })
  );
  const trustedEntities = options.includeTrusted
    ? normalizeEntityCollection(resolveReader(readerOverrides, "trustedEntities", { entities: [] }))
    : { entities: [] };
  const agentColony = normalizeAgentColony(resolveReader(readerOverrides, "agentColony", { agents: [] }));
  const adminCockpit = options.includeAdminCockpit
    ? normalizeAdminCockpit(resolveReader(readerOverrides, "adminCockpit", { terminals: [] }))
    : { terminals: [] };
  const remoteNodes = normalizeRemoteNodes(resolveReader(readerOverrides, "remoteNodes", []));
  const runtimeSnapshot = resolveReader(readerOverrides, "runtimeSnapshot", null);

  const decoratedTaskLedger = {
    ...cloneValue(taskLedger),
    tasks: decorateTaskLeaseContextList(Array.isArray(taskLedger?.tasks) ? taskLedger.tasks : [])
  };

  const worldState = buildCivilizationWorldState({
    ...(input.worldInput && typeof input.worldInput === "object" ? input.worldInput : {}),
    trustedEntities,
    agentColony,
    adminCockpit,
    remoteNodes,
    taskLedger: decoratedTaskLedger,
    graphSnapshot
  });

  return {
    ok: true,
    schemaVersion: "1.0",
    sourceContract: "civilization-world-bundle",
    generatedAt: worldState.generatedAt || generatedAt,
    options,
    graphSnapshot,
    taskLedger: decoratedTaskLedger,
    leaseLedger,
    trustedEntities,
    agentColony,
    adminCockpit,
    runtimeSnapshot,
    worldState,
    summary: buildBundleSummary(worldState, graphSnapshot, decoratedTaskLedger, leaseLedger)
  };
}

module.exports = {
  buildCivilizationWorldBundle,
  normalizeOptions,
  buildBundleSummary
};
