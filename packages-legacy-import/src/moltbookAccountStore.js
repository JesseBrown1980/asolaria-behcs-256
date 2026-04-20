const crypto = require("crypto");
const { setSecret, getSecret, deleteSecret, getVaultStatus } = require("./secureVault");

const COMPANY_PRIMARY_SIGNIN_SECRET_NAME = "company.primary_signin";
const LEGACY_MOLTBOOK_SECRET_NAME = "moltbook.account";
const PRIMARY_NAMESPACE = "owner";
const LEGACY_NAMESPACE = "asolaria";

// Backward-compatible export label for existing imports/routes.
const MOLTBOOK_SECRET_NAME = COMPANY_PRIMARY_SIGNIN_SECRET_NAME;

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeEmail(value, fallback = "") {
  const raw = normalizeText(value, fallback).toLowerCase();
  if (!raw) return "";
  return raw.replace(/\s+/g, "");
}

function normalizeUsername(value) {
  const raw = normalizeText(value).toLowerCase();
  const safe = raw.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!safe) return "";
  return safe.slice(0, 40);
}

function normalizeExcludes(value, fallback = []) {
  const items = Array.isArray(value)
    ? value
    : (Array.isArray(fallback) ? fallback : []);
  const unique = new Set();
  for (const item of items) {
    const email = normalizeEmail(item);
    if (!email || !email.includes("@")) continue;
    unique.add(email);
    if (unique.size >= 20) break;
  }
  return Array.from(unique.values());
}

function randomToken(length = 8) {
  return crypto.randomBytes(Math.max(4, Math.ceil(length / 2))).toString("hex").slice(0, length);
}

function generatePassword(length = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*_-+=";
  const bytes = crypto.randomBytes(Math.max(24, length));
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[bytes[index] % alphabet.length];
  }
  return out;
}

function defaultPortalUrl() {
  return normalizeText(
    process.env.ASOLARIA_COMPANY_SIGNIN_URL,
    normalizeText(process.env.ASOLARIA_MOLTBOOK_URL, "https://company.example.com/signin")
  );
}

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${text.slice(0, 2)}${"*".repeat(Math.max(2, text.length - 4))}${text.slice(-2)}`;
}

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !email.includes("@")) return maskValue(email);
  const [local, domain] = email.split("@");
  return `${maskValue(local)}@${domain}`;
}

function sanitizeForDisplay(account) {
  if (!account) return null;
  const email = normalizeEmail(account.email);
  const domain = email.includes("@") ? email.split("@")[1] : "";
  return {
    portal: account.portal,
    accountType: account.accountType,
    displayName: account.displayName,
    label: account.label,
    usernameMasked: maskValue(account.username),
    emailMasked: maskEmail(email),
    emailDomain: domain,
    hasPassword: Boolean(account.password),
    passwordLength: account.password ? String(account.password).length : 0,
    excludesMasked: normalizeExcludes(account.excludes).map((item) => maskEmail(item)),
    profileUrl: account.profileUrl,
    status: account.status || "draft",
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    registeredAt: account.registeredAt || null
  };
}

function ensureAccountRecord(input = {}) {
  const now = new Date().toISOString();
  const timestamp = Date.now().toString(36);
  const generatedUsername = `asolaria-owner-${timestamp}-${randomToken(4)}`;
  const username = normalizeUsername(input.username) || generatedUsername;
  const email = normalizeEmail(input.email, `${username}@example.local`);
  const password = normalizeText(input.password, generatePassword(24));
  return {
    portal: normalizeText(input.portal, "Company"),
    accountType: normalizeText(input.accountType, "Owner"),
    displayName: normalizeText(input.displayName, "Primary Company Sign-in"),
    label: normalizeText(input.label, "main_company_signin"),
    username,
    email,
    password,
    excludes: normalizeExcludes(input.excludes),
    profileUrl: normalizeText(input.profileUrl, defaultPortalUrl()),
    notes: normalizeText(input.notes, "Primary owner sign-in for company operations."),
    status: normalizeText(input.status, "active"),
    createdAt: now,
    updatedAt: now,
    registeredAt: input.registeredAt || null
  };
}

function readPrimarySecretRaw() {
  return getSecret(COMPANY_PRIMARY_SIGNIN_SECRET_NAME, { namespace: PRIMARY_NAMESPACE });
}

function readLegacySecretRaw() {
  return getSecret(LEGACY_MOLTBOOK_SECRET_NAME, { namespace: LEGACY_NAMESPACE });
}

function migrateLegacyMoltbookSecret(options = {}) {
  const deleteLegacy = options.deleteLegacy !== false;
  const existing = readPrimarySecretRaw();
  if (existing) {
    return {
      migrated: false,
      reason: "primary_exists",
      key: COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
      namespace: PRIMARY_NAMESPACE,
      legacyDeleted: false
    };
  }

  const legacy = readLegacySecretRaw();
  if (!legacy) {
    return {
      migrated: false,
      reason: "legacy_missing",
      key: COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
      namespace: PRIMARY_NAMESPACE,
      legacyDeleted: false
    };
  }

  const legacyValue = legacy.value && typeof legacy.value === "object" ? legacy.value : {};
  const record = ensureAccountRecord({
    ...legacyValue,
    portal: "Company",
    accountType: "Owner",
    label: legacyValue.label || "main_company_signin"
  });
  record.createdAt = legacyValue.createdAt || legacy.createdAt || record.createdAt;
  record.updatedAt = new Date().toISOString();

  setSecret(COMPANY_PRIMARY_SIGNIN_SECRET_NAME, record, {
    app: "Asolaria",
    portal: "Company",
    credentialOwner: PRIMARY_NAMESPACE,
    actor: "owner",
    credentialType: "company_primary_signin",
    migratedFrom: `${LEGACY_NAMESPACE}/${LEGACY_MOLTBOOK_SECRET_NAME}`
  }, { namespace: PRIMARY_NAMESPACE });

  let legacyDeleted = false;
  if (deleteLegacy) {
    deleteSecret(LEGACY_MOLTBOOK_SECRET_NAME, { namespace: LEGACY_NAMESPACE });
    legacyDeleted = true;
  }

  return {
    migrated: true,
    reason: "migrated",
    key: COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
    namespace: PRIMARY_NAMESPACE,
    legacyDeleted
  };
}

function readMoltbookAccount(options = {}) {
  const reveal = options.reveal === true;
  const autoMigrate = options.autoMigrate !== false;

  let secret = readPrimarySecretRaw();

  if (!secret && autoMigrate) {
    try {
      migrateLegacyMoltbookSecret({ deleteLegacy: true });
      secret = readPrimarySecretRaw();
    } catch (_error) {
      secret = null;
    }
  }

  if (!secret) {
    // Compatibility fallback if migration cannot run yet.
    secret = readLegacySecretRaw();
  }

  if (!secret) return null;

  const account = {
    ...(secret.value && typeof secret.value === "object" ? secret.value : {})
  };
  account.createdAt = account.createdAt || secret.createdAt;
  account.updatedAt = account.updatedAt || secret.updatedAt;

  if (reveal) {
    return account;
  }
  return sanitizeForDisplay(account);
}

function saveMoltbookAccount(account, meta = {}) {
  const normalized = {
    ...account,
    updatedAt: new Date().toISOString()
  };
  setSecret(COMPANY_PRIMARY_SIGNIN_SECRET_NAME, normalized, {
    app: "Asolaria",
    portal: normalizeText(normalized.portal, "Company"),
    credentialOwner: PRIMARY_NAMESPACE,
    actor: "owner",
    credentialType: "company_primary_signin",
    ...meta
  }, { namespace: PRIMARY_NAMESPACE });
  return readMoltbookAccount();
}

function bootstrapMoltbookAccount(input = {}) {
  const existing = readMoltbookAccount({ reveal: true, autoMigrate: true });
  if (existing) {
    return sanitizeForDisplay(existing);
  }
  const account = ensureAccountRecord(input);
  setSecret(COMPANY_PRIMARY_SIGNIN_SECRET_NAME, account, {
    app: "Asolaria",
    portal: normalizeText(account.portal, "Company"),
    credentialOwner: PRIMARY_NAMESPACE,
    actor: "owner",
    credentialType: "company_primary_signin",
    createdBy: "bootstrap"
  }, { namespace: PRIMARY_NAMESPACE });
  return sanitizeForDisplay(account);
}

function updateMoltbookAccount(input = {}) {
  const existing = readMoltbookAccount({ reveal: true, autoMigrate: true }) || ensureAccountRecord({});
  const next = {
    ...existing,
    portal: normalizeText(input.portal, existing.portal || "Company"),
    accountType: normalizeText(input.accountType, existing.accountType || "Owner"),
    displayName: normalizeText(input.displayName, existing.displayName),
    label: normalizeText(input.label, existing.label || "main_company_signin"),
    username: normalizeUsername(input.username) || existing.username,
    email: normalizeEmail(input.email, existing.email),
    password: normalizeText(input.password, existing.password),
    excludes: normalizeExcludes(input.excludes, existing.excludes || []),
    profileUrl: normalizeText(input.profileUrl, existing.profileUrl || defaultPortalUrl()),
    notes: normalizeText(input.notes, existing.notes || ""),
    status: normalizeText(input.status, existing.status || "active"),
    registeredAt: input.registeredAt === null
      ? null
      : normalizeText(input.registeredAt, existing.registeredAt || null),
    updatedAt: new Date().toISOString()
  };
  return saveMoltbookAccount(next, { updatedBy: "update" });
}

function markMoltbookRegistered(extra = {}) {
  const existing = readMoltbookAccount({ reveal: true, autoMigrate: true }) || ensureAccountRecord({});
  const next = {
    ...existing,
    status: "registered",
    registeredAt: new Date().toISOString(),
    notes: normalizeText(extra.notes, existing.notes || "Registered as owner sign-in."),
    updatedAt: new Date().toISOString()
  };
  return saveMoltbookAccount(next, { updatedBy: "mark-registered" });
}

function revealMoltbookAccount() {
  return readMoltbookAccount({ reveal: true, autoMigrate: true });
}

function getMoltbookAccountSummary() {
  const legacy = readLegacySecretRaw();
  return {
    account: readMoltbookAccount(),
    vault: getVaultStatus({ namespace: PRIMARY_NAMESPACE }),
    legacy: {
      namespace: LEGACY_NAMESPACE,
      key: LEGACY_MOLTBOOK_SECRET_NAME,
      present: Boolean(legacy)
    }
  };
}

module.exports = {
  MOLTBOOK_SECRET_NAME,
  COMPANY_PRIMARY_SIGNIN_SECRET_NAME,
  LEGACY_MOLTBOOK_SECRET_NAME,
  PRIMARY_NAMESPACE,
  LEGACY_NAMESPACE,
  bootstrapMoltbookAccount,
  updateMoltbookAccount,
  markMoltbookRegistered,
  revealMoltbookAccount,
  readMoltbookAccount,
  getMoltbookAccountSummary,
  migrateLegacyMoltbookSecret
};
