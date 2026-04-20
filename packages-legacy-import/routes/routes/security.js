/**
 * Security Routes — Phase 2 Security Fabric
 * Handles: /api/security/*
 * Command risk classification, secret hardening status, RBAC info
 */

const express = require("express");
const router = express.Router();

const { classifyCommandRisk, COMMAND_RISK_CLASSES } = require("../../src/approvalEngine");
const { getHardeningStatus, listHardenedKeys, hardenSecret } = require("../../src/secretHardening");
const { ROLES, listTokens } = require("../../middleware/auth");

function respondError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return res.status(status).json({ ok: false, error: message });
}

// Classify command risk
router.post("/classify-command", (req, res) => {
  try {
    const { command } = req.body || {};
    if (!command) return respondError(res, "Command text is required.", 400);
    const result = classifyCommandRisk(command);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return respondError(res, error, 400);
  }
});

// Get all risk class definitions
router.get("/risk-classes", (_req, res) => {
  try {
    return res.json({ ok: true, classes: COMMAND_RISK_CLASSES });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

// Get RBAC role definitions
router.get("/roles", (_req, res) => {
  try {
    return res.json({ ok: true, roles: ROLES });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

// Secret hardening status
router.get("/hardening/status", (_req, res) => {
  try {
    return res.json({ ok: true, ...getHardeningStatus() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

// List hardened keys
router.get("/hardening/keys", (_req, res) => {
  try {
    return res.json({ ok: true, keys: listHardenedKeys() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

// Harden a secret (loopback only — sensitive)
router.post("/hardening/protect", (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key || !value) return respondError(res, "Key and value are required.", 400);
    const result = hardenSecret(key, value);
    return res.json(result);
  } catch (error) {
    return respondError(res, error, 400);
  }
});

// Full security dashboard
router.get("/dashboard", (_req, res) => {
  try {
    return res.json({
      ok: true,
      rbac: { roles: Object.keys(ROLES), activeTokens: listTokens().length },
      hardening: getHardeningStatus(),
      riskClasses: Object.keys(COMMAND_RISK_CLASSES),
      phase: "2_active"
    });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

module.exports = router;
