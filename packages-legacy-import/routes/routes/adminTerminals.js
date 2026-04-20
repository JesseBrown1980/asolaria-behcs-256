/**
 * Admin Terminals Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();

function asBool(v, fb) { const s = String(v ?? "").trim().toLowerCase(); if (!s) return fb; return s === "1" || s === "true" || s === "yes"; }

function createAdminTerminalsRouter({
  respondError,
  getCachedAdminTerminalCockpitSnapshot,
  ensureAdminTerminalCockpit,
  stopAdminTerminalCockpit,
  promptAdminTerminalCockpit,
  normalizeAdminTerminalId,
  adminTerminalCockpitCache,
  ADMIN_TERMINAL_COCKPIT_TTL_MS
}) {

  router.get("/cockpit", async (_req, res) => {
    try {
      const snapshot = await getCachedAdminTerminalCockpitSnapshot();
      return res.json({ ok: true, ...snapshot });
    } catch (error) { return respondError(res, error, 500); }
  });

  router.post("/cockpit/ensure", async (req, res) => {
    try {
      const requestedIds = Array.isArray(req.body?.terminalIds)
        ? req.body.terminalIds
        : [req.body?.terminalId].filter(Boolean);
      const terminalIds = requestedIds.map((v) => normalizeAdminTerminalId(v, "")).filter(Boolean);
      const result = await ensureAdminTerminalCockpit({
        terminalIds,
        autoBootstrap: asBool(req.body?.autoBootstrap, true),
        forceBootstrap: asBool(req.body?.forceBootstrap, false),
        replace: asBool(req.body?.replace, false),
        source: String(req.body?.source || "Asolaria").trim() || "Asolaria",
        reason: String(req.body?.reason || "dashboard_bootstrap").trim() || "dashboard_bootstrap"
      });
      adminTerminalCockpitCache.payload = result.cockpit;
      adminTerminalCockpitCache.expiresAt = Date.now() + ADMIN_TERMINAL_COCKPIT_TTL_MS;
      return res.json(result);
    } catch (error) { return respondError(res, error, 400); }
  });

  router.post("/cockpit/stop", (req, res) => {
    try {
      const requestedIds = Array.isArray(req.body?.terminalIds)
        ? req.body.terminalIds
        : [req.body?.terminalId].filter(Boolean);
      const terminalIds = requestedIds.map((v) => normalizeAdminTerminalId(v, "")).filter(Boolean);
      const result = stopAdminTerminalCockpit({ terminalIds });
      adminTerminalCockpitCache.payload = result.cockpit;
      adminTerminalCockpitCache.expiresAt = Date.now() + ADMIN_TERMINAL_COCKPIT_TTL_MS;
      return res.json(result);
    } catch (error) { return respondError(res, error, 400); }
  });

  router.post("/cockpit/prompt", async (req, res) => {
    try {
      const terminalId = normalizeAdminTerminalId(req.body?.terminalId, "");
      if (!terminalId) return respondError(res, "terminalId is required.", 400);
      return res.json(await promptAdminTerminalCockpit(terminalId, {
        text: req.body?.text,
        source: String(req.body?.source || "Asolaria").trim() || "Asolaria",
        reason: String(req.body?.reason || "dashboard_prompt").trim() || "dashboard_prompt"
      }));
    } catch (error) { return respondError(res, error, 400); }
  });

  return router;
}

module.exports = createAdminTerminalsRouter;
