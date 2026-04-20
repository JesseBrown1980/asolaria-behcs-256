/**
 * Captures Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const path = require("path");
const {
  getCapturesPolicy, collectCapturesStats, enqueueCapturesPrune,
  markCaptureImportant, pruneImportantCaptures, pruneTrashCaptures,
  captureDesktopState
} = require("../src/connectors/capturesConnector");

function asBool(v, fb) { const s = String(v ?? "").trim().toLowerCase(); if (!s) return fb; return s === "1" || s === "true" || s === "yes"; }

function createCapturesRouter({ respondError, capturesDir }) {

  router.get("/stats", (_req, res) => {
    try {
      const policy = getCapturesPolicy();
      const stats = collectCapturesStats(policy);
      return res.json({ ok: true, policy, stats });
    } catch (error) { return respondError(res, error, 500); }
  });

  router.post("/prune", (req, res) => {
    try {
      const body = req.body || {};
      const job = enqueueCapturesPrune({
        dryRun: asBool(body.dryRun, false),
        keep: body.keep,
        minAgeMinutes: body.minAgeMinutes,
        pruneMode: body.pruneMode
      });
      return res.json({ ok: true, job, reply: `Queued captures prune as job ${job.id}.` });
    } catch (error) { return respondError(res, error, 400); }
  });

  router.post("/important", (req, res) => {
    try {
      const body = req.body || {};
      const capturePath = String(body.capturePath || body.path || body.filePath || "").trim();
      if (!capturePath) return respondError(res, "capturePath is required.", 400);

      const result = markCaptureImportant({
        capturePath,
        note: body.note,
        sensitive: asBool(body.sensitive, false)
      });

      try {
        const state = captureDesktopState();
        const originalAbs = result.originalPath ? path.join(capturesDir, result.originalPath) : "";
        const nextAbs = result.importantPath ? path.join(capturesDir, result.importantPath) : "";
        if (originalAbs && nextAbs && state.lastPath && path.resolve(state.lastPath) === path.resolve(originalAbs)) {
          state.lastPath = nextAbs;
          state.lastFileName = path.basename(nextAbs);
        }
      } catch (_) { /* best effort */ }

      let retention = null;
      try {
        const important = pruneImportantCaptures({ dryRun: false });
        const trash = pruneTrashCaptures({ dryRun: false });
        retention = {
          ok: Boolean(important.ok && trash.ok),
          important: important.important,
          trash: trash.trash,
          errors: [
            ...(Array.isArray(important.errors) ? important.errors : []),
            ...(Array.isArray(trash.errors) ? trash.errors : [])
          ].filter(Boolean).slice(0, 30)
        };
      } catch (_) { retention = null; }

      return res.json({ ok: true, result, retention });
    } catch (error) { return respondError(res, error, 400); }
  });

  return router;
}

module.exports = createCapturesRouter;
