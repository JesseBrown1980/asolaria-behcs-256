function buildGatewayAuditSummary(input = {}) {
  const auditStatus = input.auditStatus && typeof input.auditStatus === "object"
    ? input.auditStatus
    : {};
  const mode = String(input.mode || "full").trim().toLowerCase();
  if (mode === "compact") {
    return {
      enabled: auditStatus.enabled,
      totalEvents: auditStatus.totalEvents,
      lastHash: auditStatus.lastHash,
      lastEventAt: auditStatus.lastEventAt,
      integrity: auditStatus.integrity,
      gateLocked: auditStatus.gateLocked,
      gateReason: auditStatus.gateReason,
      lastVerifyAt: auditStatus.lastVerifyAt,
      lastVerifyTrigger: auditStatus.lastVerifyTrigger
    };
  }
  return {
    ...auditStatus
  };
}

function buildGatewayHealthSummary(input = {}) {
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const payload = {
    ok: true,
    heartbeat: state.heartbeat || {},
    cron: {
      lastTickAt: state.cron?.lastTickAt || ""
    },
    authority: input.authority || {},
    audit: buildGatewayAuditSummary({
      auditStatus: input.auditStatus,
      mode: input.auditMode
    })
  };

  const cronExecutionsLimit = Number(input.cronExecutionsLimit || 0);
  if (cronExecutionsLimit > 0) {
    payload.cron.executions = Array.isArray(state.cron?.executions)
      ? state.cron.executions.slice(-cronExecutionsLimit)
      : [];
  }

  if (input.includeServiceIdentity) {
    payload.service = String(input.service || "").trim();
    payload.bind = String(input.bind || "").trim();
    payload.port = Number(input.port || 0);
    payload.startedAt = String(state.startedAt || "").trim();
  }

  if (input.includeAuditLastError) {
    payload.auditLastError = String(input.auditStatus?.lastError || "").trim();
  }

  return payload;
}

module.exports = {
  buildGatewayAuditSummary,
  buildGatewayHealthSummary
};
