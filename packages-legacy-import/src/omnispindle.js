const path = require("path");
const {
  getOmnispindleLaneDefinitions,
  normalizeLaneId: normalizeRegistryLaneId,
  normalizeManagerId,
  getManagerDefinition
} = require("./laneRegistry");

let registerSpawnPid, generateVirtualPid, despawnPid, buildSpawnContext;
try {
  const scb = require("./spawnContextBuilder");
  registerSpawnPid = scb.registerSpawnPid;
  generateVirtualPid = scb.generateVirtualPid;
  despawnPid = scb.despawnPid;
  buildSpawnContext = scb.buildSpawnContext;
} catch (_) { /* spawnContextBuilder not available */ }

const DEFAULT_MODEL = "claude-2";
const DEFAULT_MAX_BUDGET = 0;

const LANE_DEFINITIONS = getOmnispindleLaneDefinitions();

function normalizeLaneId(raw) {
  return normalizeRegistryLaneId(raw);
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function ensureNumber(value, fallback) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return candidate;
}

function summarizeTaskActivation(taskActivation = null) {
  if (!taskActivation || typeof taskActivation !== "object") {
    return {
      requested: false,
      ok: false,
      action: "",
      reason: "",
      taskId: "",
      leaseId: "",
      status: ""
    };
  }
  return {
    requested: Boolean(taskActivation.requested),
    ok: Boolean(taskActivation.ok),
    action: cleanText(taskActivation.action),
    reason: cleanText(taskActivation.reason),
    taskId: cleanText(taskActivation.taskId),
    leaseId: cleanText(taskActivation.leaseId),
    status: cleanText(taskActivation.status)
  };
}

function summarizeCompactRuntime(compactRuntime = null) {
  if (!compactRuntime || typeof compactRuntime !== "object") {
    return {
      present: false,
      profile: "",
      signature: "",
      roleCode: "",
      agentId: "",
      tierCode: "",
      typeCodes: [],
      anchorIds: [],
      anchorCodes: [],
      chainCodes: [],
      totalEntries: 0,
      totalChains: 0
    };
  }
  const anchorRows = Array.isArray(compactRuntime.anchors) ? compactRuntime.anchors : [];
  const chainRows = Array.isArray(compactRuntime.chains) ? compactRuntime.chains : [];
  return {
    present: true,
    profile: cleanText(compactRuntime.profile),
    signature: cleanText(compactRuntime.signature),
    roleCode: cleanText(compactRuntime.roleCode),
    agentId: cleanText(compactRuntime.agentId),
    tierCode: cleanText(compactRuntime.tierCode),
    typeCodes: Array.isArray(compactRuntime.typeCodes)
      ? compactRuntime.typeCodes.map((value) => cleanText(value)).filter(Boolean)
      : [],
    anchorIds: Array.isArray(compactRuntime.anchorIds)
      ? compactRuntime.anchorIds.map((value) => cleanText(value)).filter(Boolean)
      : [],
    anchorCodes: anchorRows
      .map((row) => cleanText(row?.code || row?.id))
      .filter(Boolean),
    chainCodes: chainRows
      .map((row) => {
        const from = cleanText(row?.fromCode || row?.from);
        const to = cleanText(row?.toCode || row?.to);
        return from && to ? `${from}->${to}` : "";
      })
      .filter(Boolean),
    totalEntries: Number(compactRuntime.totalEntries || 0),
    totalChains: Number(compactRuntime.totalChains || 0)
  };
}

function summarizeSpawnPacket(packet = null) {
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      role: "",
      label: "",
      title: "",
      spawnPid: "",
      spawnedAt: "",
      totalEntries: 0,
      activeTaskCount: 0,
      activeTaskIds: [],
      taskActivation: summarizeTaskActivation(null),
      blockerCount: 0,
      signalCount: 0,
      ixBriefing: {
        compactPreferred: false,
        widened: false,
        reason: "",
        visibleCount: 0,
        reducedVisibleCount: 0,
        deferredCount: 0
      },
      compactRuntime: summarizeCompactRuntime(null),
      error: cleanText(packet && packet.error)
    };
  }
  return {
    ok: true,
    role: cleanText(packet.role),
    label: cleanText(packet.label),
    title: cleanText(packet.title),
    spawnPid: cleanText(packet.spawnPid),
    spawnedAt: cleanText(packet.spawnedAt),
    totalEntries: Number(packet.integral?.totalEntries || 0),
    activeTaskCount: Array.isArray(packet.activeTasks) ? packet.activeTasks.length : 0,
    activeTaskIds: Array.isArray(packet.activeTasks)
      ? packet.activeTasks.map((task) => cleanText(task.id)).filter(Boolean)
      : [],
    taskActivation: summarizeTaskActivation(packet.taskActivation),
    blockerCount: Number(packet.blockerCount || 0),
    signalCount: Number(packet.signalCount || 0),
    ixBriefing: {
      compactPreferred: Boolean(packet.integral?.ixBriefing?.compactPreferred),
      widened: Boolean(packet.integral?.ixBriefing?.widened),
      reason: cleanText(packet.integral?.ixBriefing?.reason),
      visibleCount: Number(packet.integral?.ixBriefing?.visibleCount || 0),
      reducedVisibleCount: Number(packet.integral?.ixBriefing?.reducedVisibleCount || 0),
      deferredCount: Array.isArray(packet.integral?.ixBriefing?.deferredIds)
        ? packet.integral.ixBriefing.deferredIds.length
        : 0
      },
    compactRuntime: summarizeCompactRuntime(packet.integral?.compactRuntime),
    error: ""
  };
}

function evaluateLaneActivationAuthority(laneId, options = {}) {
  const requested = Boolean(options.activateOwnedTask);
  const controllerId = normalizeManagerId(
    options.controllerId
      || options.managerId
      || options.requestedBy
      || options.actor
  );
  if (!requested) {
    return {
      requested: false,
      allowed: false,
      controllerId,
      reason: ""
    };
  }
  const lane = LANE_DEFINITIONS[laneId];
  if (!lane?.spawnRoleId) {
    return {
      requested: true,
      allowed: false,
      controllerId,
      reason: "lane_has_no_spawn_role"
    };
  }
  if (!controllerId) {
    return {
      requested: true,
      allowed: false,
      controllerId: "",
      reason: "controller_id_required"
    };
  }
  const manager = getManagerDefinition(controllerId);
  if (!manager) {
    return {
      requested: true,
      allowed: false,
      controllerId,
      reason: "controller_unknown"
    };
  }
  if (!manager.writeCapable) {
    return {
      requested: true,
      allowed: false,
      controllerId,
      reason: "controller_not_write_capable"
    };
  }
  const preferredManagers = Array.isArray(lane.preferredManagers)
    ? lane.preferredManagers.map((entry) => normalizeManagerId(entry)).filter(Boolean)
    : [];
  if (preferredManagers.length > 0 && !preferredManagers.includes(controllerId)) {
    return {
      requested: true,
      allowed: false,
      controllerId,
      reason: "controller_not_preferred_for_lane"
    };
  }
  return {
    requested: true,
    allowed: true,
    controllerId,
    reason: ""
  };
}

function buildLaneSpawnContext(laneId, options = {}) {
  const lane = LANE_DEFINITIONS[laneId];
  const spawnRoleId = cleanText(lane?.spawnRoleId);
  if (!spawnRoleId || typeof buildSpawnContext !== "function") {
    return null;
  }
  const activationAuthority = evaluateLaneActivationAuthority(laneId, options);
  const packet = buildSpawnContext(spawnRoleId, {
    registerPid: false,
    activateOwnedTask: activationAuthority.allowed,
    mission: cleanText(options.mission),
    extraContext: cleanText(options.extraContext),
    includeBody: Boolean(options.includeBody),
    widenMarkdown: Boolean(options.widenMarkdown),
    allowImplicitWidening: false,
    extraIxTypes: Array.isArray(options.extraIxTypes) ? options.extraIxTypes : undefined
  });
  const summary = summarizeSpawnPacket(packet);
  if (activationAuthority.requested && !activationAuthority.allowed) {
    summary.taskActivation = {
      requested: true,
      ok: false,
      action: "blocked",
      reason: cleanText(activationAuthority.reason),
      taskId: "",
      leaseId: "",
      status: ""
    };
  }
  summary.activationControllerId = cleanText(activationAuthority.controllerId);
  return {
    spawnRoleId,
    packet,
    summary,
    activationAuthority
  };
}

class Omnispindle {
  constructor(options = {}) {
    this.options = {
      executable: String(options.executable || "claude").trim() || "claude",
      workingDir: path.resolve(String(options.workingDir || process.cwd()).trim() || process.cwd()),
      model: String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      maxBudgetUsd: ensureNumber(options.maxBudgetUsd, DEFAULT_MAX_BUDGET)
    };
    this.state = {
      lanes: {},
      startedAt: "",
      prompts: [],
      broadcasts: []
    };
    this.ensureLaneState();
  }

  get model() {
    return this.options.model;
  }

  set model(value) {
    this.options.model = String(value || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  get maxBudgetUsd() {
    return this.options.maxBudgetUsd;
  }

  set maxBudgetUsd(value) {
    this.options.maxBudgetUsd = ensureNumber(value, DEFAULT_MAX_BUDGET);
  }

  configure(options = {}) {
    if (options.executable) {
      this.options.executable = String(options.executable).trim() || "claude";
    }
    if (options.workingDir) {
      this.options.workingDir = path.resolve(String(options.workingDir).trim() || process.cwd());
    }
    if (Object.prototype.hasOwnProperty.call(options, "model")) {
      this.model = options.model;
    }
    if (Object.prototype.hasOwnProperty.call(options, "maxBudgetUsd")) {
      this.maxBudgetUsd = options.maxBudgetUsd;
    }
    this.ensureLaneState();
  }

  ensureLaneState() {
    for (const laneId of Object.keys(LANE_DEFINITIONS)) {
      if (!Object.prototype.hasOwnProperty.call(this.state.lanes, laneId)) {
        this.state.lanes[laneId] = {
          status: "stopped",
          startedAt: "",
          stoppedAt: "",
          lastActionAt: "",
          lastPromptAt: "",
          lastPrompt: null,
          history: [],
          lastSpawnRoleId: "",
          lastSpawnPacket: null,
          lastSpawnPacketAt: ""
        };
      }
    }
  }

  startAll(validLanes = null) {
    this.ensureLaneState();
    const requested = Array.isArray(validLanes) && validLanes.length
      ? Array.from(new Set(validLanes.map((raw) => normalizeLaneId(raw)).filter((id) => id)))
      : Object.keys(LANE_DEFINITIONS);
    const started = [];
    const unknown = [];

    for (const laneId of requested) {
      if (!Object.prototype.hasOwnProperty.call(LANE_DEFINITIONS, laneId)) {
        unknown.push(laneId);
        continue;
      }
      this.startAgent(laneId, { silent: true });
      started.push(laneId);
    }
    this.state.startedAt = this.state.startedAt || new Date().toISOString();
    return {
      ok: true,
      started,
      unknown,
      model: this.model,
      maxBudgetUsd: this.maxBudgetUsd,
      lanes: this.summaryLanes()
    };
  }

  stopAll() {
    this.ensureLaneState();
    const stopped = [];
    for (const laneId of Object.keys(LANE_DEFINITIONS)) {
      const lane = this.state.lanes[laneId];
      if (lane.status !== "stopped") {
        this.stopAgent(laneId);
        stopped.push(laneId);
      }
    }
    return {
      ok: true,
      stopped,
      lanes: this.summaryLanes()
    };
  }

  startAgent(laneId, options = {}) {
    const normalized = normalizeLaneId(laneId);
    const lane = this.getLane(normalized);
    const now = new Date().toISOString();
    lane.status = "running";
    lane.startedAt = now;
    lane.lastActionAt = now;
    this.state.startedAt = this.state.startedAt || now;

    // Auto-register PID on lane start (LX-249 despawn protocol)
    if (registerSpawnPid && generateVirtualPid) {
      try {
        const pid = generateVirtualPid("omnispindle-" + normalized);
        registerSpawnPid("omnispindle-" + normalized, pid);
        lane.spawnPid = pid;
      } catch (_) { /* PID registration failure is non-fatal */ }
    }

    const spawnContext = buildLaneSpawnContext(normalized, options);
    lane.lastSpawnRoleId = cleanText(spawnContext?.spawnRoleId);
    lane.lastSpawnPacket = spawnContext ? spawnContext.summary : null;
    lane.lastSpawnPacketAt = spawnContext ? now : "";

    return {
      ok: true,
      laneId: normalized,
      spawnPid: lane.spawnPid || null,
      spawnRoleId: lane.lastSpawnRoleId || null,
      spawnPacket: lane.lastSpawnPacket,
      status: lane.status,
      startedAt: lane.startedAt
    };
  }

  stopAgent(laneId) {
    const lane = this.getLane(laneId);
    const now = new Date().toISOString();
    lane.status = "stopped";
    lane.stoppedAt = now;
    lane.lastActionAt = now;

    // Auto-despawn PID on lane stop (LX-249 despawn protocol)
    const normalized = normalizeLaneId(laneId);
    if (despawnPid) {
      try {
        despawnPid("omnispindle-" + normalized);
      } catch (_) { /* PID despawn failure is non-fatal */ }
    }
    lane.spawnPid = null;

    return {
      ok: true,
      laneId: normalized,
      status: lane.status,
      stoppedAt: lane.stoppedAt
    };
  }

  sendPrompt(laneId, text) {
    const normalized = normalizeLaneId(laneId);
    const lane = this.getLane(normalized);
    const now = new Date().toISOString();
    const prompt = {
      id: `prompt-${normalized}-${Date.now()}`,
      laneId: normalized,
      text: String(text || "").trim(),
      at: now,
      model: this.model
    };
    lane.lastPrompt = prompt;
    lane.lastPromptAt = now;
    lane.history.push(prompt);
    if (lane.history.length > 25) {
      lane.history.shift();
    }
    lane.lastActionAt = now;
    this.state.prompts.push(prompt);
    if (this.state.prompts.length > 50) {
      this.state.prompts.shift();
    }
    return {
      ok: true,
      laneId: normalized,
      prompt
    };
  }

  broadcast(text) {
    const now = new Date().toISOString();
    const record = {
      id: `broadcast-${Date.now()}`,
      text: String(text || "").trim(),
      at: now,
      model: this.model
    };
    this.state.broadcasts.push(record);
    if (this.state.broadcasts.length > 10) {
      this.state.broadcasts.shift();
    }
    return {
      ok: true,
      broadcast: record
    };
  }

  getStatus() {
    this.ensureLaneState();
    return {
      ok: true,
      service: "omnispindle",
      executable: this.options.executable,
      workingDir: this.options.workingDir,
      model: this.model,
      maxBudgetUsd: this.maxBudgetUsd,
      startedAt: this.state.startedAt || null,
      lanes: this.summaryLanes(),
      prompts: this.state.prompts.slice(-10),
      broadcasts: this.state.broadcasts.slice(-5)
    };
  }

  summaryLanes() {
    return Object.entries(this.state.lanes).map(([laneId, lane]) => ({
      laneId,
      status: lane.status,
      startedAt: lane.startedAt,
      stoppedAt: lane.stoppedAt,
      lastPromptAt: lane.lastPromptAt,
      lastActionAt: lane.lastActionAt,
      lastPrompt: lane.lastPrompt,
      lastSpawnRoleId: lane.lastSpawnRoleId || null,
      lastSpawnPacketAt: lane.lastSpawnPacketAt || null,
      lastSpawnPacket: lane.lastSpawnPacket,
      definition: LANE_DEFINITIONS[laneId]
    }));
  }

  getLane(laneId) {
    const normalized = normalizeLaneId(laneId);
    if (!normalized) {
      const error = new Error("laneId is required");
      error.status = 400;
      throw error;
    }
    if (!Object.prototype.hasOwnProperty.call(LANE_DEFINITIONS, normalized)) {
      const error = new Error(`Unknown lane: ${laneId}`);
      error.status = 404;
      throw error;
    }
    this.ensureLaneState();
    return this.state.lanes[normalized];
  }
}

let omnispindleInstance = null;

function getOmnispindle(options = {}) {
  if (!omnispindleInstance) {
    omnispindleInstance = new Omnispindle(options);
  } else if (options && Object.keys(options).length) {
    omnispindleInstance.configure(options);
  }
  return omnispindleInstance;
}

module.exports = {
  getOmnispindle,
  LANE_DEFINITIONS
};
