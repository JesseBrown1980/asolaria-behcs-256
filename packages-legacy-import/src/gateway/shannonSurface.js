const { prepareShannonExecution } = require("../shannonExecutionGate");
const {
  getShannonExecutionApprovalLink,
  requestShannonExecutionApproval,
  decideShannonExecutionApproval
} = require("../shannonApprovalBridge");
const {
  createShannonExecutionHandoff,
  listShannonExecutionHandoffs
} = require("../shannonExecutionHandoffStore");
const {
  stageShannonWorkerPacket,
  listShannonWorkerPackets
} = require("../shannonWorkerStageStore");
const {
  cleanText,
  parseFlag,
  clampLimit,
  buildGatewayShannonPreparePayload,
  buildGatewayShannonStatusPayload,
  buildGatewayShannonApprovalPayload,
  buildGatewayShannonHandoffPayload,
  buildGatewayShannonHandoffsPayload,
  buildGatewayShannonWorkerPayload,
  buildGatewayShannonWorkersPayload,
  resolvePrepareInput,
  resolveExecutionInput,
  currentAuthorityMode,
  buildPrepareOptions,
  mergeApprovalOptions,
  buildEngagementReviewRow,
  buildPreparationPreviewRow,
  buildStatusView
} = require("./shannonSummary");

function registerGatewayShannonHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const assertAuditGate = input.assertAuditGate;
  const authorityModes = input.authorityModes;

  app.get("/security/shannon/status", requireToken, (req, res) => {
    try {
      const query = req.query && typeof req.query === "object" ? req.query : {};
      return res.json({
        ok: true,
        ...buildGatewayShannonStatusPayload(buildStatusView(query, authorityModes))
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/security/shannon/approval/request", requireToken, (req, res) => {
    try {
      assertAuditGate("http:security.shannon.approval.request");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = requestShannonExecutionApproval(resolvePrepareInput(body), {
        source: body.source
      });
      return res.json({
        ok: true,
        ...buildGatewayShannonApprovalPayload(result)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/security/shannon/approval/decide", requireToken, (req, res) => {
    try {
      assertAuditGate("http:security.shannon.approval.decide");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const actor = cleanText(body.actor || req.headers["x-actor"] || "api");
      const result = decideShannonExecutionApproval(body, { actor });
      return res.json({
        ok: true,
        ...buildGatewayShannonApprovalPayload(result)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/security/shannon/prepare", requireToken, (req, res) => {
    try {
      assertAuditGate("http:security.shannon.prepare");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const actor = cleanText(body.actor || req.headers["x-actor"] || "api");
      const linkedApproval = getShannonExecutionApprovalLink(resolvePrepareInput(body));
      const preparation = prepareShannonExecution(
        resolveExecutionInput(body, linkedApproval),
        mergeApprovalOptions(
          buildPrepareOptions(body, actor, authorityModes),
          linkedApproval
        )
      );
      return res.json({
        ok: true,
        ...buildGatewayShannonPreparePayload(preparation)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/security/shannon/handoff", requireToken, (req, res) => {
    try {
      assertAuditGate("http:security.shannon.handoff");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const actor = cleanText(body.actor || req.headers["x-actor"] || "api");
      const result = createShannonExecutionHandoff(resolvePrepareInput(body), {
        authorityMode: currentAuthorityMode(authorityModes),
        actor
      });
      return res.json({
        ok: true,
        ...buildGatewayShannonHandoffPayload(result)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.get("/security/shannon/handoffs", requireToken, (req, res) => {
    try {
      const query = req.query && typeof req.query === "object" ? req.query : {};
      return res.json({
        ok: true,
        ...buildGatewayShannonHandoffsPayload(listShannonExecutionHandoffs({
          engagementId: query.engagementId,
          limit: query.limit
        }))
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/security/shannon/worker-stage", requireToken, (req, res) => {
    try {
      assertAuditGate("http:security.shannon.worker_stage");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const actor = cleanText(body.actor || req.headers["x-actor"] || "api");
      const result = stageShannonWorkerPacket(body, {
        actor,
        workerSurface: body.workerSurface
      });
      return res.json({
        ok: true,
        ...buildGatewayShannonWorkerPayload(result)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.get("/security/shannon/worker-stage", requireToken, (req, res) => {
    try {
      const query = req.query && typeof req.query === "object" ? req.query : {};
      return res.json({
        ok: true,
        ...buildGatewayShannonWorkersPayload(listShannonWorkerPackets({
          engagementId: query.engagementId,
          handoffId: query.handoffId,
          limit: query.limit
        }))
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });
}

function routeGatewayShannonWsMessage(ws, msg, input = {}) {
  const sendWsError = input.sendWsError;
  const assertAuditGate = input.assertAuditGate;
  const authorityModes = input.authorityModes;
  const type = cleanText(msg?.type).toLowerCase();

  if (type === "security.shannon.status") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      ws.send(JSON.stringify({
        type: "security.shannon.status.result",
        id: msg.id || "",
        payload: buildGatewayShannonStatusPayload(buildStatusView(payload, authorityModes))
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.approval.request") {
    try {
      assertAuditGate("ws:security.shannon.approval.request");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const result = requestShannonExecutionApproval(resolvePrepareInput(payload), {
        source: payload.source
      });
      ws.send(JSON.stringify({
        type: "security.shannon.approval.request.result",
        id: msg.id || "",
        payload: buildGatewayShannonApprovalPayload(result)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.approval.decide") {
    try {
      assertAuditGate("ws:security.shannon.approval.decide");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const actor = cleanText(payload.actor || "ws");
      const result = decideShannonExecutionApproval(payload, { actor });
      ws.send(JSON.stringify({
        type: "security.shannon.approval.decide.result",
        id: msg.id || "",
        payload: buildGatewayShannonApprovalPayload(result)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.handoff") {
    try {
      assertAuditGate("ws:security.shannon.handoff");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const actor = cleanText(payload.actor || "ws");
      const result = createShannonExecutionHandoff(resolvePrepareInput(payload), {
        authorityMode: currentAuthorityMode(authorityModes),
        actor
      });
      ws.send(JSON.stringify({
        type: "security.shannon.handoff.result",
        id: msg.id || "",
        payload: buildGatewayShannonHandoffPayload(result)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.handoffs") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      ws.send(JSON.stringify({
        type: "security.shannon.handoffs.result",
        id: msg.id || "",
        payload: buildGatewayShannonHandoffsPayload(listShannonExecutionHandoffs({
          engagementId: payload.engagementId,
          limit: payload.limit
        }))
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.worker-stage") {
    try {
      assertAuditGate("ws:security.shannon.worker_stage");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const actor = cleanText(payload.actor || "ws");
      const result = stageShannonWorkerPacket(payload, {
        actor,
        workerSurface: payload.workerSurface
      });
      ws.send(JSON.stringify({
        type: "security.shannon.worker-stage.result",
        id: msg.id || "",
        payload: buildGatewayShannonWorkerPayload(result)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "security.shannon.worker-stage.list") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      ws.send(JSON.stringify({
        type: "security.shannon.worker-stage.list.result",
        id: msg.id || "",
        payload: buildGatewayShannonWorkersPayload(listShannonWorkerPackets({
          engagementId: payload.engagementId,
          handoffId: payload.handoffId,
          limit: payload.limit
        }))
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type !== "security.shannon.prepare") {
    return false;
  }

  try {
    assertAuditGate("ws:security.shannon.prepare");
    const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
    const actor = cleanText(payload.actor || "ws");
    const linkedApproval = getShannonExecutionApprovalLink(resolvePrepareInput(payload));
    const preparation = prepareShannonExecution(
      resolveExecutionInput(payload, linkedApproval),
      mergeApprovalOptions(
        buildPrepareOptions(payload, actor, authorityModes),
        linkedApproval
      )
    );
    ws.send(JSON.stringify({
      type: "security.shannon.prepare.result",
      id: msg.id || "",
      payload: buildGatewayShannonPreparePayload(preparation)
    }));
  } catch (error) {
    sendWsError(ws, msg.id || "", error);
  }
  return true;
}

module.exports = {
  buildGatewayShannonPreparePayload,
  buildGatewayShannonStatusPayload,
  buildGatewayShannonApprovalPayload,
  buildGatewayShannonHandoffPayload,
  buildGatewayShannonHandoffsPayload,
  buildGatewayShannonWorkerPayload,
  buildGatewayShannonWorkersPayload,
  resolvePrepareInput,
  resolveExecutionInput,
  parseFlag,
  clampLimit,
  currentAuthorityMode,
  buildPrepareOptions,
  mergeApprovalOptions,
  buildEngagementReviewRow,
  buildPreparationPreviewRow,
  buildStatusView,
  registerGatewayShannonHttpRoutes,
  routeGatewayShannonWsMessage
};
