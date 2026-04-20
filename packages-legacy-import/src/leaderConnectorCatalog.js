"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot, projectRoot, resolveDataPath } = require("./runtimePaths");

function cleanText(value, max = 240) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function clipText(value, max = 280) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function normalizeStringArray(values = [], max = 240) {
  const deduped = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, max);
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    deduped.push(normalized);
  }
  return deduped;
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function resolveFirstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    const normalized = cleanText(candidate, 2000);
    if (normalized && fs.existsSync(normalized)) {
      return normalized;
    }
  }
  return cleanText(candidates[0], 2000);
}

function safeRelativePath(filePath) {
  const normalized = cleanText(filePath, 2000);
  if (!normalized) {
    return "";
  }
  if (!path.isAbsolute(normalized)) {
    return normalized.replace(/\\/g, "/");
  }
  const absolutePath = path.resolve(normalized);
  for (const rootPath of [instanceRoot, projectRoot]) {
    const relativePath = path.relative(rootPath, absolutePath);
    if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return relativePath.replace(/\\/g, "/");
    }
  }
  return absolutePath.replace(/\\/g, "/");
}

function defaultConfigPaths() {
  return [
    path.join(instanceRoot, "config", "leader-connector-catalog.json"),
    path.join(projectRoot, "config", "leader-connector-catalog.json")
  ];
}

function defaultLocalMirrorRoot() {
  return resolveDataPath("liris-index", "leader-connector-catalog-local");
}

function resolveLocalMirrorRoot(options = {}) {
  const requested = cleanText(options.localMirrorRoot, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return defaultLocalMirrorRoot();
}

function isWorkspaceLocalPath(filePath) {
  const normalized = cleanText(filePath, 2000);
  if (!normalized) {
    return false;
  }
  if (!path.isAbsolute(normalized)) {
    return true;
  }
  const absolutePath = path.resolve(normalized);
  return [instanceRoot, projectRoot].some((rootPath) => {
    const relativePath = path.relative(rootPath, absolutePath);
    return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  });
}

function readLeaderConnectorCatalogConfig(options = {}) {
  const configPath = resolveFirstExistingPath(options.configPaths || defaultConfigPaths());
  return {
    configPath,
    config: readJsonFile(configPath, {}) || {}
  };
}

function normalizeCoverage(config = {}) {
  const coverage = config.coverage || {};
  return {
    normalizedConnectorRows: Number(coverage.normalizedConnectorRows || 0),
    physicalConnectorSourceRows: Number(coverage.physicalConnectorSourceRows || 0),
    liveLocalizedRuntimeIndexRows: Number(coverage.liveLocalizedRuntimeIndexRows || 0),
    deviceLatticeRows: Number(coverage.deviceLatticeRows || 0),
    localSourceConnectorRows: Number(coverage.localSourceConnectorRows || 0),
    historicalExtractedConnectorSourceRows: Number(coverage.historicalExtractedConnectorSourceRows || 0)
  };
}

function normalizePrimaryFiles(config = {}) {
  return (Array.isArray(config.primaryFiles) ? config.primaryFiles : [])
    .map((entry) => {
      const filePath = cleanText(entry.path, 2000);
      const exists = Boolean(filePath) && fs.existsSync(filePath);
      return {
        id: cleanText(entry.id || path.basename(filePath), 120),
        path: filePath,
        relativePath: safeRelativePath(filePath),
        exists,
        freshness: exists ? "mounted_runtime_path" : "configured_not_mounted"
      };
    })
    .filter((entry) => entry.id && entry.path);
}

function buildLocalMirrorFiles(config = {}, mirrorRoot = "") {
  const fileIds = (Array.isArray(config.primaryFiles) ? config.primaryFiles : []).map((entry) => cleanText(entry.id, 120));
  const orderedIds = normalizeStringArray([
    ...fileIds,
    "leader-connector-catalog.csv",
    "leader-connector-catalog.json",
    "leader-connector-files.csv",
    "manifest.json",
    "packet.txt"
  ], 120);
  return orderedIds.map((id) => {
    const filePath = path.join(mirrorRoot, id);
    const exists = fs.existsSync(filePath);
    return {
      id,
      path: filePath,
      relativePath: safeRelativePath(filePath),
      exists,
      freshness: exists ? "local_device_mirror" : "local_device_pending"
    };
  });
}

function normalizeOmniShannonIdentities(config = {}) {
  return (Array.isArray(config.omniShannonIdentities) ? config.omniShannonIdentities : [])
    .map((entry) => ({
      name: cleanText(entry.name, 160),
      pid: cleanText(entry.pid, 160),
      profile: cleanText(entry.profile, 160),
      host: cleanText(entry.host, 120),
      lane: cleanText(entry.lane, 120),
      surface: cleanText(entry.surface, 240),
      deviceId: cleanText(entry.deviceId, 120),
      authorityClass: cleanText(entry.authorityClass, 120),
      approvalState: cleanText(entry.approvalState, 160),
      capturedAt: cleanText(entry.capturedAt, 80),
      verifiedAt: cleanText(entry.verifiedAt, 80),
      sourcePath: normalizeStringArray(entry.sourcePath || [], 240),
      freshness: cleanText(entry.freshness, 120),
      runtimeState: cleanText(entry.runtimeState, 160)
    }))
    .filter((entry) => entry.name);
}

function buildLeaderConnectorCatalog(options = {}) {
  const { configPath, config } = readLeaderConnectorCatalogConfig(options);
  const sourcePrimaryFiles = normalizePrimaryFiles(config);
  const sourceRuntimeRoot = cleanText(config.runtimeRoot, 240);
  const usesExternalSource = !isWorkspaceLocalPath(sourceRuntimeRoot)
    || sourcePrimaryFiles.some((entry) => !isWorkspaceLocalPath(entry.path));
  const localMirrorRoot = resolveLocalMirrorRoot(options);
  const primaryFiles = usesExternalSource
    ? buildLocalMirrorFiles(config, localMirrorRoot)
    : sourcePrimaryFiles;
  const leaderSurfaceIds = normalizeStringArray(config.leaderSurfaceIds || [], 120);
  const readerSurfaceIds = normalizeStringArray(config.readerSurfaceIds || leaderSurfaceIds, 120);
  const coverage = normalizeCoverage(config);
  const omniShannonIdentities = normalizeOmniShannonIdentities(config);
  const mountedFileCount = primaryFiles.filter((entry) => entry.exists).length;
  return {
    schemaVersion: Number(config.schemaVersion || 1),
    catalogId: cleanText(config.catalogId || "leader-connector-machine-catalog", 120),
    summary: clipText(config.summary || "", 280),
    configPath: safeRelativePath(configPath),
    runtimeRoot: usesExternalSource ? localMirrorRoot : cleanText(config.runtimeRoot, 240),
    sourceRuntimeRoot,
    mirrorMode: usesExternalSource ? "metadata_only_device_local" : "direct_runtime_local",
    pinState: usesExternalSource
      ? (mountedFileCount > 0 ? "local_device_catalog_visible" : "local_device_catalog_pending")
      : (mountedFileCount > 0 ? "runtime_catalog_visible" : "configured_not_mounted"),
    leaderSurfaceIds,
    readerSurfaceIds,
    coverage,
    primaryFiles,
    sourcePrimaryFiles,
    sourceSurfaces: normalizeStringArray(config.sourceSurfaces || [], 240),
    omniShannonIdentities,
    counts: {
      primaryFileCount: primaryFiles.length,
      mountedFileCount,
      leaderSurfaceCount: leaderSurfaceIds.length,
      readerSurfaceCount: readerSurfaceIds.length,
      omniShannonIdentityCount: omniShannonIdentities.length
    }
  };
}

function writeLocalLeaderConnectorCatalogMirror(options = {}) {
  const { config } = readLeaderConnectorCatalogConfig(options);
  const sourcePrimaryFiles = normalizePrimaryFiles(config);
  const sourceRuntimeRoot = cleanText(config.runtimeRoot, 240);
  const usesExternalSource = !isWorkspaceLocalPath(sourceRuntimeRoot)
    || sourcePrimaryFiles.some((entry) => !isWorkspaceLocalPath(entry.path));
  if (!usesExternalSource) {
    return {
      wroteMirror: false,
      reason: "source_already_local",
      rootPath: cleanText(config.runtimeRoot, 240),
      relativeRootPath: safeRelativePath(cleanText(config.runtimeRoot, 240))
    };
  }

  const mirrorRoot = resolveLocalMirrorRoot(options);
  fs.mkdirSync(mirrorRoot, { recursive: true });
  const mirroredAt = new Date().toISOString();
  const mirrorManifest = {
    ok: true,
    schemaVersion: Number(config.schemaVersion || 1),
    mirroredAt,
    mirrorMode: "metadata_only_device_local",
    catalogId: cleanText(config.catalogId || "leader-connector-machine-catalog", 120),
    sourceRuntimeRoot,
    sourcePrimaryFiles,
    sourceSurfaces: normalizeStringArray(config.sourceSurfaces || [], 240),
    coverage: normalizeCoverage(config),
    leaderSurfaceIds: normalizeStringArray(config.leaderSurfaceIds || [], 120),
    readerSurfaceIds: normalizeStringArray(config.readerSurfaceIds || config.leaderSurfaceIds || [], 120),
    omniShannonIdentities: normalizeOmniShannonIdentities(config)
  };
  const localCatalogJson = {
    catalogId: cleanText(config.catalogId || "leader-connector-machine-catalog", 120),
    mirroredAt,
    mirrorMode: "metadata_only_device_local",
    sourceRuntimeRoot,
    coverage: normalizeCoverage(config),
    sourceSurfaces: normalizeStringArray(config.sourceSurfaces || [], 240),
    leaderSurfaceIds: normalizeStringArray(config.leaderSurfaceIds || [], 120),
    readerSurfaceIds: normalizeStringArray(config.readerSurfaceIds || config.leaderSurfaceIds || [], 120)
  };
  const catalogCsv = [
    "field,value",
    `catalog_id,${cleanText(localCatalogJson.catalogId, 120)}`,
    `mirrored_at,${cleanText(mirroredAt, 80)}`,
    `mirror_mode,metadata_only_device_local`,
    `source_runtime_root,${cleanText(sourceRuntimeRoot, 240)}`,
    `normalized_connector_rows,${Number(localCatalogJson.coverage.normalizedConnectorRows || 0)}`,
    `reader_surface_count,${Number(localCatalogJson.readerSurfaceIds.length || 0)}`
  ].join("\n");
  const filesCsv = [
    "id,path",
    ...sourcePrimaryFiles.map((entry) => `${cleanText(entry.id, 120)},${cleanText(entry.path, 240)}`)
  ].join("\n");
  const packetText = [
    "@packet leader-connector-machine-catalog-local",
    `mirrored_at=${cleanText(mirroredAt, 80)}`,
    "mirror_mode=metadata_only_device_local",
    `source_runtime_root=${cleanText(sourceRuntimeRoot, 240)}`,
    `local_runtime_root=${safeRelativePath(mirrorRoot)}`,
    `coverage_rows=${Number(localCatalogJson.coverage.normalizedConnectorRows || 0)}`,
    `reader_surfaces=${localCatalogJson.readerSurfaceIds.join(" ")}`
  ].join("\n");
  fs.writeFileSync(path.join(mirrorRoot, "manifest.json"), JSON.stringify(mirrorManifest, null, 2), "utf8");
  fs.writeFileSync(path.join(mirrorRoot, "leader-connector-catalog.json"), JSON.stringify(localCatalogJson, null, 2), "utf8");
  fs.writeFileSync(path.join(mirrorRoot, "leader-connector-catalog.csv"), `${catalogCsv}\n`, "utf8");
  fs.writeFileSync(path.join(mirrorRoot, "leader-connector-files.csv"), `${filesCsv}\n`, "utf8");
  fs.writeFileSync(path.join(mirrorRoot, "packet.txt"), `${packetText}\n`, "utf8");
  return {
    wroteMirror: true,
    rootPath: mirrorRoot,
    relativeRootPath: safeRelativePath(mirrorRoot),
    sourceRuntimeRoot
  };
}

function collectCatalogPinsForSurface(surfaceId, leaderCatalog = null) {
  const normalizedSurfaceId = cleanText(surfaceId, 120);
  if (!normalizedSurfaceId || !leaderCatalog) {
    return [];
  }
  if (!normalizeStringArray(leaderCatalog.readerSurfaceIds || [], 120).includes(normalizedSurfaceId)) {
    return [];
  }
  const jsonFile = (Array.isArray(leaderCatalog.primaryFiles) ? leaderCatalog.primaryFiles : [])
    .find((entry) => entry.id === "leader-connector-catalog.json");
  const packetFile = (Array.isArray(leaderCatalog.primaryFiles) ? leaderCatalog.primaryFiles : [])
    .find((entry) => entry.id === "packet.txt");
  return [{
    catalogId: cleanText(leaderCatalog.catalogId, 120),
    runtimeRoot: cleanText(leaderCatalog.runtimeRoot, 240),
    sourceRuntimeRoot: cleanText(leaderCatalog.sourceRuntimeRoot, 240),
    mirrorMode: cleanText(leaderCatalog.mirrorMode, 120),
    pinState: cleanText(leaderCatalog.pinState, 120),
    jsonPath: cleanText(jsonFile?.path, 240),
    packetPath: cleanText(packetFile?.path, 240),
    coverageRows: Number(leaderCatalog.coverage?.normalizedConnectorRows || 0)
  }];
}

module.exports = {
  buildLeaderConnectorCatalog,
  collectCatalogPinsForSurface,
  readLeaderConnectorCatalogConfig,
  writeLocalLeaderConnectorCatalogMirror
};
