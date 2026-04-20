const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");
const {
  getSymphonyIntegrationStatus,
  startSymphonyService,
  stopSymphonyService,
  restartSymphonyService,
  submitSymphonyWorkItem
} = require("../../src/connectors/symphonyConnector");
const {
  getGeminiApiConfigSummary,
  runGeminiApiGenerateContent,
  runGeminiApiEmbedContent
} = require("../../src/connectors/geminiApiConnector");
const {
  getGoogleIntegrationStatus,
  listGmailMessages,
  listUpcomingEvents,
  searchDriveDocs,
  getGoogleDocPlainText,
  googleApiRequest
} = require("../../src/connectors/googleConnector");

function buildIntegrationOpsStatusPayload() {
  return {
    ok: true,
    symphony: getSymphonyIntegrationStatus(),
    gemini: getGeminiApiConfigSummary(),
    google: getGoogleIntegrationStatus()
  };
}

function createIntegrationOpsRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;

  router.get("/status", (_req, res) => {
    try {
      return res.json(buildIntegrationOpsStatusPayload());
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/symphony/submit", async (req, res) => {
    try {
      return res.json({ ok: true, result: await submitSymphonyWorkItem(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/symphony/start", async (req, res) => {
    try {
      return res.json({ ok: true, result: await Promise.resolve(startSymphonyService(req.body || {})) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/symphony/stop", async (req, res) => {
    try {
      return res.json({ ok: true, result: await Promise.resolve(stopSymphonyService(req.body || {})) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/symphony/restart", async (req, res) => {
    try {
      return res.json({ ok: true, result: await Promise.resolve(restartSymphonyService(req.body || {})) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/symphony/status", (_req, res) => {
    try {
      return res.json({ ok: true, status: getSymphonyIntegrationStatus() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/gemini_api/embed", async (req, res) => {
    try {
      return res.json({ ok: true, result: await runGeminiApiEmbedContent(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/gemini_api/generate", async (req, res) => {
    try {
      return res.json({ ok: true, result: await runGeminiApiGenerateContent(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/gmail/inbox", async (req, res) => {
    try {
      return res.json({ ok: true, result: await listGmailMessages(req.query || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/google/status", (_req, res) => {
    try {
      return res.json({ ok: true, status: getGoogleIntegrationStatus() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/calendar/upcoming", async (req, res) => {
    try {
      return res.json({ ok: true, result: await listUpcomingEvents(req.query || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/drive/search", async (req, res) => {
    try {
      return res.json({ ok: true, result: await searchDriveDocs(req.query || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/google/doc/plain-text", async (req, res) => {
    try {
      return res.json({ ok: true, result: await getGoogleDocPlainText(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/google/api/request", async (req, res) => {
    try {
      return res.json({ ok: true, result: await googleApiRequest(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  return router;
}

module.exports = createIntegrationOpsRouter;
module.exports.buildIntegrationOpsStatusPayload = buildIntegrationOpsStatusPayload;
