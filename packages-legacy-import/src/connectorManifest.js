const fs = require("fs");
const path = require("path");

const connectorsDir = path.join(__dirname, "connectors");

function safeRequireManifest(filePath) {
  try {
    const mod = require(filePath);
    if (mod && typeof mod.manifest === "function") {
      const manifest = mod.manifest();
      if (manifest && typeof manifest === "object") {
        return manifest;
      }
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function normalizeManifest(input = {}, fallbackId = "") {
  const source = input && typeof input === "object" ? input : {};
  const capabilities = Array.isArray(source.capabilities) ? source.capabilities.map(String).filter(Boolean) : [];
  const readScopes = Array.isArray(source.readScopes) ? source.readScopes.map(String).filter(Boolean) : [];
  const writeScopes = Array.isArray(source.writeScopes) ? source.writeScopes.map(String).filter(Boolean) : [];
  const id = String(source.id || fallbackId || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    version: String(source.version || "0.0.0-stub").trim() || "0.0.0-stub",
    description: String(source.description || "").trim(),
    capabilities,
    readScopes,
    writeScopes
  };
}

function listManifests() {
  if (!fs.existsSync(connectorsDir)) {
    return [];
  }

  const manifests = [];
  for (const entry of fs.readdirSync(connectorsDir)) {
    if (!entry.endsWith(".js")) {
      continue;
    }
    const filePath = path.join(connectorsDir, entry);
    const fallbackId = entry.replace(/\.js$/i, "");
    const manifest = normalizeManifest(safeRequireManifest(filePath), fallbackId);
    if (manifest) {
      manifests.push(manifest);
    }
  }
  return manifests.sort((left, right) => left.id.localeCompare(right.id));
}

function getManifest(id) {
  const needle = String(id || "").trim().toLowerCase();
  if (!needle) {
    return null;
  }
  return listManifests().find((manifest) => String(manifest.id || "").trim().toLowerCase() === needle) || null;
}

function getManifestSummary() {
  const manifests = listManifests();
  return {
    manifests,
    total: manifests.length
  };
}

function getConnectorManifest(id) {
  const manifest = getManifest(id);
  if (!manifest) {
    return null;
  }
  return {
    manifest
  };
}

module.exports = {
  listManifests,
  getManifest,
  getManifestSummary,
  getConnectorManifest
};
