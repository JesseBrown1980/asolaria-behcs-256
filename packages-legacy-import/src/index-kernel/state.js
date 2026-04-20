const fs = require("fs");
const { agentIndexRoot } = require("./schema");

function normalizeAutoBuild(input = {}, profile) {
  if (typeof input.autoBuild === "boolean") {
    return input.autoBuild;
  }
  if ("force" in input) {
    return Boolean(input.force);
  }
  if ("ensureFresh" in input) {
    return Boolean(input.ensureFresh);
  }
  return Boolean(profile.autoBuildDefault);
}

function buildScanContract(profile, scanMode, meta = {}) {
  return {
    mode: scanMode,
    hashMode: meta.hashMode || (scanMode === "deep" ? "content" : scanMode === "warm" ? "stat" : "none"),
    freshnessChecked: Boolean(meta.freshnessChecked),
    cacheState: meta.cacheState || "unknown",
    sourceWalk: meta.sourceWalk || (scanMode === "blink" ? "none" : "canonical-index-root"),
    builtFromSource: Boolean(meta.builtFromSource),
    usedCache: Boolean(meta.usedCache),
    manifestPointer: Boolean(profile.usesManifestPointer),
    checkedAt: new Date().toISOString()
  };
}

function decoratePayload(payload, profile, scanMode, meta = {}) {
  if (!payload) {
    return null;
  }
  const persistedScanContract = payload.persistedScanContract || payload.scanContract || null;
  return {
    ...payload,
    profile: profile.profile,
    stage: profile.stage,
    cachePath: profile.cachePath,
    sourceContract: payload.sourceContract || profile.sourceContract,
    persistedScanContract,
    scanContract: {
      ...(persistedScanContract || {}),
      ...buildScanContract(profile, scanMode, meta)
    }
  };
}

function buildStatus(profile, payload, scanMode, inventory = null) {
  const cacheExists = fs.existsSync(profile.cachePath);
  const freshnessKnown = profile.allowSourceBuild ? scanMode !== "blink" && Boolean(inventory) : true;
  const payloadLoaded = Boolean(payload && Array.isArray(payload.documents) && payload.documents.length > 0);
  const cacheFresh = profile.allowSourceBuild
    ? freshnessKnown && Boolean(payload.signature) && payload.signature === inventory.signature
    : cacheExists && payloadLoaded && (!profile.usesManifestPointer || Boolean(payload.activeSnapshotPath || payload.runningManifestPath));

  return {
    ok: true,
    enabled: fs.existsSync(agentIndexRoot),
    loadedAt: payload.generatedAt || "",
    generatedAt: payload.generatedAt || "",
    root: agentIndexRoot,
    cachePath: profile.cachePath,
    profile: profile.profile,
    stage: profile.stage,
    sourceContract: payload.sourceContract || profile.sourceContract,
    buildMode: payload.buildMode || (profile.allowSourceBuild ? "source-compile" : "promoted-snapshot"),
    promotedAt: payload.promotedAt || "",
    promotedFromProfile: payload.promotedFromProfile || "",
    signature: payload.signature || "",
    cacheExists,
    cacheFresh,
    cacheFreshKnown: freshnessKnown,
    cacheStale: freshnessKnown ? cacheExists && !cacheFresh : false,
    allowSourceBuild: profile.allowSourceBuild,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    documentCount: Number(payload.documentCount || payload.documents?.length || 0),
    canonicalDocuments: Number(payload?.sourceCounts?.canonicalDocuments || 0),
    auxiliaryDocuments: Number(payload?.sourceCounts?.auxiliaryDocuments || 0),
    catalogEntries: Number(payload.documentCount || payload.documents?.length || 0),
    ixFiles: Number(payload.documentCount || payload.documents?.length || 0),
    validationErrors: Array.isArray(payload.validationErrors) ? payload.validationErrors.slice() : [],
    scanContract: payload.scanContract || buildScanContract(profile, scanMode),
    gateReport: payload.gateReport || null,
    activeSnapshotPath: payload.activeSnapshotPath || "",
    runningManifestPath: payload.runningManifestPath || ""
  };
}

module.exports = {
  normalizeAutoBuild,
  buildScanContract,
  decoratePayload,
  buildStatus
};
