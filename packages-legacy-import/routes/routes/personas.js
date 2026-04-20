/**
 * Personas Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const {
  listPersonas, setActivePersona, upsertPersona, clearActivePersona,
  removePersona, getPersonaStoreSummary
} = require("../src/personaStore");

function createPersonasRouter({ respondError }) {
  router.get("/", (_req, res) => {
    res.json({ ok: true, ...listPersonas(), store: getPersonaStoreSummary() });
  });

  router.post("/activate", (req, res) => {
    try {
      const id = String(req.body?.id || "").trim();
      if (!id) return respondError(res, "Persona id is required.", 400);
      const active = setActivePersona(id);
      return res.json({ ok: true, active, store: getPersonaStoreSummary() });
    } catch (error) { return respondError(res, error, 400); }
  });

  router.post("/upsert", (req, res) => {
    try {
      const id = String(req.body?.id || req.body?.name || "").trim();
      const instructions = String(req.body?.instructions || req.body?.prompt || "").trim();
      if (!id || !instructions) return respondError(res, "Persona id and instructions are required.", 400);
      const persona = upsertPersona({
        id, name: String(req.body?.name || "").trim(),
        summary: String(req.body?.summary || "").trim(), instructions
      });
      return res.json({ ok: true, persona, store: getPersonaStoreSummary() });
    } catch (error) { return respondError(res, error, 400); }
  });

  router.post("/clear", (_req, res) => {
    clearActivePersona();
    return res.json({ ok: true, active: null, store: getPersonaStoreSummary() });
  });

  router.delete("/:id", (req, res) => {
    try {
      const id = String(req.params?.id || "").trim();
      if (!id) return respondError(res, "Persona id is required.", 400);
      const removed = removePersona(id);
      return res.json({ ok: true, removed, store: getPersonaStoreSummary() });
    } catch (error) { return respondError(res, error, 400); }
  });

  return router;
}

module.exports = createPersonasRouter;
