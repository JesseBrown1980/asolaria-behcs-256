const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const {
  authFromRequest,
  buildGatewayTokenPath,
  compileGatewayMessageSchema,
  createGatewayPaths,
  listToolManifests,
  loadGatewayConfig,
  loadGatewayToken,
  redactPayload
} = require("./gatewayBootstrap");
const {
  createGatewayAuthorityRuntime,
  createGatewayRuntimeState
} = require("./gatewayAuthorityRuntime");
const { createGatewayScheduler } = require("./gatewayScheduler");
const { createSlackHeartbeatDaemon } = require("./slackHeartbeatDaemon");
const {
  createBroadcastToClients,
  createGatewayWsConnectionHandler
} = require("./gatewayWsSurface");
const { createToolAuthority } = require("./toolAuthority");
const { createAuthorityModeManager } = require("./authorityMode");
const {
  registerGatewayAuthorityHttpRoutes,
  routeGatewayAuthorityWsMessage
} = require("./authoritySurface");
const {
  registerGatewayAuditHttpRoutes,
  routeGatewayAuditWsMessage
} = require("./auditSurface");
const {
  registerGatewayInvokeApprovalHttpRoutes,
  routeGatewayInvokeApprovalWsMessage
} = require("./invokeApprovalSurface");
const {
  registerGatewayShannonHttpRoutes,
  routeGatewayShannonWsMessage
} = require("./shannonSurface");
const {
  registerGatewayOpsHttpRoutes,
  routeGatewayOpsWsMessage
} = require("./gatewayOpsSurface");
const {
  registerGatewayGpuHttpRoutes,
  routeGatewayGpuWsMessage
} = require("./gpuSurface");
const { registerGatewayTaskHttpRoutes } = require("./gatewayTaskSurface");
const { createGatewayAuthorityReadiness } = require("./authorityReadiness");
const { createAuditLogManager } = require("./auditLog");
const {
  createGatewayOmnispindleControllerIssuer,
  getGatewayOmnispindleAuthorityStatus,
  getGatewayOmnispindleOperatorSummary
} = require("./omnispindleAuthority");
const { respondError, inferHttpStatusForError } = require("../../lib/helpers");
const { getLocalComputeReadinessStatus } = require("../localComputeReadiness");
const { createGpuRuntime } = require("../gpuRuntime");
const { createGpuLeaseStore } = require("../gpuLeaseStore");
const { listGpuLanePolicies } = require("../gpuLanePolicy");
const { resolveToolPaths } = require("../connectors/systemPaths");
const mistakesRouter = require("../../routes/mistakes");
const adminTerminalsRouter = require("../../routes/adminTerminals");
const standingDirectivesRouter = require("../../routes/standingDirectives");
const createTaskLedgerRouter = require("../../routes/taskLedger");
const createTaskLeaseLedgerRouter = require("../../routes/taskLeaseLedger");
const asoRouter = require("../../routes/aso");
const createCatalogRouter = require("../../routes/routes/catalog");
const createIntegrationOpsRouter = require("../../routes/routes/integrationOps");
const createManifestSyncRouter = require("../../routes/routes/manifestSync");
const { mountManagedManifestRoutes, filenameToRouteSegment } = require("../../routes/routes/manifestSync");
const createOmnispindleRouter = require("../../routes/routes/omnispindle");
const createGuardianRouter = require("../../routes/routes/guardian");
const graphRuntimeRouter = require("../../routes/routes/graphRuntime");
const createFederationRouter = require("../../routes/routes/federation");
const createWorkspaceKnowledgeRouter = require("../../routes/routes/workspaceKnowledge");
const workerRouterRouter = require("../../routes/routes/workerRouter");
const hooksRouter = require("../../routes/routes/hooks");
const createSlackIntegrationRouter = require("../../routes/integrationSlack");
const { getSlackPolicy, setSlackPolicy } = require("../connectors/slackPolicyStore");
const { publishMqttMessage, getRemoteNodeRegistry } = require("../connectors/mqttConnector");
const {
  getWorkspaceKnowledgeStatusHybrid,
  searchWorkspaceKnowledgeHybrid
} = require("../workspaceKnowledgeStore");
const { resolveNamedToolProfile } = require("../lirisNamedSurfaceRegistry");
const { resolveDataPath } = require("../runtimePaths");
const {
  getSlackIntegrationStatus,
  listSlackChannels,
  reviewSlackConversation,
  setSlackConfig,
  sendSlackMessage,
  createSlackEventPoller
} = require("../connectors/slackConnector");

function parseField(expr, min, max) {
  const value = String(expr || "").trim();
  if (value === "*") {
    return () => true;
  }
  if (/^\d+$/.test(value)) {
    const wanted = Number(value);
    return (current) => current === wanted;
  }
  const stepMatch = value.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = Math.max(1, Number(stepMatch[1]));
    return (current) => current >= min && current <= max && ((current - min) % step === 0);
  }
  return () => false;
}

function cronMatches(expr, date) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  const minuteFn = parseField(parts[0], 0, 59);
  const hourFn = parseField(parts[1], 0, 23);
  const domFn = parseField(parts[2], 1, 31);
  const monthFn = parseField(parts[3], 1, 12);
  const dowFn = parseField(parts[4], 0, 6);
  return minuteFn(date.getMinutes())
    && hourFn(date.getHours())
    && domFn(date.getDate())
    && monthFn(date.getMonth() + 1)
    && dowFn(date.getDay());
}

function createServer() {
  const gatewayPaths = createGatewayPaths(__dirname, process.env);
  const { repoRoot } = gatewayPaths;
  const config = loadGatewayConfig(gatewayPaths);
  const gatewayToken = loadGatewayToken(repoRoot, config, process.env);
  if (!gatewayToken) {
    const tokenPath = buildGatewayTokenPath(repoRoot, config);
    throw new Error(
      `Gateway token is empty. Set ASOLARIA_GATEWAY_TOKEN or create ${tokenPath}`
    );
  }

  const bind = String(config?.gateway?.bind || "127.0.0.1").trim();
  const port = Number(config?.gateway?.port || 4791);
  const redactKeys = config?.tools?.logging?.redact || [];
  const messageValidator = compileGatewayMessageSchema();
  const state = createGatewayRuntimeState(config);
  const gpuRuntime = createGpuRuntime({ resolveToolPaths });
  const gpuLeaseStore = createGpuLeaseStore({
    getGpuRuntimeStatus: () => gpuRuntime.getStatus()
  });

  const auditLog = createAuditLogManager({
    repoRoot,
    config
  });

  let broadcast = () => {};
  const authorityRuntime = createGatewayAuthorityRuntime({
    config,
    auditLog,
    state,
    broadcast: (message) => broadcast(message)
  });
  const {
    auditPolicy,
    handoverGuardPolicy,
    runtimeAuditStatus,
    refreshAuditIntegrity,
    assertAuditGate,
    recordAuthorityEvent
  } = authorityRuntime;

  const gatewayScheduler = createGatewayScheduler({
    bind,
    port,
    config,
    state,
    broadcast: (message) => broadcast(message),
    refreshAuditIntegrity,
    auditPolicy,
    cronMatches
  });
  const {
    runHeartbeat,
    runCronJob,
    startCronTicker,
    scheduleHeartbeatLoop,
    scheduleAuditVerifyLoop
  } = gatewayScheduler;
  const remoteNodeRegistry = getRemoteNodeRegistry();
  const falconAgentUrl = String(process.env.ASOLARIA_FALCON_AGENT_URL || config?.federation?.falconAgentUrl || "").trim();
  const heartbeatDaemonConfig = config?.gateway?.heartbeatDaemon || {};
  const heartbeatNamedProfile = resolveNamedToolProfile({
    namedProfileId: String(process.env.ASOLARIA_HEARTBEAT_PROFILE_ID || heartbeatDaemonConfig.namedProfileId || "").trim(),
    toolKind: "heartbeat",
    bind,
    port,
    compatPort: Number(process.env.ASOLARIA_COMPAT_4781_PORT || 4781),
    commsPort: Number(process.env.ASOLARIA_COMMS_4798_PORT || 4798),
    falconAgentUrl
  });
  const heartbeatAlertsEnabled = Object.prototype.hasOwnProperty.call(heartbeatDaemonConfig, "alertsEnabled")
    ? Boolean(heartbeatDaemonConfig.alertsEnabled)
    : Boolean(heartbeatNamedProfile?.alertsEnabled);
  const slackHeartbeatDaemon = createSlackHeartbeatDaemon({
    bind,
    port,
    hostLabel: String(heartbeatNamedProfile?.hostLabel || "Kuromi").trim(),
    intervalMs: 30_000,
    falconAgentUrl,
    logPath: resolveDataPath("heartbeat-daemon.ndjson"),
    channel: String(heartbeatDaemonConfig.channel || heartbeatNamedProfile?.channel || "").trim(),
    alertsEnabled: heartbeatAlertsEnabled,
    checks: Array.isArray(heartbeatNamedProfile?.checks) && heartbeatNamedProfile.checks.length
      ? heartbeatNamedProfile.checks
      : undefined,
    namedProfile: heartbeatNamedProfile,
    probeJson: gatewayScheduler.probeJson,
    sendSlackMessage,
    getSlackPolicy,
    getRemoteNodesSummary: () => remoteNodeRegistry.getRemoteNodesSummary(),
    broadcast: (message) => broadcast(message)
  });

  const authorityModes = createAuthorityModeManager({
    repoRoot,
    config,
    onEvent: recordAuthorityEvent
  });

  const toolAuthority = createToolAuthority({
    repoRoot,
    config,
    authorityMode: authorityModes,
    onEvent: recordAuthorityEvent
  });
  const issueOmnispindleControllerId = createGatewayOmnispindleControllerIssuer({
    authorityMode: authorityModes
  });
  const getOmnispindleControllerIssuanceStatus = () => getGatewayOmnispindleAuthorityStatus({
    authorityMode: authorityModes
  });
  const getOmnispindleOperatorSummary = () => getGatewayOmnispindleOperatorSummary({
    authorityMode: authorityModes
  });
  const authorityReadiness = createGatewayAuthorityReadiness({
    runtimeAuditStatus,
    toolAuthority,
    handoverGuardPolicy,
    state,
    runHeartbeat,
    refreshAuditIntegrity,
    authorityModes
  });
  const {
    computeAuthorityReadiness,
    runAuthorityReadinessDrill,
    assertHandoverGuards,
    resolvePendingTransitionTargetMode
  } = authorityReadiness;

  recordAuthorityEvent("server.started", {
    actor: "system",
    bind,
    port,
    pid: process.pid
  });
  refreshAuditIntegrity("startup");

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const slackEventLogPath = path.resolve(repoRoot, "data", "slack-events.ndjson");
  const manifestMountedFiles = new Set([
    "adminTerminals.js",
    "catalog.js",
    "federation.js",
    "graphRuntime.js",
    "guardian.js",
    "integrationOps.js",
    "omnispindle.js",
    "standingDirectives.js",
    "workspaceKnowledge.js",
    "workerRouter.js"
  ]);

  function requireToken(req, res, next) {
    const token = authFromRequest(req);
    if (!token || token !== gatewayToken) {
      return res.status(401).json({ ok: false, error: "Unauthorized." });
    }
    return next();
  }

  function sendHttpError(res, error) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      ok: false,
      error: String(error?.message || "request_failed"),
      code: String(error?.code || "request_failed"),
      details: error?.details || null
    });
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
    app.use(`/api/${segment}`, requireToken, router);
  }

  registerGatewayOpsHttpRoutes(app, {
    requireToken,
    sendHttpError,
    state,
    bind,
    port,
    config,
    listToolManifests,
    getLocalComputeReadinessStatus,
    toolAuthority,
    authorityModes,
    getOmnispindleOperatorSummary,
    computeAuthorityReadiness,
    runtimeAuditStatus,
    runHeartbeat,
    heartbeatDaemon: slackHeartbeatDaemon
  });

  registerGatewayGpuHttpRoutes(app, {
    requireToken,
    sendHttpError,
    assertAuditGate,
    authorityModes,
    gpuRuntime,
    gpuLeaseStore,
    listGpuLanePolicies
  });

  registerGatewayAuthorityHttpRoutes(app, {
    requireToken,
    sendHttpError,
    toolAuthority,
    authorityModes,
    getOmnispindleOperatorSummary,
    computeAuthorityReadiness,
    runAuthorityReadinessDrill,
    assertAuditGate,
    assertHandoverGuards,
    resolvePendingTransitionTargetMode
  });

  registerGatewayAuditHttpRoutes(app, {
    requireToken,
    sendHttpError,
    runtimeAuditStatus,
    refreshAuditIntegrity,
    auditLog
  });

  registerGatewayInvokeApprovalHttpRoutes(app, {
    requireToken,
    sendHttpError,
    assertAuditGate,
    toolAuthority
  });
  registerGatewayShannonHttpRoutes(app, {
    requireToken,
    sendHttpError,
    assertAuditGate,
    authorityModes
  });

  app.use("/api/mistakes", requireToken, mistakesRouter);
  app.use("/api/admin-terminals", requireToken, adminTerminalsRouter);
  app.use("/api/catalog", requireToken, createCatalogRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/manifest-sync", requireToken, createManifestSyncRouter({
    respondError,
    inferHttpStatusForError,
    mountRoute: mountManagedRoute,
    mountedFiles: manifestMountedFiles
  }));
  app.use("/api/integration-ops", requireToken, createIntegrationOpsRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/guardian", requireToken, createGuardianRouter({
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/standing-directives", requireToken, standingDirectivesRouter);
  app.use("/api/graph-runtime", requireToken, graphRuntimeRouter);
  app.use("/api/federation", requireToken, createFederationRouter({
    publishMqttMessage,
    respondError,
    inferHttpStatusForError
  }));
  app.use("/api/workspace-knowledge", requireToken, createWorkspaceKnowledgeRouter({
    respondError,
    getHybridWorkspaceKnowledgeStatus: getWorkspaceKnowledgeStatusHybrid,
    searchHybridWorkspaceKnowledge: searchWorkspaceKnowledgeHybrid
  }));
  app.use("/api/integrations/slack", requireToken, createSlackIntegrationRouter({
    getSlackPolicy,
    setSlackPolicy,
    getSlackIntegrationStatus,
    listSlackChannels,
    reviewSlackConversation,
    setSlackConfig,
    sendSlackMessage,
    createSlackEventPoller,
    defaultEventChannels: ["C0APKFR4PSA"],
    eventLogPath: slackEventLogPath
  }));
  app.use("/api/omnispindle", requireToken, createOmnispindleRouter({
    resolveToolPaths,
    respondError: sendHttpError,
    serverDir: repoRoot,
    issueControllerId: issueOmnispindleControllerId,
    getControllerIssuanceStatus: getOmnispindleControllerIssuanceStatus
  }));
  app.use("/api/worker-router", requireToken, workerRouterRouter);
  app.use("/api/hooks", requireToken, hooksRouter);
  mountManagedManifestRoutes({
    mountRoute: mountManagedRoute,
    mountedFiles: manifestMountedFiles
  });
  registerGatewayTaskHttpRoutes(app, {
    requireToken,
    createTaskLedgerRouter,
    createTaskLeaseLedgerRouter,
    asoRouter
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocket.Server({ server: httpServer, path: "/ws" });
  const clients = new Set();

  broadcast = createBroadcastToClients(clients, WebSocket);

  function sendWsError(ws, id, error) {
    ws.send(JSON.stringify({
      type: "error",
      id: id || "",
      error: String(error?.message || "request_failed"),
      code: String(error?.code || "request_failed"),
      details: error?.details || null
    }));
  }

  function routeWsMessage(ws, msg) {
    const type = String(msg?.type || "").trim().toLowerCase();
    if (routeGatewayOpsWsMessage(ws, msg, {
      sendWsError,
      state,
      bind,
      port,
      config,
      listToolManifests,
      toolAuthority,
      authorityModes,
      getOmnispindleOperatorSummary,
      computeAuthorityReadiness,
      runtimeAuditStatus,
      runHeartbeat,
      runCronJob
    })) {
      return;
    }
    if (routeGatewayGpuWsMessage(ws, msg, {
      sendWsError,
      assertAuditGate,
      authorityModes,
      gpuRuntime,
      gpuLeaseStore,
      listGpuLanePolicies
    })) {
      return;
    }
    if (routeGatewayAuthorityWsMessage(ws, msg, {
      sendWsError,
      toolAuthority,
      authorityModes,
      getOmnispindleOperatorSummary,
      computeAuthorityReadiness,
      runAuthorityReadinessDrill,
      assertAuditGate,
      assertHandoverGuards,
      resolvePendingTransitionTargetMode
    })) {
      return;
    }
    if (routeGatewayAuditWsMessage(ws, msg, {
      sendWsError,
      runtimeAuditStatus,
      refreshAuditIntegrity,
      auditLog
    })) {
      return;
    }
    if (routeGatewayInvokeApprovalWsMessage(ws, msg, {
      sendWsError,
      assertAuditGate,
      toolAuthority
    })) {
      return;
    }
    if (routeGatewayShannonWsMessage(ws, msg, {
      sendWsError,
      assertAuditGate,
      authorityModes
    })) {
      return;
    }
    ws.send(JSON.stringify({ type: "error", id: msg.id || "", error: `Unsupported message type: ${type}` }));
  }

  wss.on("connection", createGatewayWsConnectionHandler({
    clients,
    allowedOrigins: config?.gateway?.controlUi?.allowedOrigins || [],
    gatewayToken,
    messageValidator,
    redactPayload: (payload) => redactPayload(payload, redactKeys),
    routeWsMessage
  }));

  startCronTicker();
  scheduleHeartbeatLoop();
  scheduleAuditVerifyLoop();

  httpServer.listen(port, bind, () => {
    console.log(`Asolaria gateway is listening on http://${bind}:${port}`);
    console.log(`WS control plane: ws://${bind}:${port}/ws?token=***`);
    slackHeartbeatDaemon.start({ immediate: false });
  });
}

createServer();
