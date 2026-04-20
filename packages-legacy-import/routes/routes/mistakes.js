/**
 * Mistakes Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const {
  listMistakePatterns, upsertMistakePattern, pruneObsoleteMistakePatterns,
  buildMistakeAvoidanceHints, getMistakePatternSummary
} = require("../src/mistakePatternStore");
const { appendMistakeLedger } = require("../src/mistakeLedgerStore");

function asInt(v, fb, mn, mx) { const n = parseInt(v, 10); if (isNaN(n)) return fb; return Math.max(mn, Math.min(mx, n)); }

function createMistakesRouter({ settings, respondError, inferHttpStatusForError }) {

  router.get("/patterns", (req, res) => {
    const status = String(req.query?.status || "active").trim().toLowerCase();
    const limit = asInt(req.query?.limit, 120, 1, 1000);
    const skillId = String(req.query?.skillId || req.query?.skill || "").trim();
    const toolId = String(req.query?.toolId || req.query?.tool || "").trim();
    const activityType = String(req.query?.activityType || req.query?.activity || "").trim();
    const patterns = listMistakePatterns({ status, limit, skillId, toolId, activityType });
    return res.json({
      ok: true,
      enabled: Boolean(settings.mistakeTaxonomyEnabled),
      hintsMax: Number(settings.mistakeTaxonomyHintsMax || 8),
      archiveDays: Number(settings.mistakeTaxonomyArchiveDays || 180),
      archiveMaxIdleDays: Number(settings.mistakeTaxonomyArchiveDays || 180),
      ...patterns
    });
  });

  router.post("/patterns/upsert", (req, res) => {
    if (!settings.mistakeTaxonomyEnabled) {
      return respondError(res, "Mistake taxonomy is disabled in settings.", 409);
    }
    try {
      const result = upsertMistakePattern(req.body || {});
      return res.json({ ok: true, ...result, summary: getMistakePatternSummary() });
    } catch (error) {
      try {
        appendMistakeLedger({
          feature: "mistake_patterns", operation: "upsert", type: "mistake_pattern_upsert_error",
          severity: "medium", actor: "owner", laneId: "control_plane",
          message: String(error?.message || error || "upsert_failed").slice(0, 240),
          code: "mistake_pattern_upsert_error", classificationCode: "8.2.22",
          activityType: "mistake_taxonomy", skillId: "", toolId: ""
        });
      } catch (_) { /* best-effort */ }
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/patterns/prune", (req, res) => {
    try {
      const maxIdleDays = asInt(
        req.body?.maxIdleDays ?? req.body?.maxAgeDays,
        settings.mistakeTaxonomyArchiveDays, 7, 3650
      );
      const result = pruneObsoleteMistakePatterns({ maxIdleDays });
      settings.mistakeTaxonomyArchiveDays = maxIdleDays;
      settings.mistakeArchiveMaxIdleDays = maxIdleDays;
      process.env.ASOLARIA_MISTAKE_TAXONOMY_ARCHIVE_DAYS = String(maxIdleDays);
      process.env.ASOLARIA_MISTAKE_ARCHIVE_MAX_IDLE_DAYS = String(maxIdleDays);
      return res.json({ ok: true, ...result, summary: getMistakePatternSummary() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/hints", (req, res) => {
    const defaultHintsMax = Math.max(1, Number(settings.mistakeTaxonomyHintsMax || settings.mistakeHintsMax || 8));
    const limit = asInt(req.query?.limit, defaultHintsMax, 1, 24);
    const hintsResult = buildMistakeAvoidanceHints({
      status: String(req.query?.status || "active").trim().toLowerCase() || "active",
      skillId: String(req.query?.skillId || req.query?.skill || "").trim(),
      toolId: String(req.query?.toolId || req.query?.tool || "").trim(),
      activityType: String(req.query?.activityType || req.query?.activity || "").trim(),
      limit
    });
    return res.json({ ok: true, enabled: Boolean(settings.mistakeTaxonomyEnabled), limit, ...hintsResult });
  });

  return router;
}

module.exports = createMistakesRouter;
