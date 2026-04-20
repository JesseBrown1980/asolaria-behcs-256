const crypto = require("crypto");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const MS_OAUTH_SECRET_NAME = "integrations.microsoft.oauth";
const MS_ACCOUNTS_SECRET_NAME = "integrations.microsoft.accounts";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

// Keep defaults to common read-only surfaces. Teams/Chat scopes may still require admin consent.
const DEFAULT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
  "Chat.Read",
  "Team.ReadBasic.All",
  "ChannelMessage.Read.All"
];

const DEVICE_STATE_TTL_MS = 12 * 60 * 1000;
const pendingDeviceStates = new Map(); // state -> { createdAtMs, deviceCode, intervalSec, expiresAtMs }

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 900) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}${"*".repeat(Math.max(4, text.length - 8))}${text.slice(-4)}`;
}

function normalizeTenant(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "common" || lower === "organizations" || lower === "consumers") {
    return lower;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  if (/^[a-z0-9][a-z0-9.-]{1,120}$/i.test(raw) && raw.includes(".")) {
    return raw;
  }
  return "";
}

function normalizeClientId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeEmailList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const normalized = items.map(normalizeEmail).filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeScopeItem(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._-]{2,120}$/i.test(raw)) {
    return raw;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeScopeList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\s,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const normalized = items.map(normalizeScopeItem).filter(Boolean);
  return Array.from(new Set(normalized));
}

function resolveMicrosoftOAuthConfig() {
  const envTenant = normalizeTenant(process.env.ASOLARIA_MICROSOFT_TENANT || "");
  const envClientId = normalizeClientId(process.env.ASOLARIA_MICROSOFT_CLIENT_ID || "");
  const envAllowed = normalizeEmailList(process.env.ASOLARIA_MICROSOFT_ALLOWED_ACCOUNTS || "");
  const envScopes = normalizeScopeList(process.env.ASOLARIA_MICROSOFT_OAUTH_SCOPES || "");
  if (envTenant && envClientId) {
    return {
      tenant: envTenant,
      clientId: envClientId,
      allowedAccounts: envAllowed,
      scopes: envScopes,
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(MS_OAUTH_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const tenant = normalizeTenant(value.tenant || value.directory || "") || "organizations";
  const clientId = normalizeClientId(value.clientId || "");
  const allowedAccounts = normalizeEmailList(value.allowedAccounts || envAllowed);
  const scopes = normalizeScopeList(value.scopes || envScopes);
  return {
    tenant,
    clientId,
    allowedAccounts,
    scopes,
    source: clientId ? "vault" : "none",
    updatedAt: secret?.updatedAt || null
  };
}

function loadAccountsDoc() {
  const secret = getSecret(MS_ACCOUNTS_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const accounts = value.accounts && typeof value.accounts === "object" ? value.accounts : {};
  return {
    updatedAt: secret?.updatedAt || null,
    accounts: { ...accounts }
  };
}

function saveAccountsDoc(doc, meta) {
  setSecret(MS_ACCOUNTS_SECRET_NAME, {
    accounts: doc.accounts || {},
    updatedAt: new Date().toISOString()
  }, meta || {
    app: "Asolaria",
    component: "microsoft-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });
}

function listConnectedMicrosoftAccounts() {
  const doc = loadAccountsDoc();
  const accounts = doc.accounts && typeof doc.accounts === "object" ? doc.accounts : {};
  const rows = Object.entries(accounts).map(([email, record]) => {
    const safe = record && typeof record === "object" ? record : {};
    const expiresAtMs = Number(safe.expiry_date_ms || 0);
    return {
      email: normalizeEmail(email) || String(email),
      scope: String(safe.scope || "").trim(),
      tokenType: String(safe.token_type || "").trim(),
      hasRefreshToken: Boolean(String(safe.refresh_token || "").trim()),
      tenant: String(safe.tenant || "").trim(),
      expiresAt: expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null,
      expiresInSec: expiresAtMs > 0 ? Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)) : null,
      updatedAt: String(safe.updatedAt || safe.createdAt || "").trim() || null
    };
  });
  rows.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return rows;
}

function getMicrosoftConfigSummary(policy = {}) {
  const resolved = resolveMicrosoftOAuthConfig();
  const scopes = resolved.scopes && resolved.scopes.length ? resolved.scopes : DEFAULT_SCOPES;
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.clientId && resolved.tenant),
    configSource: resolved.source,
    tenant: resolved.tenant || "",
    clientIdHint: resolved.clientId ? maskSecret(resolved.clientId) : "",
    allowedAccounts: resolved.allowedAccounts,
    oauthScopes: scopes,
    connectedAccounts: listConnectedMicrosoftAccounts(),
    updatedAt: resolved.updatedAt || null
  };
}

function getMicrosoftIntegrationStatus(policy = {}) {
  return getMicrosoftConfigSummary(policy);
}

function setMicrosoftOAuthConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(MS_OAUTH_SECRET_NAME, { namespace: "owner" });
    return getMicrosoftConfigSummary();
  }

  const tenant = normalizeTenant(input.tenant || input.directory || "organizations");
  const clientId = normalizeClientId(input.clientId || input.appId || "");
  if (!tenant) {
    throw new Error("Microsoft tenant is required (organizations|common|<tenant-id>).");
  }
  if (!clientId) {
    throw new Error("Microsoft clientId is required (GUID).");
  }

  const allowedAccounts = normalizeEmailList(input.allowedAccounts || []);
  const scopes = normalizeScopeList(input.scopes || input.oauthScopes || []);

  setSecret(MS_OAUTH_SECRET_NAME, {
    tenant,
    clientId,
    allowedAccounts,
    scopes,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "microsoft-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getMicrosoftConfigSummary();
}

function manifest() {
  return {
    id: "microsoft",
    version: "1.0.0",
    description: "OAuth-based connector for Microsoft Graph API with device code flow, supporting Mail, Calendar, Teams, and Chat",
    capabilities: ["oauth", "device-code-flow", "multi-account", "config-management"],
    readScopes: ["User.Read", "Mail.Read", "Calendars.Read", "Chat.Read", "Team.ReadBasic.All", "ChannelMessage.Read.All"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: ["integrations.microsoft.oauth", "integrations.microsoft.accounts"],
    sideEffects: ["vault-write-on-config-update"],
    failureModes: ["oauth-config-missing", "tenant-invalid", "client-id-invalid", "account-not-connected"],
    emittedEvents: []
  };
}

module.exports = {
  MS_OAUTH_SECRET_NAME,
  MS_ACCOUNTS_SECRET_NAME,
  DEFAULT_SCOPES,
  getMicrosoftConfigSummary,
  getMicrosoftIntegrationStatus,
  setMicrosoftOAuthConfig,
  listConnectedMicrosoftAccounts,
  manifest
};
