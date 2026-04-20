const fs = require("node:fs");
const path = require("node:path");

const { resolveDataPath } = require("../runtimePaths");
const { resolveToolPaths } = require("./systemPaths");
const { runCodex } = require("./codexConnector");
const { runAnthropicCli } = require("./anthropicCliConnector");
const {
  getAbacusIntegrationStatus,
  getAbacusOperatingStrategy,
  createAbacusWorkPacket
} = require("./abacusConnector");
const {
  getSymphonyIntegrationStatus,
  submitSymphonyWorkItem
} = require("./symphonyConnector");
const { getAugmentContextStatus } = require("./augmentContextConnector");
const { getGeminiApiConfigSummary } = require("./geminiApiConnector");
const { publishMqttMessage } = require("./mqttConnector");
const {
  createTaskLedgerTask,
  getTaskLedgerTask,
  updateTaskLedgerTask,
  addTaskLedgerEvent
} = require("../taskLedgerStore");
const {
  getTaskLeaseLedgerSummary,
  listTaskLeases
} = require("../taskLeaseLedgerStore");
const {
  buildLeaseSummary,
  getDispatchLeaseSummary,
  hydrateDispatchRecord,
  createDispatchContext,
  updateDispatchLease
} = require("./workerRouterLease");
const { getProjectById } = require("../projectStore");
const { recommendTaskLane, normalizeLaneId } = require("../laneRegistry");
const { getRemoteNodesSummary } = require("../remoteNodeRegistry");

const ROUTER_ROOT = resolveDataPath("integrations", "worker-router");
const ROUTER_DISPATCH_ROOT = path.join(ROUTER_ROOT, "dispatches");
const WORKER_IDS = Object.freeze(["local_codex", "claude_max", "abacus", "symphony", "shared_compute"]);
const TASK_TYPES = new Set(["quick_chore", "patch", "review", "research", "orchestration", "long_running", "issue_execution"]);
const SENSITIVITY_LEVELS = new Set(["public", "sanitized", "internal", "privileged", "owner_plane"]);
const SIZE_LEVELS = new Set(["small", "medium", "large"]);

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function clipText(value, maxChars = 240) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function safeWriteText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function normalizeSlug(value, fallback = "dispatch") {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function normalizeTaskType(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return TASK_TYPES.has(normalized) ? normalized : "quick_chore";
}

function normalizeSensitivity(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return SENSITIVITY_LEVELS.has(normalized) ? normalized : "sanitized";
}

function normalizeSize(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return SIZE_LEVELS.has(normalized) ? normalized : "medium";
}

function normalizeWorkerId(value) {
  const normalized = cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "codex") return "local_codex";
  if (normalized === "claude" || normalized === "anthropic") return "claude_max";
  if (normalized === "shared-compute") return "shared_compute";
  return WORKER_IDS.includes(normalized) ? normalized : "";
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const lowered = cleanText(value).toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function normalizeTimeoutMs(value, fallback = 240000, min = 15000, max = 1800000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeList(value, maxItems = 16) {
  if (Array.isArray(value)) {
    return value.map((item) => clipText(item, 260)).filter(Boolean).slice(0, maxItems);
  }
  return cleanText(value)
    .split(/\r?\n|,/)
    .map((item) => clipText(item, 260))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeExecutor(value) {
  return cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeSharedComputeSpec(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    nodeId: cleanText(source.nodeId || source.targetNodeId || "", 120).toLowerCase(),
    executor: normalizeExecutor(source.executor),
    args: Array.isArray(source.args)
      ? source.args.map((item) => cleanText(item, 800)).filter(Boolean).slice(0, 40)
      : [],
    workingDirectory: cleanText(source.workingDirectory || "", 1200),
    timeoutMs: normalizeTimeoutMs(source.timeoutMs, 60000, 1000, 900000),
    command: cleanText(source.command || "", 1200)
  };
}

function buildSharedComputeProfile() {
  const remoteNodesSummary = getRemoteNodesSummary();
  const readyNodes = Array.isArray(remoteNodesSummary.nodes)
    ? remoteNodesSummary.nodes.filter((node) => Boolean(node?.routing?.dispatchReady))
    : [];
  return {
    id: "shared_compute",
    title: "Shared Compute",
    available: readyNodes.length > 0,
    dispatchable: readyNodes.length > 0,
    directDispatchSupported: true,
    strengths: [
      "Cross-node bounded execution for allowlisted commands and processor sharing.",
      "Best fit when a remote sub-colony already advertises a ready lane."
    ],
    limitations: [
      "Requires MQTT bridge health and a remote node that has declared dispatch-ready lanes.",
      "Execution stays bounded to allowlisted executors and explicit working directories."
    ],
    mistakes: [
      "Do not treat federation advice as authority; task and lease visibility must stay local.",
      "Do not send owner-plane secrets or broad uncontrolled write context into shared compute."
    ]
  };
}

function buildLocalCodexProfile() {
  const toolPaths = resolveToolPaths();
  const available = Boolean(toolPaths.codexPath);
  return {
    id: "local_codex",
    title: "Local Codex",
    available,
    dispatchable: available,
    directDispatchSupported: available,
    strengths: [
      "Highest-trust local coding and repo execution lane.",
      "Best fit for privileged or owner-plane scoped work."
    ],
    limitations: [
      "Local runtime only; long or parallel jobs can consume local machine budget."
    ],
    mistakes: [
      "Do not default local Codex to external chores when a cheaper bounded worker would do."
    ]
  };
}

function buildClaudeMaxProfile() {
  const toolPaths = resolveToolPaths();
  const available = Boolean(toolPaths.claudePath);
  return {
    id: "claude_max",
    title: "Claude Max Review",
    available,
    dispatchable: available,
    directDispatchSupported: available,
    strengths: [
      "Fast strong review lane for bounded advisory work."
    ],
    limitations: [
      "This lane is review-first and not the owner-plane mutation path."
    ],
    mistakes: [
      "Do not offload final repo ownership decisions to Claude Max."
    ]
  };
}

function buildAbacusProfile() {
  const status = getAbacusIntegrationStatus();
  const strategy = getAbacusOperatingStrategy();
  const dispatchable = Boolean(status?.capabilities?.browser?.ready || status?.surfaces?.desktop?.installed);
  return {
    id: "abacus",
    title: "Abacus",
    available: dispatchable,
    dispatchable,
    directDispatchSupported: true,
    strengths: [
      "Bounded external worker for quick chores and research packets."
    ],
    limitations: [
      "CLI is not a reliable unattended headless worker on this machine."
    ],
    mistakes: Array.isArray(strategy?.knownIssues) && strategy.knownIssues.length
      ? strategy.knownIssues.slice(0, 6)
      : [
          "Do not treat Abacus output as source-of-truth until it returns to Asolaria."
        ]
  };
}

function buildSymphonyProfile() {
  const status = getSymphonyIntegrationStatus();
  const configured = Boolean(status?.configured);
  return {
    id: "symphony",
    title: "Symphony",
    available: configured,
    dispatchable: configured,
    directDispatchSupported: configured,
    strengths: [
      "Best long-running issue/workspace lane when work should land in Linear."
    ],
    limitations: [
      "Pickup still depends on Symphony service health and its own queue."
    ],
    mistakes: [
      "Do not route urgent single-shot chores into Symphony when a direct lane is available."
    ]
  };
}

function getWorkerProfiles() {
  return [
    buildLocalCodexProfile(),
    buildClaudeMaxProfile(),
    buildAbacusProfile(),
    buildSymphonyProfile(),
    buildSharedComputeProfile()
  ];
}

function getWorkerProfile(workerId) {
  return getWorkerProfiles().find((item) => item.id === workerId) || null;
}

function getRemoteNodeReadyCandidates(laneId) {
  const remoteNodesSummary = getRemoteNodesSummary();
  const nodes = Array.isArray(remoteNodesSummary.nodes) ? remoteNodesSummary.nodes : [];
  return nodes.filter((node) => {
    const readyLaneIds = Array.isArray(node?.routing?.readyLaneIds) ? node.routing.readyLaneIds : [];
    return Boolean(node?.routing?.dispatchReady) && readyLaneIds.includes(laneId);
  });
}

function buildFederationRecommendation(input = {}) {
  const laneId = input.laneId || recommendTaskLane(input);
  const remoteNodesSummary = getRemoteNodesSummary();
  const nodes = Array.isArray(remoteNodesSummary.nodes) ? remoteNodesSummary.nodes : [];
  const readyCandidates = getRemoteNodeReadyCandidates(laneId);
  const declaredCandidates = nodes.filter((node) => {
    const declaredLaneIds = Array.isArray(node?.routing?.declaredLaneIds) ? node.routing.declaredLaneIds : [];
    return declaredLaneIds.includes(laneId);
  });
  const selected = input.sharedCompute?.nodeId
    ? readyCandidates.find((node) => node.nodeId === input.sharedCompute.nodeId) || null
    : readyCandidates[0] || null;
  const reasons = [];
  const warnings = [];

  if (selected) {
    reasons.push(`Federation node "${selected.nodeId}" is ready for lane ${laneId}.`);
  } else if (declaredCandidates.length > 0) {
    warnings.push(`Federation declares lane ${laneId} on ${declaredCandidates.map((node) => node.nodeId).join(", ")}, but none are currently ready.`);
  } else {
    warnings.push(`No federation node currently exports lane ${laneId}.`);
  }

  return {
    laneId,
    selectedNodeId: selected?.nodeId || "",
    candidateCount: readyCandidates.length,
    declaredCandidateCount: declaredCandidates.length,
    candidates: readyCandidates.slice(0, 5).map((node) => ({
      nodeId: node.nodeId,
      status: node.status,
      phoneMode: node.capabilities?.phoneMode || "",
      subColonyClass: node.capabilities?.subColonyClass || "",
      readyLaneIds: Array.isArray(node.routing?.readyLaneIds) ? node.routing.readyLaneIds.slice(0, 12) : []
    })),
    reasons,
    warnings
  };
}

function getWorkerRouterStatus() {
  const workers = getWorkerProfiles();
  const toolPaths = resolveToolPaths();
  const abacus = getAbacusIntegrationStatus();
  const symphony = getSymphonyIntegrationStatus();
  const augment = getAugmentContextStatus();
  const geminiApi = getGeminiApiConfigSummary();
  const qddProject = getProjectById("qdd", { includeArchived: true });
  const activeLeases = listTaskLeases({ status: "active", limit: 8 }).map((lease) => buildLeaseSummary(lease));
  const queuedLeases = listTaskLeases({ status: "queued", limit: 8 }).map((lease) => buildLeaseSummary(lease));
  const remoteNodesSummary = getRemoteNodesSummary();
  return {
    generatedAt: nowIso(),
    defaultWorker: "local_codex",
    workers,
    leaseLedger: {
      summary: getTaskLeaseLedgerSummary(),
      activeLeases,
      queuedLeases
    },
    federation: {
      totalNodes: Number(remoteNodesSummary.total || 0),
      onlineNodes: Number(remoteNodesSummary.online || 0),
      declaredNodes: Array.isArray(remoteNodesSummary.nodes)
        ? remoteNodesSummary.nodes.filter((node) => Boolean(node?.capabilities?.declared)).length
        : 0,
      readyNodes: Array.isArray(remoteNodesSummary.nodes)
        ? remoteNodesSummary.nodes.filter((node) => Boolean(node?.routing?.dispatchReady)).length
        : 0
    },
    integrationSummary: {
      localCodexAvailable: Boolean(toolPaths.codexPath),
      claudeMaxReady: Boolean(toolPaths.claudePath),
      abacusReady: Boolean(abacus?.capabilities?.browser?.ready || abacus?.surfaces?.desktop?.installed),
      symphonyConfigured: Boolean(symphony?.configured),
      symphonyRunning: Boolean(symphony?.process?.running),
      augmentContextReady: Boolean(augment?.configured),
      augmentContextMode: String(augment?.mode || ""),
      geminiApiConfigured: Boolean(geminiApi?.configured),
      qddProjectRegistered: Boolean(qddProject && !qddProject.archived),
      sharedComputeReady: Array.isArray(remoteNodesSummary.nodes)
        ? remoteNodesSummary.nodes.some((node) => Boolean(node?.routing?.dispatchReady))
        : false
    },
    coordinationSurfaces: [
      { id: "shared_compute", role: "federated_compute_manager", ready: workers.some((worker) => worker.id === "shared_compute" && worker.dispatchable), writeCapable: true },
      { id: "claude_max", role: "review_lane", ready: Boolean(toolPaths.claudePath), writeCapable: false },
      { id: "augment_context", role: "read_only_sidecar", ready: Boolean(augment?.configured), writeCapable: false },
      { id: "gemini_api", role: "alternate_brain", ready: Boolean(geminiApi?.configured), writeCapable: false },
      { id: "symphony", role: "long_running_issue_lane", ready: Boolean(symphony?.configured), writeCapable: false }
    ],
    knownIssues: [
      "Shared compute stays bounded to allowlisted executors and explicit working directories.",
      "Federated execution does not widen authority; task and lease state remains local and visible.",
      "Claude Max is a review lane here, not the owner-plane write authority.",
      "Abacus dispatch remains a packet handoff on this node when direct automation is not ready."
    ]
  };
}

function normalizeRouterInput(input = {}) {
  const title = clipText(input.title || "", 220);
  const objective = clipText(input.objective || input.prompt || input.description || "", 6000);
  if (!title && !objective) {
    throw new Error("Worker routing requires a title or objective.");
  }
  return {
    title: title || clipText(objective, 140),
    objective,
    taskType: normalizeTaskType(input.taskType),
    sensitivity: normalizeSensitivity(input.sensitivity),
    size: normalizeSize(input.size),
    allowedPaths: normalizeList(input.allowedPaths || input.paths, 24),
    preferredWorker: normalizeWorkerId(input.preferredWorker || input.workerId),
    laneId: normalizeLaneId(input.laneId || input.lane),
    requiresRepoWrite: normalizeBool(input.requiresRepoWrite, normalizeTaskType(input.taskType) === "patch"),
    needsCloudWorker: normalizeBool(input.needsCloudWorker, normalizeTaskType(input.taskType) === "research"),
    needsLongRunning: normalizeBool(input.needsLongRunning, ["long_running", "issue_execution"].includes(normalizeTaskType(input.taskType))),
    needsInteractiveCanvas: normalizeBool(input.needsInteractiveCanvas, normalizeTaskType(input.taskType) === "orchestration"),
    executeNow: normalizeBool(input.executeNow, false),
    timeoutMs: normalizeTimeoutMs(input.timeoutMs, 240000),
    launchDesktop: normalizeBool(input.launchDesktop, false),
    ensureService: normalizeBool(input.ensureService, true),
    projectScope: normalizeSlug(input.projectScope || "worker-router", "worker-router"),
    instructions: clipText(input.instructions || "", 6000),
    expectedArtifacts: normalizeList(input.expectedArtifacts || input.artifacts, 16),
    presetId: cleanText(input.presetId || ""),
    taskId: cleanText(input.taskId || ""),
    sharedCompute: normalizeSharedComputeSpec(input.sharedCompute || input)
  };
}

function recommendWorker(input = {}) {
  const normalized = normalizeRouterInput(input);
  const profiles = getWorkerProfiles();
  const byId = new Map(profiles.map((item) => [item.id, item]));
  const reasons = [];
  const warnings = [];
  const federation = buildFederationRecommendation(normalized);
  let recommendedWorkerId = "local_codex";
  let fallbackWorkerId = "claude_max";

  if (normalized.preferredWorker && byId.get(normalized.preferredWorker)?.dispatchable) {
    recommendedWorkerId = normalized.preferredWorker;
    reasons.push(`Preferred worker "${normalized.preferredWorker}" is available.`);
  } else if ((normalized.sensitivity === "privileged" || normalized.sensitivity === "owner_plane") && byId.get("local_codex")?.dispatchable) {
    recommendedWorkerId = "local_codex";
    fallbackWorkerId = byId.get("claude_max")?.dispatchable ? "claude_max" : "abacus";
    reasons.push("Privileged or owner-plane work should stay on the highest-trust local lane.");
  } else if (federation.selectedNodeId && normalized.laneId && byId.get("shared_compute")?.dispatchable) {
    recommendedWorkerId = "shared_compute";
    fallbackWorkerId = "local_codex";
    reasons.push(`Federation node "${federation.selectedNodeId}" is ready for lane ${federation.laneId}.`);
  } else if (normalized.taskType === "review" && byId.get("claude_max")?.dispatchable) {
    recommendedWorkerId = "claude_max";
    fallbackWorkerId = "local_codex";
    reasons.push("Review work benefits from a fast dedicated Claude Max analysis lane.");
  } else if (normalized.needsLongRunning && byId.get("symphony")?.dispatchable) {
    recommendedWorkerId = "symphony";
    fallbackWorkerId = byId.get("local_codex")?.dispatchable ? "local_codex" : "abacus";
    reasons.push("Long-running or issue-like work fits Symphony best when it is configured.");
  } else if ((normalized.taskType === "research" || normalized.taskType === "quick_chore" || normalized.needsCloudWorker || normalized.needsInteractiveCanvas) && byId.get("abacus")?.dispatchable) {
    recommendedWorkerId = "abacus";
    fallbackWorkerId = "local_codex";
    reasons.push("This task shape benefits from a bounded external worker surface.");
  } else {
    recommendedWorkerId = "local_codex";
    fallbackWorkerId = byId.get("claude_max")?.dispatchable ? "claude_max" : "abacus";
    reasons.push("Local Codex is the safest general-purpose default lane.");
  }

  if (normalized.requiresRepoWrite && recommendedWorkerId !== "local_codex" && recommendedWorkerId !== "shared_compute") {
    warnings.push("Repo mutation should stay on the local or explicitly bounded write lane.");
  }
  warnings.push(...federation.warnings);

  const recommendedWorker = byId.get(recommendedWorkerId) || buildLocalCodexProfile();
  const fallbackWorker = byId.get(fallbackWorkerId) || null;
  return {
    generatedAt: nowIso(),
    input: normalized,
    recommendedWorkerId,
    fallbackWorkerId: fallbackWorker?.id || "",
    recommendedWorker,
    fallbackWorker,
    reasons,
    warnings,
    federation,
    mistakes: recommendedWorker?.mistakes || [],
    limitations: recommendedWorker?.limitations || [],
    directDispatchSupported: Boolean(recommendedWorker?.directDispatchSupported),
    presetId: normalized.presetId || ""
  };
}

function buildDispatchId(title) {
  return `${nowIso().replace(/[-:TZ.]/g, "").slice(0, 14)}-${normalizeSlug(title, "worker-dispatch")}`;
}

function ensureDispatchFolder(dispatchId) {
  const folderPath = path.join(ROUTER_DISPATCH_ROOT, dispatchId);
  ensureDir(folderPath);
  return folderPath;
}

function addDispatchTaskEvent(context, input = {}) {
  return addTaskLedgerEvent(context.task.id, {
    ...input,
    detail: {
      ...(input.detail && typeof input.detail === "object" ? input.detail : {}),
      leaseId: context.leaseId
    }
  });
}

function updateDispatchTask(context, patch = {}, options = {}) {
  const nextPatch = { ...patch };
  if (context.leaseId && !Object.prototype.hasOwnProperty.call(nextPatch, "lastLeaseId")) {
    nextPatch.lastLeaseId = context.leaseId;
  }
  return updateTaskLedgerTask(context.task.id, nextPatch, options);
}

function writeDispatchDoc(dispatchFolder, payload) {
  safeWriteJson(path.join(dispatchFolder, "dispatch.json"), payload);
}

function ensureDispatchTask(recommendation, dispatchId, workerId) {
  const existing = recommendation.input.taskId ? getTaskLedgerTask(recommendation.input.taskId) : null;
  if (existing) {
    updateTaskLedgerTask(existing.id, {
      assigneeId: workerId,
      owner: workerId,
      originKind: "worker_dispatch",
      originId: dispatchId,
      projectScope: recommendation.input.projectScope
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "worker_dispatch_attached",
      note: `Attached worker dispatch ${dispatchId} to existing task.`
    });
    return getTaskLedgerTask(existing.id);
  }
  return createTaskLedgerTask({
    title: recommendation.input.title,
    description: recommendation.input.objective || recommendation.input.title,
    projectScope: recommendation.input.projectScope || "worker-router",
    status: "planned",
    priority: recommendation.input.sensitivity === "owner_plane" ? "high" : "normal",
    owner: workerId,
    assigneeId: workerId,
    originKind: "worker_dispatch",
    originId: dispatchId,
    source: "worker-router",
    tags: [workerId, recommendation.input.taskType, recommendation.input.sensitivity]
  }).task;
}

async function dispatchToLocalCodex(input, recommendation, context) {
  const promptPath = path.join(context.dispatchFolder, "prompt.txt");
  const responsePath = path.join(context.dispatchFolder, "response.txt");
  const prompt = [
    `Objective: ${input.objective || input.title}`,
    input.instructions ? `Instructions:\n${input.instructions}` : "",
    input.allowedPaths.length ? `Allowed paths:\n- ${input.allowedPaths.join("\n- ")}` : "",
    `Task type: ${input.taskType}`,
    `Sensitivity: ${input.sensitivity}`,
    `Size: ${input.size}`
  ].filter(Boolean).join("\n\n");
  safeWriteText(promptPath, prompt);

  if (!input.executeNow) {
    addDispatchTaskEvent(context, {
      type: "worker_queued",
      actor: "worker-router",
      source: "worker-router",
      note: "Local Codex dispatch queued.",
      detail: { workerId: "local_codex", promptPath }
    });
    updateDispatchTask(context, {
      status: "ready",
      progress: 0
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_ready",
      note: "Local Codex dispatch queued."
    });
    return {
      dispatchMode: "queued_local",
      resultSummary: "Local Codex task queued.",
      promptPath,
      leaseStatus: context.leaseStatus
    };
  }

  try {
    updateDispatchTask(context, {
      status: "in_progress",
      progress: 10
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_started",
      note: "Local Codex dispatch started."
    });
    const run = await runCodex({ prompt }, input.timeoutMs);
    safeWriteText(responsePath, String(run?.reply || ""));
    updateDispatchLease(context, {
      status: "completed",
      runId: context.dispatchId,
      artifactPath: responsePath
    }, {
      type: "lease_completed",
      note: "Local Codex dispatch completed."
    });
    addDispatchTaskEvent(context, {
      type: "worker_completed",
      actor: "worker-router",
      source: "worker-router",
      note: "Local Codex dispatch completed.",
      detail: { workerId: "local_codex", responsePath }
    });
    updateDispatchTask(context, {
      status: "review",
      progress: 100
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_review_ready",
      note: "Local Codex result ready for review."
    });
    return {
      dispatchMode: "direct_run",
      resultSummary: "Local Codex dispatch completed.",
      promptPath,
      responsePath,
      reply: cleanText(run?.reply, 4000),
      leaseStatus: context.leaseStatus
    };
  } catch (error) {
    const message = clipText(error?.message || error, 240);
    updateDispatchLease(context, {
      status: "failed",
      handoffReason: message,
      artifactPath: promptPath
    }, {
      type: "lease_failed",
      note: `Local Codex failed: ${message}`
    });
    updateDispatchTask(context, {
      status: "blocked",
      progress: 0
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_blocked",
      note: `Local Codex failed: ${message}`
    });
    addDispatchTaskEvent(context, {
      type: "worker_failed",
      actor: "worker-router",
      source: "worker-router",
      note: `Local Codex failed: ${message}`,
      detail: { workerId: "local_codex" }
    });
    throw error;
  }
}

async function dispatchToClaudeMax(input, context) {
  const promptPath = path.join(context.dispatchFolder, "prompt.txt");
  const responsePath = path.join(context.dispatchFolder, "response.txt");
  const prompt = [
    `Objective: ${input.objective || input.title}`,
    input.instructions ? `Instructions:\n${input.instructions}` : "",
    `Task type: ${input.taskType}`,
    `Sensitivity: ${input.sensitivity}`
  ].filter(Boolean).join("\n\n");
  safeWriteText(promptPath, prompt);

  if (!input.executeNow) {
    addDispatchTaskEvent(context, {
      type: "worker_queued",
      actor: "worker-router",
      source: "worker-router",
      note: "Claude Max review queued.",
      detail: { workerId: "claude_max", promptPath }
    });
    updateDispatchTask(context, {
      status: "ready"
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_ready",
      note: "Claude Max review queued."
    });
    return {
      dispatchMode: "queued_review",
      resultSummary: "Claude Max review queued.",
      promptPath,
      leaseStatus: context.leaseStatus
    };
  }

  try {
    const run = await runAnthropicCli(prompt, {
      timeoutMs: input.timeoutMs
    });
    safeWriteText(responsePath, String(run?.reply || ""));
    updateDispatchLease(context, {
      status: "completed",
      runId: context.dispatchId,
      artifactPath: responsePath
    }, {
      type: "lease_completed",
      note: "Claude Max review completed."
    });
    addDispatchTaskEvent(context, {
      type: "worker_completed",
      actor: "worker-router",
      source: "worker-router",
      note: "Claude Max review completed.",
      detail: { workerId: "claude_max", responsePath }
    });
    updateDispatchTask(context, {
      status: "review",
      progress: 100
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_review_ready",
      note: "Claude Max result ready for review."
    });
    return {
      dispatchMode: "direct_review",
      resultSummary: "Claude Max review completed.",
      promptPath,
      responsePath,
      reply: cleanText(run?.reply, 4000),
      leaseStatus: context.leaseStatus
    };
  } catch (error) {
    const message = clipText(error?.message || error, 240);
    updateDispatchLease(context, {
      status: "failed",
      handoffReason: message,
      artifactPath: promptPath
    }, {
      type: "lease_failed",
      note: `Claude Max failed: ${message}`
    });
    updateDispatchTask(context, {
      status: "blocked",
      progress: 0
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_blocked",
      note: `Claude Max failed: ${message}`
    });
    addDispatchTaskEvent(context, {
      type: "worker_failed",
      actor: "worker-router",
      source: "worker-router",
      note: `Claude Max failed: ${message}`,
      detail: { workerId: "claude_max" }
    });
    throw error;
  }
}

async function dispatchToAbacus(input, recommendation, context) {
  const packet = createAbacusWorkPacket({
    title: input.title,
    objective: input.objective,
    instructions: input.instructions,
    allowedPaths: input.allowedPaths,
    expectedArtifacts: input.expectedArtifacts,
    presetId: recommendation.presetId || undefined,
    taskId: context.task.id
  });
  const packetPath = path.join(context.dispatchFolder, "abacus-packet.json");
  safeWriteJson(packetPath, packet);
  addDispatchTaskEvent(context, {
    type: "worker_queued",
    actor: "worker-router",
    source: "worker-router",
    note: "Abacus packet prepared.",
    detail: { workerId: "abacus", packetPath }
  });
  updateDispatchTask(context, {
    status: "ready"
  }, {
    actor: "worker-router",
    source: "worker-router",
    type: "task_ready",
    note: "Abacus packet prepared."
  });
  return {
    dispatchMode: "packet_handoff",
    resultSummary: "Abacus packet prepared.",
    packetPath,
    leaseStatus: context.leaseStatus
  };
}

async function dispatchToSymphony(input, context) {
  if (!input.executeNow) {
    addDispatchTaskEvent(context, {
      type: "worker_queued",
      actor: "worker-router",
      source: "worker-router",
      note: "Symphony handoff queued.",
      detail: { workerId: "symphony" }
    });
    updateDispatchTask(context, {
      status: "ready"
    }, {
      actor: "worker-router",
      source: "worker-router",
      type: "task_ready",
      note: "Symphony handoff queued."
    });
    return {
      dispatchMode: "queued_issue_lane",
      resultSummary: "Symphony handoff queued.",
      leaseStatus: context.leaseStatus
    };
  }

  const issue = await submitSymphonyWorkItem({
    title: input.title,
    objective: input.objective,
    instructions: input.instructions,
    ensureService: input.ensureService
  });
  updateDispatchLease(context, {
    status: "completed",
    runId: cleanText(issue?.issue?.id, 120)
  }, {
    type: "lease_completed",
    note: "Symphony issue created."
  });
  updateDispatchTask(context, {
    status: "review",
    progress: 100
  }, {
    actor: "worker-router",
    source: "worker-router",
    type: "task_review_ready",
    note: "Symphony issue created."
  });
  return {
    dispatchMode: "issue_submission",
    resultSummary: "Symphony issue created.",
    issue,
    issueIdentifier: cleanText(issue?.issue?.identifier, 120),
    leaseStatus: context.leaseStatus
  };
}

async function dispatchToSharedCompute(input, recommendation, context) {
  const targetNodeId = cleanText(input.sharedCompute.nodeId || recommendation.federation.selectedNodeId, 120).toLowerCase();
  if (!targetNodeId) {
    throw new Error("Shared compute dispatch requires a ready federation node.");
  }
  if (!input.sharedCompute.executor) {
    throw new Error("Shared compute dispatch requires an allowlisted executor.");
  }
  const requestTopic = `asolaria/nodes/${targetNodeId}/compute/request`;
  const payload = {
    jobId: context.dispatchId,
    dispatchId: context.dispatchId,
    taskId: context.task.id,
    leaseId: context.leaseId,
    requestedBy: "worker-router",
    requestedAt: nowIso(),
    spec: {
      laneId: input.laneId || recommendation.federation.laneId || recommendTaskLane(input),
      title: input.title,
      objective: input.objective,
      instructions: input.instructions,
      executor: input.sharedCompute.executor,
      args: input.sharedCompute.args,
      workingDirectory: input.sharedCompute.workingDirectory,
      timeoutMs: input.sharedCompute.timeoutMs
    }
  };

  await publishMqttMessage({
    topic: requestTopic,
    payload,
    retain: false,
    timeoutMs: input.timeoutMs
  });

  addDispatchTaskEvent(context, {
    type: "worker_dispatched",
    actor: "worker-router",
    source: "worker-router",
    note: `Shared compute request dispatched to ${targetNodeId}.`,
    detail: {
      workerId: "shared_compute",
      nodeId: targetNodeId,
      requestTopic
    }
  });
  updateDispatchTask(context, {
    status: "in_progress",
    progress: 10
  }, {
    actor: "worker-router",
    source: "worker-router",
    type: "task_started",
    note: `Shared compute request dispatched to ${targetNodeId}.`
  });
  return {
    dispatchMode: "federated_request",
    resultSummary: `Shared compute request dispatched to ${targetNodeId}.`,
    targetNodeId,
    requestTopic,
    leaseStatus: context.leaseStatus
  };
}

async function dispatchWorkerTask(input = {}) {
  const recommendation = recommendWorker(input);
  const workerId = normalizeWorkerId(input.workerId || recommendation.recommendedWorkerId) || recommendation.recommendedWorkerId;
  const worker = getWorkerProfile(workerId);
  if (!worker?.dispatchable) {
    throw new Error(`Worker ${workerId} is not dispatchable on this machine.`);
  }

  const dispatchId = buildDispatchId(recommendation.input.title);
  const dispatchFolder = ensureDispatchFolder(dispatchId);
  const createdAt = nowIso();
  const task = ensureDispatchTask(recommendation, dispatchId, workerId);
  const initialLeaseStatus = workerId === "shared_compute"
    ? "active"
    : (recommendation.input.executeNow && (workerId === "local_codex" || workerId === "claude_max" || workerId === "symphony")
      ? "active"
      : "queued");
  const context = createDispatchContext({
    createdAt,
    dispatchId,
    dispatchFolder,
    task,
    workerId,
    initialLeaseStatus
  });

  const initialPayload = {
    id: dispatchId,
    createdAt,
    workerId,
    taskId: task.id,
    leaseId: context.leaseId,
    leaseStatus: context.leaseStatus,
    lease: getDispatchLeaseSummary(context.leaseId),
    title: recommendation.input.title,
    recommendation
  };
  writeDispatchDoc(dispatchFolder, initialPayload);

  let result;
  if (workerId === "shared_compute") {
    result = await dispatchToSharedCompute(recommendation.input, recommendation, context);
  } else if (workerId === "abacus") {
    result = await dispatchToAbacus(recommendation.input, recommendation, context);
  } else if (workerId === "claude_max") {
    result = await dispatchToClaudeMax(recommendation.input, context);
  } else if (workerId === "symphony") {
    result = await dispatchToSymphony(recommendation.input, context);
  } else {
    result = await dispatchToLocalCodex(recommendation.input, recommendation, context);
  }

  const payload = {
    ...initialPayload,
    completedAt: ["queued", "active"].includes(result?.leaseStatus || context.leaseStatus) ? "" : nowIso(),
    workerId,
    leaseStatus: result?.leaseStatus || context.leaseStatus,
    lease: getDispatchLeaseSummary(context.leaseId),
    result
  };
  writeDispatchDoc(dispatchFolder, payload);
  return payload;
}

function listWorkerDispatches(limit = 20) {
  ensureDir(ROUTER_DISPATCH_ROOT);
  return fs.readdirSync(ROUTER_DISPATCH_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => safeReadJson(path.join(ROUTER_DISPATCH_ROOT, entry.name, "dispatch.json"), null))
    .filter(Boolean)
    .map((dispatch) => hydrateDispatchRecord(dispatch))
    .sort((a, b) => String(b.completedAt || b.failedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.failedAt || a.createdAt || "")))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 20) || 20)));
}

function getWorkerDispatch(dispatchId) {
  const id = cleanText(dispatchId);
  if (!id) return null;
  return hydrateDispatchRecord(safeReadJson(path.join(ROUTER_DISPATCH_ROOT, id, "dispatch.json"), null));
}

module.exports = {
  getWorkerRouterStatus,
  recommendWorker,
  dispatchWorkerTask,
  listWorkerDispatches,
  getWorkerDispatch
};
