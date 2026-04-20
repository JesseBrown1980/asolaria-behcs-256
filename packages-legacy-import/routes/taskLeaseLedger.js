const express = require("express");
const {
  getTaskLeaseLedgerSummary,
  getTaskLeaseLedgerState,
  listTaskLeases,
  getTaskLease,
  createTaskLease,
  updateTaskLease,
  heartbeatTaskLease,
  releaseTaskLease
} = require("../src/taskLeaseLedgerStore");

function createTaskLeaseLedgerRouter({ respondError, inferHttpStatusForError }) {
  const router = express.Router();

  function sendError(res, error) {
    return respondError(res, inferHttpStatusForError(error), error);
  }

  router.get("/summary", (_req, res) => {
    try {
      return res.json({ ok: true, summary: getTaskLeaseLedgerSummary() });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/state", (req, res) => {
    try {
      const q = req.query || {};
      return res.json({
        ok: true,
        ...getTaskLeaseLedgerState({
          taskId: q.taskId,
          holderId: q.holderId,
          status: q.status,
          leaseId: q.leaseId,
          eventType: q.eventType,
          eventActor: q.eventActor,
          leaseLimit: q.leaseLimit || q.limit,
          eventLimit: q.eventLimit
        })
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/leases", (req, res) => {
    try {
      const q = req.query || {};
      const leases = listTaskLeases({ taskId: q.taskId, holderId: q.holderId, status: q.status, limit: q.limit });
      return res.json({ ok: true, count: leases.length, leases });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/leases/:id", (req, res) => {
    try {
      const q = req.query || {};
      const lease = getTaskLease(req.params.id, {
        includeEvents: q.includeEvents !== undefined ? q.includeEvents !== "false" : false,
        eventLimit: q.eventLimit
      });
      if (!lease) return res.status(404).json({ ok: false, error: "Lease not found." });
      return res.json({ ok: true, lease });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/leases", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      return res.json({ ok: true, ...createTaskLease(body) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.patch("/leases/:id", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { patch, ...options } = body;
      return res.json({
        ok: true,
        ...updateTaskLease(req.params.id, patch || body, {
          actor: options.actor || options.by,
          source: options.source,
          note: options.note,
          type: options.type
        })
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/leases/:id/heartbeat", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      return res.json({ ok: true, ...heartbeatTaskLease(req.params.id, body) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/leases/:id/release", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      return res.json({ ok: true, ...releaseTaskLease(req.params.id, body) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

module.exports = createTaskLeaseLedgerRouter;
