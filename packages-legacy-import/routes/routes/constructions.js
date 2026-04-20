const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");

function createConstructionsRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;

  router.get("/status", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /status",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/register", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "POST /register",
        stub: true,
        request: { params: req.params, query: req.query, body: req.body || {} }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "DELETE /:id",
        stub: true,
        request: { params: req.params, query: req.query, body: req.body || {} }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/process", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "POST /process",
        stub: true,
        request: { params: req.params, query: req.query, body: req.body || {} }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/complete/:agentId", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "POST /complete/:agentId",
        stub: true,
        request: { params: req.params, query: req.query, body: req.body || {} }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/spawner/status", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /spawner/status",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/agents/active", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /agents/active",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/tracers/list", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /tracers/list",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/watcher/status", (req, res) => {
    try {
      return res.json({
        ok: true,
        file: "constructions.js",
        endpoint: "GET /watcher/status",
        stub: true,
        request: { params: req.params, query: req.query }
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  return router;
}

module.exports = createConstructionsRouter;
