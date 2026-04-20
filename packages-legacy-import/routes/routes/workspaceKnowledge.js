/**
 * Workspace Knowledge Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const {
  rebuildSemanticKnowledgeIndex, getSemanticKnowledgeStatus
} = require("../../src/semanticKnowledgeStore");

function asInt(v, fb, mn, mx) { const n = parseInt(v, 10); if (isNaN(n)) return fb; return Math.max(mn, Math.min(mx, n)); }

function createWorkspaceKnowledgeRouter({ respondError, getHybridWorkspaceKnowledgeStatus, searchHybridWorkspaceKnowledge }) {

  router.get("/status", async (_req, res) => {
    const status = await getHybridWorkspaceKnowledgeStatus({});
    res.json(status);
  });

  router.get("/search", async (req, res) => {
    const query = String(req.query?.q || req.query?.query || "").trim();
    if (!query) return respondError(res, "q is required.", 400);
    const limit = asInt(req.query?.limit, 8, 1, 30);
    const result = await searchHybridWorkspaceKnowledge(query, { limit });
    return res.json(result);
  });

  router.get("/index/status", async (_req, res) => {
    const status = await getHybridWorkspaceKnowledgeStatus({});
    res.json(status);
  });

  router.get("/index/search", async (req, res) => {
    const query = String(req.query?.q || req.query?.query || "").trim();
    if (!query) return respondError(res, "q is required.", 400);
    const limit = asInt(req.query?.limit, 8, 1, 30);
    const result = await searchHybridWorkspaceKnowledge(query, { limit });
    return res.json(result);
  });

  router.post("/semantic/rebuild", async (req, res) => {
    try {
      const result = await rebuildSemanticKnowledgeIndex({
        model: req.body?.model,
        outputDimensionality: req.body?.outputDimensionality,
        maxDocs: req.body?.maxDocs,
        batchSize: req.body?.batchSize
      });
      return res.json({ ok: true, result, status: getSemanticKnowledgeStatus() });
    } catch (error) {
      return respondError(res, String(error?.message || error || "semantic_rebuild_failed"), 500);
    }
  });

  return router;
}

module.exports = createWorkspaceKnowledgeRouter;
