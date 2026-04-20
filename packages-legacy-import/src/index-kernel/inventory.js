const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  agentIndexRoot,
  CANONICAL_TYPE_DIRS,
  CANONICAL_LX_PATTERN,
  AUXILIARY_ROOT_IX_PATTERN,
  AUXILIARY_REF_IX_PATTERN,
  projectRoot
} = require("./schema");
const { resolveUnifiedIndexProfile, resolveScanMode } = require("./profile");

const SOURCE_INVENTORY_TTL_MS = Math.max(
  1000,
  Math.min(60 * 1000, Number(process.env.ASOLARIA_UNIFIED_INDEX_SOURCE_TTL_MS || 5000))
);

const sourceInventoryCache = new Map();

function hashParts(parts) {
  return crypto.createHash("sha1").update(parts.join("|"), "utf8").digest("hex");
}

function hashFileContent(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeSourcePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function compareFileDescriptors(left, right) {
  return String(left.path || "").localeCompare(String(right.path || ""));
}

function resolveInventoryHashMode(options = {}) {
  if (String(options.hashMode || "").trim().toLowerCase() === "content") {
    return "content";
  }
  const scanMode = resolveScanMode(options, options);
  return scanMode === "deep" ? "content" : "stat";
}

function getFileDescriptor(filePath, sourceKind, layer, typeHint = "", options = {}) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    relativePath: normalizeSourcePath(filePath),
    mtimeMs: Number(stat.mtimeMs || 0),
    size: Number(stat.size || 0),
    sourceKind,
    layer,
    typeHint,
    fileHash: options.hashMode === "content" ? hashFileContent(filePath) : ""
  };
}

function collectCanonicalSourceFiles(options = {}) {
  const files = [];
  if (!fs.existsSync(agentIndexRoot)) {
    return files;
  }
  for (const typeDir of CANONICAL_TYPE_DIRS) {
    const dirPath = path.join(agentIndexRoot, typeDir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !CANONICAL_LX_PATTERN.test(entry.name)) {
        continue;
      }
      files.push(getFileDescriptor(path.join(dirPath, entry.name), "canonical_lx", "canonical", typeDir, options));
    }
  }
  return files.sort(compareFileDescriptors);
}

function collectAuxiliarySourceFiles(options = {}) {
  const files = [];
  if (!fs.existsSync(agentIndexRoot)) {
    return files;
  }
  const rootEntries = fs.readdirSync(agentIndexRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile() || !AUXILIARY_ROOT_IX_PATTERN.test(entry.name)) {
      continue;
    }
    files.push(getFileDescriptor(path.join(agentIndexRoot, entry.name), "auxiliary_ix", "auxiliary", "", options));
  }
  const refsDir = path.join(agentIndexRoot, "gaia-ix-refs");
  if (fs.existsSync(refsDir)) {
    const refEntries = fs.readdirSync(refsDir, { withFileTypes: true });
    for (const entry of refEntries) {
      if (!entry.isFile() || !AUXILIARY_REF_IX_PATTERN.test(entry.name)) {
        continue;
      }
      files.push(getFileDescriptor(path.join(refsDir, entry.name), "auxiliary_ix", "auxiliary", "", options));
    }
  }
  return files.sort(compareFileDescriptors);
}

function getSourceInventory(profileInput = {}, options = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  if (!profile.allowSourceBuild) {
    return {
      root: agentIndexRoot,
      profile: profile.profile,
      canonicalFiles: [],
      auxiliaryFiles: [],
      signature: "",
      hashMode: "none"
    };
  }

  const hashMode = resolveInventoryHashMode({
    ...options,
    profile: profile.profile,
    stage: profile.stage
  });
  const cacheKey = `${profile.profile}:${profile.includeAuxiliaryIx ? "aux" : "canonical"}:${hashMode}`;
  const now = Date.now();
  const cached = sourceInventoryCache.get(cacheKey);
  if (!options.forceSourceScan && cached && now - cached.cachedAt <= SOURCE_INVENTORY_TTL_MS) {
    return cached.value;
  }

  const scanOptions = { hashMode };
  const canonicalFiles = collectCanonicalSourceFiles(scanOptions);
  const auxiliaryFiles = profile.includeAuxiliaryIx ? collectAuxiliarySourceFiles(scanOptions) : [];
  const signatureParts = [
    profile.profile,
    profile.includeAuxiliaryIx ? "auxiliary" : "canonical",
    hashMode,
    ...canonicalFiles.map((row) =>
      hashMode === "content"
        ? `${row.path}:${row.fileHash}`
        : `${row.path}:${row.mtimeMs}:${row.size}`
    ),
    ...auxiliaryFiles.map((row) =>
      hashMode === "content"
        ? `${row.path}:${row.fileHash}`
        : `${row.path}:${row.mtimeMs}:${row.size}`
    )
  ];
  const value = {
    root: agentIndexRoot,
    profile: profile.profile,
    canonicalFiles,
    auxiliaryFiles,
    signature: hashParts(signatureParts),
    hashMode
  };
  sourceInventoryCache.set(cacheKey, {
    cachedAt: now,
    value
  });
  return value;
}

module.exports = {
  getSourceInventory,
  resolveInventoryHashMode,
  SOURCE_INVENTORY_TTL_MS
};
