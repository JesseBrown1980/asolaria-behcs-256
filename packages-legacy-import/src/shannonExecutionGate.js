const { appendActionManifest } = require("./graphRuntimeStore");
const { buildShannonPacketFromEngagement } = require("./shannonPacketBuilder");

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function buildExecutionApproval(input = {}, packet = {}) {
  const rawMode = cleanText(input.mode || input.executionMode).toLowerCase();
  const mode = rawMode === "approved_run" || rawMode === "execute"
    ? "approved_run"
    : "dry_run";
  const authorityMode = cleanText(input.authorityMode || "operator_primary").toLowerCase() || "operator_primary";
  const explicitApproval = Boolean(
    input.executionApproved
      || input.explicitExecutionApproval
      || input.runApproved
  );
  return {
    mode,
    authorityMode,
    explicitApproval,
    approvedBy: cleanText(input.approvedBy || packet.approval?.approvedBy),
    approvalRef: cleanText(input.approvalRef || packet.approval?.approvalRef)
  };
}

function evaluateExecution(packet = {}, approval = {}) {
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      status: "blocked",
      reason: "packet_not_ready",
      approvalState: "blocked"
    };
  }
  if (approval.mode !== "approved_run") {
    return {
      ok: true,
      status: "dry_run_ready",
      reason: "",
      approvalState: "dry_run_only"
    };
  }
  if (!approval.explicitApproval) {
    return {
      ok: false,
      status: "blocked",
      reason: "execution_approval_required",
      approvalState: "leader_required"
    };
  }
  if (approval.authorityMode !== "asolaria_primary") {
    return {
      ok: false,
      status: "blocked",
      reason: "authority_mode_not_asolaria_primary",
      approvalState: "leader_required"
    };
  }
  if (!approval.approvedBy || !approval.approvalRef) {
    return {
      ok: false,
      status: "blocked",
      reason: "execution_approval_reference_required",
      approvalState: "leader_required"
    };
  }
  return {
    ok: true,
    status: "approved_ready",
    reason: "",
    approvalState: "leader_approved"
  };
}

function normalizePacket(input = {}) {
  if (input && typeof input === "object" && input.ok === true && input.provider === "shannon") {
    return input;
  }
  return buildShannonPacketFromEngagement(input);
}

function buildPreparationResult(packet = {}, options = {}) {
  const executionApproval = buildExecutionApproval(options, packet);
  const decision = evaluateExecution(packet, executionApproval);
  return {
    ok: decision.ok,
    provider: "shannon",
    engagementId: cleanText(packet.engagementId),
    taskId: cleanText(packet.taskId),
    mode: executionApproval.mode,
    authorityMode: executionApproval.authorityMode,
    status: decision.status,
    reason: decision.reason,
    approvalState: decision.approvalState,
    explicitApproval: executionApproval.explicitApproval,
    approvedBy: executionApproval.approvedBy,
    approvalRef: executionApproval.approvalRef,
    target: packet.target,
    expectedArtifacts: Array.isArray(packet.expectedArtifacts) ? packet.expectedArtifacts.slice() : [],
    ruleAnchors: ["LX-328", "LX-329", "LX-331", "LX-332", "LX-333"]
  };
}

function inspectShannonExecution(input = {}, options = {}) {
  const packet = normalizePacket(input);
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      error: cleanText(packet?.error || "packet_not_ready"),
      packet
    };
  }

  const output = buildPreparationResult(packet, options);

  if (options.recordManifest !== false) {
    appendActionManifest({
      component: "shannon-execution-gate",
      action: "prepare_shannon_execution",
      status: output.status,
      actor: {
        type: "security_lane",
        id: cleanText(options.actor || "sec-pentest"),
        label: cleanText(options.actor || "sec-pentest")
      },
      target: {
        type: cleanText(packet.target?.kind || "target"),
        id: cleanText(packet.engagementId || packet.taskId || ""),
        label: cleanText(packet.objective || packet.target?.label || packet.target?.ref),
        criticality: cleanText(packet.risk?.level || "normal")
      },
      reason: output.reason,
      context: {
        provider: "shannon",
        engagementId: output.engagementId,
        taskId: output.taskId,
        mode: output.mode,
        authorityMode: output.authorityMode,
        targetKind: cleanText(packet.target?.kind),
        targetRef: cleanText(packet.target?.ref)
      },
      policy: {
        mode: output.mode,
        approvalState: output.approvalState,
        autonomous: false,
        rollbackRequired: false
      },
      evidence: {
        expectedArtifacts: output.expectedArtifacts,
        approvalRef: output.approvalRef,
        ruleAnchors: output.ruleAnchors
      }
    });
  }

  return output;
}

function prepareShannonExecution(input = {}, options = {}) {
  return inspectShannonExecution(input, {
    ...options,
    recordManifest: options.recordManifest !== false
  });
}

module.exports = {
  buildExecutionApproval,
  evaluateExecution,
  buildPreparationResult,
  inspectShannonExecution,
  prepareShannonExecution
};
