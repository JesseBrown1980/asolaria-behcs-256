const mqttConnector = require("./mqttConnector");

const DEFAULT_LOCAL_MQTT_BRIDGE_CONFIG = Object.freeze({
  enabled: true,
  brokerUrl: "mqtt://127.0.0.1:18883",
  baseTopic: "asolaria",
  qos: 1,
  retainState: true,
  includeGraphEvents: false,
  includeActionManifests: false,
  includeHealth: true,
  includeColony: true,
  includeWorld: true,
  controlEnabled: false,
  computeWorkerEnabled: false,
  allowInsecureTls: false,
  healthIntervalMs: 30000,
  colonyIntervalMs: 10000,
  worldIntervalMs: 15000
});

function buildLocalMqttBridgeConfig(overrides = {}) {
  return {
    ...DEFAULT_LOCAL_MQTT_BRIDGE_CONFIG,
    ...(overrides && typeof overrides === "object" ? overrides : {})
  };
}

function ensureLocalMqttBridgeConfigured(overrides = {}) {
  const nextConfig = buildLocalMqttBridgeConfig(overrides);
  const current = mqttConnector.getMqttConfigSummary();
  const keysToCompare = [
    "enabled",
    "brokerUrl",
    "baseTopic",
    "qos",
    "retainState",
    "includeGraphEvents",
    "includeActionManifests",
    "includeHealth",
    "includeColony",
    "includeWorld",
    "controlEnabled",
    "computeWorkerEnabled",
    "allowInsecureTls",
    "healthIntervalMs",
    "colonyIntervalMs",
    "worldIntervalMs"
  ];
  const alreadyMatches = current && keysToCompare.every((key) => current[key] === nextConfig[key]);
  if (alreadyMatches && current.configured) {
    return current;
  }
  return mqttConnector.setMqttConfig(nextConfig);
}

async function startLocalMqttBridge(context = {}, overrides = {}) {
  ensureLocalMqttBridgeConfigured(overrides);
  return mqttConnector.startMqttBridge(context);
}

module.exports = {
  DEFAULT_LOCAL_MQTT_BRIDGE_CONFIG,
  buildLocalMqttBridgeConfig,
  ensureLocalMqttBridgeConfigured,
  startLocalMqttBridge
};
