/**
 * Gateway Routes — extracted from server.js (ADR-0001 strangler-fig)
 * Proxy routes to the gateway control API service.
 */
const express = require("express");
const router = express.Router();
const { respondError, asInt } = require("../../lib/helpers");

function createGatewayRouter({ callGatewayControlApi, isLoopbackRequest }) {

  function loopbackGuard(req, res) {
    if (!isLoopbackRequest(req)) {
      respondError(res, "Gateway control is only allowed from local loopback.", 403);
      return false;
    }
    return true;
  }

  router.get("/authority/status", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      const targetModeRaw = String(req.query?.targetMode || "").trim().toLowerCase();
      const targetMode = targetModeRaw && /^[a-z_]{3,40}$/.test(targetModeRaw) ? targetModeRaw : "";
      const route = targetMode ? `/authority/status?targetMode=${encodeURIComponent(targetMode)}` : "/authority/status";
      return res.json(await callGatewayControlApi("GET", route));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.get("/authority/readiness", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      const targetModeRaw = String(req.query?.targetMode || "asolaria_primary").trim().toLowerCase();
      if (!/^[a-z_]{3,40}$/.test(targetModeRaw)) return respondError(res, "Invalid targetMode value.", 400);
      return res.json(await callGatewayControlApi("GET", `/authority/readiness?targetMode=${encodeURIComponent(targetModeRaw)}`));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/authority/readiness/drill", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      const targetModeRaw = String(req.body?.targetMode || "asolaria_primary").trim().toLowerCase();
      if (!/^[a-z_]{3,40}$/.test(targetModeRaw)) return respondError(res, "Invalid targetMode value.", 400);
      return res.json(await callGatewayControlApi("POST", "/authority/readiness/drill", { targetMode: targetModeRaw }));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/heartbeat/run", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("POST", "/heartbeat/run", {}));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/heartbeat/daemon/run", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("POST", "/heartbeat/daemon/run", {}));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/heartbeat/daemon/start", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("POST", "/heartbeat/daemon/start", {}));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/heartbeat/daemon/stop", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("POST", "/heartbeat/daemon/stop", {}));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.get("/heartbeat/daemon/status", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("GET", "/heartbeat/daemon/status"));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.get("/audit/status", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("GET", "/audit/status"));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.get("/audit/events", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      const limit = asInt(req.query?.limit, 15, 1, 100);
      const typeRaw = String(req.query?.type || "").trim();
      if (typeRaw && !/^[A-Za-z0-9._:-]{1,100}$/.test(typeRaw)) return respondError(res, "Invalid type filter.", 400);
      const sinceRaw = String(req.query?.since || "").trim();
      if (sinceRaw && !Number.isFinite(Date.parse(sinceRaw))) return respondError(res, "Invalid since timestamp.", 400);
      const query = new URLSearchParams();
      query.set("limit", String(limit));
      if (typeRaw) query.set("type", typeRaw);
      if (sinceRaw) query.set("since", sinceRaw);
      return res.json(await callGatewayControlApi("GET", `/audit/events?${query.toString()}`));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.get("/audit/verify", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("GET", "/audit/verify"));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  router.post("/audit/verify", async (req, res) => {
    if (!loopbackGuard(req, res)) return;
    try {
      return res.json(await callGatewayControlApi("POST", "/audit/verify", {}));
    } catch (error) { return respondError(res, error, Number(error?.statusCode || 502)); }
  });

  return router;
}

module.exports = createGatewayRouter;
