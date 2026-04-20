const {
  cleanText,
  buildGatewayApprovalsPayload,
  buildGatewayApprovalDecisionPayload,
  buildGatewayInvokeResultPayload
} = require("./toolReviewSummary");

function getToolAuthorityMeta(toolAuthority) {
  const policy = toolAuthority && typeof toolAuthority.getPolicy === "function"
    ? toolAuthority.getPolicy()
    : null;
  return {
    authorityMode: cleanText(policy?.authorityMode)
  };
}

function registerGatewayInvokeApprovalHttpRoutes(app, input = {}) {
  const requireToken = input.requireToken;
  const sendHttpError = input.sendHttpError;
  const assertAuditGate = input.assertAuditGate;
  const toolAuthority = input.toolAuthority;

  app.post("/invoke", requireToken, async (req, res) => {
    try {
      assertAuditGate("http:invoke");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const invoked = await toolAuthority.invoke({
        tool: body.tool,
        payload: body.payload,
        approvalId: body.approvalId,
        actor: body.actor || cleanText(req.headers["x-actor"]) || "api"
      });
      const meta = getToolAuthorityMeta(toolAuthority);
      return res.json({
        ok: true,
        ...buildGatewayInvokeResultPayload(invoked, meta)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.get("/approvals", requireToken, (req, res) => {
    try {
      const approvals = toolAuthority.listApprovals({
        status: cleanText(req.query?.status),
        limit: Number(req.query?.limit || 50)
      });
      const meta = getToolAuthorityMeta(toolAuthority);
      return res.json({
        ok: true,
        ...buildGatewayApprovalsPayload(approvals, meta)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });

  app.post("/approvals/:id/decide", requireToken, (req, res) => {
    try {
      assertAuditGate("http:approval.decide");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const approval = toolAuthority.decideApproval({
        id: req.params.id,
        decision: body.decision,
        reason: body.reason,
        actor: body.actor || cleanText(req.headers["x-actor"]) || "api"
      });
      const meta = getToolAuthorityMeta(toolAuthority);
      return res.json({
        ok: true,
        ...buildGatewayApprovalDecisionPayload(approval, meta)
      });
    } catch (error) {
      return sendHttpError(res, error);
    }
  });
}

function routeGatewayInvokeApprovalWsMessage(ws, msg, input = {}) {
  const sendWsError = input.sendWsError;
  const assertAuditGate = input.assertAuditGate;
  const toolAuthority = input.toolAuthority;
  const type = cleanText(msg?.type).toLowerCase();

  if (type === "tool.invoke") {
    try {
      assertAuditGate("ws:tool.invoke");
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
      return true;
    }
    const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
    void toolAuthority.invoke({
      tool: payload.tool,
      payload: payload.payload,
      approvalId: payload.approvalId,
      actor: payload.actor || "ws"
    }).then((invoked) => {
      const meta = getToolAuthorityMeta(toolAuthority);
      ws.send(JSON.stringify({
        type: "tool.invoke.result",
        id: msg.id || "",
        payload: buildGatewayInvokeResultPayload(invoked, meta)
      }));
    }).catch((error) => {
      sendWsError(ws, msg.id || "", error);
    });
    return true;
  }

  if (type === "approvals.list") {
    try {
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const approvals = toolAuthority.listApprovals({
        status: payload.status,
        limit: payload.limit
      });
      const meta = getToolAuthorityMeta(toolAuthority);
      ws.send(JSON.stringify({
        type: "approvals.list.result",
        id: msg.id || "",
        payload: buildGatewayApprovalsPayload(approvals, meta)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  if (type === "approval.decide") {
    try {
      assertAuditGate("ws:approval.decide");
      const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
      const approval = toolAuthority.decideApproval({
        id: payload.id,
        decision: payload.decision,
        reason: payload.reason,
        actor: payload.actor || "ws"
      });
      const meta = getToolAuthorityMeta(toolAuthority);
      ws.send(JSON.stringify({
        type: "approval.decide.result",
        id: msg.id || "",
        payload: buildGatewayApprovalDecisionPayload(approval, meta)
      }));
    } catch (error) {
      sendWsError(ws, msg.id || "", error);
    }
    return true;
  }

  return false;
}

module.exports = {
  buildGatewayApprovalsPayload,
  buildGatewayApprovalDecisionPayload,
  buildGatewayInvokeResultPayload,
  registerGatewayInvokeApprovalHttpRoutes,
  routeGatewayInvokeApprovalWsMessage
};
