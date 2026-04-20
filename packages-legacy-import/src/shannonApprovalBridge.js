const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { buildShannonPacketFromEngagement } = require("./shannonPacketBuilder");
const {
  createApprovalRequest,
  getApprovalById,
  decideApproval
} = require("./guardianApprovalStore");

const shannonApprovalBridgePath = resolveDataPath("shannon-execution-approvals.json");

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(shannonApprovalBridgePath), { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function clipText(value, maxChars = 240) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function makeId(prefix = "sap") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function initialDoc() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    links: []
  };
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(shannonApprovalBridgePath)) {
    cache = initialDoc();
    fs.writeFileSync(shannonApprovalBridgePath, JSON.stringify(cache, null, 2), "utf8");
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(shannonApprovalBridgePath, "utf8"));
  } catch {
    cache = initialDoc();
  }
  if (!Array.isArray(cache.links)) cache.links = [];
  return cache;
}

function writeDoc(doc) {
  ensureDir();
  doc.updatedAt = new Date().toISOString();
  fs.writeFileSync(shannonApprovalBridgePath, JSON.stringify(doc, null, 2), "utf8");
  cache = doc;
  return cache;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findLinkByEngagementId(engagementId) {
  const wanted = cleanText(engagementId);
  if (!wanted) return null;
  const doc = loadDoc();
  return doc.links.find((row) => cleanText(row.engagementId) === wanted) || null;
}

function normalizePacket(input = {}) {
  if (input && typeof input === "object" && input.ok === true && input.provider === "shannon") {
    return input;
  }
  const direct = buildShannonPacketFromEngagement(input);
  if (direct && direct.ok === true) {
    return direct;
  }
  const engagementId = typeof input === "string"
    ? cleanText(input)
    : cleanText(input?.engagementId || input?.id);
  if (!engagementId) {
    return direct;
  }
  const link = findLinkByEngagementId(engagementId);
  if (link?.packetSnapshot && link.packetSnapshot.ok === true && link.packetSnapshot.provider === "shannon") {
    return clone(link.packetSnapshot);
  }
  return direct;
}

function buildApprovalMessage(packet = {}) {
  const lines = [
    `Allow Shannon execution handoff for engagement ${cleanText(packet.engagementId)}.`,
    `Objective: ${cleanText(packet.objective)}`,
    `Target: ${cleanText(packet.target?.kind)} :: ${cleanText(packet.target?.ref)}`,
    `Scope: ${cleanText(packet.scope?.summary)}`,
    `Allowed actions: ${Array.isArray(packet.scope?.allowedActions) ? packet.scope.allowedActions.join(", ") : ""}`,
    `Prohibited actions: ${Array.isArray(packet.prohibitedActions) ? packet.prohibitedActions.join(", ") : ""}`,
    `Artifacts: ${Array.isArray(packet.expectedArtifacts) ? packet.expectedArtifacts.join(", ") : ""}`
  ];
  return lines.filter(Boolean).join("\n");
}

function buildApprovalRisk(packet = {}) {
  const riskLevel = cleanText(packet.risk?.level || "high").toLowerCase() || "high";
  const reasons = [
    "specialist execution handoff",
    `target:${cleanText(packet.target?.kind || "target")}`,
    "requires explicit leader approval before live run"
  ];
  return {
    level: riskLevel,
    score: riskLevel === "critical" ? 95 : riskLevel === "high" ? 80 : riskLevel === "normal" ? 60 : 40,
    reasons,
    securityIncident: false
  };
}

function summarizeApproval(approval = null) {
  if (!approval) return null;
  return {
    id: cleanText(approval.id),
    status: cleanText(approval.status),
    action: cleanText(approval.action),
    source: cleanText(approval.source),
    createdAt: cleanText(approval.createdAt),
    expiresAt: cleanText(approval.expiresAt),
    decidedAt: cleanText(approval.decidedAt),
    decisionBy: cleanText(approval.decisionBy),
    decisionReason: cleanText(approval.decisionReason),
    approvedAt: cleanText(approval.approvedAt),
    deniedAt: cleanText(approval.deniedAt),
    usedAt: cleanText(approval.usedAt)
  };
}

function upsertLink(packet = {}, approval = {}) {
  const doc = loadDoc();
  const engagementId = cleanText(packet.engagementId);
  let link = doc.links.find((row) => row.engagementId === engagementId);
  const now = new Date().toISOString();
  if (!link) {
    link = {
      id: makeId("sap"),
      engagementId,
      createdAt: now,
      updatedAt: now
    };
    doc.links.push(link);
  }
  link.updatedAt = now;
  link.approvalId = cleanText(approval.id);
  link.source = cleanText(approval.source || `shannon-execution:${engagementId}`);
  link.action = cleanText(approval.action || "security.shannon.execute");
  link.targetKind = cleanText(packet.target?.kind);
  link.targetRef = clipText(packet.target?.ref, 320);
  link.objective = clipText(packet.objective, 220);
  link.packetSnapshot = clone(packet);
  writeDoc(doc);
  return clone(link);
}

function getShannonExecutionApprovalLink(engagementInput) {
  const packet = normalizePacket(engagementInput);
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      error: cleanText(packet?.error || "packet_not_ready"),
      packet
    };
  }
  const engagementId = cleanText(packet.engagementId);
  const doc = loadDoc();
  const link = doc.links.find((row) => row.engagementId === engagementId) || null;
  const approval = link?.approvalId ? getApprovalById(link.approvalId) : null;
  return {
    ok: true,
    engagementId,
    link: link ? clone(link) : null,
    approval: summarizeApproval(approval),
    approvalOptions: approval && cleanText(approval.status) === "approved" && !cleanText(approval.usedAt)
      ? {
          executionApproved: true,
          approvedBy: cleanText(approval.decisionBy || approval.approvedAt || "guardian"),
          approvalRef: cleanText(approval.id)
        }
      : {
          executionApproved: false,
          approvedBy: "",
          approvalRef: ""
        }
  };
}

function requestShannonExecutionApproval(input = {}, options = {}) {
  const packet = normalizePacket(input);
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      error: cleanText(packet?.error || "packet_not_ready"),
      packet
    };
  }

  const approval = createApprovalRequest({
    source: cleanText(options.source || `shannon-execution:${packet.engagementId}`),
    action: "security.shannon.execute",
    message: buildApprovalMessage(packet),
    risk: buildApprovalRisk(packet)
  });
  const link = upsertLink(packet, approval);
  return {
    ok: true,
    engagementId: cleanText(packet.engagementId),
    approval: summarizeApproval(approval),
    link
  };
}

function decideShannonExecutionApproval(input = {}, options = {}) {
  const engagementId = cleanText(input.engagementId || input.id);
  const approvalId = cleanText(input.approvalId);
  let resolvedApprovalId = approvalId;

  if (!resolvedApprovalId && engagementId) {
    const linked = getShannonExecutionApprovalLink(engagementId);
    resolvedApprovalId = cleanText(linked?.approval?.id);
  }
  if (!resolvedApprovalId) {
    throw new Error("Approval id or engagement id is required.");
  }

  const approval = decideApproval({
    id: resolvedApprovalId,
    decision: cleanText(input.decision),
    reason: cleanText(input.reason),
    by: cleanText(options.actor || input.actor || "manual")
  });
  return {
    ok: true,
    approval: summarizeApproval(approval)
  };
}

module.exports = {
  shannonApprovalBridgePath,
  buildApprovalMessage,
  buildApprovalRisk,
  summarizeApproval,
  getShannonExecutionApprovalLink,
  requestShannonExecutionApproval,
  decideShannonExecutionApproval
};
