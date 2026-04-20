const path = require("path");
const {
  projectRoot,
  stagingCachePath,
  devCachePath,
  runningManifestPath,
  prodCachePath
} = require("./schema");
const { cleanLine } = require("./textIds");

const PROFILE_ALIASES = new Map([
  ["stage", "staging"],
  ["staging", "staging"],
  ["dev", "dev"],
  ["development", "dev"],
  ["run", "running"],
  ["running", "running"],
  ["runtime", "running"],
  ["live", "running"],
  ["prod", "prod"],
  ["pro", "prod"],
  ["production", "prod"]
]);

const SCAN_ALIASES = new Map([
  ["blink", "blink"],
  ["fast", "blink"],
  ["warm", "warm"],
  ["delta", "warm"],
  ["deep", "deep"],
  ["full", "deep"]
]);

function resolveUnifiedIndexProfile(input = {}) {
  const options = typeof input === "string" ? { profile: input } : { ...(input || {}) };
  const rawRequested = cleanLine(
    options.profile
      || options.stage
      || process.env.ASOLARIA_UNIFIED_INDEX_PROFILE
      || process.env.ASOLARIA_RUNTIME_STAGE
      || ""
  ).toLowerCase();
  const requested = rawRequested || "running";
  const profileName = PROFILE_ALIASES.get(requested) || "";
  if (!profileName && rawRequested) {
    throw new Error(`unknown_profile:${rawRequested}`);
  }
  const resolvedProfileName = profileName || "running";
  const allowSourceBuild = resolvedProfileName === "staging" || resolvedProfileName === "dev";
  const usesManifestPointer = resolvedProfileName === "running";
  const cachePath = resolvedProfileName === "staging"
    ? stagingCachePath
    : resolvedProfileName === "dev"
      ? devCachePath
      : resolvedProfileName === "running"
        ? runningManifestPath
        : prodCachePath;
  const includeAuxiliaryDefault = resolvedProfileName === "dev";
  const sourceContract = resolvedProfileName === "staging"
    ? "canonical-lx-only"
    : resolvedProfileName === "dev"
      ? "canonical-lx-plus-aux-ix"
      : resolvedProfileName === "running"
        ? "running-validated-snapshot"
        : "promoted-snapshot";

  return {
    ...options,
    profile: resolvedProfileName,
    stage: resolvedProfileName,
    cachePath,
    allowSourceBuild,
    usesManifestPointer,
    snapshotDir: path.join(projectRoot, ".history", resolvedProfileName, "unified-agent-index-snapshots"),
    includeAuxiliaryIx: resolvedProfileName === "dev"
      ? (typeof options.includeAuxiliaryIx === "boolean" ? options.includeAuxiliaryIx : includeAuxiliaryDefault)
      : false,
    strictSourceValidation: resolvedProfileName === "staging",
    sourceContract,
    defaultScanMode: allowSourceBuild ? "warm" : "blink",
    autoBuildDefault: false
  };
}

function resolveScanMode(input = {}, profileInput = {}) {
  const profile = typeof profileInput === "object" && profileInput.profile
    ? profileInput
    : resolveUnifiedIndexProfile(profileInput);
  const requested = cleanLine(input.scanMode || input.scan || "").toLowerCase();
  return SCAN_ALIASES.get(requested) || profile.defaultScanMode || "warm";
}

function getUnifiedIndexCachePath(input = {}) {
  return resolveUnifiedIndexProfile(input).cachePath;
}

module.exports = {
  resolveUnifiedIndexProfile,
  resolveScanMode,
  getUnifiedIndexCachePath
};
