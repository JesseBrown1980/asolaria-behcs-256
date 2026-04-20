const crypto = require("crypto");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const ATLASSIAN_OAUTH_SECRET_NAME = "integrations.atlassian.oauth";
const ATLASSIAN_ACCOUNTS_SECRET_NAME = "integrations.atlassian.accounts";

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_API_HOST = "api.atlassian.com";
const ATLASSIAN_API_BASE = `https://${ATLASSIAN_API_HOST}`;

// Default to a read-only footprint that can cover Jira + Confluence content discovery.
// Adjust per your Atlassian app scopes.
const DEFAULT_SCOPES = [
  "offline_access",
  "read:jira-work",
  "read:jira-user",
  "read:confluence-content.summary",
  "read:confluence-space.summary",
  "search:confluence"
];

const OAUTH_STATE_TTL_MS = 12 * 60 * 1000;
const pendingOauthStates = new Map(); // state -> { createdAtMs, accountKey, scopes }

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 900) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeAccountKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const asEmail = normalizeEmail(raw);
  if (asEmail) return asEmail;
  return raw.slice(0, 120);
}

function normalizeAccountKeyList(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  const normalized = items
    .map((item) => normalizeAccountKey(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeScope(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Atlassian cloud scopes are colon-delimited and commonly include '.' + '-' + '_'.
  if (!/^[a-z0-9][a-z0-9:._-]{1,120}$/i.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeScopeList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = items
    .map((item) => normalizeScope(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}${"*".repeat(Math.max(4, text.length - 8))}${text.slice(-4)}`;
}

function resolveRedirectUri() {
  const port = Number(process.env.ASOLARIA_PORT || 4781);
  return `http://127.0.0.1:${port}/api/integrations/atlassian/oauth/callback`;
}

function resolveAtlassianOAuthConfig() {
  const envClientId = String(process.env.ASOLARIA_ATLASSIAN_CLIENT_ID || "").trim();
  const envClientSecret = String(process.env.ASOLARIA_ATLASSIAN_CLIENT_SECRET || "").trim();
  const envAllowedAccounts = normalizeAccountKeyList(process.env.ASOLARIA_ATLASSIAN_ALLOWED_ACCOUNTS || "");
  const envScopes = normalizeScopeList(process.env.ASOLARIA_ATLASSIAN_OAUTH_SCOPES || "");
  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      allowedAccounts: envAllowedAccounts,
      scopes: envScopes,
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(ATLASSIAN_OAUTH_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const clientId = String(value.clientId || "").trim();
  const clientSecret = String(value.clientSecret || "").trim();
  const allowedAccounts = normalizeAccountKeyList(value.allowedAccounts || envAllowedAccounts);
  const scopes = normalizeScopeList(value.scopes || envScopes);
  return {
    clientId,
    clientSecret,
    allowedAccounts,
    scopes,
    source: clientId && clientSecret ? "vault" : "none",
    updatedAt: secret?.updatedAt || null
  };
}

function getAtlassianConfigSummary(policy = {}) {
  const resolved = resolveAtlassianOAuthConfig();
  const effectiveScopes = resolved.scopes && resolved.scopes.length ? resolved.scopes : DEFAULT_SCOPES;
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.clientId && resolved.clientSecret),
    clientIdHint: resolved.clientId ? maskSecret(resolved.clientId) : "",
    clientSecretHint: resolved.clientSecret ? maskSecret(resolved.clientSecret) : "",
    configSource: resolved.source,
    allowedAccounts: resolved.allowedAccounts,
    oauthScopes: effectiveScopes,
    redirectUri: resolveRedirectUri(),
    updatedAt: resolved.updatedAt || null
  };
}

function setAtlassianOAuthConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(ATLASSIAN_OAUTH_SECRET_NAME, { namespace: "owner" });
    return getAtlassianConfigSummary();
  }

  const current = resolveAtlassianOAuthConfig();
  const clientId = String(input.clientId || "").trim() || String(current.clientId || "").trim();
  const clientSecret = String(input.clientSecret || "").trim() || String(current.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Atlassian clientId and clientSecret are required (missing from request and vault).");
  }

  const allowedAccountsRaw = input.allowedAccounts === undefined ? current.allowedAccounts : input.allowedAccounts;
  const allowedAccounts = normalizeAccountKeyList(allowedAccountsRaw || []);

  const scopesRaw = input.scopes === undefined && input.oauthScopes === undefined
    ? current.scopes
    : (input.scopes || input.oauthScopes || []);
  const scopes = normalizeScopeList(scopesRaw || []);

  setSecret(ATLASSIAN_OAUTH_SECRET_NAME, {
    clientId,
    clientSecret,
    allowedAccounts,
    scopes,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "atlassian-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getAtlassianConfigSummary();
}

function cleanupPendingOauthStates() {
  const now = Date.now();
  for (const [key, value] of pendingOauthStates.entries()) {
    if (!value || !Number.isFinite(value.createdAtMs) || now - value.createdAtMs > OAUTH_STATE_TTL_MS) {
      pendingOauthStates.delete(key);
    }
  }
}

function issueOauthState(meta = {}) {
  cleanupPendingOauthStates();
  const state = crypto.randomBytes(18).toString("hex");
  pendingOauthStates.set(state, {
    createdAtMs: Date.now(),
    accountKey: normalizeAccountKey(meta.accountKey || meta.account || meta.loginHint || ""),
    scopes: Array.isArray(meta.scopes) && meta.scopes.length ? meta.scopes : DEFAULT_SCOPES
  });
  return state;
}

function consumeOauthState(state) {
  cleanupPendingOauthStates();
  const key = String(state || "").trim();
  if (!key) {
    throw new Error("OAuth state is missing.");
  }
  const entry = pendingOauthStates.get(key);
  if (!entry) {
    throw new Error("OAuth state was not found or expired. Start auth again.");
  }
  pendingOauthStates.delete(key);
  return entry;
}

function startAtlassianOAuth(input = {}) {
  const resolved = resolveAtlassianOAuthConfig();
  if (!resolved.clientId || !resolved.clientSecret) {
    throw new Error("Atlassian integration is not configured yet (clientId/clientSecret missing).");
  }

  const redirectUri = resolveRedirectUri();
  const configScopes = resolved.scopes && resolved.scopes.length ? resolved.scopes : DEFAULT_SCOPES;
  const requestedScopes = normalizeScopeList(input.scopes || []);
  const scopes = requestedScopes.length ? requestedScopes : configScopes;

  const accountKey = normalizeAccountKey(input.account || input.loginHint || "");
  if (resolved.allowedAccounts.length && accountKey && !resolved.allowedAccounts.includes(accountKey)) {
    throw new Error(`Atlassian account is not allowlisted: ${accountKey}`);
  }

  const state = issueOauthState({ accountKey, scopes });
  const params = new URLSearchParams();
  params.set("audience", "api.atlassian.com");
  params.set("client_id", resolved.clientId);
  params.set("scope", scopes.join(" "));
  params.set("redirect_uri", redirectUri);
  params.set("state", state);
  params.set("response_type", "code");
  params.set("prompt", "consent");

  return {
    state,
    redirectUri,
    scopes,
    accountKey,
    authUrl: `${ATLASSIAN_AUTH_URL}?${params.toString()}`
  };
}

async function atlassianTokenRequest(payload) {
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload || {})
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const msg = String(parsed?.error_description || parsed?.error || `HTTP ${response.status}` || "token_request_failed");
    throw new Error(`Atlassian token request failed: ${msg}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Atlassian token request returned invalid JSON.");
  }
  return parsed;
}

async function atlassianApiGetJson(url, accessToken) {
  const response = await fetch(String(url), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const msg = String(parsed?.error?.message || parsed?.error_description || parsed?.error || `HTTP ${response.status}`);
    throw new Error(msg);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Atlassian API returned invalid JSON.");
  }
  return parsed;
}

function loadAccountsDoc() {
  const secret = getSecret(ATLASSIAN_ACCOUNTS_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const accounts = value.accounts && typeof value.accounts === "object" ? value.accounts : {};
  return {
    updatedAt: secret?.updatedAt || null,
    accounts: { ...accounts }
  };
}

function saveAccountsDoc(doc, meta) {
  const payload = {
    accounts: doc.accounts || {},
    updatedAt: new Date().toISOString()
  };
  setSecret(ATLASSIAN_ACCOUNTS_SECRET_NAME, payload, meta || {
    app: "Asolaria",
    component: "atlassian-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });
}

function listConnectedAccounts() {
  const doc = loadAccountsDoc();
  const accounts = doc.accounts && typeof doc.accounts === "object" ? doc.accounts : {};
  const rows = Object.entries(accounts).map(([key, record]) => {
    const safe = record && typeof record === "object" ? record : {};
    const expiresAtMs = Number(safe.expiry_date_ms || 0);
    const resources = Array.isArray(safe.resources) ? safe.resources : [];
    return {
      account: String(key || "").trim() || String(safe.account || "").trim() || key,
      scope: String(safe.scope || "").trim(),
      tokenType: String(safe.token_type || "").trim(),
      hasRefreshToken: Boolean(String(safe.refresh_token || "").trim()),
      resourcesCount: resources.length,
      resources: resources.slice(0, 6).map((r) => ({
        id: String(r?.id || ""),
        name: String(r?.name || ""),
        url: String(r?.url || "")
      })),
      expiresAt: expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null,
      expiresInSec: expiresAtMs > 0 ? Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)) : null,
      updatedAt: String(safe.updatedAt || safe.createdAt || "").trim() || null
    };
  });
  rows.sort((a, b) => String(a.account).localeCompare(String(b.account)));
  return rows;
}

function resolveAccountKey(requestedKey) {
  const wanted = normalizeAccountKey(requestedKey);
  const doc = loadAccountsDoc();
  const available = Object.keys(doc.accounts || {}).map((key) => normalizeAccountKey(key)).filter(Boolean);
  if (wanted) {
    if (!doc.accounts[wanted]) {
      throw new Error(`Atlassian account is not connected: ${wanted}`);
    }
    return wanted;
  }
  if (available.length === 1) return available[0];
  if (available.length === 0) {
    throw new Error("No Atlassian accounts are connected yet.");
  }
  throw new Error(`Multiple Atlassian accounts are connected (${available.join(", ")}). Specify account.`);
}

function upsertAccountTokens(accountKey, tokenResponse, meta) {
  const resolvedKey = normalizeAccountKey(accountKey);
  if (!resolvedKey) {
    throw new Error("Atlassian account key could not be resolved.");
  }

  const doc = loadAccountsDoc();
  const existing = doc.accounts[resolvedKey] && typeof doc.accounts[resolvedKey] === "object"
    ? doc.accounts[resolvedKey]
    : {};
  const now = Date.now();
  const expiresIn = Number(tokenResponse?.expires_in || 0);
  const expiryDateMs = expiresIn > 0 ? now + expiresIn * 1000 : Number(existing.expiry_date_ms || 0);
  const refresh = String(tokenResponse?.refresh_token || "").trim();

  const record = {
    account: resolvedKey,
    access_token: String(tokenResponse?.access_token || existing.access_token || "").trim(),
    refresh_token: refresh || String(existing.refresh_token || "").trim(),
    scope: String(tokenResponse?.scope || existing.scope || "").trim(),
    token_type: String(tokenResponse?.token_type || existing.token_type || "").trim() || "Bearer",
    expiry_date_ms: Number.isFinite(expiryDateMs) ? Math.max(0, Math.round(expiryDateMs)) : 0,
    resources: Array.isArray(existing.resources) ? existing.resources : [],
    profile: existing.profile && typeof existing.profile === "object" ? existing.profile : null,
    createdAt: String(existing.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };

  doc.accounts[resolvedKey] = record;
  saveAccountsDoc(doc, meta);
  return record;
}

async function ensureAccessToken(accountKey) {
  const key = resolveAccountKey(accountKey);
  const resolved = resolveAtlassianOAuthConfig();
  if (!resolved.clientId || !resolved.clientSecret) {
    throw new Error("Atlassian integration is not configured yet (clientId/clientSecret missing).");
  }

  const doc = loadAccountsDoc();
  const record = doc.accounts[key];
  if (!record || typeof record !== "object") {
    throw new Error(`Atlassian account is not connected: ${key}`);
  }

  const accessToken = String(record.access_token || "").trim();
  const refreshToken = String(record.refresh_token || "").trim();
  const expiryMs = Number(record.expiry_date_ms || 0);
  const expiresInSec = expiryMs > 0 ? Math.max(0, Math.round((expiryMs - Date.now()) / 1000)) : null;

  if (!accessToken) {
    throw new Error("Atlassian access token is missing. Reconnect via OAuth.");
  }

  // Refresh if expired or near expiry.
  if (expiryMs > 0 && expiresInSec !== null && expiresInSec > 90) {
    return { account: key, accessToken, expiresAtMs: expiryMs, expiresInSec };
  }
  if (!refreshToken) {
    return { account: key, accessToken, expiresAtMs: expiryMs, expiresInSec };
  }

  const tokenResponse = await atlassianTokenRequest({
    grant_type: "refresh_token",
    client_id: resolved.clientId,
    client_secret: resolved.clientSecret,
    refresh_token: refreshToken
  });

  const updated = upsertAccountTokens(key, tokenResponse, {
    app: "Asolaria",
    component: "atlassian-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "oauth-refresh"
  });

  const updatedAccessToken = String(updated.access_token || "").trim();
  const updatedExpiryMs = Number(updated.expiry_date_ms || 0);
  const updatedExpiresInSec = updatedExpiryMs > 0 ? Math.max(0, Math.round((updatedExpiryMs - Date.now()) / 1000)) : null;
  return { account: key, accessToken: updatedAccessToken, expiresAtMs: updatedExpiryMs, expiresInSec: updatedExpiresInSec };
}

async function fetchAccessibleResources(accessToken) {
  const url = `${ATLASSIAN_API_BASE}/oauth/token/accessible-resources`;
  const parsed = await atlassianApiGetJson(url, accessToken);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => ({
      id: String(row?.id || "").trim(),
      name: String(row?.name || "").trim(),
      url: String(row?.url || "").trim(),
      scopes: Array.isArray(row?.scopes) ? row.scopes.map((s) => String(s || "").trim()).filter(Boolean) : []
    }))
    .filter((row) => row.id && row.url);
}

async function fetchUserProfile(accessToken) {
  try {
    const url = `${ATLASSIAN_API_BASE}/me`;
    const parsed = await atlassianApiGetJson(url, accessToken);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

async function completeAtlassianOAuthCallback(input = {}) {
  const code = String(input.code || "").trim();
  const state = String(input.state || "").trim();
  if (!code) throw new Error("OAuth code is missing.");
  const entry = consumeOauthState(state);

  const resolved = resolveAtlassianOAuthConfig();
  if (!resolved.clientId || !resolved.clientSecret) {
    throw new Error("Atlassian integration is not configured yet (clientId/clientSecret missing).");
  }

  const redirectUri = resolveRedirectUri();
  const tokenResponse = await atlassianTokenRequest({
    grant_type: "authorization_code",
    client_id: resolved.clientId,
    client_secret: resolved.clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const accountKey = entry.accountKey || "default";
  const record = upsertAccountTokens(accountKey, tokenResponse, {
    app: "Asolaria",
    component: "atlassian-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "oauth-callback"
  });

  const accessToken = String(record.access_token || "").trim();
  const resources = accessToken ? await fetchAccessibleResources(accessToken) : [];
  const profile = accessToken ? await fetchUserProfile(accessToken) : null;

  const doc = loadAccountsDoc();
  const next = doc.accounts[normalizeAccountKey(accountKey)] && typeof doc.accounts[normalizeAccountKey(accountKey)] === "object"
    ? doc.accounts[normalizeAccountKey(accountKey)]
    : record;
  doc.accounts[normalizeAccountKey(accountKey)] = {
    ...next,
    resources,
    profile,
    updatedAt: new Date().toISOString()
  };
  saveAccountsDoc(doc, {
    app: "Asolaria",
    component: "atlassian-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "oauth-callback"
  });

  const expiresAtMs = Number(doc.accounts[normalizeAccountKey(accountKey)]?.expiry_date_ms || 0);
  return {
    account: accountKey,
    scopes: entry.scopes || [],
    resourcesCount: resources.length,
    expiresAt: expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null,
    hasRefreshToken: Boolean(String(doc.accounts[normalizeAccountKey(accountKey)]?.refresh_token || "").trim())
  };
}

function deepRedactLinks(value, options = {}, depth = 0) {
  const maxDepth = clampInt(options.maxDepth, 6, 1, 12);
  const maxEntries = clampInt(options.maxEntries, 220, 10, 2000);
  const maxString = clampInt(options.maxString, 1800, 120, 120000);
  if (depth > maxDepth) return null;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const trimmed = value.length > maxString ? `${value.slice(0, Math.max(0, maxString - 3))}...` : value;
    if (/https?:\/\//i.test(trimmed)) {
      // Avoid leaking clickable links into downstream models.
      return "[link redacted]";
    }
    return trimmed;
  }
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value.slice(0, maxEntries)) {
      out.push(deepRedactLinks(item, options, depth + 1));
    }
    return out;
  }

  const entries = Object.entries(value).slice(0, maxEntries);
  const out = {};
  for (const [key, item] of entries) {
    const safeKey = String(key || "").slice(0, 120);
    out[safeKey] = deepRedactLinks(item, options, depth + 1);
  }
  return out;
}

function isAllowedAtlassianApiHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === ATLASSIAN_API_HOST;
}

async function atlassianApiRequest(input = {}, policy = {}) {
  const account = resolveAccountKey(input.account || "");
  const rawUrl = String(input.url || "").trim();
  if (!rawUrl) {
    throw new Error("Atlassian API request requires a url.");
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_error) {
    parsedUrl = null;
  }
  if (!parsedUrl) {
    throw new Error("Atlassian API request url is not valid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Atlassian API requests must use https.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Atlassian API request url must not include credentials.");
  }
  if (parsedUrl.port && parsedUrl.port !== "443") {
    throw new Error("Atlassian API request url must not include a custom port.");
  }
  if (!isAllowedAtlassianApiHost(parsedUrl.hostname)) {
    throw new Error("Atlassian API request host is not allowed (only api.atlassian.com).");
  }

  const { accessToken } = await ensureAccessToken(account);
  const json = await atlassianApiGetJson(parsedUrl.toString(), accessToken);

  const safe = deepRedactLinks(json, {
    maxDepth: clampInt(policy.maxDepth, 6, 1, 12),
    maxEntries: clampInt(policy.maxEntries, 220, 10, 2000),
    maxString: clampInt(policy.maxString, 1800, 120, 120000)
  });

  return {
    account,
    url: parsedUrl.toString(),
    data: safe
  };
}

function getAtlassianIntegrationStatus(policy = {}) {
  const summary = getAtlassianConfigSummary(policy);
  const connected = listConnectedAccounts();
  return {
    ...summary,
    policy: {
      backendOnly: true,
      noLinkNavigation: true,
      linkRedaction: true,
      scopes: Array.isArray(summary.oauthScopes) && summary.oauthScopes.length ? summary.oauthScopes : DEFAULT_SCOPES
    },
    accounts: connected,
    oauth: {
      pendingStates: pendingOauthStates.size,
      stateTtlMs: OAUTH_STATE_TTL_MS
    }
  };
}

function manifest() {
  return {
    id: "atlassian",
    version: "1.0.0",
    description: "OAuth-based connector for Atlassian Cloud (Jira and Confluence) with token management and API proxying",
    capabilities: ["oauth", "token-refresh", "api-proxy", "multi-account"],
    readScopes: ["read:jira-work", "read:jira-user", "read:confluence-content.summary", "read:confluence-space.summary", "search:confluence"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: ["integrations.atlassian.oauth", "integrations.atlassian.accounts"],
    sideEffects: ["vault-write-on-token-refresh", "vault-write-on-oauth-callback"],
    failureModes: ["oauth-config-missing", "token-expired", "api-host-not-allowed", "account-not-connected"],
    emittedEvents: []
  };
}

module.exports = {
  ATLASSIAN_OAUTH_SECRET_NAME,
  ATLASSIAN_ACCOUNTS_SECRET_NAME,
  DEFAULT_SCOPES,
  getAtlassianConfigSummary,
  setAtlassianOAuthConfig,
  startAtlassianOAuth,
  completeAtlassianOAuthCallback,
  atlassianApiRequest,
  getAtlassianIntegrationStatus,
  manifest
};

