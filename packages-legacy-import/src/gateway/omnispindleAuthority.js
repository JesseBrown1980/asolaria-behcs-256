const {
  normalizeManagerId,
  getManagerDefinition,
  getOmnispindleLaneDefinitions
} = require("../laneRegistry");
const { buildGatewayLaneCompactSummary } = require("./compactLaneSummary");

const GATEWAY_CONTROLLER_PRIORITY = Object.freeze([
  "local_codex",
  "instant_agent",
  "shared_compute"
]);

function cleanText(value) {
  return String(value || "").trim();
}

function getAuthorityMode(authorityMode) {
  if (authorityMode && typeof authorityMode.getMode === "function") {
    return cleanText(authorityMode.getMode()).toLowerCase() || "operator_primary";
  }
  return "operator_primary";
}

function getGatewayOmnispindleAuthorityStatus(input = {}) {
  const mode = getAuthorityMode(input.authorityMode);
  return {
    mode,
    activationIssuanceOpen: mode === "asolaria_primary"
  };
}

function pickGatewayController(preferredManagers = []) {
  const candidates = Array.isArray(preferredManagers)
    ? preferredManagers.map((entry) => normalizeManagerId(entry)).filter(Boolean)
    : [];
  const writeCapable = candidates.filter((managerId) => Boolean(getManagerDefinition(managerId)?.writeCapable));
  if (writeCapable.length < 1) {
    return "";
  }
  for (const preferred of GATEWAY_CONTROLLER_PRIORITY) {
    if (writeCapable.includes(preferred)) {
      return preferred;
    }
  }
  return writeCapable[0] || "";
}

function issueGatewayOmnispindleControllerId(input = {}) {
  const status = getGatewayOmnispindleAuthorityStatus(input);
  if (!status.activationIssuanceOpen) {
    return "";
  }
  const laneDefinition = input.laneDefinition && typeof input.laneDefinition === "object"
    ? input.laneDefinition
    : null;
  if (!laneDefinition) {
    return "";
  }
  return pickGatewayController(laneDefinition.preferredManagers);
}

function listGatewayOmnispindleIssuedControllers(input = {}) {
  const laneDefinitions = getOmnispindleLaneDefinitions();
  return Object.keys(laneDefinitions).map((laneId) => {
    const laneDefinition = laneDefinitions[laneId] || null;
    const issuedControllerId = issueGatewayOmnispindleControllerId({
      ...input,
      laneId,
      laneDefinition
    });
    return {
      ...buildGatewayLaneCompactSummary(laneDefinition, input),
      issuedControllerId,
      activationAvailable: Boolean(issuedControllerId)
    };
  });
}

function getGatewayOmnispindleOperatorSummary(input = {}) {
  const status = getGatewayOmnispindleAuthorityStatus(input);
  const issuedControllers = listGatewayOmnispindleIssuedControllers(input);
  const activatableLanes = issuedControllers
    .filter((entry) => entry.activationAvailable)
    .map((entry) => entry.laneId);
  const activatableLaneCodes = issuedControllers
    .filter((entry) => entry.activationAvailable)
    .map((entry) => entry.laneCode)
    .filter(Boolean);
  return {
    ...status,
    compactProfile: cleanText(issuedControllers[0]?.compactProfile),
    compactSignature: cleanText(issuedControllers[0]?.compactSignature),
    laneCount: issuedControllers.length,
    activatableLaneCount: activatableLanes.length,
    activatableLanes,
    activatableLaneCodes,
    issuedControllers
  };
}

function createGatewayOmnispindleControllerIssuer(input = {}) {
  const authorityMode = input.authorityMode || null;
  return function issueControllerId(requestInput = {}) {
    return issueGatewayOmnispindleControllerId({
      ...requestInput,
      authorityMode
    });
  };
}

module.exports = {
  GATEWAY_CONTROLLER_PRIORITY,
  getAuthorityMode,
  getGatewayOmnispindleAuthorityStatus,
  listGatewayOmnispindleIssuedControllers,
  getGatewayOmnispindleOperatorSummary,
  pickGatewayController,
  issueGatewayOmnispindleControllerId,
  createGatewayOmnispindleControllerIssuer
};
