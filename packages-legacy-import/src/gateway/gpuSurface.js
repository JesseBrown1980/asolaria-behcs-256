"use strict";

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function currentAuthorityMode(authorityModes) {
  if (!authorityModes || typeof authorityModes.getStatus !== "function") return "";
  return cleanText(authorityModes.getStatus()?.mode || "");
}

function buildGatewayGpuStatusPayload(input = {}) {
  const status = input.status && typeof input.status === "object" ? input.status : {};
  return {
    status: {
      ok: Boolean(status.ok),
      detected: Boolean(status.detected),
      available: Boolean(status.available),
      reason: cleanText(status.reason || ""),
      error: cleanText(status.error || ""),
      colonyId: cleanText(status.colonyId || ""),
      controllerPid: Number(status.controllerPid || 0) || 0,
      gpuToolPath: cleanText(status.gpuToolPath || ""),
      summary: status.summary || {},
      devices: Array.isArray(status.devices) ? status.devices : [],
      processes: Array.isArray(status.processes) ? status.processes : [],
      warnings: Array.isArray(status.warnings) ? status.warnings : [],
      leases: Array.isArray(input.leases) ? input.leases : [],
      policies: Array.isArray(input.policies) ? input.policies : [],
      authorityMode: cleanText(input.authorityMode || "")
    }
  };
}

function buildGatewayGpuLeasesPayload(input = {}) {
  const leases = Array.isArray(input.leases) ? input.leases : [];
  return {
    count: leases.length,
    leases,
    authorityMode: cleanText(input.authorityMode || "")
  };
}

function buildGatewayGpuLeasePayload(input = {}) {
  return {
    lease: input.lease || null,
    policy: input.policy || null,
    summary: input.summary || {},
    authorityMode: cleanText(input.authorityMode || "")
  };
}

function registerGatewayGpuHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const assertAuditGate = typeof input.assertAuditGate === "function" ? input.assertAuditGate : () => {};

  app.get("/api/gpu/status", requireToken, (_req, res) => {
    try {
      const status = input.gpuRuntime.getStatus();
      const leases = input.gpuLeaseStore.listGpuLeases({ status: "active", limit: 100 });
      return res.json({
        ok: true,
        ...buildGatewayGpuStatusPayload({
          status,
          leases,
          policies: input.listGpuLanePolicies(),
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.get("/api/gpu/leases", requireToken, (req, res) => {
    try {
      const query = req.query && typeof req.query === "object" ? req.query : {};
      return res.json({
        ok: true,
        ...buildGatewayGpuLeasesPayload({
          leases: input.gpuLeaseStore.listGpuLeases({
            limit: query.limit,
            status: query.status,
            colonyId: query.colonyId
          }),
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/api/gpu/leases/acquire", requireToken, (req, res) => {
    try {
      assertAuditGate("http:gpu.lease.acquire");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const status = input.gpuRuntime.getStatus();
      const result = input.gpuLeaseStore.acquireGpuLease(body, {
        runtimeStatus: status,
        actor: cleanText(body.actor || req.headers["x-actor"] || body.holderId || "api"),
        source: cleanText(body.source || "gpu-surface")
      });
      return res.json({
        ok: true,
        ...buildGatewayGpuLeasePayload({
          ...result,
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/api/gpu/leases/release", requireToken, (req, res) => {
    try {
      assertAuditGate("http:gpu.lease.release");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = input.gpuLeaseStore.releaseGpuLease(body.leaseId, body, {
        actor: cleanText(body.actor || req.headers["x-actor"] || "api"),
        source: cleanText(body.source || "gpu-surface")
      });
      return res.json({
        ok: true,
        ...buildGatewayGpuLeasePayload({
          ...result,
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });
}

function routeGatewayGpuWsMessage(ws, msg, input = {}) {
  const type = cleanText(msg?.type).toLowerCase();
  const sendWsError = input.sendWsError;
  const assertAuditGate = typeof input.assertAuditGate === "function" ? input.assertAuditGate : () => {};

  if (type === "gpu.status.get") {
    try {
      const status = input.gpuRuntime.getStatus();
      ws.send(JSON.stringify({
        type: "gpu.status.get.result",
        id: msg.id || "",
        payload: buildGatewayGpuStatusPayload({
          status,
          leases: input.gpuLeaseStore.listGpuLeases({ status: "active", limit: 100 }),
          policies: input.listGpuLanePolicies(),
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "gpu.leases.list") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      ws.send(JSON.stringify({
        type: "gpu.leases.list.result",
        id: msg.id || "",
        payload: buildGatewayGpuLeasesPayload({
          leases: input.gpuLeaseStore.listGpuLeases({
            limit: payload.limit,
            status: payload.status,
            colonyId: payload.colonyId
          }),
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "gpu.lease.acquire") {
    try {
      assertAuditGate("ws:gpu.lease.acquire");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const status = input.gpuRuntime.getStatus();
      const result = input.gpuLeaseStore.acquireGpuLease(payload, {
        runtimeStatus: status,
        actor: cleanText(payload.actor || payload.holderId || "ws"),
        source: cleanText(payload.source || "gpu-surface")
      });
      ws.send(JSON.stringify({
        type: "gpu.lease.acquire.result",
        id: msg.id || "",
        payload: buildGatewayGpuLeasePayload({
          ...result,
          authorityMode: currentAuthorityMode(input.authorityModes)
        })
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "gpu.lease.release") {
    try {
      assertAuditGate("ws:gpu.lease.release");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const result = input.gpuLeaseStore.releaseGpuLease(payload.leaseId, payload, {
        actor: cleanText(payload.actor || "ws"),
        source: cleanText(payload.source || "gpu-surface")
      });
      ws.send(JSON.stringify({
        type: "gpu.lease.release.result",
        id: msg.id || "",
        payload: buildGatewayGpuLeasePayload({
          ...result,
          authorityMode: currentAuthorityMode(input.authorityModes)
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
  buildGatewayGpuLeasePayload,
  buildGatewayGpuLeasesPayload,
  buildGatewayGpuStatusPayload,
  registerGatewayGpuHttpRoutes,
  routeGatewayGpuWsMessage
};
