/**
 * Public Worker Router Routes — read-only compat surface for 4781.
 */
const express = require("express");
const { asInt, respondError, inferHttpStatusForError } = require("../../lib/helpers");
const {
  readPublicWorkerRouterStatus,
  listPublicWorkerRouterDispatches,
  getPublicWorkerRouterDispatch
} = require("../../src/connectors/workerRouterPublicRead");

const router = express.Router();

router.get("/status", (_req, res) => {
  try {
    return res.json({ ok: true, status: readPublicWorkerRouterStatus() });
  } catch (error) {
    return respondError(res, error, inferHttpStatusForError(error, 500));
  }
});

router.get("/dispatches", (req, res) => {
  try {
    const limit = asInt(req.query?.limit, 25, 1, 200);
    return res.json({ ok: true, dispatches: listPublicWorkerRouterDispatches(limit) });
  } catch (error) {
    return respondError(res, error, inferHttpStatusForError(error, 500));
  }
});

router.get("/dispatches/:id", (req, res) => {
  try {
    const dispatch = getPublicWorkerRouterDispatch(String(req.params.id || "").trim());
    if (!dispatch) return respondError(res, "Worker dispatch not found.", 404);
    return res.json({ ok: true, dispatch });
  } catch (error) {
    return respondError(res, error, inferHttpStatusForError(error, 404));
  }
});

module.exports = router;
