const express = require("express");
const {
  listMistakePatterns,
  createMistakePattern,
  archiveMistakePattern,
  buildMistakeAvoidanceHints
} = require("../src/mistakePatternStore");

const router = express.Router();

router.get("/patterns", (_req, res) => {
  try {
    const result = listMistakePatterns({
      status: String(_req.query?.status || "active").trim(),
      skillId: String(_req.query?.skillId || "").trim(),
      toolId: String(_req.query?.toolId || "").trim(),
      activityType: String(_req.query?.activityType || "").trim(),
      limit: Number(_req.query?.limit || 120)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "list_failed") });
  }
});

router.post("/patterns", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = createMistakePattern(body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "create_failed") });
  }
});

router.delete("/patterns/:id", (req, res) => {
  try {
    const result = archiveMistakePattern(req.params.id);
    if (!result.ok) {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "archive_failed") });
  }
});

router.get("/hints", (req, res) => {
  try {
    const result = buildMistakeAvoidanceHints({
      status: String(req.query?.status || "active").trim(),
      skillId: String(req.query?.skillId || "").trim(),
      toolId: String(req.query?.toolId || "").trim(),
      activityType: String(req.query?.activityType || "").trim(),
      limit: Number(req.query?.limit || 8)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "hints_failed") });
  }
});

module.exports = router;
