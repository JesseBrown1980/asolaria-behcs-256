function parseDateMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function createGatewayAuthorityReadiness(input = {}) {
  const runtimeAuditStatus = input.runtimeAuditStatus;
  const toolAuthority = input.toolAuthority;
  const handoverGuardPolicy = input.handoverGuardPolicy || {};
  const state = input.state || {};
  const runHeartbeat = input.runHeartbeat;
  const refreshAuditIntegrity = input.refreshAuditIntegrity;
  const authorityModes = input.authorityModes;

  function computeAuthorityReadiness(targetModeRaw = "asolaria_primary") {
    const targetMode = String(targetModeRaw || "asolaria_primary").trim().toLowerCase() || "asolaria_primary";
    const nowIso = new Date().toISOString();
    const nowMs = parseDateMs(nowIso);
    const auditStatus = runtimeAuditStatus();
    const approvalsSummary = toolAuthority.getSummary();
    const checks = [];

    if (handoverGuardPolicy.requireAuditIntegrity) {
      const ok = Boolean(auditStatus?.integrity?.ok);
      checks.push({
        id: "audit_integrity_ok",
        ok,
        required: true,
        reason: ok ? "" : "Audit integrity verify is failing."
      });
    }
    if (handoverGuardPolicy.requireAuditGateOpen) {
      const ok = !Boolean(auditStatus?.gateLocked);
      checks.push({
        id: "audit_gate_open",
        ok,
        required: true,
        reason: ok ? "" : `Audit gate is locked (${String(auditStatus?.gateReason || "locked")}).`
      });
    }
    if (handoverGuardPolicy.requireRecentHeartbeatOk) {
      const lastOkAt = String(state.heartbeat?.lastOkAt || "").trim();
      const lastOkMs = parseDateMs(lastOkAt);
      const ageMs = lastOkMs > 0 ? Math.max(0, nowMs - lastOkMs) : Number.POSITIVE_INFINITY;
      const ok = lastOkMs > 0 && ageMs <= handoverGuardPolicy.maxHeartbeatAgeMs;
      checks.push({
        id: "recent_heartbeat_ok",
        ok,
        required: true,
        maxAgeMs: handoverGuardPolicy.maxHeartbeatAgeMs,
        ageMs: Number.isFinite(ageMs) ? ageMs : -1,
        lastOkAt: lastOkAt || "",
        reason: ok ? "" : "Recent HEARTBEAT_OK is required before handover."
      });
    }
    if (handoverGuardPolicy.requireNoPendingApprovals) {
      const pending = Number(approvalsSummary?.counts?.pending || 0);
      const ok = pending <= handoverGuardPolicy.maxPendingApprovals;
      checks.push({
        id: "pending_approvals_guard",
        ok,
        required: true,
        pending,
        maxPending: handoverGuardPolicy.maxPendingApprovals,
        reason: ok ? "" : `Pending approvals (${pending}) exceed limit (${handoverGuardPolicy.maxPendingApprovals}).`
      });
    }

    const enforce = Boolean(
      handoverGuardPolicy.enabled
      && (!handoverGuardPolicy.enforceForAsolariaPrimary || targetMode === "asolaria_primary")
    );
    const blocking = checks.filter((item) => !item.ok);
    return {
      checkedAt: nowIso,
      targetMode,
      enforce,
      ok: enforce ? blocking.length === 0 : true,
      checks,
      blockingReasons: blocking.map((item) => String(item.reason || item.id || "guard_failed"))
    };
  }

  function assertHandoverGuards(targetModeRaw, scope) {
    const readiness = computeAuthorityReadiness(targetModeRaw);
    if (!readiness.enforce || readiness.ok) {
      return readiness;
    }
    const error = new Error(
      `Handover guard blocked transition to "${readiness.targetMode}". ${readiness.blockingReasons.join(" ")}`
    );
    error.status = 403;
    error.code = "authority_handover_guard_failed";
    error.details = {
      scope: String(scope || "").slice(0, 100),
      readiness
    };
    throw error;
  }

  function buildDrillRecommendedActions(inputState = {}) {
    const hints = [];
    const addHint = (text) => {
      const value = String(text || "").trim();
      if (!value) return;
      if (hints.includes(value)) return;
      hints.push(value);
    };

    const auditVerify = inputState.auditVerify || {};
    const auditStatus = inputState.auditStatus || {};
    const heartbeat = inputState.heartbeatResult || {};
    const readiness = inputState.readiness || {};

    if (!auditVerify.ok) {
      addHint("Audit verify failed. Inspect `data/gateway-audit.ndjson` for tamper or corruption.");
      addHint("After fixing audit data, run `POST /audit/verify` to clear the integrity gate.");
    }
    if (auditStatus.gateLocked) {
      const reason = String(auditStatus.gateReason || "audit_integrity_failed").trim();
      addHint(`Audit gate is locked (${reason}). Resolve audit integrity before handover.`);
    }

    const failedChecks = Array.isArray(heartbeat.checks)
      ? heartbeat.checks.filter((item) => !item?.ok)
      : [];
    for (const check of failedChecks) {
      const url = String(check?.url || "").trim();
      const lower = url.toLowerCase();
      if (lower.includes(":5443/health")) {
        addHint("Start sandbox manager (`services/sandbox-manager`) and re-run readiness drill.");
      } else if (lower.includes(":5444/health")) {
        addHint("Legacy memory-indexer is down. It is lexical only; main semantic retrieval lives under `/api/workspace-knowledge` on Asolaria.");
      } else if (lower.includes(":4791/health")) {
        addHint("Gateway health check failed. Restart gateway and re-run readiness drill.");
      } else {
        addHint(`Fix heartbeat dependency failure for ${url || "unknown target"} before handover.`);
      }
    }
    if (!heartbeat.ok) {
      addHint("Run `POST /heartbeat/run` (or Readiness Drill) after dependencies recover.");
    }

    const blockingReasons = Array.isArray(readiness.blockingReasons) ? readiness.blockingReasons : [];
    for (const reason of blockingReasons) {
      const text = String(reason || "").trim();
      const lower = text.toLowerCase();
      if (!text) continue;
      if (lower.includes("recent heartbeat_ok")) {
        addHint("A recent HEARTBEAT_OK is required. Ensure dependencies are healthy, then run the drill again.");
      } else if (lower.includes("pending approvals")) {
        addHint("Resolve pending approvals via `GET /approvals` and `POST /approvals/:id/decide`.");
      } else if (lower.includes("audit gate is locked")) {
        addHint("Audit gate must be open. Fix integrity and verify audit chain.");
      }
    }

    if (hints.length < 1) {
      addHint("No remediation needed. Readiness checks are passing.");
    }
    return hints.slice(0, 12);
  }

  async function runAuthorityReadinessDrill(targetModeRaw = "asolaria_primary", trigger = "http.readiness_drill") {
    const targetMode = String(targetModeRaw || "asolaria_primary").trim().toLowerCase() || "asolaria_primary";
    const startedAt = new Date().toISOString();
    const auditVerify = refreshAuditIntegrity(`${trigger}.audit_verify`);
    const heartbeatResult = await runHeartbeat(`${trigger}.heartbeat`);
    const readiness = computeAuthorityReadiness(targetMode);
    const auditStatus = runtimeAuditStatus();
    const heartbeatOk = Boolean(heartbeatResult?.ok);
    const auditOk = Boolean(auditVerify?.ok);
    const ok = Boolean(readiness?.ok) && heartbeatOk && auditOk;
    const recommendedActions = buildDrillRecommendedActions({
      auditVerify,
      auditStatus,
      heartbeatResult,
      readiness
    });
    return {
      ok,
      targetMode,
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: [
        {
          id: "audit_verify",
          ok: auditOk,
          errorCount: Number(auditVerify?.errorCount || 0),
          firstError: String(auditVerify?.firstError || "")
        },
        {
          id: "heartbeat_run",
          ok: heartbeatOk,
          ack: String(heartbeatResult?.ack || ""),
          failedChecks: Array.isArray(heartbeatResult?.checks)
            ? heartbeatResult.checks.filter((item) => !item?.ok).map((item) => ({
              url: String(item?.url || ""),
              status: Number(item?.status || 0),
              error: String(item?.error || "")
            }))
            : []
        },
        {
          id: "authority_readiness",
          ok: Boolean(readiness?.ok),
          blockingReasons: Array.isArray(readiness?.blockingReasons) ? readiness.blockingReasons : []
        }
      ],
      recommendedActions,
      readiness,
      audit: auditStatus,
      heartbeat: state.heartbeat?.lastResult || null
    };
  }

  function resolvePendingTransitionTargetMode(transitionIdRaw) {
    const transitionId = String(transitionIdRaw || "").trim();
    if (!transitionId) return "";
    const status = authorityModes.getStatus();
    const pending = Array.isArray(status?.pendingTransitions) ? status.pendingTransitions : [];
    const match = pending.find((item) => String(item?.id || "").trim() === transitionId);
    return String(match?.targetMode || "").trim().toLowerCase();
  }

  return {
    computeAuthorityReadiness,
    assertHandoverGuards,
    buildDrillRecommendedActions,
    runAuthorityReadinessDrill,
    resolvePendingTransitionTargetMode
  };
}

module.exports = {
  parseDateMs,
  createGatewayAuthorityReadiness
};
