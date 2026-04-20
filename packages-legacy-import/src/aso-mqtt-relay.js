/**
 * ASO MQTT Relay — Bidirectional bridge for ASO ops over MQTT.
 *
 * Plugs into an existing MQTT client connection. Does NOT create its own server.
 * Receives ASO op commands from Gaia (or any controller), dispatches them through
 * the aso-client SDK, and publishes results, status, and write events back.
 *
 * Topics:
 *   IN:  asolaria/nodes/{nodeName}/command/aso   — inbound op requests
 *   OUT: asolaria/nodes/{nodeName}/aso/result     — op results
 *   OUT: asolaria/nodes/{nodeName}/aso/status     — periodic status heartbeat
 *   OUT: asolaria/nodes/{nodeName}/aso/events     — write events (if onWrite available)
 */

const aso = require("./aso-client");

const STATUS_INTERVAL_MS = 60000;

/**
 * @param {{ mqttClient: object, nodeName: string }} opts
 * @returns {{ stop: () => void }}
 */
function createAsoRelay({ mqttClient, nodeName }) {
  if (!mqttClient) throw new Error("aso-mqtt-relay: mqttClient is required");
  if (!nodeName) throw new Error("aso-mqtt-relay: nodeName is required");

  const prefix = `asolaria/nodes/${nodeName}`;
  const cmdTopic = `${prefix}/command/aso`;
  const resultTopic = `${prefix}/aso/result`;
  const statusTopic = `${prefix}/aso/status`;
  const eventsTopic = `${prefix}/aso/events`;

  // --- Op dispatch map (matches aso-client exports) ---
  const OPS = {
    "add-observation": (p) => aso.observe(p.topicId, p.summary, p),
    "add-relation":    (p) => aso.relate(p.from, p.verb, p.to, p),
    "add-outcome":     (p) => aso.outcome(p.topicId, p.trigger, p.result, p),
    "add-surface":     (p) => aso.surface(p.topicId, p.host, p.port, p),
    "add-evidence":    (p) => aso.evidence(p.topicId, p.sourceKind, p.sourceRef, p),
    "add-conflict":    (p) => aso.conflict(p.topicId, p.entryA, p.entryB, p),
    "add-topic":       (p) => aso.topic(p.name, p.type, p),
    "revise-topic":    (p) => aso.revise(p.asoId, p),
    "resolve-conflict":(p) => aso.resolveConflict(p.conflictId, p.resolution, p),
    "search":          (p) => aso.search(p.query || p.q, p),
    "list":            (p) => aso.list(p),
    "get":             (p) => aso.get(p.asoId),
    "status":          ()  => aso.status(),
    "resolve":         (p) => aso.resolve(p.id),
  };

  // --- Inbound command handler ---
  function onMessage(topic, message) {
    if (topic !== cmdTopic) return;

    let parsed;
    try {
      parsed = JSON.parse(message.toString());
    } catch (err) {
      console.error("[aso-mqtt-relay] invalid JSON on", topic, ":", err.message);
      publishResult({ ok: false, error: "invalid_json" });
      return;
    }

    const { op, payload, requestId } = parsed;
    if (!op || typeof op !== "string") {
      publishResult({ ok: false, error: "missing_op", requestId });
      return;
    }

    const handler = OPS[op];
    if (!handler) {
      publishResult({ ok: false, error: `unknown_op:${op}`, requestId });
      return;
    }

    // Handle both sync and async ops
    try {
      const result = handler(payload || {});
      if (result && typeof result.then === "function") {
        result
          .then((r) => publishResult({ ...r, op, requestId }))
          .catch((e) => publishResult({ ok: false, error: e.message, op, requestId }));
      } else {
        publishResult({ ...result, op, requestId });
      }
    } catch (err) {
      console.error("[aso-mqtt-relay] op error:", op, err.message);
      publishResult({ ok: false, error: err.message, op, requestId });
    }
  }

  function publishResult(data) {
    if (!mqttClient.connected) return;
    try {
      mqttClient.publish(resultTopic, JSON.stringify(data));
    } catch (err) {
      console.error("[aso-mqtt-relay] publish error:", err.message);
    }
  }

  // --- Status heartbeat ---
  async function publishStatus() {
    if (!mqttClient.connected) return;
    try {
      const st = await Promise.resolve(aso.status());
      const payload = { ...st, nodeName, publishedAt: new Date().toISOString() };
      mqttClient.publish(statusTopic, JSON.stringify(payload), { retain: true });
    } catch (err) {
      console.error("[aso-mqtt-relay] status publish error:", err.message);
    }
  }

  // --- onWrite hook (if the kernel exposes it) ---
  let _onWriteCleanup = null;
  try {
    const asoKernel = require("./index-kernel/aso");
    if (typeof asoKernel.onWrite === "function") {
      const handler = (event) => {
        if (!mqttClient.connected) return;
        try {
          const msg = { ...event, nodeName, at: new Date().toISOString() };
          mqttClient.publish(eventsTopic, JSON.stringify(msg));
        } catch (err) {
          console.error("[aso-mqtt-relay] event publish error:", err.message);
        }
      };
      _onWriteCleanup = asoKernel.onWrite(handler);
      console.log("[aso-mqtt-relay] onWrite hook attached");
    }
  } catch (_) {
    // onWrite not available — that is fine
  }

  // --- Subscribe and start ---
  mqttClient.subscribe(cmdTopic, (err) => {
    if (err) console.error("[aso-mqtt-relay] subscribe error:", err.message);
    else console.log("[aso-mqtt-relay] subscribed to", cmdTopic);
  });
  mqttClient.on("message", onMessage);

  // Initial status + periodic heartbeat
  publishStatus();
  const statusTimer = setInterval(publishStatus, STATUS_INTERVAL_MS);

  console.log(`[aso-mqtt-relay] relay started for node '${nodeName}'`);

  // --- Cleanup ---
  function stop() {
    clearInterval(statusTimer);
    mqttClient.removeListener("message", onMessage);
    mqttClient.unsubscribe(cmdTopic);
    if (_onWriteCleanup && typeof _onWriteCleanup === "function") {
      _onWriteCleanup();
    }
    console.log("[aso-mqtt-relay] relay stopped");
  }

  return { stop };
}

module.exports = { createAsoRelay };
