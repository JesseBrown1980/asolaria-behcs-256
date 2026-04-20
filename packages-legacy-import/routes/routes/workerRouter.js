/**
 * Worker Router Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const { asInt, respondError, inferHttpStatusForError } = require("../../lib/helpers");
const {
  getWorkerRouterStatus, listWorkerDispatches, getWorkerDispatch,
  recommendWorker, dispatchWorkerTask
} = require("../../src/connectors/workerRouter");

router.get("/status", (_req, res) => {
  try {
    return res.json({ ok: true, status: getWorkerRouterStatus() });
  } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
});

router.get("/dispatches", (req, res) => {
  try {
    const limit = asInt(req.query?.limit, 25, 1, 200);
    return res.json({ ok: true, dispatches: listWorkerDispatches(limit) });
  } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
});

router.get("/dispatches/:id", (req, res) => {
  try {
    const dispatch = getWorkerDispatch(String(req.params.id || "").trim());
    if (!dispatch) return respondError(res, "Worker dispatch not found.", 404);
    return res.json({ ok: true, dispatch });
  } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 404)); }
});

router.post("/recommend", (req, res) => {
  try {
    return res.json({ ok: true, recommendation: recommendWorker(req.body || {}) });
  } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 400)); }
});

router.post("/dispatch", async (req, res) => {
  try {
    const dispatch = await dispatchWorkerTask(req.body || {});
    return res.json({ ok: true, dispatch });
  } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 400)); }
});

module.exports = router;
