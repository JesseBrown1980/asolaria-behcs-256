const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");
const { appendGraphEvent, appendActionManifest } = require("./graphRuntimeStore");

const approvalsPath = resolveDataPath("guardian-approvals.json");

function ensureDir() {
  fs.mkdirSync(path.dirname(approvalsPath), { recursive: true });
}

function initialDoc() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    approvals: []
  };
}

function loadDoc() {
  ensureDir();
  if (!fs.existsSync(approvalsPath)) {
    const doc = initialDoc();
    fs.writeFileSync(approvalsPath, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
    if (!parsed || !Array.isArray(parsed.approvals)) {
      throw new Error("Invalid guardian approval store.");
    }
    return parsed;
  } catch (_error) {
    const doc = initialDoc();
    fs.writeFileSync(approvalsPath, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
}

function saveDoc(doc) {
  doc.updatedAt = new Date().toISOString();
  if (doc.approvals.length > 600) {
    doc.approvals = doc.approvals.slice(-600);
  }
  fs.writeFileSync(approvalsPath, JSON.stringify(doc, null, 2), "utf8");
}

function normalizeAction(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function normalizeMessage(value) {
  const text = String(value || "").trim();
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

function hashRequest(action, message) {
  const source = `${normalizeAction(action)}\n${normalizeMessage(message)}`;
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

function isExpired(approval, nowMs = Date.now()) {
  const expiresAtMs = Date.parse(approval.expiresAt || "");
  if (!Number.isFinite(expiresAtMs)) return true;
  return nowMs > expiresAtMs;
}

function cleanupExpired(doc) {
  const nowMs = Date.now();
  for (const approval of doc.approvals) {
    if (approval.status === "pending" && isExpired(approval, nowMs)) {
      approval.status = "expired";
      approval.decidedAt = new Date().toISOString();
      approval.decisionBy = "system";
      approval.decisionReason = "expired";
    }
  }
}

function buildApprovalTarget(approval = {}, fallbackId = "") {
  return {
    type: "approval",
    id: String(approval.id || fallbackId || "").trim(),
    label: String(approval.action || "approval").trim(),
    criticality: String(approval?.risk?.level || "").trim().toLowerCase() || "medium"
  };
}

function createApprovalRequest(input = {}) {
  const action = normalizeAction(input.action);
  const message = normalizeMessage(input.message);
  const risk = input.risk && typeof input.risk === "object" ? input.risk : {};
  const expiresInMinutes = Math.max(5, Math.min(180, Number(input.expiresInMinutes) || 30));
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
  const requestHash = hashRequest(action, message);
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const doc = loadDoc();
  cleanupExpired(doc);

  const pendingDuplicate = doc.approvals.find((item) => {
    return item.status === "pending" && item.requestHash === requestHash && !isExpired(item);
  });
  if (pendingDuplicate) {
    return pendingDuplicate;
  }

  const approval = {
    id,
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    status: "pending",
    source: String(input.source || "unknown").slice(0, 80),
    action,
    message,
    messagePreview: message.length > 220 ? `${message.slice(0, 217)}...` : message,
    risk: {
      level: String(risk.level || "unknown"),
      score: Number.isFinite(Number(risk.score)) ? Number(risk.score) : 0,
      reasons: Array.isArray(risk.reasons) ? risk.reasons.slice(0, 12) : [],
      securityIncident: Boolean(risk.securityIncident)
    },
    requestHash,
    approvedAt: null,
    deniedAt: null,
    decidedAt: null,
    decisionBy: null,
    decisionReason: null,
    usedAt: null
  };

  doc.approvals.push(approval);
  saveDoc(doc);
  appendGraphEvent({
    component: "guardian-approval-store",
    category: "approval",
    action: "approval_created",
    actor: {
      type: "approval_source",
      id: String(input.source || "unknown").slice(0, 80)
    },
    target: buildApprovalTarget(approval),
    context: {
      action,
      source: approval.source || "",
      approvalState: approval.status || ""
    },
    policy: {
      approvalState: "pending"
    },
    detail: {
      expiresAt: approval.expiresAt,
      reasons: approval.risk?.reasons || []
    }
  });
  appendActionManifest({
    component: "guardian-approval-store",
    action: action || "approval_request",
    status: "approval_required",
    actor: {
      type: "approval_source",
      id: String(input.source || "unknown").slice(0, 80)
    },
    target: buildApprovalTarget(approval),
    reason: approval.messagePreview || approval.message || "",
    context: {
      source: approval.source || "",
      requestId: approval.id,
      tool: action || ""
    },
    policy: {
      approvalState: "pending",
      mode: "guardian"
    },
    evidence: {
      requestHash: approval.requestHash,
      riskLevel: approval.risk?.level || "",
      riskScore: approval.risk?.score || 0
    }
  });
  return approval;
}

function getApprovalById(id) {
  const wanted = String(id || "").trim();
  if (!wanted) return null;
  const doc = loadDoc();
  cleanupExpired(doc);
  saveDoc(doc);
  return doc.approvals.find((item) => item.id === wanted) || null;
}

function listApprovals(options = {}) {
  const status = String(options.status || "all").trim().toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 30));
  const doc = loadDoc();
  cleanupExpired(doc);
  saveDoc(doc);
  let rows = doc.approvals.slice().reverse();
  if (status !== "all") {
    rows = rows.filter((item) => item.status === status);
  }
  return rows.slice(0, limit);
}

function decideApproval(input = {}) {
  const id = String(input.id || "").trim();
  const decisionRaw = String(input.decision || "").trim().toLowerCase();
  const decision = decisionRaw === "approve" ? "approved" : decisionRaw === "deny" || decisionRaw === "reject" ? "denied" : "";
  if (!id || !decision) {
    throw new Error("Approval id and decision (approve|deny) are required.");
  }

  const doc = loadDoc();
  cleanupExpired(doc);
  const approval = doc.approvals.find((item) => item.id === id);
  if (!approval) {
    throw new Error("Approval request not found.");
  }
  if (approval.status !== "pending") {
    return approval;
  }
  if (isExpired(approval)) {
    approval.status = "expired";
    approval.decidedAt = new Date().toISOString();
    approval.decisionBy = "system";
    approval.decisionReason = "expired";
    saveDoc(doc);
    return approval;
  }

  const now = new Date().toISOString();
  approval.status = decision;
  approval.decidedAt = now;
  approval.updatedAt = now;
  approval.decisionBy = String(input.by || "manual").slice(0, 120);
  approval.decisionReason = String(input.reason || "").slice(0, 240);
  if (decision === "approved") {
    approval.approvedAt = now;
  } else {
    approval.deniedAt = now;
  }
  saveDoc(doc);
  appendGraphEvent({
    component: "guardian-approval-store",
    category: "approval",
    action: `approval_${decision}`,
    actor: {
      type: "approval_actor",
      id: String(input.by || "manual").slice(0, 120)
    },
    target: buildApprovalTarget(approval, id),
    context: {
      action: approval.action || "",
      source: approval.source || ""
    },
    policy: {
      approvalState: decision
    },
    detail: {
      reason: approval.decisionReason || ""
    }
  });
  return approval;
}

function consumeApprovedOverride(input = {}) {
  const action = normalizeAction(input.action);
  const message = normalizeMessage(input.message);
  if (!action && !message) {
    return null;
  }
  const requestHash = hashRequest(action, message);
  const doc = loadDoc();
  cleanupExpired(doc);
  const approval = doc.approvals.find((item) => {
    return item.status === "approved" && !item.usedAt && item.requestHash === requestHash && !isExpired(item);
  });
  if (!approval) {
    saveDoc(doc);
    return null;
  }
  approval.usedAt = new Date().toISOString();
  approval.updatedAt = approval.usedAt;
  saveDoc(doc);
  appendGraphEvent({
    component: "guardian-approval-store",
    category: "approval",
    action: "approval_consumed",
    actor: {
      type: "approval_actor",
      id: "approved_override"
    },
    target: buildApprovalTarget(approval),
    context: {
      action: approval.action || "",
      source: approval.source || ""
    },
    policy: {
      approvalState: "approved"
    },
    detail: {
      requestHash: approval.requestHash
    }
  });
  return approval;
}

function markApprovalUsed(id, reason = "manual-use") {
  const wanted = String(id || "").trim();
  if (!wanted) {
    throw new Error("Approval id is required.");
  }
  const doc = loadDoc();
  cleanupExpired(doc);
  const approval = doc.approvals.find((item) => item.id === wanted);
  if (!approval) {
    throw new Error("Approval request not found.");
  }
  if (approval.status !== "approved") {
    throw new Error("Only approved requests can be marked as used.");
  }
  if (!approval.usedAt) {
    approval.usedAt = new Date().toISOString();
    approval.updatedAt = approval.usedAt;
    approval.decisionReason = approval.decisionReason || String(reason || "manual-use").slice(0, 240);
    saveDoc(doc);
    appendGraphEvent({
      component: "guardian-approval-store",
      category: "approval",
      action: "approval_marked_used",
      actor: {
        type: "approval_actor",
        id: String(reason || "manual-use").slice(0, 120)
      },
      target: buildApprovalTarget(approval, wanted),
      context: {
        action: approval.action || "",
        source: approval.source || ""
      },
      policy: {
        approvalState: "approved"
      }
    });
  } else {
    saveDoc(doc);
  }
  return approval;
}

function parseDecisionText(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const match = text.match(/^(approve|approved|allow|yes|y|deny|denied|reject|no|n)\s+([a-z0-9_-]+)$/i);
  if (!match) return null;
  const keyword = match[1].toLowerCase();
  const decision = keyword.startsWith("a") || keyword === "yes" || keyword === "y" ? "approve" : "deny";
  return {
    decision,
    id: match[2]
  };
}

module.exports = {
  approvalsPath,
  createApprovalRequest,
  getApprovalById,
  listApprovals,
  decideApproval,
  consumeApprovedOverride,
  markApprovalUsed,
  parseDecisionText
};
