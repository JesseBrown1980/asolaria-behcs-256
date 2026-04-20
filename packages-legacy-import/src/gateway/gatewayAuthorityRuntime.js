function clampGatewayRuntimeInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function buildGatewayAuditPolicy(config = {}) {
  return {
    enabled: config?.audit?.enabled !== false,
    verifyEveryMs: clampGatewayRuntimeInt(
      Number(config?.audit?.verifyEveryMinutes || 10) * 60_000,
      10 * 60_000,
      30_000,
      24 * 60 * 60 * 1000
    ),
    gateControlWritesOnFailure: config?.audit?.gateControlWritesOnFailure !== false
  };
}

function buildGatewayHandoverGuardPolicy(config = {}) {
  return {
    enabled: config?.authority?.handoverGuards?.enabled !== false,
    enforceForAsolariaPrimary: config?.authority?.handoverGuards?.enforceForAsolariaPrimary !== false,
    requireAuditIntegrity: config?.authority?.handoverGuards?.requireAuditIntegrity !== false,
    requireAuditGateOpen: config?.authority?.handoverGuards?.requireAuditGateOpen !== false,
    requireRecentHeartbeatOk: config?.authority?.handoverGuards?.requireRecentHeartbeatOk !== false,
    maxHeartbeatAgeMs: clampGatewayRuntimeInt(
      Number(config?.authority?.handoverGuards?.maxHeartbeatAgeMinutes || 30) * 60_000,
      30 * 60_000,
      60_000,
      24 * 60 * 60 * 1000
    ),
    requireNoPendingApprovals: config?.authority?.handoverGuards?.requireNoPendingApprovals === true,
    maxPendingApprovals: clampGatewayRuntimeInt(
      Number(config?.authority?.handoverGuards?.maxPendingApprovals || 0),
      0,
      0,
      1000
    )
  };
}

function createGatewayRuntimeState(config = {}) {
  return {
    startedAt: new Date().toISOString(),
    heartbeat: {
      lastRunAt: "",
      lastOkAt: "",
      consecutiveFailures: 0,
      nextDelayMs: Math.max(60_000, Number(config?.scheduler?.heartbeatEveryMinutes || 15) * 60_000),
      lastResult: null
    },
    cron: {
      lastTickAt: "",
      executions: []
    },
    authority: {
      events: []
    },
    audit: {
      lastError: "",
      gateLocked: false,
      gateReason: "",
      lastVerifyAt: "",
      lastVerifyTrigger: "",
      lastVerifyOk: true,
      lastVerifyErrorCount: 0,
      verifyCount: 0
    }
  };
}

function createGatewayAuthorityRuntime(input = {}) {
  const config = input.config || {};
  const state = input.state || createGatewayRuntimeState(config);
  const auditLog = input.auditLog;
  const broadcast = typeof input.broadcast === "function" ? input.broadcast : () => {};
  const auditPolicy = input.auditPolicy || buildGatewayAuditPolicy(config);
  const handoverGuardPolicy = input.handoverGuardPolicy || buildGatewayHandoverGuardPolicy(config);

  function runtimeAuditStatus() {
    const auditStatus = auditLog.getStatus();
    return {
      ...auditStatus,
      lastError: state.audit.lastError || auditStatus.lastError || "",
      gateLocked: state.audit.gateLocked,
      gateReason: state.audit.gateReason || "",
      gateControlWritesOnFailure: auditPolicy.gateControlWritesOnFailure,
      verifyEveryMs: auditPolicy.verifyEveryMs,
      lastVerifyAt: state.audit.lastVerifyAt,
      lastVerifyTrigger: state.audit.lastVerifyTrigger,
      lastVerifyOk: state.audit.lastVerifyOk,
      lastVerifyErrorCount: state.audit.lastVerifyErrorCount,
      verifyCount: state.audit.verifyCount
    };
  }

  function refreshAuditIntegrity(trigger = "manual") {
    const nowIso = new Date().toISOString();
    const result = auditLog.verify();
    state.audit.lastVerifyAt = nowIso;
    state.audit.lastVerifyTrigger = String(trigger || "manual").slice(0, 120);
    state.audit.lastVerifyOk = Boolean(result?.ok);
    state.audit.lastVerifyErrorCount = Number(result?.errorCount || 0);
    state.audit.verifyCount += 1;
    const shouldLock = Boolean(auditPolicy.gateControlWritesOnFailure && !result?.ok);
    const priorLocked = Boolean(state.audit.gateLocked);
    state.audit.gateLocked = shouldLock;
    state.audit.gateReason = shouldLock
      ? String(result?.firstError || "audit_integrity_failed").slice(0, 240)
      : "";
    if (!priorLocked && shouldLock) {
      broadcast({
        type: "audit.locked",
        payload: {
          at: nowIso,
          trigger: state.audit.lastVerifyTrigger,
          reason: state.audit.gateReason,
          errorCount: state.audit.lastVerifyErrorCount
        }
      });
    } else if (priorLocked && !shouldLock) {
      broadcast({
        type: "audit.unlocked",
        payload: {
          at: nowIso,
          trigger: state.audit.lastVerifyTrigger
        }
      });
    }
    return result;
  }

  function assertAuditGate(scope) {
    if (!auditPolicy.gateControlWritesOnFailure) return;
    if (!state.audit.gateLocked) return;
    const error = new Error(
      `Audit integrity gate is locked (${state.audit.gateReason || "verify_failed"}).`
    );
    error.status = 503;
    error.code = "audit_integrity_locked";
    error.details = {
      scope: String(scope || "").slice(0, 100),
      gateReason: state.audit.gateReason || "verify_failed",
      lastVerifyAt: state.audit.lastVerifyAt || "",
      lastVerifyTrigger: state.audit.lastVerifyTrigger || "",
      lastVerifyErrorCount: state.audit.lastVerifyErrorCount || 0
    };
    throw error;
  }

  function recordAuthorityEvent(type, payload) {
    const actorHint = String(
      payload?.actor
      || payload?.approval?.actor
      || payload?.approval?.decisionBy
      || payload?.transition?.requestedBy
      || payload?.transition?.decisionBy
      || ""
    ).slice(0, 120);
    const event = {
      type,
      at: new Date().toISOString(),
      actor: actorHint,
      payload: payload || {}
    };
    const appended = auditLog.append(event);
    if (!appended.ok) {
      state.audit.lastError = String(appended.error || "audit_append_failed");
      if (auditPolicy.gateControlWritesOnFailure) {
        state.audit.gateLocked = true;
        state.audit.gateReason = "audit_append_failed";
      }
    } else {
      state.audit.lastError = "";
    }
    state.authority.events.push(event);
    if (state.authority.events.length > 250) {
      state.authority.events = state.authority.events.slice(-250);
    }
    broadcast({
      type: `authority.${type}`,
      payload: event
    });
  }

  return {
    auditPolicy,
    handoverGuardPolicy,
    runtimeAuditStatus,
    refreshAuditIntegrity,
    assertAuditGate,
    recordAuthorityEvent
  };
}

module.exports = {
  buildGatewayAuditPolicy,
  buildGatewayHandoverGuardPolicy,
  clampGatewayRuntimeInt,
  createGatewayAuthorityRuntime,
  createGatewayRuntimeState
};
