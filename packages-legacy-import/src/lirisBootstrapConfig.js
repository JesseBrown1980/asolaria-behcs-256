"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot } = require("./runtimePaths");

const identityPath = path.join(instanceRoot, "config", "liris-node-identity.json");

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizeNodeId(value, fallback = "liris") {
  const normalized = cleanText(value, 80).toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return normalized || fallback;
}

function normalizeTopicPath(value, nodeId) {
  const raw = cleanText(value, 240).toLowerCase();
  if (!raw) {
    return `asolaria/nodes/${normalizeNodeId(nodeId)}`;
  }
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/_-]+/g, "_")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || `asolaria/nodes/${normalizeNodeId(nodeId)}`;
}

function normalizeBrokerUrl(value) {
  const raw = cleanText(value, 1200);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["mqtt:", "mqtts:", "ws:", "wss:", "tcp:", "ssl:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function hostFromUrl(value) {
  const raw = cleanText(value, 1200);
  if (!raw) return "";
  try {
    return cleanText(new URL(raw).hostname, 120);
  } catch {
    return "";
  }
}

function readLirisNodeIdentity(filePath = identityPath) {
  return readJsonFile(filePath, {});
}

function replaceHostInBrokerUrl(brokerUrl, sovereignHost) {
  const normalizedBrokerUrl = normalizeBrokerUrl(brokerUrl);
  const normalizedHost = cleanText(sovereignHost, 120);
  if (!normalizedHost) return normalizedBrokerUrl;
  if (!normalizedBrokerUrl) {
    return `mqtt://${normalizedHost}:18883`;
  }
  try {
    const parsed = new URL(normalizedBrokerUrl);
    parsed.hostname = normalizedHost;
    return parsed.toString();
  } catch {
    return `mqtt://${normalizedHost}:18883`;
  }
}

function resolveLirisBootstrapConfig(options = {}) {
  const env = options && typeof options.env === "object" ? options.env : process.env;
  const identity = readLirisNodeIdentity(options.identityPath || identityPath);

  const nodeId = normalizeNodeId(env.ASOLARIA_NODE_ID || identity.nodeId || "liris");
  const role = cleanText(env.ASOLARIA_NODE_ROLE || identity.role || "sub_colony", 80) || "sub_colony";
  const envBrokerUrl = normalizeBrokerUrl(env.ASOLARIA_MQTT_BROKER_URL || "");
  const storedBrokerUrl = normalizeBrokerUrl(identity.mqttBroker || "");
  const envSovereignHost = cleanText(env.ASOLARIA_SOVEREIGN_HOST, 120);
  const sovereignHost = cleanText(
    envSovereignHost
      || identity.sovereign
      || hostFromUrl(envBrokerUrl || storedBrokerUrl),
    120
  );
  const mqttBrokerUrl = envBrokerUrl
    || (envSovereignHost ? replaceHostInBrokerUrl(storedBrokerUrl, envSovereignHost) : "")
    || storedBrokerUrl
    || (sovereignHost ? `mqtt://${sovereignHost}:18883` : "");
  const mqttTopicPrefix = normalizeTopicPath(env.ASOLARIA_MQTT_BASE_TOPIC || identity.mqttTopicPrefix || "", nodeId);
  const mqttClientId = cleanText(env.ASOLARIA_MQTT_CLIENT_ID || `asolaria-${nodeId}`, 120) || `asolaria-${nodeId}`;
  const bridgeRelay = cleanText(
    env.ASOLARIA_BRIDGE_RELAY
      || identity.bridgeRelay
      || (sovereignHost ? `http://${sovereignHost}:8788` : ""),
    240
  );
  const bridgeRoom = cleanText(env.ASOLARIA_BRIDGE_ROOM || identity.bridgeRoom || "asolaria_bridge", 120) || "asolaria_bridge";

  return {
    identityPath: options.identityPath || identityPath,
    identity,
    nodeId,
    role,
    operator: cleanText(env.ASOLARIA_OPERATOR || identity.operator || "rayssa", 80) || "rayssa",
    sovereignHost,
    mqttBrokerUrl,
    mqttTopicPrefix,
    mqttClientId,
    bridgeRelay,
    bridgeRoom
  };
}

module.exports = {
  identityPath,
  readLirisNodeIdentity,
  resolveLirisBootstrapConfig
};
