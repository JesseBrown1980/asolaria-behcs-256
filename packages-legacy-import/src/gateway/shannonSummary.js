const { inspectShannonExecution } = require("../shannonExecutionGate");
const { listSecurityEngagements } = require("../securityEngagementStore");
const {
  buildGatewayLaneCompactSummary,
  mapCompactEntryCodes
} = require("./compactLaneSummary");
const { getShannonExecutionApprovalLink } = require("../shannonApprovalBridge");

function cleanText(value) {
  return String(value || "").trim();
}

function parseFlag(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return false;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return Boolean(value);
}

function clampLimit(value, fallback = 10, min = 1, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function buildShannonCompactLane(input = {}) {
  return buildGatewayLaneCompactSummary("sec-pentest", input);
}

function buildGatewayShannonPreparePayload(preparation) {
  return {
    preparation,
    lane: buildShannonCompactLane(),
    ruleAnchorCodes: mapCompactEntryCodes(preparation?.ruleAnchors)
  };
}

function buildGatewayShannonStatusPayload(statusView) {
  return {
    status: statusView
  };
}

function buildGatewayShannonApprovalPayload(approvalView) {
  return {
    approval: approvalView,
    lane: buildShannonCompactLane()
  };
}

function buildGatewayShannonHandoffPayload(handoffView) {
  return {
    handoff: handoffView,
    lane: buildShannonCompactLane()
  };
}

function buildHandoffReviewRow(handoff = {}, compactLane = null) {
  return {
    handoffId: cleanText(handoff.handoffId),
    engagementId: cleanText(handoff.engagementId),
    status: cleanText(handoff.status),
    authorityMode: cleanText(handoff.authorityMode),
    approvedBy: cleanText(handoff.approvedBy),
    approvalRef: cleanText(handoff.approvalRef),
    laneCode: cleanText(compactLane?.laneCode),
    roleCode: cleanText(compactLane?.roleCode),
    tierCode: cleanText(compactLane?.tierCode),
    createdAt: cleanText(handoff.createdAt),
    sealHash: cleanText(handoff.sealHash),
    artifacts: handoff && typeof handoff.artifacts === "object" ? { ...handoff.artifacts } : {}
  };
}

function buildGatewayShannonHandoffsPayload(handoffs = []) {
  const compactLane = buildShannonCompactLane();
  const rows = Array.isArray(handoffs) ? handoffs : [];
  return {
    lane: compactLane,
    count: rows.length,
    handoffs: rows.map((handoff) => buildHandoffReviewRow(handoff, compactLane))
  };
}

function buildGatewayShannonWorkerPayload(workerView) {
  return {
    worker: workerView,
    lane: buildShannonCompactLane()
  };
}

function buildWorkerReviewRow(worker = {}, compactLane = null) {
  return {
    packetId: cleanText(worker.packetId),
    engagementId: cleanText(worker.engagementId),
    handoffId: cleanText(worker.handoffId),
    status: cleanText(worker.status),
    workerSurface: cleanText(worker.workerSurface),
    laneCode: cleanText(compactLane?.laneCode),
    roleCode: cleanText(compactLane?.roleCode),
    tierCode: cleanText(compactLane?.tierCode),
    createdAt: cleanText(worker.createdAt),
    sealHash: cleanText(worker.sealHash),
    handoffSealHash: cleanText(worker.handoffSealHash),
    artifacts: worker && typeof worker.artifacts === "object" ? { ...worker.artifacts } : {}
  };
}

function buildGatewayShannonWorkersPayload(workers = []) {
  const compactLane = buildShannonCompactLane();
  const rows = Array.isArray(workers) ? workers : [];
  return {
    lane: compactLane,
    count: rows.length,
    workers: rows.map((worker) => buildWorkerReviewRow(worker, compactLane))
  };
}

function resolvePrepareInput(body = {}) {
  if (body.packet && typeof body.packet === "object") {
    return body.packet;
  }
  if (body.engagement && typeof body.engagement === "object") {
    return body.engagement;
  }
  if (cleanText(body.engagementId)) {
    return cleanText(body.engagementId);
  }
  return body;
}

function resolveExecutionInput(body = {}, linkedApproval = null) {
  const input = resolvePrepareInput(body);
  if (linkedApproval?.link?.packetSnapshot && cleanText(linkedApproval.link.packetSnapshot.provider) === "shannon") {
    if (typeof input === "string" || cleanText(input?.engagementId || input?.id)) {
      return linkedApproval.link.packetSnapshot;
    }
  }
  return input;
}

function currentAuthorityMode(authorityModes) {
  const status = authorityModes && typeof authorityModes.getStatus === "function"
    ? authorityModes.getStatus()
    : null;
  return cleanText(status?.mode || "operator_primary").toLowerCase() || "operator_primary";
}

function buildPrepareOptions(body = {}, actor, authorityModes) {
  return {
    mode: body.mode || body.executionMode,
    authorityMode: currentAuthorityMode(authorityModes),
    executionApproved: parseFlag(
      body.executionApproved
      || body.explicitExecutionApproval
      || body.runApproved
    ),
    approvedBy: body.approvedBy,
    approvalRef: body.approvalRef,
    actor
  };
}

function mergeApprovalOptions(base = {}, linkedApproval = null) {
  const current = { ...(base || {}) };
  if (!current.executionApproved && linkedApproval?.approvalOptions?.executionApproved) {
    current.executionApproved = true;
    current.approvedBy = current.approvedBy || linkedApproval.approvalOptions.approvedBy;
    current.approvalRef = current.approvalRef || linkedApproval.approvalOptions.approvalRef;
  }
  return current;
}

function buildEngagementReviewRow(engagement = {}, compactLane = null) {
  return {
    engagementId: cleanText(engagement.id),
    title: cleanText(engagement.title),
    laneCode: cleanText(compactLane?.laneCode),
    roleCode: cleanText(compactLane?.roleCode),
    tierCode: cleanText(compactLane?.tierCode),
    gateStatus: cleanText(engagement.gate?.status),
    riskLevel: cleanText(engagement.risk?.level || engagement.gate?.riskLevel),
    targetKind: cleanText(engagement.target?.kind),
    targetRef: cleanText(engagement.target?.ref),
    taskId: cleanText(engagement.taskId),
    missing: Array.isArray(engagement.gate?.missing) ? engagement.gate.missing.slice() : [],
    blocked: Array.isArray(engagement.gate?.blocked) ? engagement.gate.blocked.slice() : [],
    updatedAt: cleanText(engagement.updatedAt || engagement.createdAt)
  };
}

function buildPreparationPreviewRow(engagement = {}, options = {}, authorityModes, compactLane = null) {
  const linkedApproval = getShannonExecutionApprovalLink(engagement);
  const preview = inspectShannonExecution(engagement, {
    ...mergeApprovalOptions(
      buildPrepareOptions(options, options.actor || "gateway-review", authorityModes),
      linkedApproval
    ),
    recordManifest: false
  });
  if (preview && preview.ok !== false) {
    return {
      engagementId: cleanText(preview.engagementId || engagement.id),
      laneCode: cleanText(compactLane?.laneCode),
      roleCode: cleanText(compactLane?.roleCode),
      tierCode: cleanText(compactLane?.tierCode),
      mode: cleanText(preview.mode),
      authorityMode: cleanText(preview.authorityMode),
      status: cleanText(preview.status),
      approvalState: cleanText(preview.approvalState),
      reason: cleanText(preview.reason),
      explicitApproval: Boolean(preview.explicitApproval),
      targetKind: cleanText(preview.target?.kind),
      targetRef: cleanText(preview.target?.ref),
      expectedArtifactCount: Array.isArray(preview.expectedArtifacts) ? preview.expectedArtifacts.length : 0,
      ruleAnchors: Array.isArray(preview.ruleAnchors) ? preview.ruleAnchors.slice() : [],
      ruleAnchorCodes: mapCompactEntryCodes(preview.ruleAnchors),
      approval: linkedApproval?.approval || null
    };
  }
  return {
    engagementId: cleanText(engagement.id),
    laneCode: cleanText(compactLane?.laneCode),
    roleCode: cleanText(compactLane?.roleCode),
    tierCode: cleanText(compactLane?.tierCode),
    mode: cleanText(options.mode || options.executionMode || "dry_run").toLowerCase() || "dry_run",
    authorityMode: currentAuthorityMode(authorityModes),
    status: cleanText(preview?.packet?.status || "blocked"),
    approvalState: cleanText(preview?.packet?.status || "blocked"),
    reason: cleanText(preview?.error || "packet_not_ready"),
    explicitApproval: parseFlag(
      options.executionApproved
      || options.explicitExecutionApproval
      || options.runApproved
    ),
    targetKind: cleanText(engagement.target?.kind),
    targetRef: cleanText(engagement.target?.ref),
    expectedArtifactCount: 0,
    ruleAnchors: ["LX-328", "LX-329", "LX-331", "LX-332", "LX-333"],
    ruleAnchorCodes: mapCompactEntryCodes(["LX-328", "LX-329", "LX-331", "LX-332", "LX-333"]),
    approval: linkedApproval?.approval || null
  };
}

function buildStatusView(source = {}, authorityModes) {
  const statusFilter = cleanText(source.status).toLowerCase();
  const limit = clampLimit(source.limit, 10, 1, 50);
  const engagements = listSecurityEngagements({
    status: statusFilter
  }).sort((left, right) => cleanText(right.updatedAt || right.createdAt).localeCompare(cleanText(left.updatedAt || left.createdAt)));
  const rows = engagements.slice(0, limit);
  const compactLane = buildShannonCompactLane();
  return {
    authority: {
      mode: currentAuthorityMode(authorityModes)
    },
    lane: compactLane,
    reviewMode: cleanText(source.mode || source.executionMode || "dry_run").toLowerCase() || "dry_run",
    statusFilter,
    total: engagements.length,
    count: rows.length,
    engagements: rows.map((engagement) => buildEngagementReviewRow(engagement, compactLane)),
    preparations: rows.map((engagement) => buildPreparationPreviewRow(engagement, source, authorityModes, compactLane))
  };
}

module.exports = {
  cleanText,
  parseFlag,
  clampLimit,
  buildShannonCompactLane,
  buildGatewayShannonPreparePayload,
  buildGatewayShannonStatusPayload,
  buildGatewayShannonApprovalPayload,
  buildGatewayShannonHandoffPayload,
  buildGatewayShannonHandoffsPayload,
  buildGatewayShannonWorkerPayload,
  buildGatewayShannonWorkersPayload,
  resolvePrepareInput,
  resolveExecutionInput,
  currentAuthorityMode,
  buildPrepareOptions,
  mergeApprovalOptions,
  buildEngagementReviewRow,
  buildHandoffReviewRow,
  buildPreparationPreviewRow,
  buildWorkerReviewRow,
  buildStatusView
};
