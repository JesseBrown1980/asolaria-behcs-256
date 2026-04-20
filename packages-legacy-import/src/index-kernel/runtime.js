const fs = require("fs");
const { agentIndexRoot } = require("./schema");
const { resolveUnifiedIndexProfile, resolveScanMode } = require("./profile");
const { getSourceInventory } = require("./inventory");
const { buildCompiledDocuments, buildPayload, buildEmptyPayload } = require("./compile");
const { readProfilePayload, writeProfilePayload } = require("./cache");
const { validatePayloadForProfile, runStagingGates } = require("./validate");
const { searchDocuments, collectDocumentRows } = require("./query");
const {
  normalizeAutoBuild,
  buildScanContract,
  decoratePayload,
  buildStatus
} = require("./state");

function isCacheUsable(payload, profile, inventory = null) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.documents)) {
    return false;
  }
  if (String(payload.profile || "").toLowerCase() !== profile.profile) {
    return false;
  }
  if (!profile.allowSourceBuild) {
    return true;
  }
  if (!inventory) {
    return false;
  }
  if (String(payload.signature || "") !== String(inventory.signature || "")) {
    return false;
  }
  const payloadAux = Boolean(payload.profileConfig && payload.profileConfig.includeAuxiliaryIx);
  return payloadAux === Boolean(profile.includeAuxiliaryIx);
}

function rebuildUnifiedIndex(input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  if (!profile.allowSourceBuild) {
    throw new Error(`profile_not_buildable:${profile.profile}`);
  }

  const requestedScanMode = resolveScanMode(input, profile);
  const rebuildScanMode = requestedScanMode === "blink" ? "warm" : requestedScanMode;
  const inventory = getSourceInventory(profile, {
    scanMode: rebuildScanMode,
    forceSourceScan: true
  });
  const documents = buildCompiledDocuments(inventory);
  let payload = buildPayload(profile, inventory, documents, {
    buildMode: "source-compile",
    scanContract: buildScanContract(profile, rebuildScanMode, {
      hashMode: inventory.hashMode,
      freshnessChecked: true,
      cacheState: "rebuilt",
      sourceWalk: "canonical-index-root",
      builtFromSource: true
    })
  });

  const validation = validatePayloadForProfile(payload, profile);
  if (!validation.ok) {
    const error = new Error(`validation_failed:${validation.errors.slice(0, 5).join(",")}`);
    error.validationErrors = validation.errors.slice();
    throw error;
  }

  if (profile.strictSourceValidation) {
    const gateReport = runStagingGates(payload, profile);
    if (!gateReport.ok) {
      const error = new Error(`staging_gates_failed:${gateReport.errors.slice(0, 5).join(",")}`);
      error.validationErrors = gateReport.errors.slice();
      throw error;
    }
    payload.gateReport = gateReport;
  }

  payload.validated = true;
  payload.validatedAt = new Date().toISOString();
  payload.validationErrors = [];
  payload = writeProfilePayload(profile, payload);
  return decoratePayload(payload, profile, rebuildScanMode, {
    hashMode: inventory.hashMode,
    freshnessChecked: true,
    cacheState: "rebuilt",
    sourceWalk: "canonical-index-root",
    builtFromSource: true
  });
}

function readUnifiedIndex(input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  const scanMode = resolveScanMode(input, profile);
  const autoBuild = normalizeAutoBuild(input, profile);
  const cached = readProfilePayload(profile);

  if (!profile.allowSourceBuild) {
    const payload = cached || buildEmptyPayload(profile, null, {
      buildMode: profile.usesManifestPointer ? "running-manifest" : "promoted-snapshot"
    });
    return decoratePayload(payload, profile, scanMode, {
      cacheState: cached ? "hit" : "miss",
      usedCache: Boolean(cached),
      freshnessChecked: false
    });
  }

  if (scanMode === "blink") {
    const payload = cached || buildEmptyPayload(profile);
    return decoratePayload(payload, profile, scanMode, {
      cacheState: cached ? "hit" : "miss",
      usedCache: Boolean(cached),
      freshnessChecked: false
    });
  }

  const inventory = getSourceInventory(profile, {
    scanMode,
    forceSourceScan: Boolean(input.forceSourceScan)
  });
  if (isCacheUsable(cached, profile, inventory)) {
    return decoratePayload(cached, profile, scanMode, {
      hashMode: inventory.hashMode,
      cacheState: "fresh",
      sourceWalk: "canonical-index-root",
      usedCache: true,
      freshnessChecked: true
    });
  }
  if (!autoBuild) {
    const payload = cached || buildEmptyPayload(profile, inventory);
    return decoratePayload(payload, profile, scanMode, {
      hashMode: inventory.hashMode,
      cacheState: cached ? "stale" : "miss",
      sourceWalk: "canonical-index-root",
      usedCache: Boolean(cached),
      freshnessChecked: true
    });
  }
  return rebuildUnifiedIndex({
    ...input,
    profile: profile.profile,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    scanMode
  });
}

function promoteUnifiedIndex(input = {}) {
  const sourceProfile = resolveUnifiedIndexProfile(input.sourceProfile || input.from || "staging");
  const targetProfile = resolveUnifiedIndexProfile(input.targetProfile || input.to || input.promote || "prod");
  if (targetProfile.allowSourceBuild) {
    throw new Error(`unsupported_promotion_target:${targetProfile.profile}`);
  }
  if (targetProfile.profile === "running" && sourceProfile.profile !== "staging") {
    throw new Error("running_requires_staging_source");
  }

  const sourcePayload = readUnifiedIndex({
    profile: sourceProfile.profile,
    includeAuxiliaryIx: sourceProfile.includeAuxiliaryIx,
    autoBuild: sourceProfile.allowSourceBuild,
    scanMode: sourceProfile.strictSourceValidation ? "deep" : "warm"
  });
  if (!Array.isArray(sourcePayload.documents) || sourcePayload.documents.length < 1) {
    throw new Error(`promotion_source_empty:${sourceProfile.profile}`);
  }

  const auxiliaryDocuments = Number(sourcePayload?.sourceCounts?.auxiliaryDocuments || 0);
  if (sourceProfile.profile === "dev" && auxiliaryDocuments > 0 && !input.allowAuxiliaryPromotion) {
    throw new Error("promotion_requires_allowAuxiliaryPromotion");
  }
  if (sourceProfile.profile === "staging") {
    const gateReport = sourcePayload.gateReport || runStagingGates(sourcePayload, sourceProfile);
    if (!gateReport.ok) {
      const error = new Error(`promotion_validation_failed:${gateReport.errors.slice(0, 5).join(",")}`);
      error.validationErrors = gateReport.errors.slice();
      throw error;
    }
  }

  const promotedAt = new Date().toISOString();
  const promotedPayload = {
    ...sourcePayload,
    generatedAt: promotedAt,
    profile: targetProfile.profile,
    stage: targetProfile.stage,
    sourceContract: targetProfile.sourceContract,
    buildMode: targetProfile.usesManifestPointer ? "running-manifest" : "promoted-snapshot",
    promotedAt,
    promotedFromProfile: sourceProfile.profile,
    cachePath: targetProfile.cachePath,
    profileConfig: {
      allowSourceBuild: false,
      includeAuxiliaryIx: false,
      strictSourceValidation: false
    },
    scanContract: buildScanContract(targetProfile, "blink", {
      cacheState: "promoted",
      freshnessChecked: false,
      usedCache: false
    })
  };
  const written = writeProfilePayload(targetProfile, promotedPayload);
  return decoratePayload(written, targetProfile, "blink", {
    cacheState: "promoted",
    freshnessChecked: false,
    usedCache: false
  });
}

function getUnifiedIndexStatus(input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  const scanMode = resolveScanMode(input, profile);
  const payload = readUnifiedIndex({
    ...input,
    profile: profile.profile,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    autoBuild: normalizeAutoBuild(input, profile),
    scanMode
  });
  const inventory = profile.allowSourceBuild && scanMode !== "blink"
    ? getSourceInventory(profile, { scanMode, forceSourceScan: Boolean(input.forceSourceScan) })
    : null;
  return buildStatus(profile, payload, scanMode, inventory);
}

function scanUnifiedIndex(input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  const scanMode = resolveScanMode(input, profile);
  const payload = readUnifiedIndex({
    ...input,
    profile: profile.profile,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    autoBuild: profile.allowSourceBuild && scanMode !== "blink",
    scanMode
  });
  const inventory = profile.allowSourceBuild && scanMode !== "blink"
    ? getSourceInventory(profile, { scanMode, forceSourceScan: Boolean(input.forceSourceScan) })
    : null;
  const status = buildStatus(profile, payload, scanMode, inventory);
  return {
    ...status,
    payloadSummary: {
      documentCount: status.documentCount,
      signature: status.signature
    }
  };
}

function searchUnifiedIndex(query, input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  const scanMode = resolveScanMode(input, profile);
  const payload = readUnifiedIndex({
    ...input,
    profile: profile.profile,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    autoBuild: normalizeAutoBuild(input, profile),
    scanMode
  });
  const result = searchDocuments(payload.documents || [], query, input);
  return {
    ok: true,
    enabled: fs.existsSync(agentIndexRoot),
    profile: profile.profile,
    stage: profile.stage,
    sourceContract: payload.sourceContract || profile.sourceContract,
    scanContract: payload.scanContract || buildScanContract(profile, scanMode),
    ...result
  };
}

function collectUnifiedIndexDocuments(limit = 120, input = {}) {
  const profile = resolveUnifiedIndexProfile(input);
  const scanMode = resolveScanMode(input, profile);
  const payload = readUnifiedIndex({
    ...input,
    profile: profile.profile,
    includeAuxiliaryIx: profile.includeAuxiliaryIx,
    autoBuild: normalizeAutoBuild(input, profile),
    scanMode
  });
  return collectDocumentRows(payload.documents || [], limit);
}

module.exports = {
  readUnifiedIndex,
  rebuildUnifiedIndex,
  promoteUnifiedIndex,
  scanUnifiedIndex,
  searchUnifiedIndex,
  collectUnifiedIndexDocuments,
  getUnifiedIndexStatus
};
