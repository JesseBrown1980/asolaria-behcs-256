const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");

const dataDir = resolveDataPath();

// Legacy single-vault layout (version 1).
const legacyVaultPath = path.join(dataDir, "vault.secrets.json");
const legacyKeyPath = path.join(dataDir, "vault.master.key");

// Namespaced vault layout (version 2).
const vaultRootDir = path.join(dataDir, "vault");
const VALID_NAMESPACES = new Set(["owner", "asolaria"]);

const cachedVaults = new Map(); // namespace -> vault object
const cachedKeys = new Map(); // namespace -> { key, source }
let migrationAttempted = false;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeNamespace(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "owner";
  if (!VALID_NAMESPACES.has(normalized)) {
    throw new Error(`Vault namespace is invalid: ${normalized}`);
  }
  return normalized;
}

function namespaceDir(namespace) {
  const ns = normalizeNamespace(namespace);
  return path.join(vaultRootDir, ns);
}

function namespaceVaultPath(namespace) {
  return path.join(namespaceDir(namespace), "vault.secrets.json");
}

function namespaceKeyPath(namespace) {
  return path.join(namespaceDir(namespace), "vault.master.key");
}

function createInitialVault(namespace) {
  const now = new Date().toISOString();
  return {
    version: 2,
    namespace: normalizeNamespace(namespace),
    createdAt: now,
    updatedAt: now,
    entries: {}
  };
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function hashToKey(raw) {
  return crypto.createHash("sha256").update(String(raw || ""), "utf8").digest();
}

function resolveVaultKey(namespace) {
  const ns = normalizeNamespace(namespace);
  const cached = cachedKeys.get(ns);
  if (cached) return cached;

  const envNamespaceKey = String(process.env[`ASOLARIA_VAULT_${ns.toUpperCase()}_MASTER_KEY`] || "").trim();
  if (envNamespaceKey) {
    const resolved = { key: hashToKey(envNamespaceKey), source: "env_namespace" };
    cachedKeys.set(ns, resolved);
    return resolved;
  }

  const envKey = String(process.env.ASOLARIA_VAULT_MASTER_KEY || "").trim();
  if (envKey) {
    const resolved = { key: hashToKey(envKey), source: "env" };
    cachedKeys.set(ns, resolved);
    return resolved;
  }

  const keyPath = namespaceKeyPath(ns);
  ensureDir(path.dirname(keyPath));
  if (fs.existsSync(keyPath)) {
    const raw = String(fs.readFileSync(keyPath, "utf8") || "").trim();
    const fromFile = Buffer.from(raw, "base64");
    if (fromFile.length === 32) {
      const resolved = { key: fromFile, source: "file" };
      cachedKeys.set(ns, resolved);
      return resolved;
    }
  }

  // Backward compatible fallback: use legacy key if present.
  if (fs.existsSync(legacyKeyPath)) {
    const raw = String(fs.readFileSync(legacyKeyPath, "utf8") || "").trim();
    const fromFile = Buffer.from(raw, "base64");
    if (fromFile.length === 32) {
      try {
        fs.writeFileSync(keyPath, raw, { encoding: "utf8", mode: 0o600 });
      } catch (_error) {
        // Ignore key copy failures; we can still use the legacy key in-memory.
      }
      const resolved = { key: fromFile, source: "legacy_file" };
      cachedKeys.set(ns, resolved);
      return resolved;
    }
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated.toString("base64"), { encoding: "utf8", mode: 0o600 });
  const resolved = { key: generated, source: "file" };
  cachedKeys.set(ns, resolved);
  return resolved;
}

function normalizeName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized || !/^[a-z0-9._:-]{2,90}$/.test(normalized)) {
    throw new Error("Vault secret name is invalid.");
  }
  return normalized;
}

function chooseNamespaceForLegacySecret(name) {
  const secretName = normalizeName(name);
  if (secretName.startsWith("moltbook.")) return "asolaria";
  return "owner";
}

function loadVault(namespace, options = {}) {
  const ns = normalizeNamespace(namespace);
  if (!options.skipMigration) {
    migrateLegacyVaultIfNeeded();
  }
  const cached = cachedVaults.get(ns);
  if (cached) return cached;

  const vaultPath = namespaceVaultPath(ns);
  ensureDir(path.dirname(vaultPath));

  const parsed = readJsonSafe(vaultPath);
  if (!parsed || typeof parsed !== "object" || !parsed.entries || typeof parsed.entries !== "object") {
    const fresh = createInitialVault(ns);
    fs.writeFileSync(vaultPath, JSON.stringify(fresh, null, 2), "utf8");
    cachedVaults.set(ns, fresh);
    return fresh;
  }

  const vault = {
    version: 2,
    namespace: ns,
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    entries: parsed.entries
  };
  cachedVaults.set(ns, vault);
  return vault;
}

function saveVault(namespace, vault) {
  const ns = normalizeNamespace(namespace);
  const vaultPath = namespaceVaultPath(ns);
  ensureDir(path.dirname(vaultPath));
  vault.updatedAt = new Date().toISOString();
  fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), "utf8");
}

function migrateLegacyVaultIfNeeded() {
  if (migrationAttempted) return;
  migrationAttempted = true;

  try {
    const ownerPath = namespaceVaultPath("owner");
    const asolariaPath = namespaceVaultPath("asolaria");
    const alreadyUsingNamespaces = fs.existsSync(ownerPath) || fs.existsSync(asolariaPath);
    if (alreadyUsingNamespaces) return;

    const legacy = readJsonSafe(legacyVaultPath);
    if (!legacy || typeof legacy !== "object" || !legacy.entries || typeof legacy.entries !== "object") {
      return;
    }

    const ownerVault = loadVault("owner", { skipMigration: true });
    const asolariaVault = loadVault("asolaria", { skipMigration: true });

    for (const [name, record] of Object.entries(legacy.entries)) {
      const secretName = normalizeName(name);
      const namespace = chooseNamespaceForLegacySecret(secretName);
      const target = namespace === "asolaria" ? asolariaVault : ownerVault;
      if (!target.entries[secretName]) {
        target.entries[secretName] = record;
      }
    }

    saveVault("owner", ownerVault);
    saveVault("asolaria", asolariaVault);

    // Keep a timestamped backup of the legacy file for safety.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(dataDir, `vault.secrets.legacy.bak.${stamp}.json`);
    fs.renameSync(legacyVaultPath, backupPath);
  } catch (_error) {
    // Migration best-effort. If it fails, continue using legacy as-is via existing files.
  }
}

function encryptObject(namespace, name, value) {
  const { key } = resolveVaultKey(namespace);
  const plain = JSON.stringify(value || {});
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptObject(namespace, name, record) {
  if (!record || !record.iv || !record.tag || !record.ciphertext) {
    throw new Error("Vault secret record is incomplete.");
  }
  const { key } = resolveVaultKey(namespace);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.iv, "base64")
  );
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plain);
}

function normalizeOptions(options = {}) {
  if (!options || typeof options !== "object") return {};
  return options;
}

function resolveTargetNamespace(meta = {}, options = {}) {
  const optionNs = normalizeOptions(options).namespace;
  const metaOwner = meta && typeof meta === "object" ? meta.credentialOwner || meta.vaultNamespace : "";
  return normalizeNamespace(optionNs || metaOwner || "owner");
}

function setSecret(name, value, meta = {}, options = {}) {
  const secretName = normalizeName(name);
  const namespace = resolveTargetNamespace(meta, options);
  const vault = loadVault(namespace);
  const encrypted = encryptObject(namespace, secretName, value);
  const now = new Date().toISOString();
  const previous = vault.entries[secretName];
  const mergedMeta = {
    ...(previous?.meta || {}),
    ...(meta || {}),
    vaultNamespace: namespace,
    credentialOwner: meta?.credentialOwner || namespace
  };

  vault.entries[secretName] = {
    ...encrypted,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    meta: mergedMeta
  };

  saveVault(namespace, vault);
  return getSecretMeta(secretName, { namespace });
}

function getSecret(name, options = {}) {
  const secretName = normalizeName(name);
  const namespace = resolveTargetNamespace({}, options);
  const vault = loadVault(namespace);
  const record = vault.entries[secretName];
  if (!record) return null;
  const value = decryptObject(namespace, secretName, record);
  const meta = record.meta || {};
  return {
    namespace,
    name: secretName,
    value,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    meta: {
      ...meta,
      vaultNamespace: namespace,
      credentialOwner: meta.credentialOwner || namespace
    }
  };
}

function deleteSecret(name, options = {}) {
  const secretName = normalizeName(name);
  const namespace = resolveTargetNamespace({}, options);
  const vault = loadVault(namespace);
  if (vault.entries[secretName]) {
    delete vault.entries[secretName];
    saveVault(namespace, vault);
  }
}

function listSecretMeta(options = {}) {
  const ns = normalizeOptions(options).namespace;
  if (ns) {
    const namespace = normalizeNamespace(ns);
    const vault = loadVault(namespace);
    return Object.entries(vault.entries).map(([name, record]) => ({
      namespace,
      name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      meta: {
        ...(record.meta || {}),
        vaultNamespace: namespace,
        credentialOwner: record.meta?.credentialOwner || namespace
      }
    }));
  }

  const namespaces = Array.from(VALID_NAMESPACES.values());
  return namespaces.flatMap((namespace) => listSecretMeta({ namespace }));
}

function getSecretMeta(name, options = {}) {
  const secretName = normalizeName(name);
  const namespace = resolveTargetNamespace({}, options);
  const vault = loadVault(namespace);
  const record = vault.entries[secretName];
  if (!record) return null;
  return {
    namespace,
    name: secretName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    meta: {
      ...(record.meta || {}),
      vaultNamespace: namespace,
      credentialOwner: record.meta?.credentialOwner || namespace
    }
  };
}

function getVaultStatus(options = {}) {
  const ns = normalizeOptions(options).namespace;
  if (ns) {
    const namespace = normalizeNamespace(ns);
    const { source } = resolveVaultKey(namespace);
    const vaultPath = namespaceVaultPath(namespace);
    const entries = listSecretMeta({ namespace });
    return {
      namespace,
      keySource: source,
      vaultPath,
      entriesCount: entries.length,
      entries
    };
  }

  const namespaces = {
    owner: getVaultStatus({ namespace: "owner" }),
    asolaria: getVaultStatus({ namespace: "asolaria" })
  };

  const sources = new Set([namespaces.owner.keySource, namespaces.asolaria.keySource].filter(Boolean));
  const keySource = sources.size === 1 ? Array.from(sources)[0] : "mixed";

  return {
    keySource,
    vaultRootDir,
    entriesCount: (namespaces.owner.entriesCount || 0) + (namespaces.asolaria.entriesCount || 0),
    namespaces,
    legacy: {
      vaultPath: legacyVaultPath,
      keyPath: legacyKeyPath,
      present: fs.existsSync(legacyVaultPath)
    }
  };
}

module.exports = {
  setSecret,
  getSecret,
  deleteSecret,
  listSecretMeta,
  getSecretMeta,
  getVaultStatus
};
