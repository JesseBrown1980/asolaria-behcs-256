/**
 * Hooks Connector Routes — Extracted from server.js (ADR-0001 Phase 3)
 * Handles: /api/hooks/*
 */

const express = require("express");
const router = express.Router();

const {
  getGuardVerdict,
  ingestHookEvent,
  getHookDashboard,
  getSessionDetail,
  injectSessionContext,
  queryHookEvents,
  getHookEventStats,
  listActiveSessions,
  backupTranscript
} = require("../../src/connectors/hooksConnector");

function respondError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return res.status(status).json({ ok: false, error: message });
}

router.post("/events", (req, res) => {
  try {
    return res.json(ingestHookEvent(req.body || {}));
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.get("/dashboard", (_req, res) => {
  try {
    return res.json({ ok: true, ...getHookDashboard() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/sessions", (_req, res) => {
  try {
    return res.json({ ok: true, sessions: listActiveSessions() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/sessions/:id", (req, res) => {
  try {
    const detail = getSessionDetail(req.params.id);
    if (!detail.session && !detail.summary) {
      return respondError(res, "Session not found.", 404);
    }
    return res.json({ ok: true, ...detail });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.post("/guard", (req, res) => {
  try {
    const body = req.body || {};
    const verdict = getGuardVerdict(
      String(body.tool_name || ""),
      body.tool_input || {}
    );
    return res.json({ ok: true, ...verdict });
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.post("/backup-transcript", (req, res) => {
  try {
    const body = req.body || {};
    const result = backupTranscript(
      String(body.session_id || ""),
      String(body.transcript_path || ""),
      String(body.trigger || "manual")
    );
    return res.json(result);
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.get("/context/:id", (req, res) => {
  try {
    const source = String(req.query?.source || "startup");
    return res.json({ ok: true, ...injectSessionContext(req.params.id, source) });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/stats", (_req, res) => {
  try {
    const stats = getHookEventStats();
    stats.activeSessions = listActiveSessions().length;
    return res.json({ ok: true, ...stats });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/events", (req, res) => {
  try {
    const events = queryHookEvents({
      sessionId: req.query?.sessionId,
      eventType: req.query?.eventType,
      since: req.query?.since,
      limit: Number(req.query?.limit || 200)
    });
    return res.json({ ok: true, events });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

module.exports = router;
