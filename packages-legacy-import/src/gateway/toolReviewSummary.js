const TOOL_CODES = Object.freeze({
  "browser.task": "BRT",
  "localops.run": "LOR",
  "github.status": "GHS",
  "github.repos": "GHR",
  "sandbox.execute": "SBX"
});

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeGatewayToolCode(tool = "") {
  const normalized = cleanText(tool).toLowerCase();
  if (!normalized) return "";
  if (TOOL_CODES[normalized]) return TOOL_CODES[normalized];
  const compact = normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return compact.slice(0, 4) || normalized.replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 4);
}

function buildGatewayToolReviewRow(approval = {}) {
  return {
    id: cleanText(approval.id),
    tool: cleanText(approval.tool),
    toolCode: normalizeGatewayToolCode(approval.tool),
    status: cleanText(approval.status),
    actor: cleanText(approval.actor),
    createdAt: cleanText(approval.createdAt),
    expiresAt: cleanText(approval.expiresAt),
    decidedAt: cleanText(approval.decidedAt),
    decisionBy: cleanText(approval.decisionBy),
    decisionReason: cleanText(approval.decisionReason),
    usedAt: cleanText(approval.usedAt)
  };
}

function buildGatewayApprovalsPayload(approvals = [], input = {}) {
  const rows = Array.isArray(approvals) ? approvals : [];
  return {
    authorityMode: cleanText(input.authorityMode),
    count: rows.length,
    approvals: rows.map((approval) => buildGatewayToolReviewRow(approval))
  };
}

function buildGatewayApprovalDecisionPayload(approval, input = {}) {
  return {
    authorityMode: cleanText(input.authorityMode),
    approval: buildGatewayToolReviewRow(approval)
  };
}

function buildGatewayInvokeResultPayload(invoked = {}, input = {}) {
  return {
    ...invoked,
    authorityMode: cleanText(input.authorityMode || invoked?.mode),
    toolCode: normalizeGatewayToolCode(invoked?.tool)
  };
}

module.exports = {
  TOOL_CODES,
  cleanText,
  normalizeGatewayToolCode,
  buildGatewayToolReviewRow,
  buildGatewayApprovalsPayload,
  buildGatewayApprovalDecisionPayload,
  buildGatewayInvokeResultPayload
};
