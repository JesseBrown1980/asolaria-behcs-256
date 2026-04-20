/**
 * Connector Manifest Routes — Extracted from server.js (ADR-0001 Phase 3)
 * Handles: /api/connectors/manifests/*
 */

const express = require("express");
const router = express.Router();

const { getManifestSummary, getConnectorManifest } = require("../../src/connectorManifest");

function respondError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return res.status(status).json({ ok: false, error: message });
}

router.get("/", (_req, res) => {
  try {
    return res.json({ ok: true, ...getManifestSummary() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/:id", (req, res) => {
  try {
    const manifest = getConnectorManifest(String(req.params.id));
    if (!manifest) return respondError(res, "Connector not found.", 404);
    return res.json({ ok: true, ...manifest });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

module.exports = router;
