const {
  getLaneDefinition
} = require("../laneRegistry");
const {
  TYPE_CODES,
  TIER_CODES,
  readCompactRuntime
} = require("../compactRuntimeStore");

function cleanText(value) {
  return String(value || "").trim();
}

function getCompactRuntimeSnapshot(input = {}) {
  if (input.compactRuntime && typeof input.compactRuntime === "object") {
    return input.compactRuntime;
  }
  return readCompactRuntime({ profile: cleanText(input.profile) || "running" }) || null;
}

function buildCompactMaps(compactRuntime = null) {
  const roleMap = new Map();
  const entryMap = new Map();
  if (!compactRuntime || typeof compactRuntime !== "object") {
    return { roleMap, entryMap };
  }
  const roleTable = Array.isArray(compactRuntime?.tables?.roleTable)
    ? compactRuntime.tables.roleTable
    : [];
  const entryTable = Array.isArray(compactRuntime?.tables?.entryTable)
    ? compactRuntime.tables.entryTable
    : [];
  for (const row of roleTable) {
    const role = cleanText(row?.role);
    if (role) {
      roleMap.set(role, row);
    }
  }
  for (const row of entryTable) {
    const id = cleanText(row?.id);
    if (id) {
      entryMap.set(id, row);
    }
  }
  return { roleMap, entryMap };
}

function buildFallbackRoleCode(agentId = "", roleId = "") {
  const normalizedAgentId = cleanText(agentId);
  if (normalizedAgentId.startsWith("AGT-")) {
    return normalizedAgentId.slice(4);
  }
  return cleanText(roleId)
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase()
    .slice(0, 4);
}

function normalizeTypeCode(type = "") {
  const normalized = cleanText(type).toLowerCase();
  return TYPE_CODES[normalized] || cleanText(type).toUpperCase().slice(0, 3);
}

function buildGatewayLaneCompactSummary(laneInput, input = {}) {
  const laneDefinition = laneInput && typeof laneInput === "object"
    ? laneInput
    : getLaneDefinition(laneInput || input.laneId || input.lane);
  if (!laneDefinition) {
    return null;
  }

  const compactRuntime = getCompactRuntimeSnapshot(input);
  const { roleMap, entryMap } = buildCompactMaps(compactRuntime);
  const spawnRoleId = cleanText(laneDefinition?.spawnRoleId);
  const roleRow = spawnRoleId ? roleMap.get(spawnRoleId) : null;
  const agentId = cleanText(laneDefinition?.spawnAgentId || roleRow?.agentId);
  const responsibilityTier = cleanText(laneDefinition?.spawnResponsibilityTier || roleRow?.tier).toLowerCase();
  const anchorIds = Array.isArray(laneDefinition?.priorityChains)
    ? laneDefinition.priorityChains.map((entry) => cleanText(entry)).filter(Boolean)
    : [];

  return {
    laneId: cleanText(laneDefinition?.id),
    laneCode: cleanText(laneDefinition?.code),
    family: cleanText(laneDefinition?.family),
    spawnRoleId,
    agentId,
    roleCode: cleanText(roleRow?.code) || buildFallbackRoleCode(agentId, spawnRoleId),
    responsibilityTier,
    tierCode: cleanText(roleRow?.tierCode) || TIER_CODES[responsibilityTier] || "",
    typeCodes: Array.isArray(roleRow?.ixTypes) && roleRow.ixTypes.length > 0
      ? roleRow.ixTypes.map((entry) => cleanText(entry)).filter(Boolean)
      : Array.isArray(laneDefinition?.ixTypes)
        ? laneDefinition.ixTypes.map((entry) => normalizeTypeCode(entry)).filter(Boolean)
        : [],
    anchorIds,
    anchorCodes: anchorIds.map((id) => cleanText(entryMap.get(id)?.c)).filter(Boolean),
    compactProfile: cleanText(compactRuntime?.profile),
    compactSignature: cleanText(compactRuntime?.signature)
  };
}

function mapCompactEntryCodes(entryIds = [], input = {}) {
  const compactRuntime = getCompactRuntimeSnapshot(input);
  const { entryMap } = buildCompactMaps(compactRuntime);
  return (Array.isArray(entryIds) ? entryIds : [])
    .map((id) => cleanText(entryMap.get(cleanText(id))?.c))
    .filter(Boolean);
}

module.exports = {
  buildGatewayLaneCompactSummary,
  mapCompactEntryCodes
};
