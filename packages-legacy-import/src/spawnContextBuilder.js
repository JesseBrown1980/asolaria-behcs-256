/**
 * Spawn Context Builder — Asolaria's Internal Agent Briefing System
 *
 * When Asolaria spawns a real agent inside the black hole, she needs to
 * decide WHAT that agent knows. This module is her PID controller:
 *
 *   P (Proportional) — current blockers, health state, active alarms
 *   I (Integral)     — accumulated IX knowledge, filtered by agent role
 *   D (Derivative)   — recent MQTT traffic, inbox delta, drift signals
 *
 * The output is a "spawn context packet" — a compressed briefing that
 * gives the agent exactly what it needs and nothing more.
 *
 * Merged: Gaia's priorityChains/flags + Liris's persistent PID registry,
 * permissions, structured JSON packet, mistake filtering, health-state.json,
 * drift-signals.json, and graph event emission.
 *
 * LX chain: LX-122 (identity handshake), LX-116 (awakening), LX-111 (swarm collapse)
 */

const fs = require("fs");
const path = require("path");
const { searchAgentIndex } = require("./agentIndexStore");
const {
  buildCompactRuntimeView,
  buildIxBriefingView
} = require("./spawnCompactRuntime");
const { resolveRolePointerAnchors } = require("./spawnPointerResolver");
const {
  queryTasksForRole,
  buildTaskActivationResult,
  activateOwnedTaskForRole
} = require("./spawnTaskRuntime");
const { getEntryId, reduceIxEntriesForRole } = require("./spawnIxReduction");
const { buildSpawnPacket } = require("./spawnPacketShape");
const { emitSpawnGraphEvent } = require("./spawnGraphEvent");
const { createSpawnIxCacheRuntime } = require("./spawnIxCache");
const { createSpawnPidRegistry } = require("./spawnPidRegistry");
const { createSpawnStateSignalsRuntime } = require("./spawnStateSignals");
const { normalizeSpawnText, getMistakesForRole } = require("./spawnMistakeResolver");
const { mergeExtraIxEntriesForSpawn } = require("./spawnExtraIx");
const { buildSpawnPackAssembly } = require("./spawnPackAssembly");
const { buildSpawnTextBriefing } = require("./spawnTextBriefing");
const { AGENT_ROLES, buildAgentIdentity } = require("./spawnRoleConfig");
const { instanceRoot, projectRoot, resolveDataPath } = require("./runtimePaths");

// Optional dependencies — not all stores exist on every node
let appendGraphEvent = null;
try {
  const graphStore = require("./graphRuntimeStore");
  appendGraphEvent = graphStore.appendGraphEvent;
} catch (_) { /* graphRuntimeStore not available on this node */ }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUNTIME_ROOT = path.join(instanceRoot, "runtime");
const ADMIN_TERMINALS = path.join(RUNTIME_ROOT, "admin-terminals");
const HEALTH_PATH = resolveDataPath("health-state.json");
const DRIFT_PATH = resolveDataPath("drift-signals.json");
const PID_REGISTRY_PATH = resolveDataPath("spawn-pid-registry.json");

const BOOT_CRITICAL_LX = ["LX-204", "LX-122", "LX-116", "LX-111", "LX-239", "LX-249"];
const DEFAULT_PACK_BRIEFING_LIMIT = 2;
const FINAL_IX_TYPE_CAPS = Object.freeze({
  identity: 1,
  mistake: 3,
  pattern: 4,
  plan: 3,
  policy: 2,
  project: 2,
  reference: 3,
  rule: 4,
  skill: 4,
  task: 3,
  tool: 4
});

// ── Index Cache Layer ──
// Caches the I (integral) component — local LX knowledge filtered by role.
// Invalidated on file change in data/agent-index/ or after TTL expiry.
const IX_CACHE_TTL_MS = 60000; // 1 minute
const ixRuntime = createSpawnIxCacheRuntime({
  projectRoot,
  cacheTtlMs: IX_CACHE_TTL_MS,
  defaultPackBriefingLimit: DEFAULT_PACK_BRIEFING_LIMIT,
  bootCriticalIds: BOOT_CRITICAL_LX,
  searchAgentIndex,
  resolveRolePointerAnchors,
  logPrefix: "[spawnContextBuilder]"
});
const pidRuntime = createSpawnPidRegistry({
  pidRegistryPath: PID_REGISTRY_PATH
});
const stateRuntime = createSpawnStateSignalsRuntime({
  runtimeRoot: RUNTIME_ROOT,
  adminTerminalsRoot: ADMIN_TERMINALS,
  healthPath: HEALTH_PATH,
  driftPath: DRIFT_PATH
});
const generateVirtualPid = pidRuntime.generateVirtualPid;
const readPidRegistry = pidRuntime.readPidRegistry;
const registerSpawnPid = pidRuntime.registerSpawnPid;
const despawnPid = pidRuntime.despawnPid;
const getActiveSpawns = pidRuntime.getActiveSpawns;
const readHealthState = stateRuntime.readHealthState;
const getCurrentBlockers = stateRuntime.getCurrentBlockers;

// ---------------------------------------------------------------------------
// I — Integral: Local LX Knowledge Filtered by Role
// ---------------------------------------------------------------------------

function getIxEntriesForRole(role) {
  return ixRuntime.getIxEntriesForRole(role, AGENT_ROLES);
}

const readDriftSignals = stateRuntime.readDriftSignals;

// ---------------------------------------------------------------------------
// DESPAWN PROTOCOL — Enforced via spawnTextBriefing.js (LX-249).
// Every spawned agent receives mandatory despawn instructions: index discoveries
// before finishing, then call despawnPid(role) to deregister.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Core: Build Spawn Context Packet
// ---------------------------------------------------------------------------

/**
 * Build a spawn context packet for a given agent role.
 * This is what Asolaria hands to a real agent when she spawns it.
 *
 * Returns a structured JSON packet (Liris format) with a .textBriefing
 * field containing the original Gaia text packet for backward compatibility.
 *
 * @param {string} role — helm, sentinel, vector, falcon, rook, forge, watchdog
 * @param {object} options
 * @param {boolean} options.includeBody — include IX snippets in text briefing
 * @param {string}  options.extraContext — extra text appended to briefing
 * @param {string}  options.mission — specific mission text for this spawn
 * @param {string[]} options.extraIxTypes — additional IX types to include
 * @param {boolean} options.widenMarkdown — explicitly widen lower-tier packets into fuller markdown mode
 * @param {boolean} options.allowImplicitWidening — allow lower-tier mission/blocker widening without an explicit widen request (default: true)
 * @param {boolean} options.registerPid — register in persistent PID registry (default: true)
 * @returns {object} Structured spawn context packet
 */
function buildSpawnContext(role, options = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const config = AGENT_ROLES[normalizedRole];
  if (!config) {
    return { ok: false, error: `Unknown role: ${role}. Valid: ${Object.keys(AGENT_ROLES).join(", ")}` };
  }
  const agentIdentity = buildAgentIdentity(normalizedRole, config);

  // Generate virtual PID
  const virtualPid = generateVirtualPid(normalizedRole);

  // Register in persistent PID registry (Liris feature)
  const shouldRegister = options.registerPid !== false;
  if (shouldRegister) {
    registerSpawnPid(normalizedRole, virtualPid, agentIdentity);
  }

  // P — Proportional: current state
  const health = readHealthState();
  const terminalBlockers = config.includeActiveBlockers ? getCurrentBlockers() : [];
  const allBlockers = [...(health.blockers || []), ...terminalBlockers.map(b => `[${b.source}] ${b.state}: ${b.detail}`)];

  // I — Integral: accumulated knowledge
  const ixEntries = getIxEntriesForRole(normalizedRole);

  // If extra IX types requested (Liris feature), add them
  mergeExtraIxEntriesForSpawn(ixEntries, config, options, {
    searchAgentIndex,
    getEntryId
  });

  // D — Derivative: drift signals
  const drift = readDriftSignals();
  let activeTasks = queryTasksForRole(normalizedRole, config);
  const taskActivation = options.activateOwnedTask
    ? activateOwnedTaskForRole(normalizedRole, activeTasks, {
        spawnPid: virtualPid,
        actor: "spawn-context-builder",
        source: "spawn-context-builder"
      })
    : buildTaskActivationResult();
  if (taskActivation.ok && taskActivation.task) {
    activeTasks = [
      taskActivation.task,
      ...activeTasks.filter((task) => normalizeSpawnText(task.id) !== normalizeSpawnText(taskActivation.task.id))
    ];
  } else if (taskActivation.ok && taskActivation.action === "reused") {
    activeTasks = queryTasksForRole(normalizedRole, config);
  }

  const {
    rulePackReport,
    patternPackReport,
    planPackReport,
    skillPackReport,
    toolPackReport,
    mistakePackReport,
    rulePackGate,
    patternPackGate,
    planPackGate,
    skillPackGate,
    toolPackGate,
    mistakePackGate,
    rulePacks,
    patternPacks,
    planPacks,
    skillPacks,
    toolPacks,
    mistakePacks,
    rulePointers,
    patternDigest,
    patternPointers,
    planPointers,
    mistakePointers,
    mistakes
  } = buildSpawnPackAssembly({
    normalizedRole,
    config,
    activeTasks,
    driftSignals: drift.signals,
    mission: options.mission,
    allBlockers,
    extraContext: options.extraContext,
    defaultPackBriefingLimit: DEFAULT_PACK_BRIEFING_LIMIT,
    finalTypeCaps: FINAL_IX_TYPE_CAPS
  }, {
    searchAgentIndex
  });
  const ixReduction = reduceIxEntriesForRole(ixEntries, normalizedRole, config, {
    bootCriticalIds: BOOT_CRITICAL_LX,
    finalTypeCaps: FINAL_IX_TYPE_CAPS
  });
  const visibleIxEntries = ixReduction.visible;
  const compactRuntime = buildCompactRuntimeView(normalizedRole, visibleIxEntries);
  const ixBriefing = buildIxBriefingView(agentIdentity, options, visibleIxEntries, compactRuntime, allBlockers);
  const briefingIxEntries = ixBriefing.visible;

  const textBriefing = buildSpawnTextBriefing({
    config,
    agentIdentity,
    normalizedRole,
    virtualPid,
    spawnedAt: new Date().toISOString(),
    visibleIxEntries,
    briefingIxEntries,
    options,
    compactRuntime,
    ixBriefing,
    rulePointers,
    allBlockers,
    driftSignals: drift.signals,
    mistakePointers,
    mistakes,
    patternPointers,
    planPointers,
    skillPacks,
    toolPacks,
    activeTasks,
    taskActivation
  });
  const packet = buildSpawnPacket({
    agentIdentity,
    virtualPid,
    normalizedRole,
    config,
    options,
    health,
    allBlockers,
    terminalBlockers,
    integral: {
      briefingIxEntries,
      ixReduction,
      ixBriefing,
      compactRuntime,
      rulePacks,
      rulePointers,
      patternPacks,
      patternDigest,
      patternPointers,
      planPacks,
      planPointers,
      mistakePacks,
      mistakePointers,
      skillPacks,
      toolPacks,
      rulePackGate,
      patternPackGate,
      planPackGate,
      skillPackGate,
      mistakePackGate,
      toolPackGate
    },
    drift,
    mistakes,
    activeTasks,
    taskActivation,
    textBriefing
  });

  emitSpawnGraphEvent({
    appendGraphEvent,
    agentIdentity,
    virtualPid,
    normalizedRole,
    briefingIxEntries,
    visibleIxEntries,
    ixBriefing,
    patternPacks,
    skillPacks,
    toolPacks,
    allBlockers,
    drift,
    config
  });

  return packet;
}

// ---------------------------------------------------------------------------
// Utility: List all available roles
// ---------------------------------------------------------------------------

function listAgentRoles() {
  return Object.entries(AGENT_ROLES).map(([role, config]) => ({
    role,
    agentId: buildAgentIdentity(role, config).agentId,
    responsibilityTier: buildAgentIdentity(role, config).responsibilityTier,
    label: config.label,
    title: config.title,
    ixTypes: config.ixTypes,
    maxEntries: config.maxEntries,
    priorityChains: (config.priorityChains || []).length,
    permissions: config.permissions || []
  }));
}

// ---------------------------------------------------------------------------
// IX Cache Management
// ---------------------------------------------------------------------------

function invalidateIxCache() {
  ixRuntime.invalidateIxCache();
}

function startIxFileWatcher() {
  ixRuntime.startIxFileWatcher();
}

function stopIxFileWatcher() {
  ixRuntime.stopIxFileWatcher();
}

function getIxCacheStats() {
  return ixRuntime.getIxCacheStats();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildSpawnContext,
  listAgentRoles,
  generateVirtualPid,
  getCurrentBlockers,
  getActiveSpawns,
  despawnPid,
  readPidRegistry,
  registerSpawnPid,
  readHealthState,
  readDriftSignals,
  getMistakesForRole,
  getIxEntriesForRole,
  activateOwnedTaskForRole,
  invalidateIxCache,
  startIxFileWatcher,
  stopIxFileWatcher,
  getIxCacheStats,
  AGENT_ROLES
};
