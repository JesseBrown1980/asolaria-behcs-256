const crypto = require("crypto");
const mqtt = require("mqtt");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const remoteNodeRegistry = require("../remoteNodeRegistry");

const MQTT_SECRET_NAME = "integrations.mqtt";
const DEFAULT_BASE_TOPIC = "asolaria";
const DEFAULT_QOS = 1;
const DEFAULT_HEALTH_INTERVAL_MS = 30000;
const DEFAULT_COLONY_INTERVAL_MS = 10000;
const DEFAULT_WORLD_INTERVAL_MS = 15000;
const runtime = {
  context: {
    graphRuntimeEmitter: null,
    getHealthPayload: null,
    getColonyPayload: null,
    getPresencePayload: null,
    getWorldPayload: null,
    onControlRequest: null
  },
  client: null,
  clientKey: "",
  connectingPromise: null,
  listenersAttached: false,
  timers: {
    health: null,
    colony: null,
    world: null
  },
  graphHandlers: {
    event: null,
    manifest: null
  },
  lastError: "",
  lastConnectedAt: "",
  lastDisconnectedAt: "",
  lastPublishedAt: "",
  lastInboundAt: "",
  lastControlRequest: null,
  publishedCount: 0,
  inboundCount: 0,
  droppedCount: 0,
  reconnectCount: 0,
  subscriptions: [],
  state: "idle"
};

function normalizeText(value, maxLen = 600) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function normalizeInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeBrokerUrl(value) {
  const raw = normalizeText(value, 1200);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["mqtt:", "mqtts:", "ws:", "wss:", "tcp:", "ssl:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function normalizeTopicPath(value, fallback = DEFAULT_BASE_TOPIC) {
  const raw = normalizeText(value, 240).toLowerCase();
  if (!raw) return fallback;
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/_-]+/g, "_")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized || fallback;
}

function normalizeUsername(value) {
  return normalizeText(value, 200);
}

function normalizePassword(value) {
  return String(value || "").trim().slice(0, 400);
}

function normalizeClientId(value) {
  const raw = normalizeText(value, 120);
  if (!raw) return "";
  return raw.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 120);
}

function maskSecret(value) {
  const token = String(value || "");
  if (!token) return "";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 3)}${"*".repeat(Math.max(4, token.length - 6))}${token.slice(-3)}`;
}

function makeClientId() {
  return `asolaria-${crypto.randomBytes(6).toString("hex")}`;
}

function resolveStoredSecret() {
  const secret = getSecret(MQTT_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  return {
    secret,
    value
  };
}

function resolveMqttConfig() {
  const envBrokerUrl = normalizeBrokerUrl(process.env.ASOLARIA_MQTT_BROKER_URL || "");
  if (envBrokerUrl) {
    return {
      enabled: normalizeBool(process.env.ASOLARIA_MQTT_ENABLED, true),
      configured: true,
      source: "env",
      updatedAt: null,
      brokerUrl: envBrokerUrl,
      username: normalizeUsername(process.env.ASOLARIA_MQTT_USERNAME || ""),
      password: normalizePassword(process.env.ASOLARIA_MQTT_PASSWORD || ""),
      clientId: normalizeClientId(process.env.ASOLARIA_MQTT_CLIENT_ID || "") || makeClientId(),
      baseTopic: normalizeTopicPath(process.env.ASOLARIA_MQTT_BASE_TOPIC || "", DEFAULT_BASE_TOPIC),
      qos: normalizeInt(process.env.ASOLARIA_MQTT_QOS, DEFAULT_QOS, 0, 2),
      retainState: normalizeBool(process.env.ASOLARIA_MQTT_RETAIN_STATE, true),
      includeGraphEvents: normalizeBool(process.env.ASOLARIA_MQTT_INCLUDE_GRAPH_EVENTS, true),
      includeActionManifests: normalizeBool(process.env.ASOLARIA_MQTT_INCLUDE_ACTION_MANIFESTS, true),
      includeHealth: normalizeBool(process.env.ASOLARIA_MQTT_INCLUDE_HEALTH, true),
      includeColony: normalizeBool(process.env.ASOLARIA_MQTT_INCLUDE_COLONY, true),
      includeWorld: normalizeBool(process.env.ASOLARIA_MQTT_INCLUDE_WORLD, true),
      controlEnabled: normalizeBool(process.env.ASOLARIA_MQTT_CONTROL_ENABLED, true),
      allowInsecureTls: normalizeBool(process.env.ASOLARIA_MQTT_ALLOW_INSECURE_TLS, false),
      healthIntervalMs: normalizeInt(process.env.ASOLARIA_MQTT_HEALTH_INTERVAL_MS, DEFAULT_HEALTH_INTERVAL_MS, 5000, 300000),
      colonyIntervalMs: normalizeInt(process.env.ASOLARIA_MQTT_COLONY_INTERVAL_MS, DEFAULT_COLONY_INTERVAL_MS, 3000, 300000),
      worldIntervalMs: normalizeInt(process.env.ASOLARIA_MQTT_WORLD_INTERVAL_MS, DEFAULT_WORLD_INTERVAL_MS, 5000, 300000)
    };
  }

  const { secret, value } = resolveStoredSecret();
  const brokerUrl = normalizeBrokerUrl(value.brokerUrl || "");
  return {
    enabled: normalizeBool(value.enabled, false),
    configured: Boolean(brokerUrl),
    source: secret ? "vault" : "none",
    updatedAt: secret?.updatedAt || null,
    brokerUrl,
    username: normalizeUsername(value.username || ""),
    password: normalizePassword(value.password || ""),
    clientId: normalizeClientId(value.clientId || "") || makeClientId(),
    baseTopic: normalizeTopicPath(value.baseTopic || "", DEFAULT_BASE_TOPIC),
    qos: normalizeInt(value.qos, DEFAULT_QOS, 0, 2),
    retainState: normalizeBool(value.retainState, true),
    includeGraphEvents: normalizeBool(value.includeGraphEvents, true),
    includeActionManifests: normalizeBool(value.includeActionManifests, true),
    includeHealth: normalizeBool(value.includeHealth, true),
    includeColony: normalizeBool(value.includeColony, true),
    includeWorld: normalizeBool(value.includeWorld, true),
    controlEnabled: normalizeBool(value.controlEnabled, true),
    allowInsecureTls: normalizeBool(value.allowInsecureTls, false),
    healthIntervalMs: normalizeInt(value.healthIntervalMs, DEFAULT_HEALTH_INTERVAL_MS, 5000, 300000),
    colonyIntervalMs: normalizeInt(value.colonyIntervalMs, DEFAULT_COLONY_INTERVAL_MS, 3000, 300000),
    worldIntervalMs: normalizeInt(value.worldIntervalMs, DEFAULT_WORLD_INTERVAL_MS, 5000, 300000)
  };
}

function buildTopicMap(config = resolveMqttConfig()) {
  const root = normalizeTopicPath(config.baseTopic || DEFAULT_BASE_TOPIC, DEFAULT_BASE_TOPIC);
  return {
    root,
    graphEvents: `${root}/graph/events`,
    actionManifests: `${root}/graph/manifests`,
    colonyStatus: `${root}/agents/colony/status`,
    worldState: `${root}/world/state`,
    runtimeHealth: `${root}/runtime/health`,
    runtimePresence: `${root}/runtime/presence`,
    controlRequest: `${root}/control/request`,
    controlAck: `${root}/control/ack`
  };
}

function getMqttConfigSummary() {
  const config = resolveMqttConfig();
  const topics = buildTopicMap(config);
  return {
    enabled: Boolean(config.enabled),
    configured: Boolean(config.configured),
    source: config.source,
    updatedAt: config.updatedAt || null,
    brokerUrl: config.brokerUrl || "",
    username: config.username || "",
    usernameHint: maskSecret(config.username),
    passwordConfigured: Boolean(config.password),
    passwordHint: maskSecret(config.password),
    clientId: config.clientId || "",
    baseTopic: topics.root,
    qos: Number(config.qos || DEFAULT_QOS),
    retainState: Boolean(config.retainState),
    includeGraphEvents: Boolean(config.includeGraphEvents),
    includeActionManifests: Boolean(config.includeActionManifests),
    includeHealth: Boolean(config.includeHealth),
    includeColony: Boolean(config.includeColony),
    includeWorld: Boolean(config.includeWorld),
    controlEnabled: Boolean(config.controlEnabled),
    allowInsecureTls: Boolean(config.allowInsecureTls),
    healthIntervalMs: Number(config.healthIntervalMs || DEFAULT_HEALTH_INTERVAL_MS),
    colonyIntervalMs: Number(config.colonyIntervalMs || DEFAULT_COLONY_INTERVAL_MS),
    worldIntervalMs: Number(config.worldIntervalMs || DEFAULT_WORLD_INTERVAL_MS),
    topics
  };
}

function getMqttIntegrationStatus() {
  const summary = getMqttConfigSummary();
  return {
    ...summary,
    connection: {
      ok: runtime.state === "connected",
      state: runtime.state,
      lastError: runtime.lastError,
      lastConnectedAt: runtime.lastConnectedAt || "",
      lastDisconnectedAt: runtime.lastDisconnectedAt || "",
      lastPublishedAt: runtime.lastPublishedAt || "",
      lastInboundAt: runtime.lastInboundAt || "",
      reconnectCount: Number(runtime.reconnectCount || 0),
      publishedCount: Number(runtime.publishedCount || 0),
      inboundCount: Number(runtime.inboundCount || 0),
      droppedCount: Number(runtime.droppedCount || 0),
      subscriptions: Array.isArray(runtime.subscriptions) ? [...runtime.subscriptions] : []
    },
    lastControlRequest: runtime.lastControlRequest
  };
}

function setMqttConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(MQTT_SECRET_NAME, { namespace: "owner" });
    return getMqttConfigSummary();
  }

  const previous = resolveMqttConfig();
  const has = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);
  const next = {
    enabled: has("enabled") ? normalizeBool(input.enabled, previous.enabled) : previous.enabled,
    brokerUrl: has("brokerUrl") ? normalizeBrokerUrl(input.brokerUrl) : previous.brokerUrl,
    username: has("username") ? normalizeUsername(input.username) : previous.username,
    password: has("password") ? normalizePassword(input.password) : previous.password,
    clientId: has("clientId") ? normalizeClientId(input.clientId) : previous.clientId,
    baseTopic: has("baseTopic") ? normalizeTopicPath(input.baseTopic, DEFAULT_BASE_TOPIC) : previous.baseTopic,
    qos: has("qos") ? normalizeInt(input.qos, previous.qos || DEFAULT_QOS, 0, 2) : previous.qos,
    retainState: has("retainState") ? normalizeBool(input.retainState, previous.retainState) : previous.retainState,
    includeGraphEvents: has("includeGraphEvents") ? normalizeBool(input.includeGraphEvents, previous.includeGraphEvents) : previous.includeGraphEvents,
    includeActionManifests: has("includeActionManifests") ? normalizeBool(input.includeActionManifests, previous.includeActionManifests) : previous.includeActionManifests,
    includeHealth: has("includeHealth") ? normalizeBool(input.includeHealth, previous.includeHealth) : previous.includeHealth,
    includeColony: has("includeColony") ? normalizeBool(input.includeColony, previous.includeColony) : previous.includeColony,
    includeWorld: has("includeWorld") ? normalizeBool(input.includeWorld, previous.includeWorld) : previous.includeWorld,
    controlEnabled: has("controlEnabled") ? normalizeBool(input.controlEnabled, previous.controlEnabled) : previous.controlEnabled,
    allowInsecureTls: has("allowInsecureTls") ? normalizeBool(input.allowInsecureTls, previous.allowInsecureTls) : previous.allowInsecureTls,
    healthIntervalMs: has("healthIntervalMs")
      ? normalizeInt(input.healthIntervalMs, previous.healthIntervalMs || DEFAULT_HEALTH_INTERVAL_MS, 5000, 300000)
      : previous.healthIntervalMs,
    colonyIntervalMs: has("colonyIntervalMs")
      ? normalizeInt(input.colonyIntervalMs, previous.colonyIntervalMs || DEFAULT_COLONY_INTERVAL_MS, 3000, 300000)
      : previous.colonyIntervalMs,
    worldIntervalMs: has("worldIntervalMs")
      ? normalizeInt(input.worldIntervalMs, previous.worldIntervalMs || DEFAULT_WORLD_INTERVAL_MS, 5000, 300000)
      : previous.worldIntervalMs,
    updatedAt: new Date().toISOString()
  };

  if (!next.clientId) {
    next.clientId = previous.clientId || makeClientId();
  }

  if (next.enabled && !next.brokerUrl) {
    throw new Error("MQTT brokerUrl is required when MQTT is enabled.");
  }

  setSecret(
    MQTT_SECRET_NAME,
    next,
    {
      app: "Asolaria",
      component: "mqtt-integration",
      credentialOwner: "owner",
      actor: "owner",
      updatedBy: "api"
    },
    { namespace: "owner" }
  );

  return getMqttConfigSummary();
}

function stopTimer(name) {
  if (runtime.timers[name]) {
    clearInterval(runtime.timers[name]);
    runtime.timers[name] = null;
  }
}

function stopAllTimers() {
  stopTimer("health");
  stopTimer("colony");
}

function setRuntimeState(state, error = "") {
  runtime.state = state;
  runtime.lastError = normalizeText(error, 240);
}

function getClientKey(config) {
  return JSON.stringify({
    brokerUrl: config.brokerUrl,
    username: config.username,
    clientId: config.clientId,
    baseTopic: config.baseTopic,
    qos: config.qos,
    allowInsecureTls: config.allowInsecureTls
  });
}

function disconnectClient(reason = "disconnected") {
  stopAllTimers();
  if (runtime.context.graphRuntimeEmitter && runtime.listenersAttached) {
    detachGraphListeners();
  }
  const client = runtime.client;
  runtime.client = null;
  if (client) {
    try {
      client.removeAllListeners();
      client.end(true);
    } catch (_error) {
      // ignore
    }
  }
  runtime.clientKey = "";
  runtime.connectingPromise = null;
  runtime.subscriptions = [];
  runtime.lastDisconnectedAt = new Date().toISOString();
  setRuntimeState(reason, runtime.lastError);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_error) {
    return null;
  }
}

async function waitForConnected(timeoutMs = 12000) {
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  while (Date.now() < deadline) {
    if (runtime.client && runtime.state === "connected") {
      return runtime.client;
    }
    if (runtime.connectingPromise) {
      try {
        await Promise.race([
          runtime.connectingPromise,
          new Promise((resolve) => setTimeout(resolve, 400))
        ]);
      } catch (_error) {
        // keep waiting until deadline or explicit failure state.
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`MQTT connection timed out while waiting for broker (${runtime.lastError || "not_connected"}).`);
}

async function publishRaw(topic, payload, options = {}) {
  const client = await waitForConnected(Number(options.timeoutMs || 12000) || 12000);
  const qos = normalizeInt(options.qos, resolveMqttConfig().qos || DEFAULT_QOS, 0, 2);
  const retain = options.retain === undefined ? false : Boolean(options.retain);
  const body = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  await new Promise((resolve, reject) => {
    client.publish(topic, body, { qos, retain }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  runtime.publishedCount += 1;
  runtime.lastPublishedAt = new Date().toISOString();
  return {
    ok: true,
    topic,
    qos,
    retain,
    publishedAt: runtime.lastPublishedAt
  };
}

async function publishMqttMessage(input = {}) {
  const config = resolveMqttConfig();
  if (!config.enabled) {
    throw new Error("MQTT integration is disabled.");
  }
  if (!config.configured) {
    throw new Error("MQTT integration is not configured.");
  }
  await syncMqttBridge({ reason: "publish" });
  const topics = buildTopicMap(config);
  const relativeTopic = normalizeText(input.topicSuffix || input.relativeTopic || "", 240)
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  const topic = normalizeText(input.topic || "", 320)
    || (relativeTopic ? `${topics.root}/${relativeTopic}` : "");
  if (!topic) {
    throw new Error("MQTT topic or topicSuffix is required.");
  }
  return publishRaw(topic, input.payload, {
    qos: input.qos,
    retain: input.retain,
    timeoutMs: input.timeoutMs
  });
}

async function publishRetainedState(topic, payload, options = {}) {
  try {
    await publishRaw(topic, payload, {
      qos: options.qos,
      retain: options.retain !== undefined ? options.retain : true,
      timeoutMs: options.timeoutMs
    });
  } catch (error) {
    runtime.droppedCount += 1;
    runtime.lastError = normalizeText(error?.message || error || "mqtt_publish_failed", 240);
  }
}

async function publishHealthSnapshot() {
  const config = resolveMqttConfig();
  if (!config.includeHealth || typeof runtime.context.getHealthPayload !== "function") {
    return;
  }
  const topics = buildTopicMap(config);
  const payload = await Promise.resolve(runtime.context.getHealthPayload());
  await publishRetainedState(topics.runtimeHealth, payload, {
    qos: config.qos,
    retain: config.retainState
  });
}

async function publishColonySnapshot() {
  const config = resolveMqttConfig();
  if (!config.includeColony || typeof runtime.context.getColonyPayload !== "function") {
    return;
  }
  const topics = buildTopicMap(config);
  const payload = await Promise.resolve(runtime.context.getColonyPayload());
  await publishRetainedState(topics.colonyStatus, payload, {
    qos: config.qos,
    retain: config.retainState
  });
}

async function publishWorldSnapshot() {
  const config = resolveMqttConfig();
  if (!config.includeWorld || typeof runtime.context.getWorldPayload !== "function") {
    return;
  }
  const topics = buildTopicMap(config);
  const payload = await Promise.resolve(runtime.context.getWorldPayload());
  await publishRetainedState(topics.worldState, payload, {
    qos: config.qos,
    retain: config.retainState
  });
}

async function publishPresenceState(state, extra = {}) {
  const config = resolveMqttConfig();
  if (!config.configured) {
    return;
  }
  const topics = buildTopicMap(config);
  const basePayload = typeof runtime.context.getPresencePayload === "function"
    ? await Promise.resolve(runtime.context.getPresencePayload())
    : {};
  const payload = {
    app: "Asolaria",
    state,
    clientId: config.clientId,
    brokerUrl: config.brokerUrl,
    at: new Date().toISOString(),
    ...((basePayload && typeof basePayload === "object") ? basePayload : {}),
    ...((extra && typeof extra === "object") ? extra : {})
  };
  await publishRetainedState(topics.runtimePresence, payload, {
    qos: config.qos,
    retain: config.retainState
  });
}

function detachGraphListeners() {
  const emitter = runtime.context.graphRuntimeEmitter;
  if (!emitter || !runtime.listenersAttached) {
    runtime.listenersAttached = false;
    return;
  }
  if (runtime.graphHandlers.event) {
    emitter.off("graph_event", runtime.graphHandlers.event);
  }
  if (runtime.graphHandlers.manifest) {
    emitter.off("action_manifest", runtime.graphHandlers.manifest);
  }
  runtime.listenersAttached = false;
}

function attachGraphListeners() {
  const emitter = runtime.context.graphRuntimeEmitter;
  const config = resolveMqttConfig();
  if (!emitter || runtime.listenersAttached) {
    return;
  }
  runtime.graphHandlers.event = (payload) => {
    if (!resolveMqttConfig().includeGraphEvents || runtime.state !== "connected") {
      return;
    }
    const topics = buildTopicMap(resolveMqttConfig());
    void publishRetainedState(topics.graphEvents, payload, {
      qos: config.qos,
      retain: false
    });
  };
  runtime.graphHandlers.manifest = (payload) => {
    if (!resolveMqttConfig().includeActionManifests || runtime.state !== "connected") {
      return;
    }
    const topics = buildTopicMap(resolveMqttConfig());
    void publishRetainedState(topics.actionManifests, payload, {
      qos: config.qos,
      retain: false
    });
  };
  emitter.on("graph_event", runtime.graphHandlers.event);
  emitter.on("action_manifest", runtime.graphHandlers.manifest);
  runtime.listenersAttached = true;
}

function restartStateTimers(config) {
  stopAllTimers();
  if (!runtime.client || runtime.state !== "connected") {
    return;
  }
  if (config.includeHealth && typeof runtime.context.getHealthPayload === "function") {
    runtime.timers.health = setInterval(() => {
      void publishHealthSnapshot();
    }, Number(config.healthIntervalMs || DEFAULT_HEALTH_INTERVAL_MS));
  }
  if (config.includeColony && typeof runtime.context.getColonyPayload === "function") {
    runtime.timers.colony = setInterval(() => {
      void publishColonySnapshot();
    }, Number(config.colonyIntervalMs || DEFAULT_COLONY_INTERVAL_MS));
  }
  if (config.includeWorld && typeof runtime.context.getWorldPayload === "function") {
    runtime.timers.world = setInterval(() => {
      void publishWorldSnapshot();
    }, Number(config.worldIntervalMs || DEFAULT_WORLD_INTERVAL_MS));
  }
}

async function handleControlRequest(topic, rawMessage) {
  const config = resolveMqttConfig();
  const topics = buildTopicMap(config);
  runtime.inboundCount += 1;
  runtime.lastInboundAt = new Date().toISOString();
  const parsed = safeJsonParse(rawMessage);
  const payload = parsed && typeof parsed === "object"
    ? parsed
    : {
        action: "raw_text",
        text: String(rawMessage || "")
      };
  const action = normalizeText(payload.action || payload.type || "", 120).toLowerCase() || "unknown";
  const requestId = normalizeText(payload.id || payload.requestId || "", 160);
  const replyTopic = normalizeText(payload.replyTopic || "", 320) || topics.controlAck;
  runtime.lastControlRequest = {
    receivedAt: runtime.lastInboundAt,
    topic,
    replyTopic,
    action,
    requestId
  };

  let reply = {
    ok: true,
    requestId,
    action,
    at: new Date().toISOString(),
    handledBy: "asolaria_mqtt"
  };

  try {
    if (action === "ping") {
      reply.reply = "pong";
    } else if (action === "status.request") {
      reply.status = {
        mqtt: getMqttIntegrationStatus(),
        health: typeof runtime.context.getHealthPayload === "function"
          ? await Promise.resolve(runtime.context.getHealthPayload())
          : null,
        colony: typeof runtime.context.getColonyPayload === "function"
          ? await Promise.resolve(runtime.context.getColonyPayload())
          : null
      };
    } else if (typeof runtime.context.onControlRequest === "function") {
      const custom = await Promise.resolve(runtime.context.onControlRequest({
        topic,
        payload,
        requestId,
        replyTopic
      }));
      if (custom && typeof custom === "object") {
        reply = {
          ...reply,
          ...custom
        };
      } else {
        reply.ok = false;
        reply.error = "unhandled_control_request";
      }
    } else {
      reply.ok = false;
      reply.error = `unsupported_action:${action || "unknown"}`;
    }
  } catch (error) {
    reply.ok = false;
    reply.error = normalizeText(error?.message || error || "mqtt_control_failed", 240);
  }

  await publishRetainedState(replyTopic, reply, {
    qos: config.qos,
    retain: false
  });
}

function createClient(config) {
  const topics = buildTopicMap(config);
  const connectionOptions = {
    clientId: config.clientId,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
    keepalive: 30,
    protocolVersion: 4,
    username: config.username || undefined,
    password: config.password || undefined,
    rejectUnauthorized: !config.allowInsecureTls,
    will: {
      topic: topics.runtimePresence,
      payload: JSON.stringify({
        app: "Asolaria",
        state: "offline",
        clientId: config.clientId,
        at: new Date().toISOString()
      }),
      qos: config.qos,
      retain: config.retainState
    }
  };

  const client = mqtt.connect(config.brokerUrl, connectionOptions);
  client.on("connect", () => {
    runtime.lastConnectedAt = new Date().toISOString();
    setRuntimeState("connected", "");
    runtime.reconnectCount += 1;
    const subscribeTopics = [];
    if (config.controlEnabled) {
      subscribeTopics.push(topics.controlRequest);
    }
    // Subscribe to remote sub-colony node telemetry (federation)
    const federationBaseTopic = `${topics.root}/nodes`;
    subscribeTopics.push(`${federationBaseTopic}/+/runtime/health`);
    subscribeTopics.push(`${federationBaseTopic}/+/runtime/presence`);
    subscribeTopics.push(`${federationBaseTopic}/+/agents/colony/status`);
    subscribeTopics.push(`${federationBaseTopic}/+/world/state`);
    if (subscribeTopics.length > 0) {
      client.subscribe(subscribeTopics, { qos: config.qos }, (error, granted) => {
        if (error) {
          runtime.lastError = normalizeText(error?.message || error || "mqtt_subscribe_failed", 240);
          return;
        }
        runtime.subscriptions = Array.isArray(granted)
          ? granted.map((item) => String(item?.topic || "").trim()).filter(Boolean)
          : subscribeTopics;
      });
    } else {
      runtime.subscriptions = [];
    }
    attachGraphListeners();
    restartStateTimers(config);
    void publishPresenceState("online", {
      subscriptions: runtime.subscriptions
    });
    void publishHealthSnapshot();
    void publishColonySnapshot();
    void publishWorldSnapshot();
  });
  client.on("reconnect", () => {
    setRuntimeState("reconnecting", runtime.lastError);
  });
  client.on("offline", () => {
    runtime.lastDisconnectedAt = new Date().toISOString();
    setRuntimeState("offline", runtime.lastError);
  });
  client.on("close", () => {
    runtime.lastDisconnectedAt = new Date().toISOString();
    stopAllTimers();
    setRuntimeState("closed", runtime.lastError);
  });
  client.on("error", (error) => {
    runtime.lastError = normalizeText(error?.message || error || "mqtt_error", 240);
    setRuntimeState("error", runtime.lastError);
  });
  client.on("message", (topic, message) => {
    const topicStr = String(topic || "");
    const msgStr = String(message || "");
    // Route federation node telemetry to remote node registry
    const nodeTopicMatch = topicStr.match(new RegExp(`^${topics.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/nodes/([^/]+)/(.+)$`));
    if (nodeTopicMatch) {
      const nodeId = nodeTopicMatch[1];
      const subtopic = nodeTopicMatch[2];
      const parsed = safeJsonParse(msgStr);
      runtime.inboundCount += 1;
      runtime.lastInboundAt = new Date().toISOString();
      if (subtopic === "runtime/health") {
        remoteNodeRegistry.updateNodeHealth(nodeId, parsed);
      } else if (subtopic === "runtime/presence") {
        remoteNodeRegistry.updateNodePresence(nodeId, parsed?.state || "online");
      } else if (subtopic === "agents/colony/status") {
        remoteNodeRegistry.updateNodeColony(nodeId, parsed);
      } else if (subtopic === "world/state") {
        remoteNodeRegistry.updateNodeWorld(nodeId, parsed);
      }
      return;
    }
    void handleControlRequest(topicStr, msgStr);
  });
  return client;
}

async function syncMqttBridge(options = {}) {
  const reason = normalizeText(options.reason || "", 120);
  const config = resolveMqttConfig();
  const nextKey = getClientKey(config);

  if (!config.enabled) {
    disconnectClient("disabled");
    return getMqttIntegrationStatus();
  }
  if (!config.configured) {
    disconnectClient("not_configured");
    return getMqttIntegrationStatus();
  }

  if (runtime.client && runtime.clientKey === nextKey && (runtime.state === "connected" || runtime.state === "reconnecting" || runtime.state === "connecting")) {
    restartStateTimers(config);
    if (runtime.context.graphRuntimeEmitter) {
      attachGraphListeners();
    }
    return getMqttIntegrationStatus();
  }

  disconnectClient(reason || "reconnect");
  setRuntimeState("connecting", "");
  runtime.clientKey = nextKey;
  runtime.connectingPromise = new Promise((resolve, reject) => {
    try {
      runtime.client = createClient(config);
      const onConnect = () => {
        cleanup();
        resolve(getMqttIntegrationStatus());
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        if (!runtime.client) return;
        runtime.client.off("connect", onConnect);
        runtime.client.off("error", onError);
      };
      runtime.client.once("connect", onConnect);
      runtime.client.once("error", onError);
    } catch (error) {
      reject(error);
    }
  }).catch((error) => {
    runtime.lastError = normalizeText(error?.message || error || "mqtt_connect_failed", 240);
    setRuntimeState("error", runtime.lastError);
    throw error;
  }).finally(() => {
    runtime.connectingPromise = null;
  });

  return runtime.connectingPromise;
}

function startMqttBridge(context = {}) {
  runtime.context = {
    ...runtime.context,
    ...(context && typeof context === "object" ? context : {})
  };
  if (runtime.context.graphRuntimeEmitter && runtime.state === "connected") {
    attachGraphListeners();
  }
  return syncMqttBridge({ reason: "start" }).catch(() => getMqttIntegrationStatus());
}

async function stopMqttBridge(reason = "stopped") {
  try {
    if (runtime.state === "connected") {
      await publishPresenceState("offline", {
        reason
      });
    }
  } catch (_error) {
    // ignore
  }
  disconnectClient(reason);
  return getMqttIntegrationStatus();
}

module.exports = {
  MQTT_SECRET_NAME,
  getMqttConfigSummary,
  getMqttIntegrationStatus,
  setMqttConfig,
  publishMqttMessage,
  buildTopicMap,
  startMqttBridge,
  stopMqttBridge,
  syncMqttBridge,
  getRemoteNodeRegistry: () => remoteNodeRegistry
};
