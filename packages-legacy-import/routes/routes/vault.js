/**
 * Vault Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const { getVaultStatus } = require("../src/secureVault");

router.get("/status", (_req, res) => {
  res.json({ ok: true, vault: getVaultStatus() });
});

module.exports = router;
