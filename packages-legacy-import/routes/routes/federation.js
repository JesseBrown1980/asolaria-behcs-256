/**
 * Federation Routes — extracted from server.js (ADR-0001 strangler-fig)
 *
 * Routes:
 *   GET  /nodes           — list all remote sub-colony nodes
 *   GET  /nodes/:nodeId   — get specific node
 *   POST /nodes/:nodeId/control — send control command via MQTT (loopback only)
 */

const express = require("express");
const router = express.Router();

const remoteNodeRegistry = require("../../src/remoteNodeRegistry");

// publishMqttMessage is injected via factory to avoid circular dependency with server.js
let _publishMqtt = null;

function createFederationRouter({ publishMqttMessage, respondError, inferHttpStatusForError }) {
  _publishMqtt = publishMqttMessage;

  router.get("/nodes", async (_req, res) => {
    try {
      const summary = remoteNodeRegistry.getRemoteNodesSummary();
      return res.json({ ok: true, ...summary });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/nodes/:nodeId", async (req, res) => {
    try {
      const node = remoteNodeRegistry.getRemoteNode(req.params.nodeId);
      if (!node) {
        return res.status(404).json({ ok: false, error: "node_not_found" });
      }
      return res.json({ ok: true, node });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/nodes/:nodeId/control", async (req, res) => {
    try {
      const nodeId = String(req.params.nodeId || "").trim();
      const node = remoteNodeRegistry.getRemoteNode(nodeId);
      if (!node) {
        return res.status(404).json({ ok: false, error: "node_not_found" });
      }
      const controlTopic = `asolaria/nodes/${nodeId}/control/request`;
      const payload = {
        action: String(req.body?.action || "ping"),
        ...(req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {}),
        id: `ctrl-${Date.now()}`,
        sentAt: new Date().toISOString(),
        sentBy: "sovereign"
      };
      const published = await _publishMqtt({
        topic: controlTopic,
        payload
      });
      return res.json({ ok: true, published, controlTopic, payload });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  return router;
}

module.exports = createFederationRouter;
