/**
 * Gateway Token Management Routes — Extracted from server.js (ADR-0001 Phase 3)
 * Handles: /api/gateway/tokens/*
 */

const express = require("express");
const router = express.Router();

const { generateToken, listTokens, revokeToken } = require("../../middleware/auth");

function respondError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return res.status(status).json({ ok: false, error: message });
}

router.get("/", (_req, res) => {
  try {
    return res.json({ ok: true, tokens: listTokens() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.post("/", (req, res) => {
  try {
    const { label, role } = req.body || {};
    if (!label) return respondError(res, "Token label is required.", 400);
    const result = generateToken(label, role || "admin");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.delete("/:hint", (req, res) => {
  try {
    const revoked = revokeToken(String(req.params.hint));
    if (!revoked) return respondError(res, "Token not found.", 404);
    return res.json({ ok: true, revoked: true });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

module.exports = router;
