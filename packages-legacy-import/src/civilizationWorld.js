function cleanText(value, maxLen = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function toIso(value) {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

function asInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(numeric);
}

function levelRank(level) {
  switch (String(level || "").trim().toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function normalizeStatus(value, fallback = "unknown") {
  const normalized = cleanText(value, 80).toLowerCase();
  return normalized || fallback;
}

function makeEntityId(kind, id) {
  const safeKind = cleanText(kind, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "entity";
  const safeId = cleanText(id, 120).toLowerCase().replace(/[^a-z0-9_./:-]+/g, "_") || safeKind;
  return `${safeKind}:${safeId}`;
}

function classifyTrustedEntityKind(entity = {}) {
  const kind = normalizeStatus(entity.kind, "surface");
  if (kind === "brain") return "surface";
  if (kind === "worker") return "surface";
  if (kind === "remote_mcp") return "surface";
  if (kind === "cloud_model") return "surface";
  if (kind === "transport") return "gate";
  if (kind === "terminal") return "surface";
  return "surface";
}

function districtForEntity(kind, subtype = "") {
  const normalizedKind = normalizeStatus(kind, "entity");
  const normalizedSubtype = normalizeStatus(subtype, "");
  if (normalizedKind === "sovereign") return "citadel";
  if (normalizedKind === "sub_colony") return "world_bridge";
  if (normalizedKind === "agent") return normalizedSubtype === "admin_terminal" ? "perimeter" : "colony";
  if (normalizedKind === "tower") return "perimeter";
  if (normalizedKind === "surface") {
    if (normalizedSubtype.includes("cloud")) return "cloud_arc";
    if (normalizedSubtype.includes("remote") || normalizedSubtype.includes("mcp")) return "world_bridge";
    return "workshop";
  }
  if (normalizedKind === "gate") {
    if (normalizedSubtype.includes("cloud")) return "cloud_arc";
    if (normalizedSubtype.includes("swarmdesk")) return "world_bridge";
    return "gate_ring";
  }
  if (normalizedKind === "packet" || normalizedKind === "task") return "ledger_quarter";
  return "workshop";
}

function motionForStatus(status = "", hot = false) {
  const normalized = normalizeStatus(status, "unknown");
  if (normalized === "active" || hot) return "moving";
  if (normalized === "running" || normalized === "connected" || normalized === "online") return "awake";
  if (normalized === "degraded" || normalized === "error" || normalized === "failed") return "disturbed";
  if (normalized === "offline" || normalized === "idle") return "resting";
  return "steady";
}

function buildDistricts() {
  return [
    {
      id: "citadel",
      label: "Citadel",
      purpose: "Asolaria core orchestration and sovereign control."
    },
    {
      id: "colony",
      label: "Colony",
      purpose: "Named agents carrying work across the system."
    },
    {
      id: "perimeter",
      label: "Perimeter Towers",
      purpose: "Guardian towers and admin sidecars watching ingress and egress."
    },
    {
      id: "gate_ring",
      label: "Gate Ring",
      purpose: "Transport, relay, tunnel, and coordination checkpoints."
    },
    {
      id: "ledger_quarter",
      label: "Ledger Quarter",
      purpose: "Tasks, packets, and tracked work bundles."
    },
    {
      id: "workshop",
      label: "Workshop",
      purpose: "Local tools and coder surfaces."
    },
    {
      id: "cloud_arc",
      label: "Cloud Arc",
      purpose: "Heavy reasoning and multimodal cloud surfaces."
    },
    {
      id: "world_bridge",
      label: "World Bridge",
      purpose: "External world renderers and trusted remote workspaces."
    }
  ];
}

function buildEntityRegistry() {
  return {
    entities: [],
    byId: new Map(),
    aliases: new Map()
  };
}

function addAlias(registry, alias, entityId) {
  const safeAlias = cleanText(alias, 200).toLowerCase();
  if (!safeAlias || !entityId) return;
  registry.aliases.set(safeAlias, entityId);
}

function registerEntity(registry, entity, aliases = []) {
  const payload = entity && typeof entity === "object" ? { ...entity } : {};
  if (!payload.id) {
    throw new Error("civilization entity id is required");
  }
  const existing = registry.byId.get(payload.id);
  if (!existing) {
    registry.byId.set(payload.id, payload);
    registry.entities.push(payload);
  } else {
    Object.assign(existing, payload);
  }
  const aliasList = Array.isArray(aliases) ? aliases : [];
  aliasList.forEach((alias) => addAlias(registry, alias, payload.id));
  addAlias(registry, payload.id, payload.id);
  addAlias(registry, payload.label, payload.id);
  return registry.byId.get(payload.id);
}

function resolveEntityId(registry, ...aliases) {
  for (const alias of aliases) {
    const safeAlias = cleanText(alias, 200).toLowerCase();
    if (!safeAlias) continue;
    const hit = registry.aliases.get(safeAlias);
    if (hit) return hit;
  }
  return "";
}

function buildSovereignEntity() {
  return {
    id: makeEntityId("sovereign", "asolaria"),
    label: "Asolaria",
    kind: "sovereign",
    subtype: "core_runtime",
    status: "running",
    district: "citadel",
    trusted: true,
    owned: true,
    online: true,
    hot: true,
    motion: "moving",
    icon: "A",
    provider: "local",
    sourceRef: "runtime:asolaria-core"
  };
}

function buildGateEntity(id, label, options = {}) {
  const kind = options.kind || "gate";
  const subtype = normalizeStatus(options.subtype, "control");
  const status = normalizeStatus(options.status, "unknown");
  const online = Boolean(options.online);
  const hot = Boolean(options.hot);
  return {
    id: makeEntityId(kind, id),
    label,
    kind,
    subtype,
    status,
    district: districtForEntity(kind, subtype),
    trusted: Boolean(options.trusted),
    owned: Boolean(options.owned),
    online,
    hot,
    motion: motionForStatus(status, hot),
    provider: cleanText(options.provider, 80),
    sourceRef: cleanText(options.sourceRef, 180),
    summary: cleanText(options.summary, 200)
  };
}

function buildTrustedSurfaceEntity(entity = {}) {
  const kind = classifyTrustedEntityKind(entity);
  const subtype = normalizeStatus(entity.kind, "surface");
  const connected = Boolean(entity.connected);
  const status = connected ? "connected" : "offline";
  return {
    id: makeEntityId(kind, entity.id || entity.label || subtype),
    label: cleanText(entity.label || entity.id || "Surface", 120),
    kind,
    subtype,
    status,
    district: districtForEntity(kind, subtype.includes("cloud") || String(entity.provider || "").includes("google") ? "cloud" : subtype),
    trusted: Boolean(entity.trusted),
    owned: Boolean(entity.owned),
    online: connected,
    hot: false,
    motion: motionForStatus(status, false),
    provider: cleanText(entity.provider, 80),
    model: cleanText(entity.model, 120),
    capabilities: Array.isArray(entity.capabilities) ? entity.capabilities.slice(0, 12) : [],
    sourceRef: cleanText(entity.url || entity.executable || entity.topicRoot || "", 180)
  };
}

function buildColonyAgentEntity(agent = {}) {
  const state = normalizeStatus(agent.state, agent.running ? "idle" : "offline");
  const subtype = normalizeStatus(agent.plane || "lane", "lane");
  const hot = state === "active";
  return {
    id: makeEntityId("agent", agent.id || agent.name || "agent"),
    label: cleanText(agent.name || agent.id || "Agent", 120),
    kind: "agent",
    subtype,
    status: state,
    district: districtForEntity("agent", subtype),
    trusted: true,
    owned: true,
    online: Boolean(agent.running),
    hot,
    motion: motionForStatus(state, hot),
    icon: cleanText(agent.icon || "?", 4),
    role: cleanText(agent.role, 160),
    provider: cleanText(agent.lastExecution?.provider || "", 80),
    model: cleanText(agent.lastExecution?.model || "", 120),
    sourceRef: cleanText(agent.profilePath || "", 220)
  };
}

function buildTowerEntity(terminal = {}) {
  const status = normalizeStatus(terminal.state, terminal.running ? "idle" : "offline");
  const hot = status === "active";
  return {
    id: makeEntityId("tower", terminal.id || terminal.name || "tower"),
    label: `${cleanText(terminal.name || terminal.id || "Tower", 80)} Tower`,
    kind: "tower",
    subtype: "guardian_admin_terminal",
    status,
    district: "perimeter",
    trusted: true,
    owned: true,
    online: Boolean(terminal.running),
    hot,
    motion: motionForStatus(status, hot),
    icon: cleanText(terminal.icon || "T", 4),
    guardianAgentId: makeEntityId("agent", terminal.id || terminal.name || "tower"),
    transcriptPath: cleanText(terminal.cockpit?.transcriptPath || "", 220),
    sourceRef: cleanText(terminal.sidecar?.runtimeRoot || terminal.sidecar?.statusPath || "", 220)
  };
}

function buildConnectorTowerEntity(id, label, options = {}) {
  const status = normalizeStatus(options.status, options.online ? "online" : "offline");
  const hot = Boolean(options.hot) || status === "active" || status === "degraded";
  return {
    id: makeEntityId("tower", id),
    label: `${cleanText(label || "Connector", 80)} Tower`,
    kind: "tower",
    subtype: normalizeStatus(options.subtype, "connector_tower"),
    status,
    district: districtForEntity("tower", options.subtype || "connector_tower"),
    trusted: options.trusted !== false,
    owned: options.owned !== false,
    online: Boolean(options.online),
    hot,
    motion: motionForStatus(status, hot),
    icon: cleanText(options.icon || "T", 4),
    provider: cleanText(options.provider, 80),
    summary: cleanText(options.summary, 200),
    sourceRef: cleanText(options.sourceRef, 220)
  };
}

function buildTrustedConnectorTopology(entity = {}) {
  const id = cleanText(entity.id, 120).toLowerCase();
  const connected = Boolean(entity.connected);
  const status = connected ? "connected" : "offline";
  const provider = cleanText(entity.provider, 80);
  const sourceRef = cleanText(entity.url || entity.executable || entity.topicRoot || "", 220);

  switch (id) {
    case "codex-head":
      return {
        gateId: "codex-head",
        gateLabel: "Codex Gate",
        gateSubtype: "reasoning_gate",
        gateAliases: ["codex-head", "local_codex", "worker_lane:local_codex", "brain:codex-head"],
        towerId: "codex-head",
        towerLabel: "Codex",
        towerSubtype: "reasoning_tower",
        towerAliases: ["tower:codex-head", "codex tower"],
        status,
        online: connected,
        provider,
        icon: "CX",
        summary: "Primary sovereign coding and planning tower.",
        sourceRef,
        routeKind: "reasoning_mount",
        routeNotes: "Primary Codex reasoning lane mounted behind the Codex gate."
      };
    case "claude-code":
      return {
        gateId: "claude-max-review",
        gateLabel: "Claude Max Gate",
        gateSubtype: "review_gate",
        gateAliases: ["claude-code", "claude_max", "worker_lane:claude_max", "review_lane:claude_max"],
        towerId: "claude-max-review",
        towerLabel: "Claude Max",
        towerSubtype: "review_tower",
        towerAliases: ["tower:claude-max-review", "claude max tower"],
        status,
        online: connected,
        provider,
        icon: "CL",
        summary: "Fast review and bug-finding tower backed by Claude Code Max.",
        sourceRef,
        routeKind: "review_mount",
        routeNotes: "Claude Max review lane mounted behind the Claude gate."
      };
    case "omnispindle":
      return {
        gateId: "omnispindle",
        gateLabel: "Omnispindle Gate",
        gateSubtype: "remote_mcp_gate",
        gateAliases: ["omnispindle", "remote_mcp:omnispindle"],
        towerId: "omnispindle",
        towerLabel: "Omnispindle",
        towerSubtype: "remote_mcp_tower",
        towerAliases: ["tower:omnispindle", "omnispindle tower"],
        status,
        online: connected,
        provider,
        icon: "OM",
        summary: "Trusted remote MCP tower bridging Asolaria and MadnessInteractive.",
        sourceRef,
        routeKind: "mcp_mount",
        routeNotes: "Omnispindle remote MCP mounted behind the Omnispindle gate."
      };
    case "asolaria-augment-mcp":
      return {
        gateId: "augment-context",
        gateLabel: "Augment Context Gate",
        gateSubtype: "context_gate",
        gateAliases: [
          "augment_context",
          "augment-context",
          "asolaria-augment-mcp",
          "remote_mcp:asolaria-augment-mcp",
          "read_only_sidecar:augment_context"
        ],
        towerId: "augment-context",
        towerLabel: "Augment Context",
        towerSubtype: "context_tower",
        towerAliases: ["tower:augment-context", "augment context tower"],
        status,
        online: connected,
        provider,
        icon: "AU",
        summary: "Read-only context-retrieval tower for codebase and workspace search.",
        sourceRef,
        routeKind: "context_mount",
        routeNotes: "Augment Context is mounted behind a guarded read-only gate."
      };
    case "gemini-api-cloud":
      return {
        gateId: "gemini-api",
        gateLabel: "Gemini API Gate",
        gateSubtype: "cloud_reasoning_gate",
        gateAliases: ["gemini-api-cloud", "gemini_api", "alternate_brain:gemini_api", "cloud_model:gemini-api-cloud"],
        towerId: "gemini-api",
        towerLabel: "Gemini API",
        towerSubtype: "cloud_reasoning_tower",
        towerAliases: ["tower:gemini-api", "gemini api tower"],
        status,
        online: connected,
        provider,
        icon: "GA",
        summary: "Gemini API multimodal, files, and embeddings route.",
        sourceRef,
        routeKind: "cloud_mount",
        routeNotes: "Gemini API services are mounted behind a dedicated cloud gate.",
        parentGateAlias: "gemini-cloud"
      };
    case "vertex-gemini":
      return {
        gateId: "vertex-gemini",
        gateLabel: "Vertex Gate",
        gateSubtype: "cloud_compute_gate",
        gateAliases: ["vertex-gemini", "vertex", "cloud_model:vertex-gemini"],
        towerId: "vertex-gemini",
        towerLabel: "Vertex",
        towerSubtype: "cloud_compute_tower",
        towerAliases: ["tower:vertex-gemini", "vertex tower"],
        status,
        online: connected,
        provider,
        icon: "VX",
        summary: "Google Cloud compute tower for heavy long-running reasoning.",
        sourceRef,
        routeKind: "cloud_mount",
        routeNotes: "Vertex workloads are mounted behind a dedicated cloud gate.",
        parentGateAlias: "gemini-cloud"
      };
    case "warp-terminal":
      return {
        gateId: "warp-terminal",
        gateLabel: "Warp Gate",
        gateSubtype: "terminal_gate",
        gateAliases: ["warp-terminal", "warp", "terminal:warp-terminal"],
        towerId: "warp-terminal",
        towerLabel: "Warp",
        towerSubtype: "terminal_tower",
        towerAliases: ["tower:warp-terminal", "warp tower"],
        status,
        online: connected,
        provider,
        icon: "WP",
        summary: "Trusted operator terminal tower for fast task execution.",
        sourceRef,
        routeKind: "terminal_mount",
        routeNotes: "Warp is mounted behind a trusted operator gate."
      };
    default:
      return null;
  }
}

function buildPacketEntityFromTerminal(terminal = {}) {
  const packetPath = cleanText(terminal.files?.activeTaskPacketPath || "", 320);
  if (!packetPath) return null;
  const packetId = makeEntityId("packet", packetPath);
  return {
    id: packetId,
    label: cleanText(packetPath.split(/[\\/]/).pop() || "Packet", 140),
    kind: "packet",
    subtype: "task_bundle",
    status: terminal.running ? "in_transit" : "queued",
    district: "ledger_quarter",
    trusted: true,
    owned: true,
    online: Boolean(terminal.running),
    hot: Boolean(terminal.running),
    motion: terminal.running ? "moving" : "steady",
    ownerId: makeEntityId("tower", terminal.id || terminal.name || "tower"),
    sourceRef: packetPath
  };
}

function buildTaskEntity(task = {}) {
  const status = normalizeStatus(task.status, "planned");
  const lease = task.leaseContext && typeof task.leaseContext === "object" ? task.leaseContext : {};
  const leaseStatus = normalizeStatus(lease.status, "");
  const hot = status === "in_progress" || status === "blocked" || status === "review" || leaseStatus === "active" || leaseStatus === "queued";
  return {
    id: makeEntityId("task", task.id || task.title || "task"),
    label: cleanText(task.title || task.id || "Task", 160),
    kind: "task",
    subtype: status,
    status,
    district: "ledger_quarter",
    trusted: true,
    owned: true,
    online: status !== "done" && status !== "archived" && status !== "canceled",
    hot,
    motion: motionForStatus(status, hot),
    priority: normalizeStatus(task.priority, "normal"),
    projectScope: cleanText(task.projectScope || "", 80),
    owner: cleanText(lease.holderId || task.assigneeId || task.owner || "", 120),
    sourceRef: cleanText(lease.dispatchId || lease.artifactRef || task.lastLeaseId || task.source || "", 120)
  };
}

function buildFallbackGraphEntity(node = {}) {
  const subtype = normalizeStatus(node.type, "runtime_node");
  const status = node.freshnessBand === "hot"
    ? "active"
    : node.freshnessBand === "warm"
      ? "online"
      : "idle";
  return {
    id: makeEntityId("runtime_node", node.id || node.entityId || node.label || "node"),
    label: cleanText(node.label || node.entityId || node.id || "Runtime Node", 140),
    kind: "runtime_node",
    subtype,
    status,
    district: node.domain === "external" ? "world_bridge" : districtForEntity("runtime_node", subtype),
    trusted: false,
    owned: node.domain !== "external",
    online: status !== "offline",
    hot: node.freshnessBand === "hot",
    motion: motionForStatus(status, node.freshnessBand === "hot"),
    sourceRef: cleanText(node.id, 180),
    riskLevel: normalizeStatus(node.maxRiskLevel, "low"),
    riskScore: Number(node.maxRiskScore || 0)
  };
}

function buildSubColonyEntity(nodeId, options = {}) {
  const id = cleanText(nodeId, 80);
  const label = cleanText(options.label || nodeId, 120);
  const online = Boolean(options.online);
  const status = normalizeStatus(options.status, online ? "online" : "offline");
  const hot = online && Boolean(options.hot);
  const capabilities = options.capabilities && typeof options.capabilities === "object" ? options.capabilities : {};
  const phoneMode = cleanText(capabilities.phoneMode, 40);
  const subColonyClass = cleanText(capabilities.subColonyClass || options.subtype || "lan_colony", 80);
  const role = cleanText(capabilities.role || "sub_colony", 40);
  const icon = cleanText(
    options.icon
      || (subColonyClass === "phone_only_sub" ? "PH" : subColonyClass === "hybrid_sub" ? "HY" : subColonyClass === "no_phone_sub" ? "NP" : "DS"),
    8
  );
  const summaryBits = [
    options.summary || `Sub-colony node: ${id}`,
    phoneMode ? `phone: ${phoneMode}` : "",
    subColonyClass ? `class: ${subColonyClass}` : ""
  ].filter(Boolean);
  return {
    id: makeEntityId("sub_colony", id),
    label: `${label} (Sub-Colony)`,
    kind: "sub_colony",
    subtype: subColonyClass,
    status,
    district: "world_bridge",
    trusted: true,
    owned: true,
    online,
    hot,
    motion: motionForStatus(status, hot),
    icon,
    provider: cleanText(options.provider || "asolaria_federation", 80),
    sourceRef: cleanText(options.sourceRef || `node:${id}`, 220),
    summary: cleanText(summaryBits.join(" | "), 240),
    risk: { level: "low", score: 0 },
    tags: [`node:${id}`, "federation", `role:${role}`, phoneMode ? `phone_mode:${phoneMode}` : "", subColonyClass ? `sub_colony_class:${subColonyClass}` : ""].filter(Boolean)
  };
}

function buildFederationGateEntity(options = {}) {
  const online = Boolean(options.online);
  const status = normalizeStatus(options.status, online ? "online" : "offline");
  return {
    id: makeEntityId("gate", "federation"),
    label: "Federation Gate",
    kind: "gate",
    subtype: "federation_gate",
    status,
    district: "gate_ring",
    trusted: true,
    owned: true,
    online,
    hot: false,
    motion: motionForStatus(status, false),
    provider: "asolaria_federation",
    sourceRef: "federation:colony_network",
    summary: cleanText(options.summary || `Federation coordination gate (${options.nodeCount || 0} nodes).`, 200)
  };
}

function routeId(sourceId, targetId, kind) {
  return makeEntityId("route", `${sourceId}__${kind}__${targetId}`);
}

function buildRoute(sourceId, targetId, kind, options = {}) {
  return {
    id: routeId(sourceId, targetId, kind),
    sourceId,
    targetId,
    kind: normalizeStatus(kind, "route"),
    status: normalizeStatus(options.status, "observed"),
    riskLevel: normalizeStatus(options.riskLevel, "low"),
    riskScore: Number(options.riskScore || 0),
    traffic: asInt(options.traffic, 1),
    lastSeenAt: toIso(options.lastSeenAt || options.at || new Date().toISOString()),
    intent: cleanText(options.intent || options.action || "", 160),
    packetId: cleanText(options.packetId || "", 220),
    notes: cleanText(options.notes || "", 220),
    sourceRef: cleanText(options.sourceRef || "", 220)
  };
}

function nodeAliasCandidates(node = {}) {
  const aliases = [];
  const push = (value) => {
    const text = cleanText(value, 200);
    if (text) aliases.push(text);
  };
  push(node.id);
  push(node.entityId);
  push(node.label);
  push(`${node.type}:${node.entityId || node.id}`);
  return Array.from(new Set(aliases));
}

function buildCivilizationEvent(record = {}, registry) {
  const actorType = cleanText(record.actor?.type || "", 80);
  const actorId = cleanText(record.actor?.id || record.actor?.label || "", 140);
  const subjectType = cleanText(record.subject?.type || "", 80);
  const subjectId = cleanText(record.subject?.id || record.subject?.label || "", 140);
  const targetType = cleanText(record.target?.type || "", 80);
  const targetId = cleanText(record.target?.id || record.target?.label || "", 140);
  const actorEntityId = resolveEntityId(
    registry,
    `${actorType}:${actorId}`,
    actorId,
    record.actor?.label
  );
  const subjectEntityId = resolveEntityId(
    registry,
    `${subjectType}:${subjectId}`,
    subjectId,
    record.subject?.label
  );
  const targetEntityId = resolveEntityId(
    registry,
    `${targetType}:${targetId}`,
    targetId,
    record.target?.label
  );
  const route = actorEntityId && targetEntityId
    ? routeId(actorEntityId, targetEntityId, record.kind === "action_manifest" ? "manifest" : "event")
    : "";
  return {
    schemaVersion: "1.0",
    eventId: cleanText(record.id, 160),
    eventKind: cleanText(record.kind || "graph_event", 60),
    eventType: cleanText(`${record.component || "runtime"}.${record.action || record.category || "event"}`, 160),
    timestamp: toIso(record.at || record.createdAt || new Date().toISOString()),
    actorId: actorEntityId || "",
    subjectId: subjectEntityId || "",
    targetId: targetEntityId || "",
    originNode: actorEntityId || "",
    targetNode: targetEntityId || subjectEntityId || "",
    targetGate: targetEntityId && String(targetEntityId).startsWith("gate:") ? targetEntityId : "",
    route,
    intent: cleanText(record.action || record.category || "", 120),
    payloadRef: cleanText(
      record.detail?.packetId
      || record.detail?.eventId
      || record.detail?.responsePath
      || record.context?.packetId
      || "",
      220
    ),
    resourceScope: cleanText(record.context?.projectScope || record.context?.scope || record.target?.domain || "", 120),
    securityContext: {
      approvalState: normalizeStatus(record.policy?.approvalState, "not_required"),
      mode: cleanText(record.policy?.mode || "", 80),
      autonomous: Boolean(record.policy?.autonomous)
    },
    priority: levelRank(record.risk?.level) >= levelRank("high") ? "high" : levelRank(record.risk?.level) >= levelRank("medium") ? "medium" : "low",
    retryPolicy: "operator_defined",
    idempotencyKey: cleanText(record.id, 160),
    correlationId: cleanText(record.context?.dispatchId || record.context?.issueId || record.detail?.eventId || "", 160),
    threadId: cleanText(record.context?.threadId || "", 160),
    lifecycleState: normalizeStatus(record.status || record.action || "observed", "observed"),
    error: cleanText(record.detail?.error || (String(record.status || "").toLowerCase() === "failed" ? record.action : ""), 220),
    risk: {
      level: normalizeStatus(record.risk?.level, "low"),
      score: Number(record.risk?.score || 0)
    }
  };
}

function buildCivilizationWorldState(input = {}) {
  const generatedAt = new Date().toISOString();
  const trustedEntities = Array.isArray(input.trustedEntities?.entities) ? input.trustedEntities.entities : [];
  const colonyAgents = Array.isArray(input.agentColony?.agents) ? input.agentColony.agents : [];
  const adminTerminals = Array.isArray(input.adminCockpit?.terminals) ? input.adminCockpit.terminals : [];
  const taskLedgerTasks = Array.isArray(input.taskLedger?.tasks) ? input.taskLedger.tasks : [];
  const graphNodes = Array.isArray(input.graphSnapshot?.graph?.nodes) ? input.graphSnapshot.graph.nodes : [];
  const graphEdges = Array.isArray(input.graphSnapshot?.graph?.edges) ? input.graphSnapshot.graph.edges : [];
  const graphRecords = [
    ...(Array.isArray(input.graphSnapshot?.recent?.events) ? input.graphSnapshot.recent.events : []),
    ...(Array.isArray(input.graphSnapshot?.recent?.manifests) ? input.graphSnapshot.recent.manifests : [])
  ];

  const registry = buildEntityRegistry();
  const routes = [];
  const packets = [];

  const sovereign = registerEntity(
    registry,
    buildSovereignEntity(),
    ["asolaria-core", "runtime:asolaria-core", "agent:asolaria"]
  );
  const registerConnectorInfrastructure = (spec = {}) => {
    if (!spec.gateId || !spec.towerId) return null;
    const gate = registerEntity(
      registry,
      buildGateEntity(spec.gateId, spec.gateLabel, {
        subtype: spec.gateSubtype,
        status: spec.status,
        online: spec.online,
        trusted: true,
        owned: true,
        provider: spec.provider,
        sourceRef: spec.sourceRef,
        summary: spec.summary
      }),
      spec.gateAliases || []
    );
    const tower = registerEntity(
      registry,
      buildConnectorTowerEntity(spec.towerId, spec.towerLabel, {
        subtype: spec.towerSubtype,
        status: spec.status,
        online: spec.online,
        provider: spec.provider,
        icon: spec.icon,
        summary: spec.summary,
        sourceRef: spec.sourceRef
      }),
      spec.towerAliases || []
    );
    connectTowerToGate(tower, gate, spec.notes || `Asolaria governs ${tower.label}.`);
    return { gate, tower };
  };
  const connectTowerToGate = (towerEntity, gateEntity, notes) => {
    if (!towerEntity || !gateEntity) return;
    routes.push(buildRoute(sovereign.id, towerEntity.id, "sovereign_control", {
      status: towerEntity.status,
      lastSeenAt: generatedAt,
      notes
    }));
    routes.push(buildRoute(towerEntity.id, gateEntity.id, "guarded_portal", {
      status: gateEntity.status,
      traffic: towerEntity.hot ? 3 : 1,
      lastSeenAt: generatedAt,
      notes: `${towerEntity.label} watches and governs ${gateEntity.label}.`
    }));
  };

  const colonyGate = registerEntity(
    registry,
    buildGateEntity("agent-colony", "Agent Colony Gate", {
      subtype: "coordination_gate",
      status: input.agentColony?.relay?.running ? "online" : "degraded",
      online: Boolean(input.agentColony?.relay?.running),
      trusted: true,
      owned: true,
      provider: "bridge",
      sourceRef: cleanText(input.agentColony?.room || "asolaria_bridge", 120),
      summary: "Primary lane coordination gate."
    }),
    ["agent_colony", "colony_dashboard:agent_colony", "agent colony", "agent-colony"]
  );

  const relayGate = registerEntity(
    registry,
    buildGateEntity("bridge-relay", "Bridge Relay Gate", {
      subtype: "relay_gate",
      status: input.agentColony?.relay?.running ? "online" : "offline",
      online: Boolean(input.agentColony?.relay?.running),
      trusted: true,
      owned: true,
      provider: "bridge",
      sourceRef: cleanText(input.agentColony?.relay?.pidFilePath || "", 220)
    }),
    ["bridge-relay", "relay", "coordination_bus"]
  );
  const relayTower = registerEntity(
    registry,
    buildConnectorTowerEntity("bridge-relay", "Relay", {
      subtype: "relay_connector",
      status: relayGate.status,
      online: relayGate.online,
      provider: "bridge",
      icon: "BR",
      summary: "Coordination relay tower for named lanes.",
      sourceRef: relayGate.sourceRef
    }),
    ["tower:bridge-relay", "relay tower"]
  );

  routes.push(buildRoute(sovereign.id, colonyGate.id, "sovereign_control", {
    status: colonyGate.status,
    lastSeenAt: generatedAt,
    notes: "Asolaria governs the colony gate."
  }));
  connectTowerToGate(relayTower, relayGate, "Asolaria governs the relay tower.");

  const tunnelGate = registerEntity(
    registry,
    buildGateEntity("bridge-tunnel", "Bridge Tunnel Gate", {
      subtype: "public_internet_gate",
      status: input.agentColony?.tunnel?.running ? "online" : "offline",
      online: Boolean(input.agentColony?.tunnel?.running),
      trusted: true,
      owned: true,
      provider: "cloudflare",
      sourceRef: cleanText(input.agentColony?.tunnel?.url || "", 220)
    }),
    ["cloudflared-quick", "bridge-tunnel", "public tunnel"]
  );
  const tunnelTower = registerEntity(
    registry,
    buildConnectorTowerEntity("bridge-tunnel", "Public Tunnel", {
      subtype: "public_internet_tower",
      status: tunnelGate.status,
      online: tunnelGate.online,
      provider: "cloudflare",
      icon: "CF",
      summary: "Ingress and egress tower for external relay movement.",
      sourceRef: tunnelGate.sourceRef
    }),
    ["tower:bridge-tunnel", "public tunnel tower"]
  );
  connectTowerToGate(tunnelTower, tunnelGate, "Asolaria governs the public tunnel tower.");

  if (input.mqttStatus) {
    const mqttGate = registerEntity(
      registry,
      buildGateEntity("mqtt-bus", "MQTT Bus", {
        subtype: "telemetry_gate",
        status: input.mqttStatus.connection?.ok ? "connected" : "offline",
        online: Boolean(input.mqttStatus.connection?.ok),
        trusted: true,
        owned: true,
        provider: "mqtt",
        sourceRef: cleanText(input.mqttStatus.baseTopic || "", 220)
      }),
      ["mqtt", "mqtt-bridge", "transport:mqtt-bridge"]
    );
    const mqttTower = registerEntity(
      registry,
      buildConnectorTowerEntity("mqtt-bus", "MQTT", {
        subtype: "telemetry_tower",
        status: mqttGate.status,
        online: mqttGate.online,
        provider: "mqtt",
        icon: "MQ",
        summary: "Realtime telemetry tower for the living world state.",
        sourceRef: mqttGate.sourceRef
      }),
      ["tower:mqtt-bus", "mqtt tower"]
    );
    connectTowerToGate(mqttTower, mqttGate, "Asolaria governs the telemetry tower.");
  }

  let symphonyGate = null;
  let symphonyTower = null;
  if (input.symphonyStatus) {
    symphonyGate = registerEntity(
      registry,
      buildGateEntity("symphony", "Symphony Gate", {
        subtype: "workflow_gate",
        status: input.symphonyStatus.process?.running ? "online" : "offline",
        online: Boolean(input.symphonyStatus.process?.running),
        trusted: true,
        owned: true,
        provider: "symphony",
        sourceRef: cleanText(input.symphonyStatus.workflowPath || input.symphonyStatus.repoRoot || "", 220)
      }),
      [
        "symphony",
        "worker_lane:symphony",
        "integration:symphony",
        "service_manager:symphony-manager",
        `service_endpoint:symphony:${input.symphonyStatus.port || 4792}`
      ]
    );
    symphonyTower = registerEntity(
      registry,
      buildConnectorTowerEntity("symphony", "Symphony", {
        subtype: "workflow_tower",
        status: symphonyGate.status,
        online: symphonyGate.online,
        provider: "symphony",
        icon: "SY",
        summary: "Long-running workflow tower and issue-processing route.",
        sourceRef: symphonyGate.sourceRef
      }),
      ["tower:symphony", "symphony tower"]
    );
    connectTowerToGate(symphonyTower, symphonyGate, "Asolaria governs the long-running workflow tower.");
  }

  const swarmDeskGate = registerEntity(
    registry,
    buildGateEntity("swarmdesk-world", "SwarmDesk World Gate", {
      subtype: "swarmdesk_gate",
      status: trustedEntities.some((entity) => entity.id === "omnispindle" && entity.connected) ? "linked" : "planned",
      online: trustedEntities.some((entity) => entity.id === "omnispindle" && entity.connected),
      trusted: true,
      owned: true,
      provider: "madnessinteractive",
      sourceRef: "https://madnessinteractive.cc/dashboard"
    }),
    ["swarmdesk", "madnessinteractive", "3d_control_world"]
  );
  const swarmDeskTower = registerEntity(
    registry,
    buildConnectorTowerEntity("swarmdesk-world", "SwarmDesk", {
      subtype: "world_bridge_tower",
      status: swarmDeskGate.status,
      online: swarmDeskGate.online,
      provider: "madnessinteractive",
      icon: "SW",
      summary: "Trusted world-render tower for the 3D task civilization.",
      sourceRef: swarmDeskGate.sourceRef
    }),
    ["tower:swarmdesk-world", "swarmdesk tower"]
  );
  connectTowerToGate(swarmDeskTower, swarmDeskGate, "Asolaria governs the world-render tower.");

  const hasGeminiCloud = trustedEntities.some((entity) =>
    ["gemini-api-cloud", "vertex-gemini"].includes(String(entity?.id || "").trim())
  );
  const geminiGate = hasGeminiCloud
    ? registerEntity(
      registry,
      buildGateEntity("gemini-cloud", "Gemini Cloud Gate", {
        subtype: "cloud_gate",
        status: "linked",
        online: true,
        trusted: true,
        owned: true,
        provider: "google"
      }),
      ["gemini-cloud", "google-gemini", "cloud gate"]
    )
    : null;
  const geminiTower = geminiGate
    ? registerEntity(
      registry,
      buildConnectorTowerEntity("gemini-cloud", "Gemini Cloud", {
        subtype: "cloud_arc_tower",
        status: geminiGate.status,
        online: geminiGate.online,
        provider: "google",
        icon: "G",
        summary: "Cloud reasoning tower for Gemini and Vertex routes."
      }),
      ["tower:gemini-cloud", "gemini tower"]
    )
    : null;
  if (geminiGate) {
    connectTowerToGate(geminiTower, geminiGate, "Asolaria governs the Google cloud tower.");
  }

  trustedEntities.forEach((entity) => {
    const worldEntity = registerEntity(
      registry,
      buildTrustedSurfaceEntity(entity),
      [
        entity.id,
        entity.label,
        `${entity.kind}:${entity.id}`,
        `${entity.provider}:${entity.id}`,
        entity.id === "codex-head" ? "local_codex" : "",
        entity.id === "claude-code" ? "claude_max" : "",
        entity.id === "gemini-api-cloud" ? "gemini_api" : "",
        entity.id === "asolaria-augment-mcp" ? "augment_context" : "",
        entity.id === "symphony-service" ? "worker_lane:symphony" : ""
      ]
    );
    const topology = buildTrustedConnectorTopology(entity);
    if (topology) {
      const infrastructure = registerConnectorInfrastructure(topology);
      if (infrastructure?.gate) {
        routes.push(buildRoute(infrastructure.gate.id, worldEntity.id, topology.routeKind || "connector_mount", {
          status: worldEntity.status,
          lastSeenAt: generatedAt,
          notes: topology.routeNotes || `${worldEntity.label} is mounted behind ${infrastructure.gate.label}.`
        }));
        if (topology.parentGateAlias) {
          const parentGateId = resolveEntityId(registry, topology.parentGateAlias);
          if (parentGateId) {
            routes.push(buildRoute(parentGateId, infrastructure.gate.id, "cloud_route", {
              status: infrastructure.gate.status,
              lastSeenAt: generatedAt,
              notes: `${infrastructure.gate.label} is nested under the parent cloud gate.`
            }));
          }
        }
        if (entity.id === "omnispindle") {
          routes.push(buildRoute(infrastructure.gate.id, swarmDeskGate.id, "world_bridge", {
            status: worldEntity.status,
            lastSeenAt: generatedAt,
            notes: "Omnispindle bridges the Asolaria civilization into SwarmDesk."
          }));
        }
      }
    }
    if (entity.id === "symphony-service" && symphonyGate) {
      routes.push(buildRoute(symphonyGate.id, worldEntity.id, "workflow_mount", {
        status: worldEntity.status,
        lastSeenAt: generatedAt,
        notes: "Symphony service is mounted behind the Symphony gate."
      }));
    }
    if (entity.id === "codex-head") {
      routes.push(buildRoute(sovereign.id, worldEntity.id, "reasoning", {
        status: worldEntity.status,
        notes: "Primary head-model path.",
        lastSeenAt: generatedAt
      }));
    }
    if (entity.id === "omnispindle") {
      routes.push(buildRoute(worldEntity.id, resolveEntityId(registry, "swarmdesk", "swarmdesk-world"), "world_bridge", {
        status: worldEntity.status,
        notes: "Trusted bridge into the MadnessInteractive world.",
        lastSeenAt: generatedAt
      }));
    }
    if (geminiGate && (entity.id === "gemini-api-cloud" || entity.id === "vertex-gemini")) {
      routes.push(buildRoute(geminiGate.id, worldEntity.id, "cloud_route", {
        status: worldEntity.status,
        notes: "Google cloud surface mounted behind the Gemini gate.",
        lastSeenAt: generatedAt
      }));
    }
  });

  colonyAgents.forEach((agent) => {
    if (String(agent?.id || "").trim().toLowerCase() === "asolaria") {
      return;
    }
    const worldAgent = registerEntity(
      registry,
      buildColonyAgentEntity(agent),
      [
        agent.id,
        agent.name,
        `${agent.plane || "lane"}:${agent.id}`,
        `agent:${agent.id}`
      ]
    );
    routes.push(buildRoute(colonyGate.id, worldAgent.id, "colony_route", {
      status: worldAgent.status,
      traffic: worldAgent.hot ? 3 : 1,
      lastSeenAt: agent.lastSeenAt || generatedAt,
      notes: "Observed live lane or admin-terminal route."
    }));
  });

  adminTerminals.forEach((terminal) => {
    const tower = registerEntity(
      registry,
      buildTowerEntity(terminal),
      [
        terminal.id,
        `${terminal.id}_tower`,
        `terminal_sidecar:${terminal.id}_sidecar`,
        `${terminal.name} tower`
      ]
    );
    const agentId = resolveEntityId(registry, terminal.id, `agent:${terminal.id}`);
    if (agentId) {
      routes.push(buildRoute(agentId, tower.id, "guardian_link", {
        status: tower.status,
        traffic: tower.hot ? 3 : 1,
        lastSeenAt: terminal.lastSeenAt || generatedAt,
        notes: "Guardian agent attached to its tower."
      }));
      routes.push(buildRoute(tower.id, colonyGate.id, "guarded_portal", {
        status: tower.status,
        traffic: tower.hot ? 3 : 1,
        lastSeenAt: terminal.lastSeenAt || generatedAt,
        notes: "Tower watches ingress and egress for the colony."
      }));
    }
    const packetEntity = buildPacketEntityFromTerminal(terminal);
    if (packetEntity) {
      const registeredPacket = registerEntity(
        registry,
        packetEntity,
        [packetEntity.sourceRef, packetEntity.label]
      );
      packets.push(registeredPacket);
      routes.push(buildRoute(tower.id, registeredPacket.id, "packet_carry", {
        status: registeredPacket.status,
        traffic: registeredPacket.hot ? 3 : 1,
        packetId: registeredPacket.id,
        lastSeenAt: terminal.lastSeenAt || generatedAt,
        notes: "Active mission packet carried by a guardian tower."
      }));
    }
  });

  const prioritizedTaskLedgerTasks = [
    ...taskLedgerTasks.filter((task) => {
      const status = normalizeStatus(task?.status, "planned");
      return !["done", "archived", "canceled"].includes(status);
    }),
    ...taskLedgerTasks.filter((task) => {
      const status = normalizeStatus(task?.status, "planned");
      return ["done", "archived", "canceled"].includes(status);
    })
  ];

  prioritizedTaskLedgerTasks
    .forEach((task) => {
      const taskEntity = registerEntity(
        registry,
        buildTaskEntity(task),
        [task.id, task.title]
      );
      if (taskEntity.online) {
        routes.push(buildRoute(colonyGate.id, taskEntity.id, "task_route", {
          status: taskEntity.status,
          traffic: taskEntity.hot ? 2 : 1,
          lastSeenAt: task.updatedAt || task.createdAt || generatedAt,
          notes: "Task tracked in the canonical ledger."
        }));
      }
    });

  graphNodes.forEach((node) => {
    const existingId = resolveEntityId(registry, ...nodeAliasCandidates(node));
    if (existingId) return;
    registerEntity(
      registry,
      buildFallbackGraphEntity(node),
      nodeAliasCandidates(node)
    );
  });

  graphEdges.forEach((edge) => {
    const sourceId = resolveEntityId(registry, edge.source, String(edge.source || "").split(":").slice(-1)[0]);
    const targetId = resolveEntityId(registry, edge.target, String(edge.target || "").split(":").slice(-1)[0]);
    if (!sourceId || !targetId) return;
    routes.push(buildRoute(sourceId, targetId, "observed_route", {
      status: edge.freshnessBand === "hot" ? "active" : "observed",
      riskLevel: edge.maxRiskLevel,
      riskScore: edge.maxRiskScore,
      traffic: edge.count,
      action: Array.isArray(edge.actions) ? edge.actions[0] : "",
      lastSeenAt: edge.lastSeen,
      sourceRef: edge.id
    }));
  });

  // Federation: remote sub-colony nodes
  const remoteNodes = Array.isArray(input.remoteNodes) ? input.remoteNodes : [];
  const onlineRemoteNodes = remoteNodes.filter((n) => n && n.status === "online");
  let federationGate = null;
  if (remoteNodes.length > 0) {
    federationGate = registerEntity(
      registry,
      buildFederationGateEntity({
        online: onlineRemoteNodes.length > 0,
        status: onlineRemoteNodes.length > 0 ? "online" : "offline",
        nodeCount: remoteNodes.length,
        summary: `Federation gate coordinating ${remoteNodes.length} sub-colony node(s).`
      }),
      ["federation", "federation_gate", "colony_network"]
    );
    routes.push(buildRoute(sovereign.id, federationGate.id, "federation_control", {
      status: federationGate.status,
      lastSeenAt: generatedAt,
      notes: "Sovereign controls the federation gate."
    }));
    remoteNodes.forEach((node) => {
      if (!node || !node.nodeId) return;
      const subColony = registerEntity(
        registry,
        buildSubColonyEntity(node.nodeId, {
          online: node.status === "online",
          status: node.status || "offline",
          hot: node.hasHealth && node.status === "online",
          capabilities: node.capabilities,
          sourceRef: `node:${node.nodeId}`,
          summary: `Sub-colony ${node.nodeId} — health: ${node.hasHealth ? "yes" : "no"}, colony: ${node.hasColony ? "yes" : "no"}`
        }),
        [`node:${node.nodeId}`, `sub_colony:${node.nodeId}`, node.nodeId]
      );
      routes.push(buildRoute(federationGate.id, subColony.id, "colony_federation_route", {
        status: subColony.status,
        traffic: subColony.hot ? 3 : 1,
        lastSeenAt: node.lastSeenAt || generatedAt,
        notes: `Federation route to sub-colony ${node.nodeId}.`
      }));
    });
  }

  const dedupedRoutes = [];
  const seenRouteIds = new Set();
  routes.forEach((route) => {
    if (!route?.id || seenRouteIds.has(route.id)) return;
    seenRouteIds.add(route.id);
    dedupedRoutes.push(route);
  });

  const events = graphRecords
    .slice(-40)
    .map((record) => buildCivilizationEvent(record, registry))
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  const riskSummary = dedupedRoutes.reduce((acc, route) => {
    const level = normalizeStatus(route.riskLevel, "low");
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0 });

  const entities = registry.entities.slice().sort((a, b) =>
    (Number(b.hot) - Number(a.hot))
    || (Number(b.online) - Number(a.online))
    || String(a.label || "").localeCompare(String(b.label || ""))
  );

  const countsByKind = entities.reduce((acc, entity) => {
    const kind = normalizeStatus(entity.kind, "entity");
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  const projectedTaskEntities = entities.filter((entity) => entity.kind === "task");
  const openTaskEntities = projectedTaskEntities.filter((entity) => entity.online);

  const districtCounts = entities.reduce((acc, entity) => {
    const district = normalizeStatus(entity.district, "workshop");
    acc[district] = (acc[district] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    schemaVersion: "1.0",
    generatedAt,
    worldview: "asolaria_civilization_world",
    summary: {
      entities: entities.length,
      agents: countsByKind.agent || 0,
      towers: countsByKind.tower || 0,
      gates: countsByKind.gate || 0,
      packets: countsByKind.packet || 0,
      tasks: openTaskEntities.length,
      projectedTasks: projectedTaskEntities.length,
      closedTaskProjections: Math.max(0, projectedTaskEntities.length - openTaskEntities.length),
      routes: dedupedRoutes.length,
      events: events.length,
      onlineEntities: entities.filter((entity) => entity.online).length,
      hotEntities: entities.filter((entity) => entity.hot).length,
      riskRoutes: riskSummary
    },
    districts: buildDistricts().map((district) => ({
      ...district,
      count: Number(districtCounts[district.id] || 0)
    })),
    entities,
    routes: dedupedRoutes,
    packets,
    events,
    projections: {
      graph: {
        visibleNodes: graphNodes.length,
        visibleEdges: graphEdges.length,
        visibleEvents: Array.isArray(input.graphSnapshot?.records?.events) ? input.graphSnapshot.records.events.length : 0,
        visibleManifests: Array.isArray(input.graphSnapshot?.records?.manifests) ? input.graphSnapshot.records.manifests.length : 0
      },
      colony: {
        total: asInt(input.agentColony?.counts?.total, 0),
        online: asInt(input.agentColony?.counts?.online, 0),
        active: asInt(input.agentColony?.counts?.active, 0)
      },
      taskLedger: {
        totalTasks: asInt(input.taskLedger?.summary?.totalTasks, 0),
        openTasks: asInt(input.taskLedger?.summary?.openTasks, 0),
        activeTasks: asInt(input.taskLedger?.summary?.activeTasks, 0)
      },
      federation: {
        total: remoteNodes.length,
        online: onlineRemoteNodes.length
      }
    },
    notes: [
      "Guardian towers are derived from Helm and Sentinel admin sidecars.",
      "Connector towers now represent Codex, Claude Max, Omnispindle, Augment Context, Gemini API, Vertex, Symphony, MQTT, SwarmDesk, relay, and tunnel boundaries.",
      "Packets are modeled as carried work bundles tied to active mission files.",
      "The world state is a projection of the canonical runtime, not the source of truth."
    ]
  };
}

module.exports = {
  buildCivilizationWorldState
};
