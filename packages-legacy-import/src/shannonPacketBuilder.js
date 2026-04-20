const { getSecurityEngagement } = require("./securityEngagementStore");

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeActionList(values = []) {
  return unique(
    (Array.isArray(values) ? values : [])
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean)
  );
}

function buildInstructions(engagement = {}) {
  const scope = engagement.scope || {};
  const lines = [
    "Operate only inside the explicit engagement contract.",
    "Treat the target as white-box or operator-authorized exactly as declared.",
    "Keep proof first and write findings against the contract artifact paths.",
    "Do not widen authority, do not change scope, and do not target anything outside the packet."
  ];
  if (scope.summary) {
    lines.push(`Scope summary: ${scope.summary}`);
  }
  if (Array.isArray(scope.allowedActions) && scope.allowedActions.length) {
    lines.push(`Allowed actions: ${scope.allowedActions.join(", ")}`);
  }
  if (Array.isArray(scope.deniedActions) && scope.deniedActions.length) {
    lines.push(`Denied actions: ${scope.deniedActions.join(", ")}`);
  }
  return lines.join("\n");
}

function buildShannonPacketFromEngagement(engagementInput = {}, options = {}) {
  const engagement = engagementInput && typeof engagementInput === "object" && engagementInput.id
    ? engagementInput
    : getSecurityEngagement(engagementInput);

  if (!engagement) {
    return { ok: false, error: "security_engagement_not_found" };
  }
  if (!engagement.gate?.ok && options.allowBlocked !== true) {
    return {
      ok: false,
      error: "security_engagement_not_ready",
      engagementId: engagement.id,
      status: cleanText(engagement.gate?.status),
      blocked: Array.isArray(engagement.gate?.blocked) ? engagement.gate.blocked.slice() : [],
      missing: Array.isArray(engagement.gate?.missing) ? engagement.gate.missing.slice() : []
    };
  }

  const scope = engagement.scope || {};
  const evidence = engagement.evidence || {};
  const deniedActions = normalizeActionList(scope.deniedActions);
  const prohibitedActions = unique([
    "open_world_targeting",
    "authority_widening",
    "uncontrolled_brain_mutation",
    ...deniedActions
  ]);
  const allowedActions = normalizeActionList(scope.allowedActions);

  return {
    ok: true,
    provider: "shannon",
    schemaVersion: 1,
    engagementId: cleanText(engagement.id),
    laneId: cleanText(engagement.laneId),
    roleId: cleanText(engagement.roleId),
    mode: cleanText(engagement.authorization?.mode),
    objective: cleanText(engagement.title),
    target: {
      kind: cleanText(engagement.target?.kind),
      ref: cleanText(engagement.target?.ref),
      label: cleanText(engagement.target?.label)
    },
    scope: {
      summary: cleanText(scope.summary),
      allowedPaths: Array.isArray(scope.allowedPaths) ? scope.allowedPaths.slice() : [],
      allowedHosts: Array.isArray(scope.allowedHosts) ? scope.allowedHosts.slice() : [],
      allowedActions,
      deniedActions
    },
    risk: {
      level: cleanText(engagement.risk?.level),
      riskyActionsRequested: Boolean(engagement.risk?.riskyActionsRequested),
      leaderApprovalRequired: Boolean(engagement.risk?.leaderApprovalRequired),
      escalationAllowed: Boolean(engagement.risk?.escalationAllowed)
    },
    approval: {
      approvedBy: cleanText(engagement.authorization?.approvedBy),
      approvalRef: cleanText(engagement.authorization?.approvalRef),
      approvedAt: cleanText(engagement.authorization?.approvedAt),
      leaderApproved: Boolean(engagement.authorization?.leaderApproved)
    },
    prohibitedActions,
    expectedArtifacts: unique([
      cleanText(evidence.contractJsonPath),
      cleanText(evidence.contractMarkdownPath),
      cleanText(evidence.findingsJsonPath),
      cleanText(evidence.findingsMarkdownPath),
      cleanText(evidence.evidenceBundlePath),
      cleanText(evidence.negativeEvidencePath)
    ]),
    requiredEvidenceKinds: Array.isArray(evidence.requiredKinds) ? evidence.requiredKinds.slice() : [],
    preserveNegativeEvidence: Boolean(evidence.preserveNegativeEvidence),
    ruleAnchors: ["LX-328", "LX-329", "LX-331", "LX-332"],
    instructions: buildInstructions(engagement),
    taskId: cleanText(engagement.taskId)
  };
}

module.exports = {
  buildShannonPacketFromEngagement
};
