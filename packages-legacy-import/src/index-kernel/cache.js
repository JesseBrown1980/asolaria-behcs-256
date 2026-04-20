const fs = require("fs");
const path = require("path");
const { projectRoot } = require("./schema");
const { resolveUnifiedIndexProfile } = require("./profile");
const { validatePayloadForProfile } = require("./validate");

const runtimeCache = new Map();

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  fs.renameSync(tempPath, filePath);
}

function formatSnapshotStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear()).padStart(4, "0");
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getUTCDate()).padStart(2, "0");
  const hour = String(safeDate.getUTCHours()).padStart(2, "0");
  const minute = String(safeDate.getUTCMinutes()).padStart(2, "0");
  const second = String(safeDate.getUTCSeconds()).padStart(2, "0");
  const millisecond = String(safeDate.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hour}${minute}${second}${millisecond}Z`;
}

function getProfileSnapshotDir(profileInput = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  return profile.snapshotDir;
}

function readJsonPayload(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.statSync(filePath);
  const cached = runtimeCache.get(filePath);
  if (
    cached
    && cached.mtimeMs === Number(stat.mtimeMs || 0)
    && cached.size === Number(stat.size || 0)
  ) {
    return cached.payload;
  }
  const payload = JSON.parse(String(fs.readFileSync(filePath, "utf8") || ""));
  runtimeCache.set(filePath, {
    mtimeMs: Number(stat.mtimeMs || 0),
    size: Number(stat.size || 0),
    payload
  });
  return payload;
}

function rememberPayload(filePath, payload) {
  if (!fs.existsSync(filePath)) {
    runtimeCache.delete(filePath);
    return;
  }
  const stat = fs.statSync(filePath);
  runtimeCache.set(filePath, {
    mtimeMs: Number(stat.mtimeMs || 0),
    size: Number(stat.size || 0),
    payload
  });
}

function toRelativePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function resolveSnapshotPath(filePath) {
  if (!filePath) {
    return "";
  }
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, String(filePath));
}

function pathWithinRoot(filePath, rootPath) {
  const target = path.resolve(filePath).toLowerCase();
  const root = path.resolve(rootPath).toLowerCase();
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function ensureProfilePayloadContract(payload, profile) {
  const validation = validatePayloadForProfile(payload, profile);
  if (!validation.ok) {
    const error = new Error(`profile_contract_failed:${validation.errors.slice(0, 5).join(",")}`);
    error.validationErrors = validation.errors.slice();
    throw error;
  }
}

function archiveExistingCache(profileInput = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  if (profile.usesManifestPointer || !fs.existsSync(profile.cachePath)) {
    return "";
  }
  const snapshotDir = getProfileSnapshotDir(profile);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const existingPayload = readJsonPayload(profile.cachePath) || {};
  const existingStamp = formatSnapshotStamp(existingPayload.generatedAt || existingPayload.promotedAt || new Date());
  const archivePath = path.join(snapshotDir, `compiled-unified-agent-index-prev-${existingStamp}.json`);
  if (!fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, String(fs.readFileSync(profile.cachePath, "utf8") || ""), "utf8");
  }
  return archivePath;
}

function writeProfilePayload(profileInput = {}, payload) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  ensureProfilePayloadContract({ ...payload, snapshotPath: "" }, profile);
  const snapshotDir = getProfileSnapshotDir(profile);
  fs.mkdirSync(snapshotDir, { recursive: true });
  if (!profile.usesManifestPointer) {
    archiveExistingCache(profile);
  }

  const snapshotPath = path.join(
    snapshotDir,
    `compiled-unified-agent-index-${formatSnapshotStamp(payload.generatedAt || payload.promotedAt || new Date())}.json`
  );
  const nextPayload = {
    ...payload,
    snapshotPath
  };
  writeJsonAtomic(snapshotPath, nextPayload);
  rememberPayload(snapshotPath, nextPayload);

  if (profile.usesManifestPointer) {
    const manifest = {
      schemaVersion: 1,
      profile: profile.profile,
      stage: profile.stage,
      sourceContract: profile.sourceContract,
      manifestPath: profile.cachePath,
      activeSnapshotPath: toRelativePath(snapshotPath),
      activeSnapshotAbsolutePath: snapshotPath,
      generatedAt: nextPayload.generatedAt || "",
      promotedAt: nextPayload.promotedAt || "",
      promotedFromProfile: nextPayload.promotedFromProfile || "",
      signature: nextPayload.signature || "",
      documentCount: Number(nextPayload.documentCount || nextPayload.documents?.length || 0),
      sourceCounts: nextPayload.sourceCounts || {},
      buildMode: nextPayload.buildMode || "running-manifest",
      validated: Boolean(nextPayload.validated),
      validationErrors: Array.isArray(nextPayload.validationErrors) ? nextPayload.validationErrors.slice() : []
    };
    writeJsonAtomic(profile.cachePath, manifest);
    rememberPayload(profile.cachePath, manifest);
    return {
      ...nextPayload,
      activeSnapshotPath: snapshotPath,
      runningManifestPath: profile.cachePath,
      runningManifest: manifest
    };
  }

  writeJsonAtomic(profile.cachePath, nextPayload);
  rememberPayload(profile.cachePath, nextPayload);
  return nextPayload;
}

function readProfilePayload(profileInput = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  if (profile.usesManifestPointer) {
    const manifest = readJsonPayload(profile.cachePath);
    const manifestSnapshotPath = manifest?.activeSnapshotPath || manifest?.activeSnapshotAbsolutePath || "";
    if (!manifest || !manifestSnapshotPath) {
      return null;
    }
    const snapshotPath = resolveSnapshotPath(manifestSnapshotPath);
    if (!pathWithinRoot(snapshotPath, profile.snapshotDir)) {
      throw new Error(`manifest_snapshot_out_of_bounds:${profile.profile}`);
    }
    const payload = readJsonPayload(snapshotPath);
    if (!payload) {
      return null;
    }
    ensureProfilePayloadContract(payload, profile);
    return {
      ...payload,
      profile: profile.profile,
      stage: profile.stage,
      cachePath: profile.cachePath,
      sourceContract: profile.sourceContract,
      activeSnapshotPath: snapshotPath,
      runningManifestPath: profile.cachePath,
      runningManifest: manifest
    };
  }
  const payload = readJsonPayload(profile.cachePath);
  if (payload) {
    ensureProfilePayloadContract(payload, profile);
  }
  return payload;
}

module.exports = {
  getProfileSnapshotDir,
  readProfilePayload,
  rememberPayload,
  writeProfilePayload
};
