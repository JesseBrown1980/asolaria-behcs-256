const {
  buildGatewayToolsPolicyPayload,
  buildGatewayAuthorityStatusPayload,
  buildGatewayAuthorityReadinessPayload,
  buildGatewayAuthorityReadinessDrillPayload,
  buildGatewayAuthorityModeResultPayload
} = require("./authoritySummary");

function cleanText(value) {
  return String(value || "").trim();
}

function parseTargetMode(value, fallback = "asolaria_primary") {
  return cleanText(value || fallback).toLowerCase() || fallback;
}

function registerGatewayAuthorityHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const toolAuthority = input.toolAuthority;
  const authorityModes = input.authorityModes;
  const getOmnispindleOperatorSummary = input.getOmnispindleOperatorSummary;
  const computeAuthorityReadiness = input.computeAuthorityReadiness;
  const runAuthorityReadinessDrill = input.runAuthorityReadinessDrill;
  const assertAuditGate = input.assertAuditGate;
  const assertHandoverGuards = input.assertHandoverGuards;
  const resolvePendingTransitionTargetMode = input.resolvePendingTransitionTargetMode;

  app.get("/tools/policy", requireToken, (_req, res) => {
    const authorityStatus = authorityModes.getStatus();
    res.json({
      ok: true,
      ...buildGatewayToolsPolicyPayload({
        policy: toolAuthority.getPolicy(),
        authorityStatus,
        omnispindle: getOmnispindleOperatorSummary()
      }),
      readiness: computeAuthorityReadiness("asolaria_primary")
    });
  });

  app.get("/authority/status", requireToken, (req, res) => {
    const targetMode = parseTargetMode(req.query?.targetMode, "asolaria_primary");
    const authorityStatus = authorityModes.getStatus();
    res.json({
      ok: true,
      ...buildGatewayAuthorityStatusPayload({
        authorityStatus,
        omnispindle: getOmnispindleOperatorSummary(),
        readiness: computeAuthorityReadiness(targetMode)
      })
    });
  });

  app.get("/authority/readiness", requireToken, (req, res) => {
    const targetMode = parseTargetMode(req.query?.targetMode, "asolaria_primary");
    res.json({
      ok: true,
      ...buildGatewayAuthorityReadinessPayload({
        readiness: computeAuthorityReadiness(targetMode)
      })
    });
  });

  app.post("/authority/readiness/drill", requireToken, async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const targetMode = parseTargetMode(body.targetMode, "asolaria_primary");
      const drill = await runAuthorityReadinessDrill(targetMode, "http.readiness_drill");
      return res.json({
        ok: true,
        ...buildGatewayAuthorityReadinessDrillPayload({
          drill
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/authority/mode/request", requireToken, (req, res) => {
    try {
      assertAuditGate("http:authority.mode.request");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const readiness = assertHandoverGuards(body.targetMode, "http:authority.mode.request");
      const result = authorityModes.requestTransition({
        targetMode: body.targetMode,
        actor: body.actor || cleanText(req.headers["x-actor"]) || "api",
        reason: body.reason,
        ttlMs: body.ttlMs
      });
      return res.json({
        ok: true,
        ...buildGatewayAuthorityModeResultPayload({
          result,
          readiness
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/authority/mode/confirm", requireToken, (req, res) => {
    try {
      assertAuditGate("http:authority.mode.confirm");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const targetModeHint = resolvePendingTransitionTargetMode(body.id);
      const readiness = targetModeHint
        ? assertHandoverGuards(targetModeHint, "http:authority.mode.confirm")
        : computeAuthorityReadiness("operator_primary");
      const result = authorityModes.confirmTransition({
        id: body.id,
        confirmText: body.confirmText,
        actor: body.actor || cleanText(req.headers["x-actor"]) || "api",
        reason: body.reason
      });
      return res.json({
        ok: true,
        ...buildGatewayAuthorityModeResultPayload({
          result,
          readiness
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/authority/mode/rollback", requireToken, (req, res) => {
    try {
      assertAuditGate("http:authority.mode.rollback");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = authorityModes.rollback({
        actor: body.actor || cleanText(req.headers["x-actor"]) || "api",
        reason: body.reason
      });
      return res.json({
        ok: true,
        ...buildGatewayAuthorityModeResultPayload({
          result
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });
}

function routeGatewayAuthorityWsMessage(ws, msg, input = {}) {
  const sendWsError = input.sendWsError;
  const toolAuthority = input.toolAuthority;
  const authorityModes = input.authorityModes;
  const getOmnispindleOperatorSummary = input.getOmnispindleOperatorSummary;
  const computeAuthorityReadiness = input.computeAuthorityReadiness;
  const runAuthorityReadinessDrill = input.runAuthorityReadinessDrill;
  const assertAuditGate = input.assertAuditGate;
  const assertHandoverGuards = input.assertHandoverGuards;
  const resolvePendingTransitionTargetMode = input.resolvePendingTransitionTargetMode;
  const type = cleanText(msg?.type).toLowerCase();

  if (type === "tools.policy") {
    const authorityStatus = authorityModes.getStatus();
    ws.send(JSON.stringify({
      type: "tools.policy.result",
      id: msg.id || "",
      payload: buildGatewayToolsPolicyPayload({
        policy: toolAuthority.getPolicy(),
        authorityStatus,
        omnispindle: getOmnispindleOperatorSummary()
      })
    }));
    return true;
  }

  if (type === "authority.status") {
    const targetMode = parseTargetMode(msg?.payload?.targetMode, "asolaria_primary");
    const authorityStatus = authorityModes.getStatus();
    ws.send(JSON.stringify({
      type: "authority.status.result",
      id: msg.id || "",
      payload: buildGatewayAuthorityStatusPayload({
        authorityStatus,
        omnispindle: getOmnispindleOperatorSummary(),
        readiness: computeAuthorityReadiness(targetMode)
      })
    }));
    return true;
  }

  if (type === "authority.readiness") {
    const targetMode = parseTargetMode(msg?.payload?.targetMode, "asolaria_primary");
    ws.send(JSON.stringify({
      type: "authority.readiness.result",
      id: msg.id || "",
      payload: buildGatewayAuthorityReadinessPayload({
        readiness: computeAuthorityReadiness(targetMode)
      })
    }));
    return true;
  }

  if (type === "authority.readiness.drill") {
    const targetMode = parseTargetMode(msg?.payload?.targetMode, "asolaria_primary");
    void runAuthorityReadinessDrill(targetMode, "ws.readiness_drill").then((drill) => {
      ws.send(JSON.stringify({
        type: "authority.readiness.drill.result",
        id: msg.id || "",
        payload: buildGatewayAuthorityReadinessDrillPayload({
          drill
        })
      }));
    }).catch((error) => {
      sendWsError(ws, msg.id || "", error);
    });
    return true;
  }

  if (type === "authority.mode.request") {
    try {
      assertAuditGate("ws:authority.mode.request");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const readiness = assertHandoverGuards(payload.targetMode, "ws:authority.mode.request");
      const result = authorityModes.requestTransition({
        targetMode: payload.targetMode,
        reason: payload.reason,
        ttlMs: payload.ttlMs,
        actor: payload.actor || "ws"
      });
      ws.send(JSON.stringify({
        type: "authority.mode.request.result",
        id: msg.id || "",
        payload: buildGatewayAuthorityModeResultPayload({
          result,
          readiness
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "authority.mode.confirm") {
    try {
      assertAuditGate("ws:authority.mode.confirm");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const targetModeHint = resolvePendingTransitionTargetMode(payload.id);
      const readiness = targetModeHint
        ? assertHandoverGuards(targetModeHint, "ws:authority.mode.confirm")
        : computeAuthorityReadiness("operator_primary");
      const result = authorityModes.confirmTransition({
        id: payload.id,
        confirmText: payload.confirmText,
        reason: payload.reason,
        actor: payload.actor || "ws"
      });
      ws.send(JSON.stringify({
        type: "authority.mode.confirm.result",
        id: msg.id || "",
        payload: buildGatewayAuthorityModeResultPayload({
          result,
          readiness
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "authority.mode.rollback") {
    try {
      assertAuditGate("ws:authority.mode.rollback");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const result = authorityModes.rollback({
        reason: payload.reason,
        actor: payload.actor || "ws"
      });
      ws.send(JSON.stringify({
        type: "authority.mode.rollback.result",
        id: msg.id || "",
        payload: buildGatewayAuthorityModeResultPayload({
          result
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  return false;
}

module.exports = {
  parseTargetMode,
  registerGatewayAuthorityHttpRoutes,
  routeGatewayAuthorityWsMessage
};
