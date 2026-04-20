const LANE_FAMILY_ORDER = Object.freeze(["control", "knowledge", "build", "security", "device", "federation"]);

const MANAGER_REGISTRY = Object.freeze({
  instant_agent: Object.freeze({
    id: "instant_agent",
    label: "Instant Agent",
    kind: "ephemeral_lane_manager",
    domain: "local",
    writeCapable: true
  }),
  local_codex: Object.freeze({
    id: "local_codex",
    label: "Local Codex",
    kind: "owner_plane_write",
    domain: "local",
    writeCapable: true
  }),
  claude_max: Object.freeze({
    id: "claude_max",
    label: "Claude Max",
    kind: "review_lane_manager",
    domain: "local",
    writeCapable: false
  }),
  abacus: Object.freeze({
    id: "abacus",
    label: "Abacus",
    kind: "bounded_external_worker",
    domain: "external",
    writeCapable: false
  }),
  symphony: Object.freeze({
    id: "symphony",
    label: "Symphony",
    kind: "long_running_issue_manager",
    domain: "service",
    writeCapable: false
  }),
  shared_compute: Object.freeze({
    id: "shared_compute",
    label: "Shared Compute",
    kind: "federated_compute_manager",
    domain: "federated",
    writeCapable: true
  }),
  cursor: Object.freeze({
    id: "cursor",
    label: "Cursor",
    kind: "external_provider_manager",
    domain: "external",
    writeCapable: false
  }),
  antigravity: Object.freeze({
    id: "antigravity",
    label: "Antigravity",
    kind: "external_provider_manager",
    domain: "external",
    writeCapable: false
  })
});

const LANE_REGISTRY = Object.freeze({
  "ctl-core": Object.freeze({ id: "ctl-core", family: "control", label: "Core Control", icon: "CC", code: "ctl-core", summary: "Owns colony lifecycle, dispatch, and default hot-lane authority.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex"] }),
  "ctl-route": Object.freeze({ id: "ctl-route", family: "control", label: "Control Route", icon: "CR", code: "ctl-route", summary: "Routes control packets, handshakes, and command-center traffic.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex"], aliases: ["control", "omnispindle-control"], spawnRoleId: "omnispindle-control", spawnAgentId: "AGT-OMC", spawnResponsibilityTier: "control", spawnLabel: "Omnispindle-Control — Control Route", spawnTitle: "Control Route", spawnIdentity: "You are the Omnispindle Control Route. You route control packets, handshakes, and lane traffic between colony surfaces.", spawnBriefing: "You are the control route. Keep command traffic coherent and do not widen authority beyond the requested route.", ixTypes: ["rule", "pattern", "tool"], taskKeywords: ["control", "route", "handshake", "packet", "omnispindle", "signal"], priorityChains: ["LX-204", "LX-122", "LX-288", "LX-049"], permissions: ["control.packet", "handshake.route", "lane.route"], maxEntries: 10, includeBootCritical: true, includeActiveBlockers: false }),
  "ctl-pid": Object.freeze({ id: "ctl-pid", family: "control", label: "PID Control", icon: "CP", code: "ctl-pid", summary: "Tracks spawn ownership, TTL, handoff, and despawn correctness.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex"] }),
  "ctl-watch": Object.freeze({ id: "ctl-watch", family: "control", label: "Control Watch", icon: "CW", code: "ctl-watch", summary: "Monitors topology drift, runtime health, and lane alarms.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex"], aliases: ["scout", "omnispindle-scout"], spawnRoleId: "omnispindle-scout", spawnAgentId: "AGT-OMS", spawnResponsibilityTier: "observer", spawnLabel: "Omnispindle-Scout — Control Watch", spawnTitle: "Control Watch", spawnIdentity: "You are the Omnispindle Control Watch. You monitor topology drift, runtime health, and lane alarms across the colony.", spawnBriefing: "You are the control watch. Stay lightweight, read-mostly, and escalate drift instead of mutating state blindly.", ixTypes: ["pattern", "mistake", "rule"], taskKeywords: ["scout", "topology", "health", "drift", "monitor", "omnispindle"], priorityChains: ["LX-288", "LX-111", "LX-245", "LX-208"], permissions: ["topology.scan", "health.report", "drift.detect"], maxEntries: 10, includeBootCritical: false, includeActiveBlockers: true }),
  "idx-search": Object.freeze({ id: "idx-search", family: "knowledge", label: "Index Search", icon: "IS", code: "idx-search", summary: "Fast lexical and staged runtime index retrieval.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex", "claude_max"] }),
  "idx-chain": Object.freeze({ id: "idx-chain", family: "knowledge", label: "Index Chain", icon: "IC", code: "idx-chain", summary: "Follows chain links, boot packs, and compressed reasoning trails.", deviceScope: "desktop", hot: false, preferredManagers: ["instant_agent", "local_codex"] }),
  "mem-brief": Object.freeze({ id: "mem-brief", family: "knowledge", label: "Memory Brief", icon: "MB", code: "mem-brief", summary: "Builds compact briefings and per-agent context packets.", deviceScope: "desktop", hot: true, preferredManagers: ["instant_agent", "local_codex"] }),
  "gnn-route": Object.freeze({ id: "gnn-route", family: "knowledge", label: "GNN Route", icon: "GR", code: "gnn-route", summary: "Predicts likely next constructions, lane transfers, and graph-weighted routing.", deviceScope: "desktop", hot: false, preferredManagers: ["instant_agent", "local_codex", "claude_max"] }),
  "src-build": Object.freeze({ id: "src-build", family: "build", label: "Source Build", icon: "SB", code: "src-build", summary: "Primary coding and repo mutation lane.", deviceScope: "desktop", hot: true, preferredManagers: ["local_codex", "instant_agent", "symphony"] }),
  "tst-verify": Object.freeze({ id: "tst-verify", family: "build", label: "Test Verify", icon: "TV", code: "tst-verify", summary: "Review, regression checks, and bounded verification lane.", deviceScope: "desktop", hot: true, preferredManagers: ["claude_max", "local_codex", "instant_agent"] }),
  "ops-run": Object.freeze({ id: "ops-run", family: "build", label: "Ops Run", icon: "OR", code: "ops-run", summary: "Operational repairs, maintenance, service actions, and health tooling.", deviceScope: "desktop", hot: true, preferredManagers: ["local_codex", "shared_compute", "instant_agent"] }),
  "rel-promote": Object.freeze({ id: "rel-promote", family: "build", label: "Release Promote", icon: "RP", code: "rel-promote", summary: "Controlled promotion lane for staging/dev/prod and long-running issue handoff.", deviceScope: "desktop", hot: false, preferredManagers: ["symphony", "local_codex"] }),
  "sec-pentest": Object.freeze({ id: "sec-pentest", family: "security", label: "Security Pentest", icon: "SP", code: "sec-pentest", summary: "Bounded white-box security assessment, exploit proof, and evidence-first findings.", deviceScope: "desktop", hot: false, preferredManagers: ["local_codex", "claude_max"], aliases: ["security", "pentest", "shannon", "sec-audit"], spawnRoleId: "pentester", spawnAgentId: "AGT-PNT", spawnResponsibilityTier: "working", spawnLabel: "Pentester — Security Pentest", spawnTitle: "Security Pentest", spawnIdentity: "You are the Pentester Security Lane. Assess approved targets, prove findings with evidence, and stay inside explicit scope.", spawnBriefing: "You are the pentest lane. Work from an explicit engagement packet, keep proof first, and do not escalate into uncontrolled mutation or general authority.", ixTypes: ["rule", "tool", "plan", "mistake", "task"], taskKeywords: ["security", "pentest", "audit", "exploit", "proof", "white-box", "shannon", "finding", "engagement", "scope"], priorityChains: ["LX-328", "LX-329", "LX-330", "LX-332", "LX-333", "LX-321", "LX-249"], permissions: ["security.assess", "evidence.capture", "finding.report", "scope.verify"], maxEntries: 14, includeBootCritical: false, includeActiveBlockers: false }),
  "ph-capture": Object.freeze({ id: "ph-capture", family: "device", label: "Phone Capture", icon: "PC", code: "ph-capture", summary: "Phone screen capture, OCR intake, and screenshot evidence.", deviceScope: "phone", hot: false, preferredManagers: ["instant_agent", "shared_compute"] }),
  "ph-action": Object.freeze({ id: "ph-action", family: "device", label: "Phone Action", icon: "PA", code: "ph-action", summary: "ADB and phone-side action execution.", deviceScope: "phone", hot: false, preferredManagers: ["instant_agent", "shared_compute"] }),
  "ph-comms": Object.freeze({ id: "ph-comms", family: "device", label: "Phone Comms", icon: "PM", code: "ph-comms", summary: "Message, chat, and phone communication lane.", deviceScope: "phone", hot: true, preferredManagers: ["instant_agent", "shared_compute"] }),
  "desk-io": Object.freeze({ id: "desk-io", family: "device", label: "Desktop IO", icon: "DI", code: "desk-io", summary: "Desktop control, capture, and surface IO lane.", deviceScope: "desktop", hot: false, preferredManagers: ["instant_agent", "local_codex"] }),
  "node-share": Object.freeze({ id: "node-share", family: "federation", label: "Node Share", icon: "NS", code: "node-share", summary: "Cross-machine shared compute and processor sharing.", deviceScope: "cross-node", hot: true, preferredManagers: ["shared_compute", "instant_agent", "local_codex"] }),
  "bus-mqtt": Object.freeze({ id: "bus-mqtt", family: "federation", label: "MQTT Bus", icon: "MQ", code: "bus-mqtt", summary: "Federation bus, retained state, and cross-node signaling.", deviceScope: "cross-node", hot: false, preferredManagers: ["shared_compute", "instant_agent"] }),
  "bridge-mcp": Object.freeze({ id: "bridge-mcp", family: "federation", label: "Bridge MCP", icon: "BM", code: "bridge-mcp", summary: "Managed bridge lane for remote MCP or provider-side tool links.", deviceScope: "cross-node", hot: true, preferredManagers: ["antigravity", "cursor", "instant_agent"], aliases: ["bridge", "omnispindle-bridge"], spawnRoleId: "omnispindle-bridge", spawnAgentId: "AGT-OMB", spawnResponsibilityTier: "working", spawnLabel: "Omnispindle-Bridge — MCP Bridge", spawnTitle: "MCP Bridge", spawnIdentity: "You are the Omnispindle MCP Bridge. You maintain the remote bridge path and keep provider links bounded and inspectable.", spawnBriefing: "You are the bridge lane. Maintain the bridge path, but do not auto-connect or widen trust without explicit authority.", ixTypes: ["tool", "reference", "pattern"], taskKeywords: ["bridge", "MCP", "remote", "link", "omnispindle", "gate", "relay"], priorityChains: ["LX-288", "LX-049", "LX-121", "LX-111"], permissions: ["bridge.connect", "mcp.relay", "remote.link"], maxEntries: 10, includeBootCritical: true, includeActiveBlockers: false }),
  "burst-cloud": Object.freeze({ id: "burst-cloud", family: "federation", label: "Burst Cloud", icon: "BC", code: "burst-cloud", summary: "External agent-manager lane for bounded cloud bursts, research, and sidecar task swarms.", deviceScope: "cloud-reserved", hot: false, preferredManagers: ["antigravity", "cursor", "abacus", "symphony"] })
});

const DEFAULT_HOT_LANES = Object.freeze(
  Object.values(LANE_REGISTRY).filter((lane) => lane.hot).map((lane) => lane.id)
);

const MANAGER_ALIASES = Object.freeze({
  codex: "local_codex",
  claude: "claude_max",
  anthropic: "claude_max",
  "shared-compute": "shared_compute"
});

const LANE_ALIASES = Object.freeze(
  Object.values(LANE_REGISTRY).reduce((acc, lane) => {
    acc[lane.id] = lane.id;
    for (const alias of lane.aliases || []) {
      acc[String(alias || "").trim().toLowerCase()] = lane.id;
    }
    return acc;
  }, {})
);

function cleanId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLaneId(value) {
  const raw = cleanId(value);
  if (!raw) return "";
  return LANE_ALIASES[raw] || "";
}

function normalizeManagerId(value) {
  const raw = cleanId(value).replace(/[\s-]+/g, "_");
  if (!raw) return "";
  const normalized = MANAGER_ALIASES[raw] || raw;
  return MANAGER_REGISTRY[normalized] ? normalized : "";
}

function normalizeNodeCode(value) {
  const normalized = cleanId(value).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) return "node";
  return normalized.slice(0, 3);
}

function getLaneDefinition(laneId) {
  const normalized = normalizeLaneId(laneId);
  return normalized ? LANE_REGISTRY[normalized] || null : null;
}

function listLaneDefinitions(options = {}) {
  return Object.values(LANE_REGISTRY).filter((lane) => {
    if (options.family && lane.family !== String(options.family)) return false;
    if (options.hotOnly && !lane.hot) return false;
    if (options.deviceScope && lane.deviceScope !== String(options.deviceScope)) return false;
    return true;
  });
}

function getManagerDefinition(managerId) {
  const normalized = normalizeManagerId(managerId);
  return normalized ? MANAGER_REGISTRY[normalized] || null : null;
}

function listLaneManagers() {
  return Object.values(MANAGER_REGISTRY);
}

function getOmnispindleLaneDefinitions() {
  return ["ctl-route", "bridge-mcp", "ctl-watch"].reduce((acc, laneId) => {
    acc[laneId] = getLaneDefinition(laneId);
    return acc;
  }, {});
}

function buildOmnispindleSpawnRoles() {
  return ["ctl-route", "bridge-mcp", "ctl-watch"].reduce((acc, laneId) => {
    const lane = getLaneDefinition(laneId);
    if (!lane?.spawnRoleId) return acc;
    acc[lane.spawnRoleId] = {
      agentId: lane.spawnAgentId,
      responsibilityTier: lane.spawnResponsibilityTier,
      label: lane.spawnLabel,
      title: lane.spawnTitle,
      identity: lane.spawnIdentity,
      briefing: lane.spawnBriefing,
      ixTypes: lane.ixTypes || [],
      taskKeywords: lane.taskKeywords || [],
      priorityChains: lane.priorityChains || [],
      permissions: lane.permissions || [],
      maxEntries: Number(lane.maxEntries || 10),
      includeBootCritical: Boolean(lane.includeBootCritical),
      includeActiveBlockers: Boolean(lane.includeActiveBlockers)
    };
    return acc;
  }, {});
}

function createLaneAgentCode(nodeId, laneId, ordinal = 1) {
  const lane = getLaneDefinition(laneId);
  if (!lane) return "";
  const safeOrdinal = Math.max(1, Math.min(99, Number(ordinal) || 1));
  return `${normalizeNodeCode(nodeId)}-${lane.code}-${String(safeOrdinal).padStart(2, "0")}`;
}

function recommendTaskLane(input = {}) {
  const taskType = cleanId(input.taskType).replace(/[\s-]+/g, "_");
  if (taskType === "orchestration") return "ctl-route";
  if (taskType === "review") return "tst-verify";
  if (taskType === "patch") return "src-build";
  if (taskType === "security" || taskType === "pentest" || taskType === "security_review" || taskType === "white_box_audit") return "sec-pentest";
  if (taskType === "research") return input.needsCloudWorker ? "burst-cloud" : "idx-search";
  if (taskType === "long_running" || taskType === "issue_execution") return "burst-cloud";
  if (input.needsSecurityReview || input.needsPentest) return "sec-pentest";
  if (input.needsInteractiveCanvas) return "bridge-mcp";
  return "ops-run";
}

function resolveTaskManagementIdentity(input = {}) {
  const laneId = getLaneDefinition(input.laneId || input.lane)?.id || recommendTaskLane(input);
  const lane = getLaneDefinition(laneId);
  const workerId = normalizeManagerId(input.workerId || input.worker);
  const providerId = normalizeManagerId(input.providerId || input.provider);
  const managerId = normalizeManagerId(
    input.managerId
      || input.manager
      || workerId
      || providerId
      || lane?.preferredManagers?.[0]
      || "instant_agent"
  );
  return {
    laneId: lane?.id || "",
    managerId,
    workerId,
    providerId,
    lane,
    manager: getManagerDefinition(managerId)
  };
}

module.exports = {
  LANE_FAMILY_ORDER,
  LANE_REGISTRY,
  MANAGER_REGISTRY,
  DEFAULT_HOT_LANES,
  normalizeLaneId,
  normalizeManagerId,
  getLaneDefinition,
  listLaneDefinitions,
  getManagerDefinition,
  listLaneManagers,
  getOmnispindleLaneDefinitions,
  buildOmnispindleSpawnRoles,
  createLaneAgentCode,
  recommendTaskLane,
  resolveTaskManagementIdentity
};
