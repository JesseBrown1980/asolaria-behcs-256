"use strict";

const { normalizeColonyCapabilities } = require("../colonyCapabilitySchema");
const { buildColonyLaneRouting } = require("../colonyCapabilityRouting");

const MQTT_COMPACT_TRANSPORT_VERSION = "asolaria_mqtt_compact_v1";

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizeNodeId(value) {
  return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

function safeIso(value, fallback = "") {
  const text = cleanText(value, 80);
  if (!text) return fallback;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const token = cleanText(value, 40).toLowerCase();
  if (["true", "1", "yes", "on", "online", "ok", "ready"].includes(token)) return true;
  if (["false", "0", "no", "off", "offline"].includes(token)) return false;
  return fallback;
}

function asInt(value, fallback = 0, min = 0, max = 1000000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function pickObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseNodeIdFromBaseTopic(baseTopic = "") {
  const scoped = cleanText(baseTopic, 240).match(/(?:^|\/)nodes\/([^/]+)$/i);
  return scoped?.[1] ? normalizeNodeId(scoped[1]) : "";
}

function resolveNodeId(payload = {}, options = {}) {
  return normalizeNodeId(
    options.nodeId
    || parseNodeIdFromBaseTopic(options.baseTopic || "")
    || payload.nodeId
    || payload.id
    || payload.sourceNodeId
    || payload.agentColony?.nodeId
    || payload.worldState?.nodeId
  ) || "local";
}

function resolveColonyId(payload = {}, nodeId = "", options = {}) {
  return cleanText(
    options.colonyId
    || payload.colonyId
    || payload.headColony
    || payload.capabilities?.headColony
    || payload.agentColony?.headColony
    || payload.agentColony?.capabilities?.headColony
    || nodeId,
    120
  ) || nodeId || "local";
}

function buildEnvelope(packetKind, packetCode, payload = {}, options = {}) {
  const nodeId = resolveNodeId(payload, options);
  return {
    transportVersion: MQTT_COMPACT_TRANSPORT_VERSION,
    compact: true,
    packetKind,
    packetCode,
    nodeId,
    colonyId: resolveColonyId(payload, nodeId, options),
    at: safeIso(
      options.at
      || payload.at
      || payload.generatedAt
      || payload.updatedAt
      || payload.lastSeenAt,
      new Date().toISOString()
    )
  };
}

function buildCompactHealthPayload(payload = {}, options = {}) {
  const source = pickObject(payload);
  const summary = pickObject(source.summary);
  const taskLedger = pickObject(source.taskLedger || summary.taskLedger);
  const queue = pickObject(source.queue || summary.queue);
  const authority = pickObject(source.authority);
  const audit = pickObject(source.audit);
  const heartbeat = pickObject(source.heartbeat);
  const workerRouter = pickObject(source.workerRouter);

  return {
    ...buildEnvelope("runtime_health", "RTH", source, options),
    ok: asBool(source.ok, false),
    service: cleanText(source.service || source.app || summary.service, 120),
    port: asInt(source.port || summary.port, 0, 0, 65535),
    authorityMode: cleanText(authority.mode || source.authorityMode, 80),
    auditIntegrityOk: asBool(audit.integrityOk || source.auditIntegrityOk, false),
    heartbeatOk: asBool(heartbeat.lastResult?.ok || heartbeat.ok, false),
    taskLedger: {
      totalTasks: asInt(taskLedger.totalTasks, 0),
      openTasks: asInt(taskLedger.openTasks, 0),
      activeTasks: asInt(taskLedger.activeTasks, 0)
    },
    queue: {
      queued: asInt(queue.queued, 0),
      running: asInt(queue.running, 0),
      total: asInt(queue.total, 0)
    },
    workerRouter: {
      totalNodes: asInt(workerRouter.totalNodes || workerRouter.summary?.totalNodes, 0),
      onlineNodes: asInt(workerRouter.onlineNodes || workerRouter.summary?.onlineNodes, 0),
      readyNodes: asInt(workerRouter.readyNodes || workerRouter.summary?.readyNodes, 0)
    }
  };
}

function buildCompactColonyPayload(payload = {}, options = {}) {
  const source = pickObject(payload.agentColony || payload);
  const nodeId = resolveNodeId(source, options);
  const status = cleanText(source.status || options.status || "online", 40).toLowerCase() || "online";
  const counts = pickObject(source.counts);
  const rawReadiness = pickObject(source.readiness);
  const readiness = {
    computeWorkerReady: asBool(rawReadiness.computeWorkerReady || source.computeWorkerReady, false),
    phoneOrbitalReady: asBool(rawReadiness.phoneOrbitalReady || source.phoneOrbitalReady || source.phoneReady, false)
  };
  const capabilities = normalizeColonyCapabilities(source.capabilities || source, {
    nodeId,
    defaultRole: cleanText(source.role || options.defaultRole || "sub_colony", 80) || "sub_colony"
  });
  const routing = buildColonyLaneRouting({
    ...source,
    nodeId,
    status,
    capabilities,
    readiness
  }, {
    nodeId,
    status,
    defaultRole: capabilities.role || "sub_colony"
  });

  return {
    ...buildEnvelope("colony_status", "COL", source, { ...options, nodeId }),
    status,
    counts: {
      total: asInt(counts.total || source.total, 0),
      online: asInt(counts.online || source.online, 0),
      active: asInt(counts.active || source.active, 0),
      adminActive: asInt(counts.adminActive || source.adminActive, 0)
    },
    relayRunning: asBool(source.relay?.running, false),
    tunnelRunning: asBool(source.tunnel?.running, false),
    capabilities,
    routing,
    readiness
  };
}

function buildCompactWorldPayload(payload = {}, options = {}) {
  const source = pickObject(payload.worldState || payload);
  const entities = Array.isArray(source.entities) ? source.entities : [];
  const routes = Array.isArray(source.routes) ? source.routes : [];
  const summary = pickObject(source.summary);
  const criticalRoutes = routes.filter((route) => cleanText(route?.riskLevel, 20).toLowerCase() === "critical").length;
  const highRoutes = routes.filter((route) => cleanText(route?.riskLevel, 20).toLowerCase() === "high").length;

  return {
    ...buildEnvelope("world_state", "WRD", source, options),
    worldview: cleanText(source.worldview || payload.worldview, 80),
    summary: {
      entities: asInt(summary.entities, entities.length),
      routes: asInt(summary.routes, routes.length),
      hotEntities: entities.filter((entity) => Boolean(entity?.hot)).length,
      onlineEntities: entities.filter((entity) => Boolean(entity?.online)).length,
      towers: entities.filter((entity) => cleanText(entity?.kind, 40).toLowerCase() === "tower").length,
      subColonies: entities.filter((entity) => cleanText(entity?.kind, 40).toLowerCase() === "sub_colony").length,
      criticalRoutes,
      highRoutes
    }
  };
}

function buildCompactPresencePayload(payload = {}, options = {}) {
  const source = pickObject(payload);
  const subscriptions = Array.isArray(source.subscriptions) ? source.subscriptions : [];

  return {
    ...buildEnvelope("runtime_presence", "PRS", source, options),
    app: cleanText(source.app || "Asolaria", 80),
    state: cleanText(source.state || options.state || "online", 40).toLowerCase() || "online",
    clientId: cleanText(source.clientId || options.clientId, 120),
    brokerUrl: cleanText(source.brokerUrl || options.brokerUrl, 240),
    subscriptionsCount: subscriptions.length
  };
}

module.exports = {
  MQTT_COMPACT_TRANSPORT_VERSION,
  buildCompactHealthPayload,
  buildCompactColonyPayload,
  buildCompactWorldPayload,
  buildCompactPresencePayload
};
