const express = require("express");
const {
  getTaskLedgerSummary,
  getTaskLedgerState,
  listTaskLedgerTasks,
  getTaskLedgerTask,
  createTaskLedgerTask,
  updateTaskLedgerTask,
  deleteTaskLedgerTask,
  listTaskLedgerEvents,
  addTaskLedgerEvent
} = require("../src/taskLedgerStore");
const {
  getTaskLease,
  releaseTaskLease
} = require("../src/taskLeaseLedgerStore");
const {
  decorateTaskLeaseContext,
  decorateTaskLeaseContextList
} = require("../src/taskLeaseView");

function createTaskLedgerRouter({ respondError, inferHttpStatusForError }) {
  const router = express.Router();

  function sendError(res, error) {
    const status = inferHttpStatusForError(error);
    return respondError(res, status, error);
  }

  function withLeaseLedger(task) {
    return task ? decorateTaskLeaseContext(task) : task;
  }

  function withLeaseLedgerList(tasks) {
    return decorateTaskLeaseContextList(tasks);
  }

  function syncTerminalTaskLease(task, options = {}) {
    const status = String(task?.status || "").trim().toLowerCase();
    if (!options.forceRelease && !["done", "canceled", "archived"].includes(status)) {
      return null;
    }
    const leaseId = String(task?.lastLeaseId || "").trim();
    if (!leaseId) {
      return null;
    }
    const lease = getTaskLease(leaseId);
    if (!lease || !["queued", "active"].includes(String(lease.status || "").trim().toLowerCase())) {
      return null;
    }
    return releaseTaskLease(leaseId, {
      status: status === "done" && !options.forceRelease ? "completed" : "released",
      actor: options.actor || options.by || "task-ledger",
      source: options.source || "task-ledger",
      note: options.note || (options.forceRelease ? "Task removed; closing linked lease." : `Task marked ${status}; closing linked lease.`)
    });
  }

  // GET /summary
  router.get("/summary", (_req, res) => {
    try {
      const summary = getTaskLedgerSummary();
      return res.json({ ok: true, summary });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // GET /state
  router.get("/state", (req, res) => {
    try {
      const q = req.query || {};
      const result = getTaskLedgerState({
        projectScope: q.projectScope || q.scope,
        projectMarker: q.projectMarker,
        includeArchived: q.includeArchived !== undefined ? q.includeArchived !== "false" : undefined,
        taskStatus: q.taskStatus || q.status,
        taskPriority: q.taskPriority || q.priority,
        taskQuery: q.taskQuery || q.q,
        taskLimit: q.taskLimit || q.limit,
        eventLimit: q.eventLimit,
        eventTaskId: q.eventTaskId,
        eventType: q.eventType,
        eventActor: q.eventActor,
        eventSince: q.eventSince,
        eventUntil: q.eventUntil
      });
      const ledger = {
        ...result,
        tasks: withLeaseLedgerList(result.tasks)
      };
      return res.json({ ok: true, ledger, ...ledger });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // GET /tasks
  router.get("/tasks", (req, res) => {
    try {
      const q = req.query || {};
      const tasks = withLeaseLedgerList(listTaskLedgerTasks({
        status: q.status,
        priority: q.priority,
        query: q.query || q.q,
        includeArchived: q.includeArchived !== undefined ? q.includeArchived !== "false" : undefined,
        projectScope: q.projectScope || q.scope,
        projectMarker: q.projectMarker,
        limit: q.limit
      }));
      return res.json({ ok: true, count: tasks.length, tasks });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // GET /tasks/:id
  router.get("/tasks/:id", (req, res) => {
    try {
      const q = req.query || {};
      const task = getTaskLedgerTask(req.params.id, {
        includeEvents: q.includeEvents !== undefined ? q.includeEvents !== "false" : false,
        eventLimit: q.eventLimit
      });
      if (!task) {
        return res.status(404).json({ ok: false, error: "Task not found." });
      }
      return res.json({ ok: true, task: withLeaseLedger(task) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // POST /tasks
  router.post("/tasks", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = createTaskLedgerTask(body);
      return res.json({ ok: true, ...result, task: withLeaseLedger(result.task) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // PATCH /tasks/:id
  function handleTaskUpdate(req, res) {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { patch, ...options } = body;
      const result = updateTaskLedgerTask(req.params.id, patch || body, {
        actor: options.actor || options.by,
        source: options.source,
        note: options.note,
        type: options.type
      });
      syncTerminalTaskLease(result.task, options);
      return res.json({ ok: true, ...result, task: withLeaseLedger(result.task) });
    } catch (error) {
      return sendError(res, error);
    }
  }

  router.patch("/tasks/:id", handleTaskUpdate);
  router.put("/tasks/:id", handleTaskUpdate);

  // DELETE /tasks/:id
  router.delete("/tasks/:id", (req, res) => {
    try {
      const q = req.query || {};
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = deleteTaskLedgerTask(req.params.id, {
        hard: q.hard === "true" || body.hard === true,
        actor: body.actor || q.actor,
        source: body.source || q.source,
        note: body.note
      });
      syncTerminalTaskLease((q.hard === "true" || body.hard === true) ? result.removed : result.task, {
        actor: body.actor || q.actor,
        source: body.source || q.source,
        note: body.note,
        forceRelease: q.hard === "true" || body.hard === true
      });
      return res.json({
        ok: true,
        ...result,
        task: withLeaseLedger(result.task),
        removed: withLeaseLedger(result.removed)
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // POST /tasks/:id/events
  router.post("/tasks/:id/events", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = addTaskLedgerEvent(req.params.id, body);
      return res.json({ ok: true, ...result, task: withLeaseLedger(result.task) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

module.exports = createTaskLedgerRouter;
