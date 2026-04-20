"use strict";

const fs = require("fs");
const path = require("path");
const adminTerminalsRouter = require("../../routes/adminTerminals");
const asoRouter = require("../../routes/aso");
const createCatalogRouter = require("../../routes/routes/catalog");
const { buildCatalogSummaryPayload, loadCatalogDependencies } = require("../../routes/routes/catalog");
const createIntegrationOpsRouter = require("../../routes/routes/integrationOps");
const { buildIntegrationOpsStatusPayload } = require("../../routes/routes/integrationOps");
const createManifestSyncRouter = require("../../routes/routes/manifestSync");
const { mountManagedManifestRoutes, filenameToRouteSegment } = require("../../routes/routes/manifestSync");
const createGuardianRouter = require("../../routes/routes/guardian");
const { buildGuardianStatusPayload, loadGuardianDependencies } = require("../../routes/routes/guardian");
const standingDirectivesRouter = require("../../routes/standingDirectives");
const connectorManifestsRouter = require("../../routes/routes/connectorManifests");
const createFederationRouter = require("../../routes/routes/federation");
const createGatewayRouter = require("../../routes/routes/gateway");
const gatewayTokensRouter = require("../../routes/routes/gatewayTokens");
const createOmnispindleRouter = require("../../routes/routes/omnispindle");
const graphRuntimeRouter = require("../../routes/routes/graphRuntime");
const hooksRouter = require("../../routes/routes/hooks");
const createPolicyRouter = require("../../routes/routes/policy");
const securityRouter = require("../../routes/routes/security");
const createWorkspaceKnowledgeRouter = require("../../routes/routes/workspaceKnowledge");
const createSlackIntegrationRouter = require("../../routes/integrationSlack");
const { respondError, inferHttpStatusForError } = require("../../lib/helpers");
const { isLoopbackRequest } = require("../../lib/network");
const { CLAWBOT_CAUTION } = require("../brainPolicy");
const { resolveToolPaths } = require("../connectors/systemPaths");
const { publishMqttMessage } = require("../connectors/mqttConnector");
const { getSlackPolicy, setSlackPolicy } = require("../connectors/slackPolicyStore");
const {
  getWorkspaceKnowledgeStatusHybrid,
  searchWorkspaceKnowledgeHybrid
} = require("../workspaceKnowledgeStore");
const {
  getSlackIntegrationStatus,
  listSlackChannels,
  reviewSlackConversation,
  setSlackConfig,
  sendSlackMessage,
  createSlackEventPoller
} = require("../connectors/slackConnector");

function sendJsonError(res, status, error, extra = {}) {
  res.status(status).json({
    ok: false,
    error: String(error || "request_failed"),
    ...extra
  });
}

function tokenFromRequest(req) {
  const queryToken = String(req.query?.token || "").trim();
  if (queryToken) {
    return queryToken;
  }
  const headerToken = String(req.headers["x-asolaria-mobile-token"] || req.headers["x-asolaria-token"] || "").trim();
  if (headerToken) {
    return headerToken;
  }
  return "";
}

function registerCompat4781ApiRoutes(app, input = {}) {
  const compatSurface = String(input.compatSurface || "proxy_4781").trim() || "proxy_4781";
  const gatewayBaseUrl = String(input.gatewayBaseUrl || "").trim();
  const runtimeState = input.runtimeState || {};
  const compatSummary = input.compatSummary;
  const repoRoot = path.resolve(__dirname, "..", "..");
  const remoteNodeRegistry = input.remoteNodeRegistry;
  const getLocalComputeReadinessStatus = input.getLocalComputeReadinessStatus;
  const normalizeChannels = typeof input.normalizeChannels === "function" ? input.normalizeChannels : (value) => Array.isArray(value) ? value : [];
  const normalizeBaseUrl = typeof input.normalizeBaseUrl === "function" ? input.normalizeBaseUrl : (value, fallback = "") => String(value || fallback || "").trim();
  const remoteBaseUrlFromState = typeof input.remoteBaseUrlFromState === "function" ? input.remoteBaseUrlFromState : () => "";
  const localCompatBaseUrl = typeof input.localCompatBaseUrl === "function" ? input.localCompatBaseUrl : () => "";
  const resolveRequestedChannel = typeof input.resolveRequestedChannel === "function" ? input.resolveRequestedChannel : () => "";
  const buildConnectionRouting = typeof input.buildConnectionRouting === "function" ? input.buildConnectionRouting : () => ({});
  const phoneBridgeKeeperStatus = typeof input.phoneBridgeKeeperStatus === "function" ? input.phoneBridgeKeeperStatus : () => ({});
  const phoneTunnelMonitorStatus = typeof input.phoneTunnelMonitorStatus === "function" ? input.phoneTunnelMonitorStatus : () => ({});
  const workOrgState = typeof input.workOrgState === "function"
    ? input.workOrgState
    : () => ({ activeOrg: "", activeOrgLabel: "", profiles: {} });
  const clampNumber = typeof input.clampNumber === "function"
    ? input.clampNumber
    : (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
  const manifestMountedFiles = new Set([
    "adminTerminals.js",
    "aso.js",
    "catalog.js",
    "connectorManifests.js",
    "federation.js",
    "gateway.js",
    "gatewayTokens.js",
    "graphRuntime.js",
    "guardian.js",
    "hooks.js",
    "integrationOps.js",
    "omnispindle.js",
    "policy.js",
    "security.js",
    "standingDirectives.js",
    "workerRouter.js",
    "workerRuntime.js",
    "workspaceKnowledge.js"
  ]);

  async function proxyGatewayJson(req, res, routePath, options = {}) {
    const upstreamPath = String(routePath || "").trim();
    if (!upstreamPath) {
      sendJsonError(res, 500, "compat_upstream_path_missing");
      return;
    }
    try {
      const method = String(options.method || req.method || "GET").trim().toUpperCase();
      const upstreamUrl = new URL(upstreamPath, gatewayBaseUrl);
      const response = await fetch(upstreamUrl, {
        method,
        headers: {
          Authorization: `Bearer ${String(runtimeState.gatewayToken || "").trim()}`,
          "Content-Type": "application/json"
        },
        body: ["GET", "HEAD"].includes(method)
          ? undefined
          : JSON.stringify(req.body && typeof req.body === "object" ? req.body : {})
      });
      const raw = await response.text();
      let payload = raw ? { ok: response.ok, raw } : { ok: response.ok };
      try {
        payload = raw ? JSON.parse(raw) : payload;
      } catch (_error) {
        payload = raw ? { ok: response.ok, raw } : payload;
      }
      if (!response.ok) {
        sendJsonError(res, response.status || 502, payload?.error || `gateway_status_${response.status || 0}`, {
          compatListener: true,
          compatSurface
        });
        return;
      }
      res.status(response.status || 200).json(payload);
    } catch (error) {
      sendJsonError(res, 502, String(error?.message || error || "gateway_proxy_failed"), {
        compatListener: true,
        compatSurface,
        gatewayBaseUrl
      });
    }
  }

  async function callGatewayControlApi(method, route, body = null) {
    const response = await fetch(new URL(String(route || "").trim(), gatewayBaseUrl), {
      method: String(method || "GET").trim().toUpperCase(),
      headers: {
        Authorization: `Bearer ${String(runtimeState.gatewayToken || "").trim()}`,
        "Content-Type": "application/json"
      },
      body: body && !["GET", "HEAD"].includes(String(method || "GET").trim().toUpperCase())
        ? JSON.stringify(body)
        : undefined
    });
    const raw = await response.text();
    let payload = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
      const error = new Error(String(payload?.error || `gateway_status_${response.status || 0}`));
      error.statusCode = response.status || 502;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function requireMobileToken(req, res, next) {
    const token = tokenFromRequest(req);
    if (!token || token !== runtimeState.mobileToken) {
      sendJsonError(res, 401, "unauthorized_mobile_compat_access", {
        compatListener: true,
        compatSurface
      });
      return;
    }
    next();
  }

  function mountManagedRoute({ file, routeSegment }) {
    const fileName = path.basename(String(file || "").trim());
    if (!fileName) {
      throw new Error("Managed route file is required.");
    }
    const segment = String(routeSegment || filenameToRouteSegment(fileName)).trim() || filenameToRouteSegment(fileName);
    const candidates = [
      path.resolve(repoRoot, "routes", "routes", fileName),
      path.resolve(repoRoot, "routes", fileName)
    ];
    const modulePath = candidates.find((candidate) => fs.existsSync(candidate)) || "";
    if (!modulePath) {
      throw new Error(`Managed route file not found: ${fileName}`);
    }
    delete require.cache[modulePath];
    const routeExport = require(modulePath);
    const router = typeof routeExport === "function"
      ? routeExport({ respondError, inferHttpStatusForError })
      : routeExport;
    app.use(`/api/${segment}`, requireMobileToken, router);
  }

  function updateConnectionState(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const nextPreference = normalizeChannels(body.preference || runtimeState.connection.preference);
    const nextAvailable = normalizeChannels(body.available || runtimeState.connection.available);
    const nextRemoteBaseUrl = normalizeBaseUrl(body.remoteBaseUrl, remoteBaseUrlFromState());

    runtimeState.connection.preference = nextPreference.length ? nextPreference : runtimeState.connection.preference;
    runtimeState.connection.available = nextAvailable.length ? nextAvailable : runtimeState.connection.available;
    runtimeState.connection.allowPublicInternet = body.allowPublicInternet === undefined
      ? runtimeState.connection.allowPublicInternet
      : Boolean(body.allowPublicInternet);
    runtimeState.connection.publicInternetPrivate = body.publicInternetPrivate === undefined
      ? runtimeState.connection.publicInternetPrivate
      : Boolean(body.publicInternetPrivate);
    runtimeState.connection.remoteAuthRequired = body.remoteAuthRequired === undefined
      ? runtimeState.connection.remoteAuthRequired
      : Boolean(body.remoteAuthRequired);
    runtimeState.connection.requireEncryptedRemote = body.requireEncryptedRemote === undefined
      ? runtimeState.connection.requireEncryptedRemote
      : Boolean(body.requireEncryptedRemote);
    runtimeState.connection.stealthDeny = body.stealthDeny === undefined
      ? runtimeState.connection.stealthDeny
      : Boolean(body.stealthDeny);
    runtimeState.connection.remoteBaseUrl = nextRemoteBaseUrl || localCompatBaseUrl();
    runtimeState.connection.updatedAt = new Date().toISOString();
    runtimeState.connection.updatedBy = String(req.headers["x-asolaria-viewer"] || "mobile_compat").trim() || "mobile_compat";

    res.json({
      ok: true,
      compatListener: true,
      compatSurface,
      remoteBaseUrl: remoteBaseUrlFromState(),
      connectionRouting: buildConnectionRouting(resolveRequestedChannel(req))
    });
  }

  function armControl(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const ttlMs = Math.round(clampNumber(body.ttlMs, 10 * 60 * 1000, 15 * 1000, 30 * 60 * 1000));
    const actor = String(body.by || req.headers["x-asolaria-viewer"] || "mobile-console").trim() || "mobile-console";

    runtimeState.control.armedUntilMs = Date.now() + ttlMs;
    runtimeState.control.armedBy = actor;
    runtimeState.control.lastAction = `armed:${actor}`;
    runtimeState.control.lastError = "";
    runtimeState.control.updatedAt = new Date().toISOString();

    res.json({
      ok: true,
      compatListener: true,
      compatSurface,
      control: compatSummary.buildControlStatus(),
      authority: compatSummary.buildControlAuthority()
    });
  }

  function disarmControl(req, res) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const reason = String(body.reason || "manual_disarm").trim() || "manual_disarm";

    runtimeState.control.armedUntilMs = 0;
    runtimeState.control.lastAction = `disarmed:${reason}`;
    runtimeState.control.updatedAt = new Date().toISOString();

    res.json({
      ok: true,
      compatListener: true,
      compatSurface,
      control: compatSummary.buildControlStatus(),
      authority: compatSummary.buildControlAuthority()
    });
  }

  function getConnectionRoutingState(req = null) {
    return buildConnectionRouting(resolveRequestedChannel(req));
  }

  function getWorkLinkPolicySummary() {
    return {
      remoteBaseUrl: remoteBaseUrlFromState(),
      requireEncryptedRemote: Boolean(runtimeState.connection?.requireEncryptedRemote),
      remoteAuthRequired: Boolean(runtimeState.connection?.remoteAuthRequired),
      stealthDeny: Boolean(runtimeState.connection?.stealthDeny),
      allowPublicInternet: Boolean(runtimeState.connection?.allowPublicInternet),
      publicInternetPrivate: Boolean(runtimeState.connection?.publicInternetPrivate),
      preferredChannels: Array.isArray(runtimeState.connection?.preference) ? runtimeState.connection.preference.slice() : [],
      availableChannels: Array.isArray(runtimeState.connection?.available) ? runtimeState.connection.available.slice() : []
    };
  }

  function getWorkOrgPolicySummary(options = {}) {
    const state = workOrgState();
    const profiles = state && typeof state.profiles === "object" && state.profiles ? state.profiles : {};
    const rows = Object.entries(profiles).map(([key, profile]) => ({
      key,
      label: String(profile?.label || key),
      active: String(state?.activeOrg || "") === key,
      profile: profile && typeof profile === "object" ? { ...profile } : {}
    }));
    return {
      activeOrg: String(state?.activeOrg || ""),
      activeOrgLabel: String(state?.activeOrgLabel || ""),
      profiles: options.includeProfiles === false
        ? rows.map(({ key, label, active }) => ({ key, label, active }))
        : rows
    };
  }

  function setActiveWorkOrg(value) {
    const key = String(value || "").trim();
    if (!key) {
      throw new Error("Organization is required.");
    }
    const state = workOrgState();
    if (!state.profiles || typeof state.profiles !== "object") {
      state.profiles = {};
    }
    if (!state.profiles[key]) {
      state.profiles[key] = { label: key };
    }
    state.activeOrg = key;
    state.activeOrgLabel = String(state.profiles[key]?.label || key);
    return {
      key,
      profile: state.profiles[key]
    };
  }

  app.get("/api/health/fast", async (req, res) => {
    try {
      res.json(await compatSummary.buildHealthPayload(req, true));
    } catch (error) {
      sendJsonError(res, 502, String(error?.message || error || "gateway_unreachable"), {
        compatListener: true,
        compatSurface,
        gatewayBaseUrl
      });
    }
  });

  app.get("/api/health", async (req, res) => {
    try {
      res.json(await compatSummary.buildHealthPayload(req, true));
    } catch (error) {
      sendJsonError(res, 502, String(error?.message || error || "gateway_unreachable"), {
        compatListener: true,
        compatSurface,
        gatewayBaseUrl
      });
    }
  });

  app.get("/api/mobile/bootstrap", (req, res) => {
    res.json(compatSummary.buildMobileBootstrap(req));
  });

  app.get("/api/mobile/session", requireMobileToken, (req, res) => {
    res.json(compatSummary.buildMobileSession(req));
  });

  app.get("/api/mobile/control/status", requireMobileToken, (req, res) => {
    res.json({
      ok: true,
      compatListener: true,
      compatSurface,
      control: compatSummary.buildControlStatus(),
      authority: compatSummary.buildControlAuthority(),
      phoneBridgeKeeper: phoneBridgeKeeperStatus(),
      phoneTunnelMonitor: phoneTunnelMonitorStatus()
    });
  });

  app.post("/api/mobile/control/arm", requireMobileToken, armControl);
  app.post("/api/mobile/control/disarm", requireMobileToken, disarmControl);
  app.post("/api/mobile/connections", requireMobileToken, updateConnectionState);

  app.get("/api/mobile/inbox", requireMobileToken, (req, res) => {
    res.json({
      ok: true,
      compatListener: true,
      compatSurface,
      inbox: compatSummary.buildInboxPayload(req)
    });
  });

  app.get("/api/mobile/settings", requireMobileToken, (_req, res) => {
    res.json(compatSummary.buildMobileSettings());
  });

  app.get("/api/guardian/status", (_req, res) => {
    try {
      return res.json(buildGuardianStatusPayload(loadGuardianDependencies()));
    } catch (error) {
      return sendJsonError(res, 500, String(error?.message || error || "guardian_status_failed"));
    }
  });

  app.get("/api/catalog/summary", (_req, res) => {
    try {
      return res.json(buildCatalogSummaryPayload(loadCatalogDependencies()));
    } catch (error) {
      return sendJsonError(res, 500, String(error?.message || error || "catalog_summary_failed"));
    }
  });

  app.get("/api/integration-ops/status", (_req, res) => {
    try {
      return res.json(buildIntegrationOpsStatusPayload());
    } catch (error) {
      return sendJsonError(res, 500, String(error?.message || error || "integration_ops_status_failed"));
    }
  });

  app.use("/api/admin-terminals", requireMobileToken, adminTerminalsRouter);
  app.use("/api/catalog", requireMobileToken, createCatalogRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/manifest-sync", requireMobileToken, createManifestSyncRouter({
    respondError,
    inferHttpStatusForError,
    mountRoute: mountManagedRoute,
    mountedFiles: manifestMountedFiles
  }));
  app.use("/api/integration-ops", requireMobileToken, createIntegrationOpsRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/aso", requireMobileToken, asoRouter);
  app.use("/api/guardian", requireMobileToken, createGuardianRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/connectors/manifests", requireMobileToken, connectorManifestsRouter);
  app.use("/api/gateway", requireMobileToken, createGatewayRouter({
    callGatewayControlApi,
    isLoopbackRequest
  }));
  app.use("/api/gateway/tokens", requireMobileToken, gatewayTokensRouter);
  app.use("/api/graph-runtime", requireMobileToken, graphRuntimeRouter);
  app.use("/api/hooks", requireMobileToken, hooksRouter);
  app.use("/api/omnispindle", requireMobileToken, createOmnispindleRouter({
    resolveToolPaths,
    respondError,
    serverDir: repoRoot
  }));
  app.use("/api/policy", requireMobileToken, createPolicyRouter({
    respondError,
    inferHttpStatusForError,
    getWorkLinkPolicySummary,
    getWorkOrgPolicySummary,
    setActiveWorkOrg,
    CLAWBOT_CAUTION,
    getConnectionRoutingState: (req) => getConnectionRoutingState(req)
  }));
  app.use("/api/security", requireMobileToken, securityRouter);
  app.use("/api/standing-directives", requireMobileToken, standingDirectivesRouter);
  app.use("/api/integrations/slack", requireMobileToken, createSlackIntegrationRouter({
    getSlackPolicy,
    setSlackPolicy,
    getSlackIntegrationStatus,
    listSlackChannels,
    reviewSlackConversation,
    setSlackConfig,
    sendSlackMessage,
    createSlackEventPoller,
    defaultEventChannels: ["C0APKFR4PSA"],
    eventLogPath: path.resolve(__dirname, "..", "..", "data", "slack-events.ndjson")
  }));

  app.get("/api/workspace-knowledge/status", (_req, res) => {
    res.json(compatSummary.workspaceIndexStatus());
  });

  app.get("/api/workspace-knowledge/index/status", (_req, res) => {
    res.json(compatSummary.workspaceIndexStatus());
  });

  app.get("/api/workspace-knowledge/colony-memory/status", (_req, res) => {
    res.json(compatSummary.colonyMemoryStatus());
  });

  app.use("/api/workspace-knowledge", requireMobileToken, createWorkspaceKnowledgeRouter({
    respondError,
    getHybridWorkspaceKnowledgeStatus: getWorkspaceKnowledgeStatusHybrid,
    searchHybridWorkspaceKnowledge: searchWorkspaceKnowledgeHybrid
  }));

  app.get("/api/federation/nodes", (_req, res) => {
    try {
      res.json({
        ok: true,
        compatListener: true,
        compatSurface,
        ...remoteNodeRegistry.getRemoteNodesSummary()
      });
    } catch (error) {
      sendJsonError(res, 500, String(error?.message || error || "federation_nodes_failed"));
    }
  });

  app.get("/api/federation/nodes/:nodeId", (req, res) => {
    try {
      const node = remoteNodeRegistry.getRemoteNode(req.params.nodeId);
      if (!node) {
        sendJsonError(res, 404, "node_not_found");
        return;
      }
      res.json({
        ok: true,
        compatListener: true,
        compatSurface,
        node
      });
    } catch (error) {
      sendJsonError(res, 500, String(error?.message || error || "federation_node_failed"));
    }
  });

  app.get("/api/federation/self/compute-readiness", (_req, res) => {
    try {
      res.json({
        ok: true,
        compatListener: true,
        compatSurface,
        readiness: getLocalComputeReadinessStatus()
      });
    } catch (error) {
      sendJsonError(res, 500, String(error?.message || error || "federation_self_compute_readiness_failed"));
    }
  });

  app.use("/api/federation", requireMobileToken, createFederationRouter({
    publishMqttMessage,
    respondError,
    inferHttpStatusForError
  }));
  mountManagedManifestRoutes({
    mountRoute: mountManagedRoute,
    mountedFiles: manifestMountedFiles
  });
}

module.exports = {
  sendJsonError,
  tokenFromRequest,
  registerCompat4781ApiRoutes
};
