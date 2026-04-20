const {
  cleanText,
  buildGatewayAuditEventsPayload
} = require("./auditReviewSummary");

function buildGatewayAuditVerifyPayload(result, audit) {
  return {
    result,
    audit
  };
}

function registerGatewayAuditHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const runtimeAuditStatus = input.runtimeAuditStatus;
  const refreshAuditIntegrity = input.refreshAuditIntegrity;
  const auditLog = input.auditLog;

  app.get("/audit/status", requireToken, (_req, res) => {
    res.json({
      ok: true,
      audit: runtimeAuditStatus()
    });
  });

  app.get("/audit/events", requireToken, (req, res) => {
    try {
      const events = auditLog.list({
        type: cleanText(req.query?.type),
        since: cleanText(req.query?.since),
        limit: Number(req.query?.limit || 100)
      });
      return res.json({
        ok: true,
        ...buildGatewayAuditEventsPayload(events)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.get("/audit/verify", requireToken, (_req, res) => {
    const result = refreshAuditIntegrity("http.verify.get");
    res.json({
      ok: true,
      ...buildGatewayAuditVerifyPayload(result, runtimeAuditStatus())
    });
  });

  app.post("/audit/verify", requireToken, (_req, res) => {
    const result = refreshAuditIntegrity("http.verify.post");
    res.json({
      ok: true,
      ...buildGatewayAuditVerifyPayload(result, runtimeAuditStatus())
    });
  });
}

function routeGatewayAuditWsMessage(ws, msg, input = {}) {
  const sendWsError = input.sendWsError;
  const runtimeAuditStatus = input.runtimeAuditStatus;
  const refreshAuditIntegrity = input.refreshAuditIntegrity;
  const auditLog = input.auditLog;
  const type = cleanText(msg?.type).toLowerCase();

  if (type === "audit.status") {
    ws.send(JSON.stringify({
      type: "audit.status.result",
      id: msg.id || "",
      payload: {
        audit: runtimeAuditStatus()
      }
    }));
    return true;
  }

  if (type === "audit.list") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const events = auditLog.list({
        type: payload.type,
        since: payload.since,
        limit: payload.limit
      });
      ws.send(JSON.stringify({
        type: "audit.list.result",
        id: msg.id || "",
        payload: buildGatewayAuditEventsPayload(events)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "audit.verify") {
    const result = refreshAuditIntegrity("ws.verify");
    ws.send(JSON.stringify({
      type: "audit.verify.result",
      id: msg.id || "",
      payload: buildGatewayAuditVerifyPayload(result, runtimeAuditStatus())
    }));
    return true;
  }

  return false;
}

module.exports = {
  buildGatewayAuditEventsPayload,
  buildGatewayAuditVerifyPayload,
  registerGatewayAuditHttpRoutes,
  routeGatewayAuditWsMessage
};
