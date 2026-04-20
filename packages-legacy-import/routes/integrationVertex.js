const express = require("express");
const { respondError, inferHttpStatusForError } = require("../lib/helpers");

function createVertexIntegrationRouter({ vertexPolicy, getVertexIntegrationStatus }) {
  const router = express.Router();

  // GET /status
  router.get("/status", (_req, res) => {
    try {
      const status = getVertexIntegrationStatus(vertexPolicy);
      return res.json({ ok: true, status });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  return router;
}

module.exports = createVertexIntegrationRouter;
