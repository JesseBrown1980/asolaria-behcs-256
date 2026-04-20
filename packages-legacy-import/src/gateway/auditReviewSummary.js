const { normalizeGatewayToolCode } = require("./toolReviewSummary");

const AUDIT_EVENT_CODES = Object.freeze({
  "tool.invoke": "TIV",
  "tool.invoked": "TIV",
  "approval.created": "APC",
  "approval.decided": "APD",
  "approval.used": "APU",
  "authority.transition_requested": "ATR",
  "authority.mode_changed": "AMC"
});

const AUTHORITY_MODE_CODES = Object.freeze({
  operator_primary: "OPR",
  shared_control: "SHC",
  asolaria_primary: "ASP"
});

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeAuditEventCode(type = "") {
  const normalized = cleanText(type).toLowerCase();
  if (!normalized) return "";
  if (AUDIT_EVENT_CODES[normalized]) return AUDIT_EVENT_CODES[normalized];
  const compact = normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return compact.slice(0, 4);
}

function normalizeAuthorityModeCode(mode = "") {
  const normalized = cleanText(mode).toLowerCase();
  return AUTHORITY_MODE_CODES[normalized] || "";
}

function resolveAuditTool(event = {}) {
  const payload = event && typeof event.payload === "object" ? event.payload : {};
  return cleanText(
    payload.tool
    || payload.approval?.tool
    || payload.target?.id
    || ""
  );
}

function resolveAuditAuthorityMode(event = {}) {
  const payload = event && typeof event.payload === "object" ? event.payload : {};
  return cleanText(payload.mode || "");
}

function resolveAuditTransitionTargetMode(event = {}) {
  const payload = event && typeof event.payload === "object" ? event.payload : {};
  return cleanText(payload.transition?.targetMode || payload.to || "");
}

function resolveAuditApprovalState(event = {}) {
  const payload = event && typeof event.payload === "object" ? event.payload : {};
  const explicit = cleanText(payload.approval?.status || payload.approvalState);
  if (explicit) return explicit;
  const type = cleanText(event.type).toLowerCase();
  if (type === "approval.created") return "pending";
  if (type === "approval.used") return "approved";
  return "";
}

function resolveAuditOk(event = {}) {
  const payload = event && typeof event.payload === "object" ? event.payload : {};
  if (typeof payload.ok === "boolean") return payload.ok;
  return undefined;
}

function buildGatewayAuditEventRow(event = {}) {
  const tool = resolveAuditTool(event);
  const authorityMode = resolveAuditAuthorityMode(event);
  const transitionTargetMode = resolveAuditTransitionTargetMode(event);
  return {
    ...event,
    eventCode: normalizeAuditEventCode(event.type),
    tool,
    toolCode: normalizeGatewayToolCode(tool),
    authorityMode,
    authorityModeCode: normalizeAuthorityModeCode(authorityMode),
    transitionTargetMode,
    transitionTargetModeCode: normalizeAuthorityModeCode(transitionTargetMode),
    approvalState: resolveAuditApprovalState(event),
    ok: resolveAuditOk(event)
  };
}

function buildGatewayAuditEventsPayload(events = []) {
  const rows = Array.isArray(events) ? events : [];
  return {
    count: rows.length,
    events: rows.map((event) => buildGatewayAuditEventRow(event))
  };
}

module.exports = {
  AUDIT_EVENT_CODES,
  AUTHORITY_MODE_CODES,
  cleanText,
  normalizeAuditEventCode,
  normalizeAuthorityModeCode,
  buildGatewayAuditEventRow,
  buildGatewayAuditEventsPayload
};
