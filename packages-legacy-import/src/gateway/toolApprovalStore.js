const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { appendGraphEvent, appendActionManifest } = require("../graphRuntimeStore");

function createDefaultError(message, status = 400, code = "bad_request", details = null) {
  const err = new Error(String(message || "request_failed"));
  err.status = status;
  err.code = code;
  if (details !== null && details !== undefined) {
    err.details = details;
  }
  return err;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${pairs.join(",")}}`;
}

function hashObject(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function redactPreview(value) {
  const blockedKeys = new Set([
    "token",
    "secret",
    "password",
    "private_key",
    "apikey",
    "api_key",
    "authorization",
    "cookie"
  ]);

  function walk(input) {
    if (input === null || input === undefined) return input;
    if (typeof input !== "object") return input;
    if (Array.isArray(input)) return input.map((item) => walk(item));
    const out = {};
    for (const [key, child] of Object.entries(input)) {
      if (blockedKeys.has(String(key || "").toLowerCase())) {
        out[key] = "***REDACTED***";
      } else {
        out[key] = walk(child);
      }
    }
    return out;
  }

  const preview = walk(value);
  const serialized = stableStringify(preview);
  if (serialized.length <= 1800) {
    return preview;
  }
  return { truncated: true, preview: serialized.slice(0, 1800) };
}

function ensureApprovalStore(storePath) {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ approvals: [] }, null, 2), "utf8");
  }
}

function readApprovalStore(storePath) {
  ensureApprovalStore(storePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (parsed && Array.isArray(parsed.approvals)) {
      return parsed;
    }
  } catch {}
  return { approvals: [] };
}

function writeApprovalStore(storePath, doc) {
  ensureApprovalStore(storePath);
  const safe = {
    approvals: Array.isArray(doc?.approvals) ? doc.approvals.slice(-1000) : []
  };
  fs.writeFileSync(storePath, JSON.stringify(safe, null, 2), "utf8");
}

function expirePendingApprovals(doc, nowIso) {
  let changed = false;
  const nowMs = Date.parse(nowIso);
  for (const item of doc.approvals) {
    if (item.status !== "pending") continue;
    const expiryMs = Date.parse(String(item.expiresAt || ""));
    if (Number.isFinite(expiryMs) && nowMs > expiryMs) {
      item.status = "expired";
      item.decidedAt = nowIso;
      item.updatedAt = nowIso;
      item.decisionBy = "system";
      item.decisionReason = "expired";
      changed = true;
    }
  }
  return changed;
}

function createGatewayToolApprovalStore(input = {}) {
  const storePath = String(input.storePath || "").trim();
  if (!storePath) {
    throw new Error("storePath is required.");
  }
  const approvalTtlMs = Number.isFinite(Number(input.approvalTtlMs))
    ? Math.max(60 * 1000, Math.min(24 * 60 * 60 * 1000, Math.round(Number(input.approvalTtlMs))))
    : 15 * 60 * 1000;
  const emit = typeof input.emit === "function" ? input.emit : null;
  const isApprovalRequired = typeof input.isApprovalRequired === "function" ? input.isApprovalRequired : () => true;
  const toError = typeof input.errorFactory === "function" ? input.errorFactory : createDefaultError;

  function emitEvent(type, payload) {
    if (!emit) return;
    try {
      emit(type, payload);
    } catch {}
  }

  function loadDoc() {
    const doc = readApprovalStore(storePath);
    const nowIso = new Date().toISOString();
    const changed = expirePendingApprovals(doc, nowIso);
    if (changed) writeApprovalStore(storePath, doc);
    return doc;
  }

  function listApprovals(options = {}) {
    const doc = loadDoc();
    const status = String(options.status || "").trim().toLowerCase();
    const limitRaw = Number(options.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.round(limitRaw))) : 50;
    let rows = doc.approvals.slice().reverse();
    if (status) {
      rows = rows.filter((item) => String(item.status || "").toLowerCase() === status);
    }
    return rows.slice(0, limit);
  }

  function createApproval({ tool, payload, actor }) {
    const doc = loadDoc();
    const now = new Date();
    const nowIso = now.toISOString();
    const inputHash = hashObject(payload || {});
    const duplicate = doc.approvals.find((item) => (
      item.status === "pending"
      && item.tool === tool
      && item.inputHash === inputHash
    ));
    if (duplicate) {
      return duplicate;
    }
    const id = `gwapr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(now.getTime() + approvalTtlMs).toISOString();
    const approval = {
      id,
      tool,
      status: "pending",
      actor: String(actor || "unknown").slice(0, 120),
      inputHash,
      inputPreview: redactPreview(payload || {}),
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt,
      decisionBy: "",
      decisionReason: "",
      decidedAt: "",
      usedAt: ""
    };
    doc.approvals.push(approval);
    writeApprovalStore(storePath, doc);
    emitEvent("approval.created", { approval });
    appendGraphEvent({
      component: "gateway-tool-authority",
      category: "gateway_approval",
      action: "approval_created",
      actor: {
        type: "gateway_actor",
        id: String(actor || "unknown").slice(0, 120)
      },
      target: {
        type: "gateway_tool",
        id: tool,
        criticality: isApprovalRequired(tool) ? "high" : "medium"
      },
      context: {
        tool,
        approvalId: approval.id
      },
      policy: {
        approvalState: "pending",
        mode: "gateway"
      }
    });
    appendActionManifest({
      component: "gateway-tool-authority",
      action: tool,
      status: "approval_required",
      actor: {
        type: "gateway_actor",
        id: String(actor || "unknown").slice(0, 120)
      },
      target: {
        type: "gateway_tool",
        id: tool,
        criticality: isApprovalRequired(tool) ? "high" : "medium"
      },
      reason: `Gateway tool "${tool}" requires approval before execution.`,
      context: {
        tool,
        approvalId: approval.id
      },
      policy: {
        approvalState: "pending",
        mode: "gateway",
        rollbackRequired: true
      },
      evidence: {
        inputPreview: JSON.stringify(redactPreview(payload || {})).slice(0, 320)
      }
    });
    return approval;
  }

  function decideApproval(inputDecision = {}) {
    const id = String(inputDecision.id || "").trim();
    const decisionRaw = String(inputDecision.decision || "").trim().toLowerCase();
    const reason = String(inputDecision.reason || "").trim().slice(0, 260);
    const actor = String(inputDecision.actor || "manual").trim().slice(0, 120);
    if (!id) throw toError("Approval id is required.", 400, "approval_id_required");
    const decision = decisionRaw === "approve" ? "approved" : decisionRaw === "deny" || decisionRaw === "reject" ? "denied" : "";
    if (!decision) throw toError("Decision must be approve or deny.", 400, "approval_decision_invalid");

    const doc = loadDoc();
    const nowIso = new Date().toISOString();
    const approval = doc.approvals.find((item) => item.id === id);
    if (!approval) throw toError("Approval not found.", 404, "approval_not_found");
    if (approval.status !== "pending") {
      return approval;
    }
    approval.status = decision;
    approval.updatedAt = nowIso;
    approval.decidedAt = nowIso;
    approval.decisionBy = actor;
    approval.decisionReason = reason || (decision === "approved" ? "approved" : "denied");
    writeApprovalStore(storePath, doc);
    emitEvent("approval.decided", { approval });
    appendGraphEvent({
      component: "gateway-tool-authority",
      category: "gateway_approval",
      action: `approval_${decision}`,
      actor: {
        type: "gateway_actor",
        id: actor
      },
      target: {
        type: "gateway_tool",
        id: approval.tool,
        criticality: isApprovalRequired(approval.tool) ? "high" : "medium"
      },
      context: {
        tool: approval.tool,
        approvalId: approval.id
      },
      policy: {
        approvalState: decision,
        mode: "gateway"
      },
      detail: {
        reason: approval.decisionReason || ""
      }
    });
    return approval;
  }

  function consumeApproval(approvalId, tool, payload, actor) {
    const wanted = String(approvalId || "").trim();
    if (!wanted) throw toError("approvalId is required for this tool.", 403, "approval_id_required");
    const inputHash = hashObject(payload || {});
    const doc = loadDoc();
    const nowIso = new Date().toISOString();
    const approval = doc.approvals.find((item) => item.id === wanted);
    if (!approval) throw toError("Approval not found.", 404, "approval_not_found");
    if (approval.status !== "approved") throw toError(`Approval is ${approval.status}.`, 403, "approval_not_approved");
    if (approval.usedAt) throw toError("Approval already used.", 409, "approval_already_used");
    if (approval.tool !== tool || approval.inputHash !== inputHash) {
      throw toError("Approval does not match this tool invocation.", 403, "approval_mismatch");
    }
    approval.usedAt = nowIso;
    approval.updatedAt = nowIso;
    approval.usedBy = String(actor || "unknown").slice(0, 120);
    writeApprovalStore(storePath, doc);
    emitEvent("approval.used", { approval });
    appendGraphEvent({
      component: "gateway-tool-authority",
      category: "gateway_approval",
      action: "approval_used",
      actor: {
        type: "gateway_actor",
        id: String(actor || "unknown").slice(0, 120)
      },
      target: {
        type: "gateway_tool",
        id: tool,
        criticality: isApprovalRequired(tool) ? "high" : "medium"
      },
      context: {
        tool,
        approvalId: approval.id
      },
      policy: {
        approvalState: "approved",
        mode: "gateway"
      }
    });
    return approval;
  }

  function getSummary() {
    const doc = loadDoc();
    const counts = {
      pending: 0,
      approved: 0,
      denied: 0,
      expired: 0,
      used: 0
    };
    for (const item of doc.approvals) {
      const status = String(item.status || "").toLowerCase();
      if (status in counts) counts[status] += 1;
      if (item.usedAt) counts.used += 1;
    }
    return {
      storePath,
      total: doc.approvals.length,
      counts
    };
  }

  return {
    listApprovals,
    createApproval,
    decideApproval,
    consumeApproval,
    getSummary
  };
}

module.exports = {
  createGatewayToolApprovalStore,
  redactPreview
};
