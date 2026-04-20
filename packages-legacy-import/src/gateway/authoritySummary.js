function cleanText(value) {
  return String(value || "").trim();
}

function buildGatewayAuthoritySummary(input = {}) {
  const authorityStatus = input.authorityStatus && typeof input.authorityStatus === "object"
    ? input.authorityStatus
    : {};
  const pendingTransitions = Array.isArray(authorityStatus.pendingTransitions)
    ? authorityStatus.pendingTransitions
    : [];
  const pendingTransitionsMode = String(input.pendingTransitionsMode || "full").trim().toLowerCase();
  const summary = {
    ...authorityStatus,
    mode: cleanText(authorityStatus.mode),
    updatedAt: cleanText(authorityStatus.updatedAt),
    updatedBy: cleanText(authorityStatus.updatedBy),
    pendingTransitions: pendingTransitionsMode === "count"
      ? pendingTransitions.length
      : pendingTransitions
  };

  if (Object.prototype.hasOwnProperty.call(input, "policy")) {
    summary.policy = input.policy;
  }
  if (Object.prototype.hasOwnProperty.call(input, "approvals")) {
    summary.approvals = input.approvals;
  }
  if (Object.prototype.hasOwnProperty.call(input, "readiness")) {
    summary.readiness = input.readiness;
  }
  if (Object.prototype.hasOwnProperty.call(input, "omnispindle")) {
    summary.omnispindle = input.omnispindle;
  }
  if (Array.isArray(input.events)) {
    summary.events = input.events;
  }

  return summary;
}

function buildGatewayToolsPolicyPayload(input = {}) {
  return {
    policy: input.policy,
    authority: buildGatewayAuthoritySummary({
      authorityStatus: input.authorityStatus,
      omnispindle: input.omnispindle
    })
  };
}

function buildGatewayAuthorityStatusPayload(input = {}) {
  return {
    authority: buildGatewayAuthoritySummary({
      authorityStatus: input.authorityStatus,
      omnispindle: input.omnispindle
    }),
    readiness: input.readiness
  };
}

function buildGatewayAuthorityReadinessPayload(input = {}) {
  return {
    readiness: input.readiness
  };
}

function buildGatewayAuthorityReadinessDrillPayload(input = {}) {
  return {
    drill: input.drill
  };
}

function buildGatewayAuthorityModeResultPayload(input = {}) {
  const result = input.result && typeof input.result === "object" ? input.result : {};
  const payload = {
    ...result
  };
  if (Object.prototype.hasOwnProperty.call(input, "readiness")) {
    payload.readiness = input.readiness;
  }
  return payload;
}

module.exports = {
  buildGatewayAuthoritySummary,
  buildGatewayToolsPolicyPayload,
  buildGatewayAuthorityStatusPayload,
  buildGatewayAuthorityReadinessPayload,
  buildGatewayAuthorityReadinessDrillPayload,
  buildGatewayAuthorityModeResultPayload
};
