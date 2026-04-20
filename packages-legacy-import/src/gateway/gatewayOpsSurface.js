const { buildGatewayAuthoritySummary } = require("./authoritySummary");
const { buildGatewayHealthSummary } = require("./healthSummary");

function cleanText(value) {
  return String(value || "").trim();
}

function buildGatewayOpsHealthPayload(input = {}) {
  const authorityStatus = input.authorityModes.getStatus();
  const readiness = input.computeAuthorityReadiness("asolaria_primary");
  const auditStatus = input.runtimeAuditStatus();
  return buildGatewayHealthSummary({
    state: input.state,
    service: "asolaria-gateway",
    bind: input.bind,
    port: input.port,
    authority: buildGatewayAuthoritySummary({
      authorityStatus,
      policy: input.toolAuthority.getPolicy(),
      approvals: input.toolAuthority.getSummary(),
      readiness,
      omnispindle: input.getOmnispindleOperatorSummary(),
      events: Array.isArray(input.state?.authority?.events)
        ? input.state.authority.events.slice(-30)
        : [],
      pendingTransitionsMode: "count"
    }),
    auditStatus,
    includeServiceIdentity: input.includeServiceIdentity !== false,
    cronExecutionsLimit: Number(input.cronExecutionsLimit || 20),
    auditMode: input.auditMode || "full",
    includeAuditLastError: input.includeAuditLastError === true
  });
}

function buildGatewayCronPayload(input = {}) {
  const executions = Array.isArray(input.executions) ? input.executions : [];
  return {
    jobs: input.jobs || {},
    executions: executions.slice(-Math.max(1, Number(input.limit || 50)))
  };
}

function registerGatewayOpsHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const listToolManifests = input.listToolManifests;
  const getLocalComputeReadinessStatus = input.getLocalComputeReadinessStatus;
  const runHeartbeat = input.runHeartbeat;
  const heartbeatDaemon = input.heartbeatDaemon;

  app.get("/health", (_req, res) => {
    res.json(buildGatewayOpsHealthPayload({
      state: input.state,
      bind: input.bind,
      port: input.port,
      toolAuthority: input.toolAuthority,
      authorityModes: input.authorityModes,
      getOmnispindleOperatorSummary: input.getOmnispindleOperatorSummary,
      computeAuthorityReadiness: input.computeAuthorityReadiness,
      runtimeAuditStatus: input.runtimeAuditStatus,
      includeServiceIdentity: true,
      cronExecutionsLimit: 20,
      auditMode: "full"
    }));
  });

  app.get("/tools", requireToken, (_req, res) => {
    const manifests = listToolManifests();
    res.json({
      ok: true,
      count: manifests.length,
      tools: manifests,
      policy: input.toolAuthority.getPolicy()
    });
  });

  app.get("/federation/self/compute-readiness", requireToken, (_req, res) => {
    res.json({
      ok: true,
      readiness: getLocalComputeReadinessStatus()
    });
  });

  app.post("/heartbeat/run", requireToken, async (_req, res) => {
    try {
      const result = await runHeartbeat("http.manual");
      return res.json({
        ok: true,
        result,
        heartbeat: input.state.heartbeat
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/heartbeat/daemon/run", requireToken, async (_req, res) => {
    if (!heartbeatDaemon || typeof heartbeatDaemon.run !== "function") {
      return res.status(501).json({ ok: false, error: "heartbeat_daemon_unavailable" });
    }
    try {
      const result = await heartbeatDaemon.run("http.daemon.manual");
      return res.json({
        ok: true,
        result,
        daemon: heartbeatDaemon.status()
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/heartbeat/daemon/start", requireToken, (_req, res) => {
    if (!heartbeatDaemon || typeof heartbeatDaemon.start !== "function") {
      return res.status(501).json({ ok: false, error: "heartbeat_daemon_unavailable" });
    }
    return res.json({
      ok: true,
      status: "started",
      daemon: heartbeatDaemon.start()
    });
  });

  app.post("/heartbeat/daemon/stop", requireToken, (_req, res) => {
    if (!heartbeatDaemon || typeof heartbeatDaemon.stop !== "function") {
      return res.status(501).json({ ok: false, error: "heartbeat_daemon_unavailable" });
    }
    return res.json({
      ok: true,
      status: "stopped",
      daemon: heartbeatDaemon.stop()
    });
  });

  app.get("/heartbeat/daemon/status", requireToken, (_req, res) => {
    if (!heartbeatDaemon || typeof heartbeatDaemon.status !== "function") {
      return res.status(501).json({ ok: false, error: "heartbeat_daemon_unavailable" });
    }
    return res.json({
      ok: true,
      daemon: heartbeatDaemon.status()
    });
  });

  app.get("/cron", requireToken, (_req, res) => {
    res.json({
      ok: true,
      ...buildGatewayCronPayload({
        jobs: input.config?.scheduler?.jobs || {},
        executions: input.state?.cron?.executions || [],
        limit: 50
      })
    });
  });
}

function routeGatewayOpsWsMessage(ws, msg, input = {}) {
  const type = cleanText(msg?.type).toLowerCase();

  if (type === "ping") {
    ws.send(JSON.stringify({ type: "pong", at: new Date().toISOString(), id: msg.id || "" }));
    return true;
  }

  if (type === "registry.list") {
    ws.send(JSON.stringify({
      type: "registry.list.result",
      id: msg.id || "",
      payload: { tools: input.listToolManifests() }
    }));
    return true;
  }

  if (type === "health.get") {
    ws.send(JSON.stringify({
      type: "health.get.result",
      id: msg.id || "",
      payload: buildGatewayOpsHealthPayload({
        state: input.state,
        bind: input.bind,
        port: input.port,
        toolAuthority: input.toolAuthority,
        authorityModes: input.authorityModes,
        getOmnispindleOperatorSummary: input.getOmnispindleOperatorSummary,
        computeAuthorityReadiness: input.computeAuthorityReadiness,
        runtimeAuditStatus: input.runtimeAuditStatus,
        includeServiceIdentity: true,
        auditMode: "compact",
        includeAuditLastError: true
      })
    }));
    return true;
  }

  if (type === "heartbeat.run") {
    void input.runHeartbeat("ws").then((result) => {
      ws.send(JSON.stringify({
        type: "heartbeat.run.result",
        id: msg.id || "",
        payload: result
      }));
    }).catch((error) => {
      input.sendWsError(ws, msg.id || "", error);
    });
    return true;
  }

  if (type === "cron.list") {
    ws.send(JSON.stringify({
      type: "cron.list.result",
      id: msg.id || "",
      payload: buildGatewayCronPayload({
        jobs: input.config?.scheduler?.jobs || {},
        executions: input.state?.cron?.executions || [],
        limit: 30
      })
    }));
    return true;
  }

  if (type === "cron.run") {
    const jobName = cleanText(msg?.payload?.name);
    if (!jobName || !Object.prototype.hasOwnProperty.call(input.config?.scheduler?.jobs || {}, jobName)) {
      ws.send(JSON.stringify({
        type: "error",
        id: msg.id || "",
        error: "Unknown cron job name."
      }));
      return true;
    }
    void input.runCronJob(jobName, "manual").then((record) => {
      ws.send(JSON.stringify({
        type: "cron.run.result",
        id: msg.id || "",
        payload: record
      }));
    }).catch((error) => {
      input.sendWsError(ws, msg.id || "", error);
    });
    return true;
  }

  return false;
}

module.exports = {
  buildGatewayCronPayload,
  buildGatewayOpsHealthPayload,
  cleanText,
  registerGatewayOpsHttpRoutes,
  routeGatewayOpsWsMessage
};
