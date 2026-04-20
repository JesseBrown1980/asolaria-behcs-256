/**
 * Graph Runtime Routes — extracted from server.js (ADR-0001 strangler-fig)
 *
 * Routes:
 *   GET /snapshot
 *   GET /export
 *   GET /diff-report
 *   GET /training-export
 *   GET /stream (SSE)
 */

const express = require("express");
const router = express.Router();

const {
  buildGraphRuntimeSnapshot,
  buildGraphRuntimeDiffReport,
  buildGraphRuntimeTrainingDataset
} = require("../../src/graphRuntimeQuery");

const { graphRuntimeEmitter } = require("../../src/graphRuntimeStore");

function parseGraphRuntimeBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function buildSnapshotFromQuery(query) {
  return buildGraphRuntimeSnapshot({
    windowMinutes: query?.windowMinutes,
    includeLowRisk: parseGraphRuntimeBool(query?.includeLowRisk, false),
    maxNodes: query?.maxNodes,
    maxEdges: query?.maxEdges,
    timelineBuckets: query?.timelineBuckets,
    component: query?.component,
    action: query?.action,
    minRisk: query?.minRisk,
    cutoffAt: query?.cutoffAt,
    compareCutoffAt: query?.compareCutoffAt,
    eventLimit: query?.eventLimit,
    manifestLimit: query?.manifestLimit,
    recentEventLimit: query?.recentEventLimit,
    recentManifestLimit: query?.recentManifestLimit
  });
}

router.get("/snapshot", (req, res) => {
  return res.json(buildSnapshotFromQuery(req.query));
});

router.get("/export", (req, res) => {
  const snapshot = buildSnapshotFromQuery(req.query);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="graph-runtime-${stamp}.json"`);
  return res.json({
    ok: true,
    exportedAt: new Date().toISOString(),
    query: {
      windowMinutes: req.query?.windowMinutes || "",
      includeLowRisk: parseGraphRuntimeBool(req.query?.includeLowRisk, false),
      maxNodes: req.query?.maxNodes || "",
      maxEdges: req.query?.maxEdges || "",
      component: req.query?.component || "",
      action: req.query?.action || "",
      minRisk: req.query?.minRisk || "",
      cutoffAt: req.query?.cutoffAt || "",
      compareCutoffAt: req.query?.compareCutoffAt || ""
    },
    snapshot
  });
});

router.get("/diff-report", (req, res) => {
  const report = buildGraphRuntimeDiffReport({
    windowMinutes: req.query?.windowMinutes,
    includeLowRisk: parseGraphRuntimeBool(req.query?.includeLowRisk, false),
    maxNodes: req.query?.maxNodes,
    maxEdges: req.query?.maxEdges,
    timelineBuckets: req.query?.timelineBuckets,
    component: req.query?.component,
    action: req.query?.action,
    minRisk: req.query?.minRisk,
    cutoffAt: req.query?.cutoffAt,
    compareCutoffAt: req.query?.compareCutoffAt,
    eventLimit: req.query?.eventLimit,
    manifestLimit: req.query?.manifestLimit,
    recentEventLimit: req.query?.recentEventLimit,
    recentManifestLimit: req.query?.recentManifestLimit
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="graph-runtime-diff-${stamp}.md"`);
  return res.send(report.markdown);
});

router.get("/training-export", (req, res) => {
  const dataset = buildGraphRuntimeTrainingDataset({
    windowMinutes: req.query?.windowMinutes,
    includeLowRisk: parseGraphRuntimeBool(req.query?.includeLowRisk, false),
    maxNodes: req.query?.maxNodes,
    maxEdges: req.query?.maxEdges,
    timelineBuckets: req.query?.timelineBuckets,
    component: req.query?.component,
    action: req.query?.action,
    minRisk: req.query?.minRisk,
    cutoffAt: req.query?.cutoffAt,
    compareCutoffAt: req.query?.compareCutoffAt,
    eventLimit: req.query?.eventLimit,
    manifestLimit: req.query?.manifestLimit,
    recentEventLimit: req.query?.recentEventLimit,
    recentManifestLimit: req.query?.recentManifestLimit
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="graph-runtime-training-${stamp}.json"`);
  return res.json(dataset);
});

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const send = (eventName, payload) => {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (_error) {
      // Socket likely closed.
    }
  };

  const forwardGraphEvent = (payload) => send("graph_event", {
    id: payload?.id || "",
    at: payload?.at || "",
    action: payload?.action || "",
    component: payload?.component || "",
    risk: payload?.risk || null
  });

  const forwardManifest = (payload) => send("action_manifest", {
    id: payload?.id || "",
    at: payload?.createdAt || "",
    action: payload?.action || "",
    component: payload?.component || "",
    status: payload?.status || "",
    risk: payload?.risk || null
  });

  const heartbeat = setInterval(() => {
    send("ping", { ok: true, at: new Date().toISOString() });
  }, 15000);

  graphRuntimeEmitter.on("graph_event", forwardGraphEvent);
  graphRuntimeEmitter.on("action_manifest", forwardManifest);
  send("hello", {
    ok: true,
    at: new Date().toISOString(),
    snapshotUrl: "/api/graph-runtime/snapshot"
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    graphRuntimeEmitter.off("graph_event", forwardGraphEvent);
    graphRuntimeEmitter.off("action_manifest", forwardManifest);
  });
});

module.exports = router;
