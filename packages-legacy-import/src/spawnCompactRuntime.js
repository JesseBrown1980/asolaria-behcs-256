const fs = require("fs");

const { resolveDataPath } = require("./runtimePaths");

const COMPACT_RUNTIME_PATH = resolveDataPath("compact-runtime", "running.json");
const COMPACT_FIRST_TIERS = new Set(["observer", "working"]);

function cleanCompactText(value) {
  return String(value || "").trim();
}

function getCompactEntryId(entry) {
  return cleanCompactText(entry?.id || entry?.lx || entry?.ix);
}

function readCompactRuntimeState() {
  try {
    if (!fs.existsSync(COMPACT_RUNTIME_PATH)) {
      return null;
    }
    return JSON.parse(String(fs.readFileSync(COMPACT_RUNTIME_PATH, "utf8") || ""));
  } catch (_) {
    return null;
  }
}

function buildCompactRuntimeView(role, visibleIxEntries = []) {
  const compact = readCompactRuntimeState();
  if (!compact || !compact.tables || !Array.isArray(compact.tables.roleTable)) {
    return null;
  }
  const normalizedRole = cleanCompactText(role).toLowerCase();
  const roleRow = compact.tables.roleTable.find((row) => cleanCompactText(row.role).toLowerCase() === normalizedRole);
  if (!roleRow) {
    return null;
  }

  const entryRows = Array.isArray(compact.tables.entryTable) ? compact.tables.entryTable : [];
  const chainRows = Array.isArray(compact.tables.chainTable) ? compact.tables.chainTable : [];
  const entryMap = new Map(entryRows.map((row) => [cleanCompactText(row.id), row]));
  const anchorIds = visibleIxEntries
    .map((entry) => getCompactEntryId(entry))
    .filter(Boolean)
    .slice(0, 6);
  const anchorSet = new Set(anchorIds);
  const anchors = anchorIds
    .map((id) => entryMap.get(id))
    .filter(Boolean)
    .map((row) => ({
      id: cleanCompactText(row.id),
      code: cleanCompactText(row.c),
      typeCode: cleanCompactText(row.tc),
      number: Number(row.n || 0),
      chainCount: Array.isArray(row.ch) ? row.ch.length : 0
    }));
  const chains = chainRows
    .filter((row) => anchorSet.has(cleanCompactText(row.f)) || anchorSet.has(cleanCompactText(row.t)))
    .slice(0, 12)
    .map((row) => ({
      from: cleanCompactText(row.f),
      to: cleanCompactText(row.t),
      fromCode: cleanCompactText(row.fc),
      toCode: cleanCompactText(row.tc)
    }));

  return {
    profile: cleanCompactText(compact.profile),
    signature: cleanCompactText(compact.signature),
    roleCode: cleanCompactText(roleRow.code),
    agentId: cleanCompactText(roleRow.agentId),
    tierCode: cleanCompactText(roleRow.tierCode),
    typeCodes: Array.isArray(roleRow.ixTypes) ? roleRow.ixTypes.slice() : [],
    anchorIds,
    anchors,
    chains,
    totalEntries: Number(compact.documentCount || entryRows.length || 0),
    totalChains: Number(compact?.totals?.chains || chainRows.length || 0)
  };
}

function buildIxBriefingView(agentIdentity, options = {}, visibleIxEntries = [], compactRuntime = null, allBlockers = []) {
  const tier = cleanCompactText(agentIdentity?.responsibilityTier).toLowerCase();
  const compactPreferred = COMPACT_FIRST_TIERS.has(tier);
  const compactAnchorIds = Array.isArray(compactRuntime?.anchorIds) ? compactRuntime.anchorIds.filter(Boolean) : [];
  const anchorSet = new Set(compactAnchorIds);
  const allowImplicitWidening = options.allowImplicitWidening !== false;
  let widened = true;
  let reason = "tier-default";

  if (compactPreferred) {
    if (options.widenMarkdown === true || options.includeBody === true) {
      widened = true;
      reason = "explicit-widen";
    } else if (cleanCompactText(options.mission) && allowImplicitWidening) {
      widened = true;
      reason = "mission";
    } else if (Array.isArray(allBlockers) && allBlockers.length > 0 && allowImplicitWidening) {
      widened = true;
      reason = "blockers";
    } else if (Array.isArray(options.extraIxTypes) && options.extraIxTypes.length > 0) {
      widened = true;
      reason = "extra-types";
    } else if (!compactRuntime || compactAnchorIds.length === 0) {
      widened = true;
      reason = "compact-runtime-unavailable";
    } else {
      widened = false;
      reason = "tier-compact-first";
    }
  }

  const preferredVisible = widened
    ? visibleIxEntries.slice()
    : visibleIxEntries.filter((entry) => anchorSet.has(getCompactEntryId(entry)));
  const visible = preferredVisible.length > 0
    ? preferredVisible
    : visibleIxEntries.slice(0, Math.min(6, visibleIxEntries.length));
  const visibleIds = new Set(visible.map((entry) => getCompactEntryId(entry)).filter(Boolean));
  const deferredIds = visibleIxEntries
    .map((entry) => getCompactEntryId(entry))
    .filter((id) => id && !visibleIds.has(id));

  return {
    compactPreferred,
    widened,
    reason,
    visible,
    visibleCount: visible.length,
    reducedVisibleCount: visibleIxEntries.length,
    deferredIds,
    compactAnchorIds: compactAnchorIds.slice(0, 12)
  };
}

module.exports = {
  buildCompactRuntimeView,
  buildIxBriefingView,
  readCompactRuntimeState
};
