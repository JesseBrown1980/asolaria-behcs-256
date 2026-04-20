const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");

function createFullMemoryLaneRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;

  router.get("/status", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "fullMemoryLane.js",
        endpoint: "GET /status",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/conversations", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "fullMemoryLane.js",
        endpoint: "GET /conversations",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/conversations/:chatId", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "fullMemoryLane.js",
        endpoint: "GET /conversations/:chatId",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/search", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "fullMemoryLane.js",
        endpoint: "GET /search",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/backfill/public-memory", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "fullMemoryLane.js",
        endpoint: "POST /backfill/public-memory",
        stub: true,
        request: { params: req.params, query: req.query, body: req.body || {} }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  return router;
}

module.exports = createFullMemoryLaneRouter;
