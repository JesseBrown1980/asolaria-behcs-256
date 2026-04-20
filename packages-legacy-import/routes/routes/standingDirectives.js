/**
 * Standing Directives Routes — Extracted from server.js (ADR-0001 Phase 3)
 * Handles: /api/standing-directives/*
 */

const express = require("express");
const router = express.Router();

const {
  listDirectives,
  getDirective,
  createDirective,
  updateDirective,
  deleteDirective,
  getActiveDirectivesText
} = require("../src/standingDirectivesStore");

function respondError(res, error, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return res.status(status).json({ ok: false, error: message });
}

router.get("/", (req, res) => {
  try {
    const active = req.query?.active === "true" ? true : req.query?.active === "false" ? false : undefined;
    return res.json({ ok: true, directives: listDirectives({ active }) });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/active/text", (_req, res) => {
  try {
    return res.json({ ok: true, text: getActiveDirectivesText() });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.get("/:id", (req, res) => {
  try {
    const directive = getDirective(String(req.params.id));
    if (!directive) return respondError(res, "Directive not found.", 404);
    return res.json({ ok: true, directive });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

router.post("/", (req, res) => {
  try {
    const directive = createDirective(req.body || {});
    return res.json({ ok: true, directive });
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.put("/:id", (req, res) => {
  try {
    const updated = updateDirective(String(req.params.id), req.body || {});
    if (!updated) return respondError(res, "Directive not found.", 404);
    return res.json({ ok: true, directive: updated });
  } catch (error) {
    return respondError(res, error, 400);
  }
});

router.delete("/:id", (req, res) => {
  try {
    const deleted = deleteDirective(String(req.params.id));
    if (!deleted) return respondError(res, "Directive not found.", 404);
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    return respondError(res, error, 500);
  }
});

module.exports = router;
