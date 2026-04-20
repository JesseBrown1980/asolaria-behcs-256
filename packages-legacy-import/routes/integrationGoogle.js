const express = require("express");
const { respondError, inferHttpStatusForError } = require("../lib/helpers");

function createGoogleIntegrationRouter({ googlePolicy, getGoogleIntegrationStatus }) {
  const router = express.Router();

  // GET /status
  router.get("/status", (_req, res) => {
    try {
      const status = getGoogleIntegrationStatus(googlePolicy);
      return res.json({ ok: true, status });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  return router;
}

module.exports = createGoogleIntegrationRouter;
