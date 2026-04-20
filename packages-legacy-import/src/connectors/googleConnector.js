const crypto = require("crypto");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const GOOGLE_OAUTH_SECRET_NAME = "integrations.google.oauth";
const GOOGLE_ACCOUNTS_SECRET_NAME = "integrations.google.accounts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];

const OAUTH_STATE_TTL_MS = 12 * 60 * 1000;
const GOOGLE_NETWORK_RETRY_DELAYS_MS = [500, 1200];
const pendingOauthStates = new Map(); // state -> { createdAtMs, loginHint, scopes }

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 900) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
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

function normalizeEmailList(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  const normalized = items
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

const PRIMARY_RUNTIME_ACCOUNT = normalizeEmail(
  process.env.ASOLARIA_PRIMARY_GOOGLE_ACCOUNT || "plasmatoid@gmail.com"
);

function applyPrimaryGoogleAccountPolicy(input = {}) {
  const primary = PRIMARY_RUNTIME_ACCOUNT;
  const allowedInput = Array.isArray(input.allowedAccounts) ? input.allowedAccounts : [];
  const allowedAccounts = normalizeEmailList(allowedInput);
  const defaultAccountInput = normalizeEmail(input.defaultAccount || "");

  let nextAllowed = allowedAccounts;
  let nextDefault = defaultAccountInput;
  if (primary) {
    if (!nextAllowed.includes(primary)) {
      nextAllowed = [primary, ...nextAllowed];
    }
    nextDefault = primary;
  }

  return {
    allowedAccounts: nextAllowed,
    defaultAccount: nextDefault
  };
}

function normalizeScope(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Common non-URL OpenID scopes.
  if (raw === "openid" || raw === "email" || raw === "profile") {
    return raw;
  }

  // Most Google API scopes are URLs under www.googleapis.com/auth/...
  // Keep this strict to avoid turning this into an arbitrary URL allowlist.
  if (!/^https:\/\/www\.googleapis\.com\/auth\/[a-z0-9._/-]+$/i.test(raw)) {
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

function sleep(ms) {
  const delay = Number(ms);
  return new Promise((resolve) => setTimeout(resolve, Number.isFinite(delay) && delay > 0 ? delay : 0));
}

function isRetryableGoogleNetworkError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("network")
  );
}

async function withGoogleNetworkRetries(label, action) {
  const runner = typeof action === "function" ? action : null;
  if (!runner) {
    throw new Error(`Google network retry action is missing for ${label || "operation"}.`);
  }
  let lastError = null;
  for (let attempt = 0; attempt <= GOOGLE_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await runner();
    } catch (error) {
      lastError = error;
      if (!isRetryableGoogleNetworkError(error) || attempt >= GOOGLE_NETWORK_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await sleep(GOOGLE_NETWORK_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError || new Error(`Google network action failed: ${label || "operation"}`);
}

function resolveRedirectUri() {
  const port = Number(process.env.ASOLARIA_PORT || 4781);
  return `http://127.0.0.1:${port}/api/integrations/google/oauth/callback`;
}

function resolveGoogleOAuthConfig() {
  const envClientId = String(process.env.ASOLARIA_GOOGLE_CLIENT_ID || "").trim();
  const envClientSecret = String(process.env.ASOLARIA_GOOGLE_CLIENT_SECRET || "").trim();
  const envAllowedAccounts = normalizeEmailList(process.env.ASOLARIA_GOOGLE_ALLOWED_ACCOUNTS || "");
  const envDefaultAccount = normalizeEmail(process.env.ASOLARIA_GOOGLE_DEFAULT_ACCOUNT || "");
  const envScopes = normalizeScopeList(process.env.ASOLARIA_GOOGLE_OAUTH_SCOPES || "");
  if (envClientId && envClientSecret) {
    const identityPolicy = applyPrimaryGoogleAccountPolicy({
      allowedAccounts: envAllowedAccounts,
      defaultAccount: envDefaultAccount
    });
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      allowedAccounts: identityPolicy.allowedAccounts,
      defaultAccount: identityPolicy.defaultAccount,
      scopes: envScopes,
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(GOOGLE_OAUTH_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const clientId = String(value.clientId || "").trim();
  const clientSecret = String(value.clientSecret || "").trim();
  const identityPolicy = applyPrimaryGoogleAccountPolicy({
    allowedAccounts: normalizeEmailList(value.allowedAccounts || envAllowedAccounts),
    defaultAccount: normalizeEmail(value.defaultAccount || envDefaultAccount)
  });
  const scopes = normalizeScopeList(value.scopes || envScopes);
  return {
    clientId,
    clientSecret,
    allowedAccounts: identityPolicy.allowedAccounts,
    defaultAccount: identityPolicy.defaultAccount,
    scopes,
    source: clientId && clientSecret ? "vault" : "none",
    updatedAt: secret?.updatedAt || null
  };
}

function getGoogleConfigSummary(policy = {}) {
  const resolved = resolveGoogleOAuthConfig();
  const effectiveScopes = resolved.scopes && resolved.scopes.length ? resolved.scopes : DEFAULT_SCOPES;
  const connectedAccounts = listConnectedAccounts();
  const connectedSet = new Set(connectedAccounts.map((row) => normalizeEmail(row.email)).filter(Boolean));
  const allowedAccounts = Array.isArray(resolved.allowedAccounts) ? resolved.allowedAccounts : [];
  const allowlistedConnected = allowedAccounts.filter((email) => connectedSet.has(email));
  const allowlistedMissing = allowedAccounts.filter((email) => !connectedSet.has(email));
  const primaryAccount = normalizeEmail(resolved.defaultAccount || PRIMARY_RUNTIME_ACCOUNT || "");
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.clientId && resolved.clientSecret),
    clientIdHint: resolved.clientId ? maskSecret(resolved.clientId) : "",
    clientSecretHint: resolved.clientSecret ? maskSecret(resolved.clientSecret) : "",
    configSource: resolved.source,
    allowedAccounts,
    defaultAccount: primaryAccount || "",
    primaryRuntimeAccount: PRIMARY_RUNTIME_ACCOUNT || "",
    primaryConnected: Boolean(primaryAccount && connectedSet.has(primaryAccount)),
    connectedAccounts,
    allowlistedConnected,
    allowlistedMissing,
    oauthScopes: effectiveScopes,
    redirectUri: resolveRedirectUri(),
    updatedAt: resolved.updatedAt || null
  };
}

function setGoogleOAuthConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(GOOGLE_OAUTH_SECRET_NAME, { namespace: "owner" });
    return getGoogleConfigSummary();
  }

  // Allow partial updates (e.g., scopes-only change) without requiring
  // re-sending the clientId/clientSecret that are already stored in the vault.
  const current = resolveGoogleOAuthConfig();
  const clientId = String(input.clientId || "").trim() || String(current.clientId || "").trim();
  const clientSecret = String(input.clientSecret || "").trim() || String(current.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google clientId and clientSecret are required (missing from request and vault).");
  }
  if (!/\.apps\.googleusercontent\.com$/i.test(clientId)) {
    throw new Error("Google clientId does not look valid (expected ...apps.googleusercontent.com).");
  }

  const allowedAccountsRaw = input.allowedAccounts === undefined ? current.allowedAccounts : input.allowedAccounts;
  const defaultAccountRaw = input.defaultAccount === undefined ? current.defaultAccount : input.defaultAccount;
  const identityPolicy = applyPrimaryGoogleAccountPolicy({
    allowedAccounts: normalizeEmailList(allowedAccountsRaw || []),
    defaultAccount: normalizeEmail(defaultAccountRaw || "")
  });

  const scopesRaw = input.scopes === undefined && input.oauthScopes === undefined
    ? current.scopes
    : (input.scopes || input.oauthScopes || []);
  const scopes = normalizeScopeList(scopesRaw || []);
  setSecret(GOOGLE_OAUTH_SECRET_NAME, {
    clientId,
    clientSecret,
    allowedAccounts: identityPolicy.allowedAccounts,
    defaultAccount: identityPolicy.defaultAccount,
    scopes,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "google-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getGoogleConfigSummary();
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
    loginHint: normalizeEmail(meta.loginHint || ""),
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

function startGoogleOAuth(input = {}) {
  const resolved = resolveGoogleOAuthConfig();
  if (!resolved.clientId || !resolved.clientSecret) {
    throw new Error("Google integration is not configured yet (clientId/clientSecret missing).");
  }

  const redirectUri = resolveRedirectUri();
  const configScopes = resolved.scopes && resolved.scopes.length ? resolved.scopes : DEFAULT_SCOPES;
  const requestedScopes = normalizeScopeList(input.scopes || []);
  const scopes = requestedScopes.length ? requestedScopes : configScopes;
  const loginHint = normalizeEmail(input.loginHint || input.account || "");
  const state = issueOauthState({ loginHint, scopes });
  const params = new URLSearchParams();
  params.set("client_id", resolved.clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", scopes.join(" "));
  params.set("access_type", "offline");
  params.set("include_granted_scopes", "true");
  params.set("prompt", "consent");
  params.set("state", state);
  if (loginHint) {
    params.set("login_hint", loginHint);
  }

  return {
    state,
    redirectUri,
    scopes,
    loginHint,
    authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`
  };
}

async function googleTokenRequest(payload) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }
  const response = await withGoogleNetworkRetries("google-token-request", () => fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  }));

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const msg = String(parsed?.error_description || parsed?.error || `HTTP ${response.status}` || "token_request_failed");
    throw new Error(`Google token request failed: ${msg}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Google token request returned invalid JSON.");
  }
  return parsed;
}

async function googleApiGetJson(url, accessToken) {
  const response = await withGoogleNetworkRetries("google-api-get-json", () => fetch(String(url), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  }));
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
    throw new Error("Google API returned invalid JSON.");
  }
  return parsed;
}

async function googleApiGetText(url, accessToken, options = {}) {
  const accept = String(options.accept || "text/plain").trim() || "text/plain";
  const response = await withGoogleNetworkRetries("google-api-get-text", () => fetch(String(url), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: accept
    }
  }));
  const text = await response.text();

  if (!response.ok) {
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_error) {
      parsed = null;
    }
    const msg = String(parsed?.error?.message || parsed?.error_description || parsed?.error || `HTTP ${response.status}`);
    throw new Error(msg);
  }

  return String(text || "");
}

function loadAccountsDoc() {
  const secret = getSecret(GOOGLE_ACCOUNTS_SECRET_NAME, { namespace: "owner" });
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
  setSecret(GOOGLE_ACCOUNTS_SECRET_NAME, payload, meta || {
    app: "Asolaria",
    component: "google-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });
}

function listConnectedAccounts() {
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
      expiresAt: expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : null,
      expiresInSec: expiresAtMs > 0 ? Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)) : null,
      updatedAt: String(safe.updatedAt || safe.createdAt || "").trim() || null
    };
  });
  rows.sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return rows;
}

async function fetchGmailProfile(accessToken) {
  const url = `${GMAIL_API_BASE}/users/me/profile`;
  const parsed = await googleApiGetJson(url, accessToken);
  return {
    emailAddress: normalizeEmail(parsed.emailAddress || "") || String(parsed.emailAddress || "").trim(),
    messagesTotal: Number.isFinite(Number(parsed.messagesTotal)) ? Number(parsed.messagesTotal) : null,
    threadsTotal: Number.isFinite(Number(parsed.threadsTotal)) ? Number(parsed.threadsTotal) : null,
    historyId: String(parsed.historyId || "").trim()
  };
}

function upsertAccountTokens(email, tokenResponse, meta) {
  const resolvedEmail = normalizeEmail(email);
  if (!resolvedEmail) {
    throw new Error("Google account email could not be resolved.");
  }
  const doc = loadAccountsDoc();
  const existing = doc.accounts[resolvedEmail] && typeof doc.accounts[resolvedEmail] === "object"
    ? doc.accounts[resolvedEmail]
    : {};
  const now = Date.now();
  const expiresIn = Number(tokenResponse?.expires_in || 0);
  const expiryDateMs = expiresIn > 0 ? now + expiresIn * 1000 : Number(existing.expiry_date_ms || 0);
  const refresh = String(tokenResponse?.refresh_token || "").trim();
  const record = {
    access_token: String(tokenResponse?.access_token || existing.access_token || "").trim(),
    refresh_token: refresh || String(existing.refresh_token || "").trim(),
    scope: String(tokenResponse?.scope || existing.scope || "").trim(),
    token_type: String(tokenResponse?.token_type || existing.token_type || "").trim() || "Bearer",
    expiry_date_ms: Number.isFinite(expiryDateMs) ? Math.max(0, Math.round(expiryDateMs)) : 0,
    createdAt: String(existing.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
  doc.accounts[resolvedEmail] = record;
  saveAccountsDoc(doc, meta);
  return record;
}

function resolveAccountEmail(requestedEmail) {
  const wanted = normalizeEmail(requestedEmail);
  const doc = loadAccountsDoc();
  const available = Object.keys(doc.accounts || {}).map((key) => normalizeEmail(key)).filter(Boolean);
  if (wanted) {
    if (!doc.accounts[wanted]) {
      throw new Error(`Google account is not connected: ${wanted}`);
    }
    return wanted;
  }
  const oauth = resolveGoogleOAuthConfig();
  const preferred = normalizeEmail(oauth.defaultAccount || "");
  if (preferred) {
    if (doc.accounts[preferred]) {
      return preferred;
    }
    const connected = available.length ? available.join(", ") : "none";
    throw new Error(`Google primary account is not connected: ${preferred}. Connected accounts: ${connected}. Re-run OAuth for the primary account.`);
  }
  if (available.length === 1) {
    return available[0];
  }
  if (available.length === 0) {
    throw new Error("No Google accounts are connected yet.");
  }
  throw new Error(`Multiple Google accounts are connected (${available.join(", ")}). Specify account email.`);
}

async function ensureAccessToken(accountEmail) {
  const resolvedEmail = resolveAccountEmail(accountEmail);
  const oauth = resolveGoogleOAuthConfig();
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error("Google integration is not configured yet (clientId/clientSecret missing).");
  }

  const doc = loadAccountsDoc();
  const record = doc.accounts[resolvedEmail];
  if (!record || typeof record !== "object") {
    throw new Error(`Google account is not connected: ${resolvedEmail}`);
  }
  const now = Date.now();
  const expiry = Number(record.expiry_date_ms || 0);
  const accessToken = String(record.access_token || "").trim();
  if (accessToken && expiry > now + 2 * 60 * 1000) {
    return { email: resolvedEmail, accessToken };
  }

  const refreshToken = String(record.refresh_token || "").trim();
  if (!refreshToken) {
    throw new Error(`Google refresh token missing for ${resolvedEmail}. Reconnect the account.`);
  }

  const refreshed = await googleTokenRequest({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  upsertAccountTokens(resolvedEmail, refreshed, {
    app: "Asolaria",
    component: "google-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "token-refresh"
  });

  const nextAccess = String(refreshed.access_token || "").trim();
  if (!nextAccess) {
    throw new Error("Google refresh did not return an access_token.");
  }
  return { email: resolvedEmail, accessToken: nextAccess };
}

async function completeGoogleOAuthCallback(input = {}) {
  const code = String(input.code || "").trim();
  const state = String(input.state || "").trim();
  if (!code) {
    throw new Error("OAuth callback missing code.");
  }
  if (!state) {
    throw new Error("OAuth callback missing state.");
  }
  const entry = consumeOauthState(state);
  const oauth = resolveGoogleOAuthConfig();
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error("Google integration is not configured yet (clientId/clientSecret missing).");
  }

  const redirectUri = resolveRedirectUri();
  let tokenResponse = null;
  try {
    tokenResponse = await googleTokenRequest({
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Google OAuth code exchange failed: ${message}`);
  }

  const accessToken = String(tokenResponse.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Google OAuth did not return an access_token.");
  }

  let profile = null;
  try {
    profile = await fetchGmailProfile(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Google Gmail profile lookup after OAuth failed: ${message}`);
  }
  const email = normalizeEmail(profile.emailAddress || entry.loginHint || "");
  if (!email) {
    throw new Error("Could not determine Google account email after OAuth.");
  }

  if (oauth.allowedAccounts && oauth.allowedAccounts.length > 0 && !oauth.allowedAccounts.includes(email)) {
    throw new Error(`Connected Google account is not allowed by policy: ${email}`);
  }

  const record = upsertAccountTokens(email, tokenResponse, {
    app: "Asolaria",
    component: "google-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "oauth-callback"
  });

  return {
    email,
    scopesGranted: String(record.scope || "").trim(),
    tokenType: String(record.token_type || "").trim(),
    expiresAt: record.expiry_date_ms ? new Date(Number(record.expiry_date_ms)).toISOString() : null,
    hasRefreshToken: Boolean(String(record.refresh_token || "").trim())
  };
}

function sanitizeText(text) {
  return String(text || "")
    .replace(/\bhttps?:\/\/\S+/gi, "[link omitted]")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickHeader(headers, name) {
  const wanted = String(name || "").toLowerCase();
  const rows = Array.isArray(headers) ? headers : [];
  const found = rows.find((row) => String(row?.name || "").toLowerCase() === wanted);
  return sanitizeText(found?.value || "");
}

function normalizeGmailMessage(msg) {
  const payload = msg?.payload && typeof msg.payload === "object" ? msg.payload : {};
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const internalDateMs = Number(msg?.internalDate || 0);
  const at = Number.isFinite(internalDateMs) && internalDateMs > 0
    ? new Date(internalDateMs).toISOString()
    : "";
  const snippetRaw = String(msg?.snippet || "");
  const snippet = clipText(sanitizeText(snippetRaw), 900);
  return {
    id: String(msg?.id || ""),
    threadId: String(msg?.threadId || ""),
    at: at || "",
    from: clipText(pickHeader(headers, "From"), 240),
    to: clipText(pickHeader(headers, "To"), 240),
    subject: clipText(pickHeader(headers, "Subject"), 240),
    date: clipText(pickHeader(headers, "Date"), 120),
    snippet,
    hasLinksRedacted: /\bhttps?:\/\/\S+/i.test(snippetRaw)
  };
}

function buildGmailDigest(accountEmail, messages, options = {}) {
  const maxChars = clampInt(options.maxChars, 24000, 2000, 120000);
  const lines = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const at = String(message.at || "").replace("T", " ").replace("Z", " UTC");
    const subject = message.subject ? `Subject: ${message.subject}` : "Subject: (none)";
    const from = message.from ? `From: ${message.from}` : "From: (unknown)";
    const snippet = message.snippet ? `Snippet: ${message.snippet}` : "";
    lines.push([at, from, subject, snippet].filter(Boolean).join(" | "));
  }
  const joined = lines.join("\n");
  const header = `Gmail digest for ${accountEmail} (${Array.isArray(messages) ? messages.length : 0} messages)\n`;
  const text = `${header}${joined}`;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

async function listGmailMessages(input = {}, policy = {}) {
  const limit = clampInt(input.limit, 12, 1, clampInt(policy.maxMessages, 40, 5, 80));
  const account = resolveAccountEmail(input.account || input.email || "");
  const { accessToken } = await ensureAccessToken(account);

  const params = new URLSearchParams();
  params.set("maxResults", String(limit));
  if (input.q) {
    params.set("q", String(input.q || "").trim());
  }
  const labelIds = Array.isArray(input.labelIds) ? input.labelIds : [];
  if (labelIds.length) {
    for (const label of labelIds) {
      const id = String(label || "").trim();
      if (id) {
        params.append("labelIds", id);
      }
    }
  }

  const listUrl = `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`;
  const listing = await googleApiGetJson(listUrl, accessToken);
  const items = Array.isArray(listing.messages) ? listing.messages : [];
  const ids = items.map((row) => String(row?.id || "").trim()).filter(Boolean).slice(0, limit);

  const messages = [];
  for (const id of ids) {
    const msgUrl = `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;
    const raw = await googleApiGetJson(msgUrl, accessToken);
    const normalized = normalizeGmailMessage(raw);
    if (normalized && normalized.id) {
      messages.push(normalized);
    }
  }

  const digest = buildGmailDigest(account, messages, {
    maxChars: clampInt(policy.maxDigestChars, 26000, 2000, 120000)
  });

  return {
    account,
    query: String(input.q || "").trim(),
    messageCount: messages.length,
    messages,
    digest
  };
}

async function listCalendars(input = {}) {
  const account = resolveAccountEmail(input.account || input.email || "");
  const { accessToken } = await ensureAccessToken(account);
  const maxResults = clampInt(input.limit, 50, 1, 250);
  const url = `${CALENDAR_API_BASE}/users/me/calendarList?maxResults=${maxResults}`;
  const parsed = await googleApiGetJson(url, accessToken);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const calendars = items.map((cal) => {
    return {
      id: String(cal?.id || ""),
      summary: clipText(sanitizeText(cal?.summary || ""), 200),
      primary: Boolean(cal?.primary),
      accessRole: String(cal?.accessRole || "")
    };
  });
  return {
    account,
    calendars
  };
}

function normalizeCalendarDateTime(value) {
  if (!value || typeof value !== "object") return "";
  const dt = String(value.dateTime || "").trim();
  const d = String(value.date || "").trim();
  return dt || d;
}

async function listUpcomingEvents(input = {}) {
  const account = resolveAccountEmail(input.account || input.email || "");
  const { accessToken } = await ensureAccessToken(account);
  const days = clampInt(input.days, 7, 1, 60);
  const limit = clampInt(input.limit, 20, 1, 80);
  const calendarId = String(input.calendarId || "primary").trim() || "primary";
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams();
  params.set("timeMin", now.toISOString());
  params.set("timeMax", end.toISOString());
  params.set("maxResults", String(limit));
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  params.set("showDeleted", "false");

  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const parsed = await googleApiGetJson(url, accessToken);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const events = items.map((event) => {
    const start = normalizeCalendarDateTime(event?.start);
    const endTime = normalizeCalendarDateTime(event?.end);
    const summary = clipText(sanitizeText(event?.summary || ""), 220);
    const location = clipText(sanitizeText(event?.location || ""), 240);
    const description = clipText(sanitizeText(event?.description || ""), 800);
    return {
      id: String(event?.id || ""),
      status: String(event?.status || ""),
      summary,
      start,
      end: endTime,
      location,
      description
    };
  });

  return {
    account,
    calendarId,
    window: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString()
    },
    eventCount: events.length,
    events
  };
}

function isAllowedGoogleApiHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  if (host === "www.googleapis.com") return true;
  if (host.endsWith(".googleapis.com")) return true;
  return false;
}

function redactLinksOnly(text) {
  return String(text || "").replace(/\bhttps?:\/\/\S+/gi, "[link omitted]");
}

function normalizeSearchTerms(query, maxTerms = 3) {
  const raw = String(query || "").toLowerCase();
  const tokens = raw.match(/[a-z0-9]{3,}/g) || [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "what",
    "when",
    "where",
    "who",
    "why",
    "how",
    "your",
    "you",
    "are",
    "was",
    "were",
    "will",
    "about",
    "into",
    "over",
    "under"
  ]);
  const unique = [];
  for (const token of tokens) {
    if (!token) continue;
    if (stop.has(token)) continue;
    if (unique.includes(token)) continue;
    unique.push(token);
    if (unique.length >= maxTerms) break;
  }
  return unique;
}

function escapeDriveQueryValue(value) {
  // Drive query strings use single quotes; avoid breaking out.
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .trim();
}

function buildDriveDocsQuery(query) {
  const terms = normalizeSearchTerms(query, 3);
  const chunks = [];
  for (const term of terms) {
    const escaped = escapeDriveQueryValue(term);
    if (!escaped) continue;
    chunks.push(`name contains '${escaped}'`);
    chunks.push(`fullText contains '${escaped}'`);
  }
  const termClause = chunks.length ? `(${chunks.join(" or ")}) and ` : "";
  return `${termClause}trashed = false and mimeType = 'application/vnd.google-apps.document'`;
}

async function searchDriveDocs(input = {}, policy = {}) {
  const limit = clampInt(input.limit, 5, 1, 20);
  const account = resolveAccountEmail(input.account || input.email || "");
  const { accessToken } = await ensureAccessToken(account);

  const q = buildDriveDocsQuery(input.query || input.q || "");
  const params = new URLSearchParams();
  params.set("pageSize", String(limit));
  params.set("q", q);
  params.set("fields", "files(id,name,mimeType,modifiedTime),nextPageToken");

  const url = `${DRIVE_API_BASE}/files?${params.toString()}`;
  const parsed = await googleApiGetJson(url, accessToken);
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const normalized = files.slice(0, limit).map((file) => {
    return {
      id: String(file?.id || "").trim(),
      name: clipText(sanitizeText(file?.name || ""), 180),
      mimeType: String(file?.mimeType || "").trim(),
      modifiedTime: String(file?.modifiedTime || "").trim()
    };
  }).filter((file) => Boolean(file.id));

  return {
    account,
    query: String(input.query || input.q || "").trim(),
    fileCount: normalized.length,
    files: normalized
  };
}

async function getGoogleDocPlainText(input = {}, policy = {}) {
  const account = resolveAccountEmail(input.account || input.email || "");
  const docId = String(input.docId || input.documentId || input.id || "").trim();
  if (!docId) {
    throw new Error("Google docId is required.");
  }
  const { accessToken } = await ensureAccessToken(account);
  const maxChars = clampInt(policy.maxChars, 9000, 800, 60000);

  const metaUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(docId)}?fields=id,name,mimeType,modifiedTime`;
  const meta = await googleApiGetJson(metaUrl, accessToken);
  const title = clipText(sanitizeText(meta?.name || ""), 200);
  const exportUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(docId)}/export?mimeType=text/plain`;
  const raw = await googleApiGetText(exportUrl, accessToken, { accept: "text/plain" });
  const extracted = redactLinksOnly(String(raw || ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const text = extracted.length > maxChars ? `${extracted.slice(0, Math.max(0, maxChars - 3))}...` : extracted;

  return {
    account,
    docId,
    title,
    text,
    truncated: extracted.length > maxChars
  };
}

function deepRedactLinks(value, options = {}, depth = 0) {
  const maxDepth = clampInt(options.maxDepth, 6, 1, 12);
  const maxEntries = clampInt(options.maxEntries, 220, 10, 2000);
  const maxString = clampInt(options.maxString, 1800, 120, 120000);

  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string") {
    return clipText(redactLinksOnly(value), maxString);
  }
  if (t === "number" || t === "boolean") return value;
  if (t !== "object") return clipText(String(value), maxString);

  if (depth >= maxDepth) {
    return Array.isArray(value) ? "[truncated]" : { truncated: true };
  }

  if (Array.isArray(value)) {
    const out = [];
    const slice = value.slice(0, maxEntries);
    for (const item of slice) {
      out.push(deepRedactLinks(item, options, depth + 1));
    }
    if (value.length > maxEntries) {
      out.push(`[truncated ${value.length - maxEntries} more items]`);
    }
    return out;
  }

  const entries = Object.entries(value);
  const out = {};
  const slice = entries.slice(0, maxEntries);
  for (const [key, item] of slice) {
    const safeKey = clipText(redactLinksOnly(key), 240);
    out[safeKey] = deepRedactLinks(item, options, depth + 1);
  }
  if (entries.length > maxEntries) {
    out._truncated = `[truncated ${entries.length - maxEntries} more keys]`;
  }
  return out;
}

function normalizeHttpMethod(value, fallback = "GET") {
  const method = String(value || fallback).trim().toUpperCase();
  if (!method) return "GET";
  if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return method;
  }
  throw new Error(`Google API request method is not allowed: ${method}`);
}

function prepareGoogleApiBody(bodyInput, maxBodyChars) {
  if (bodyInput === undefined || bodyInput === null || bodyInput === "") {
    return "";
  }
  let text = "";
  if (typeof bodyInput === "string") {
    text = bodyInput.trim();
  } else if (typeof bodyInput === "object") {
    try {
      text = JSON.stringify(bodyInput);
    } catch (_error) {
      throw new Error("Google API request body must be valid JSON.");
    }
  } else {
    throw new Error("Google API request body must be JSON object/array or JSON string.");
  }
  if (!text) {
    return "";
  }
  if (text.length > maxBodyChars) {
    throw new Error(`Google API request body exceeds ${maxBodyChars} characters.`);
  }
  try {
    JSON.parse(text);
  } catch (_error) {
    throw new Error("Google API request body must parse as JSON.");
  }
  return text;
}

async function googleApiRequest(input = {}, policy = {}) {
  const account = resolveAccountEmail(input.account || input.email || "");
  const rawUrl = String(input.url || "").trim();
  if (!rawUrl) {
    throw new Error("Google API request requires a url.");
  }
  const method = normalizeHttpMethod(input.method || "GET");
  const maxBodyChars = clampInt(policy.maxBodyChars, 90000, 200, 300000);
  const requestBody = prepareGoogleApiBody(input.body, maxBodyChars);
  if (method === "GET" && requestBody) {
    throw new Error("Google API request body is not allowed for GET.");
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_error) {
    parsedUrl = null;
  }
  if (!parsedUrl) {
    throw new Error("Google API request url is not valid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Google API requests must use https.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Google API request url must not include credentials.");
  }
  if (parsedUrl.port && parsedUrl.port !== "443") {
    throw new Error("Google API request url must not include a custom port.");
  }
  if (!isAllowedGoogleApiHost(parsedUrl.hostname)) {
    throw new Error("Google API request host is not allowed (only *.googleapis.com).");
  }

  const { accessToken } = await ensureAccessToken(account);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json"
  };
  if (requestBody) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  const response = await fetch(parsedUrl.toString(), {
    method,
    headers,
    body: requestBody || undefined
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const msg = String(parsed?.error?.message || parsed?.error_description || parsed?.error || clipText(text, 600) || `HTTP ${response.status}`);
    if (/insufficient authentication scopes?/i.test(msg)) {
      throw new Error(`${msg} Re-run Google OAuth consent with the required scopes.`);
    }
    throw new Error(msg);
  }

  const safe = deepRedactLinks(parsed !== null ? parsed : text, {
    maxDepth: clampInt(policy.maxDepth, 6, 1, 12),
    maxEntries: clampInt(policy.maxEntries, 220, 10, 2000),
    maxString: clampInt(policy.maxString, 1800, 120, 120000)
  });

  return {
    account,
    method,
    url: parsedUrl.toString(),
    status: response.status,
    data: safe
  };
}

function getGoogleIntegrationStatus(policy = {}) {
  const summary = getGoogleConfigSummary(policy);
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

module.exports = {
  GOOGLE_OAUTH_SECRET_NAME,
  GOOGLE_ACCOUNTS_SECRET_NAME,
  DEFAULT_SCOPES,
  ensureAccessToken,
  getGoogleConfigSummary,
  setGoogleOAuthConfig,
  startGoogleOAuth,
  completeGoogleOAuthCallback,
  listGmailMessages,
  listCalendars,
  listUpcomingEvents,
  searchDriveDocs,
  getGoogleDocPlainText,
  googleApiRequest,
  getGoogleIntegrationStatus
};
