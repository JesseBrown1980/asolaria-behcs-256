const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");

function loadGuardianDependencies() {
  let guardianStore = {};
  let approvalStore = {};
  let settingsStore = {};

  try {
    guardianStore = require("../../src/guardianStore");
  } catch (_error) {
    guardianStore = {};
  }

  try {
    approvalStore = require("../../src/guardianApprovalStore");
  } catch (_error) {
    approvalStore = {};
  }

  try {
    settingsStore = require("../../lib/settings");
  } catch (_error) {
    settingsStore = {};
  }

  return {
    getGuardianStatusSummary: typeof guardianStore.getGuardianStatusSummary === "function"
      ? guardianStore.getGuardianStatusSummary
      : () => ({ profile: null, smtp: null, whatsapp: null, vault: null }),
    readGuardianProfile: typeof guardianStore.readGuardianProfile === "function"
      ? guardianStore.readGuardianProfile
      : () => null,
    bootstrapGuardianProfile: typeof guardianStore.bootstrapGuardianProfile === "function"
      ? guardianStore.bootstrapGuardianProfile
      : (input = {}) => ({ ownerName: String(input.ownerName || "Owner").trim() || "Owner", contacts: [] }),
    updateGuardianProfile: typeof guardianStore.updateGuardianProfile === "function"
      ? guardianStore.updateGuardianProfile
      : (input = {}) => ({ ownerName: String(input.ownerName || "Owner").trim() || "Owner", contacts: [] }),
    readGuardianSmtpConfig: typeof guardianStore.readGuardianSmtpConfig === "function"
      ? guardianStore.readGuardianSmtpConfig
      : () => null,
    setGuardianSmtpConfig: typeof guardianStore.setGuardianSmtpConfig === "function"
      ? guardianStore.setGuardianSmtpConfig
      : (input = {}) => ({ host: String(input.host || "").trim(), port: Number(input.port || 587), configured: false }),
    readGuardianWhatsAppConfig: typeof guardianStore.readGuardianWhatsAppConfig === "function"
      ? guardianStore.readGuardianWhatsAppConfig
      : () => null,
    setGuardianWhatsAppConfig: typeof guardianStore.setGuardianWhatsAppConfig === "function"
      ? guardianStore.setGuardianWhatsAppConfig
      : (input = {}) => ({ enabled: Boolean(input.enabled), configured: false }),
    listApprovals: typeof approvalStore.listApprovals === "function"
      ? approvalStore.listApprovals
      : () => [],
    decideApproval: typeof approvalStore.decideApproval === "function"
      ? approvalStore.decideApproval
      : (input = {}) => ({
        id: String(input.id || "").trim(),
        status: String(input.decision || "").trim().toLowerCase() === "approve" ? "approved" : "denied"
      }),
    createApprovalRequest: typeof approvalStore.createApprovalRequest === "function"
      ? approvalStore.createApprovalRequest
      : (input = {}) => ({
        id: `apr_${Date.now()}`,
        status: "pending",
        action: String(input.action || "").trim(),
        message: String(input.message || "").trim()
      }),
    getSettingsSnapshot: typeof settingsStore.getSettingsSnapshot === "function"
      ? settingsStore.getSettingsSnapshot
      : () => ({})
  };
}

function summarizeApprovals(listApprovals, limit = 200) {
  const rows = Array.isArray(listApprovals({ status: "all", limit })) ? listApprovals({ status: "all", limit }) : [];
  const summary = {
    total: rows.length,
    pending: 0,
    approved: 0,
    denied: 0,
    expired: 0
  };
  for (const row of rows) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (status && Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
  }
  return {
    summary,
    rows
  };
}

function buildGuardianStatusPayload(deps) {
  return {
    ok: true,
    guardian: deps.getGuardianStatusSummary(),
    approvals: summarizeApprovals(deps.listApprovals).summary,
    settings: deps.getSettingsSnapshot()
  };
}

function createGuardianRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;
  const deps = loadGuardianDependencies();

  router.get("/status", (_req, res) => {
    try {
      return res.json(buildGuardianStatusPayload(deps));
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/profile", (_req, res) => {
    try {
      return res.json({ ok: true, profile: deps.readGuardianProfile() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/profile/bootstrap", (req, res) => {
    try {
      return res.json({ ok: true, profile: deps.bootstrapGuardianProfile(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/profile/update", (req, res) => {
    try {
      return res.json({ ok: true, profile: deps.updateGuardianProfile(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/smtp", (_req, res) => {
    try {
      return res.json({ ok: true, smtp: deps.readGuardianSmtpConfig() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/smtp", (req, res) => {
    try {
      return res.json({ ok: true, smtp: deps.setGuardianSmtpConfig(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/whatsapp", (_req, res) => {
    try {
      return res.json({ ok: true, whatsapp: deps.readGuardianWhatsAppConfig() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/whatsapp", (req, res) => {
    try {
      return res.json({ ok: true, whatsapp: deps.setGuardianWhatsAppConfig(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/audit", (_req, res) => {
    try {
      const audit = summarizeApprovals(deps.listApprovals);
      return res.json({
        ok: true,
        guardian: deps.getGuardianStatusSummary(),
        approvals: audit.summary,
        settings: deps.getSettingsSnapshot()
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/approve", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (body.id && body.decision) {
        return res.json({ ok: true, approval: deps.decideApproval(body) });
      }
      const created = deps.createApprovalRequest({
        action: body.action || body.type || "guardian_approval",
        message: body.message || body.reason || "",
        source: body.source || "guardian-router",
        risk: body.risk
      });
      return res.json({ ok: true, approval: created });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/approvals", (req, res) => {
    try {
      const status = String(req.query?.status || "all").trim().toLowerCase() || "all";
      const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 30) || 30));
      return res.json({ ok: true, approvals: deps.listApprovals({ status, limit }) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  return router;
}

module.exports = createGuardianRouter;
module.exports.buildGuardianStatusPayload = buildGuardianStatusPayload;
module.exports.loadGuardianDependencies = loadGuardianDependencies;
