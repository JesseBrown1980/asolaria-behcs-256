const fs = require("fs");
const path = require("path");

const hardeningDir = path.join(__dirname, "..", "data", "vault", "hardening");
const protectedKeysPath = path.join(hardeningDir, "protected-keys.json");
const rotateLogPath = path.join(hardeningDir, "rotate-log.ndjson");

function ensureDir() {
  fs.mkdirSync(hardeningDir, { recursive: true });
}

function loadProtectedKeys() {
  ensureDir();
  if (!fs.existsSync(protectedKeysPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(protectedKeysPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveProtectedKeys(keys) {
  ensureDir();
  fs.writeFileSync(protectedKeysPath, JSON.stringify(keys, null, 2), "utf8");
}

function listProtectedKeys() {
  return loadProtectedKeys().map((row) => ({
    name: row.name,
    protectedAt: row.protectedAt
  }));
}

function listHardenedKeys() {
  return listProtectedKeys().map((row) => row.name);
}

function appendRotateLog(entry) {
  ensureDir();
  fs.appendFileSync(rotateLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function getLogStatus() {
  ensureDir();
  if (!fs.existsSync(rotateLogPath)) {
    return {
      ok: true,
      entries: 0,
      updatedAt: ""
    };
  }
  const raw = fs.readFileSync(rotateLogPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const stat = fs.statSync(rotateLogPath);
  return {
    ok: true,
    entries: lines.length,
    updatedAt: stat.mtime.toISOString()
  };
}

function getHardeningStatus() {
  const keys = loadProtectedKeys();
  return {
    protectedKeys: keys.length,
    hardeningDir,
    log: getLogStatus()
  };
}

function protectKey(name, _value = "") {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Key name is required.");
  }
  const keys = loadProtectedKeys();
  const existing = keys.find((row) => row.name === cleanName);
  const protectedAt = new Date().toISOString();
  if (existing) {
    existing.protectedAt = protectedAt;
  } else {
    keys.push({ name: cleanName, protectedAt });
  }
  saveProtectedKeys(keys);
  appendRotateLog({ at: protectedAt, action: "protect", key: cleanName });
  return {
    ok: true,
    key: cleanName,
    protectedAt
  };
}

function hardenSecret(name, value) {
  return protectKey(name, value);
}

function rotateLog() {
  const status = getLogStatus();
  appendRotateLog({ at: new Date().toISOString(), action: "rotate" });
  return {
    ok: true,
    previousEntries: status.entries
  };
}

module.exports = {
  getHardeningStatus,
  listProtectedKeys,
  listHardenedKeys,
  protectKey,
  hardenSecret,
  rotateLog,
  getLogStatus
};
