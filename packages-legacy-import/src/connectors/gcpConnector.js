const crypto = require("crypto");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const GCP_SERVICE_ACCOUNT_SECRET = "integrations.gcp.service_account";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Default is intentionally read-only. Add broader scopes only when needed.
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform.read-only"
];

const DEFAULT_ALLOWED_ADMIN_SERVICES = [
  "serviceusage.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iam.googleapis.com",
  "aiplatform.googleapis.com",
  "discoveryengine.googleapis.com",
  "generativelanguage.googleapis.com",
  "speech.googleapis.com",
  "texttospeech.googleapis.com",
  "drive.googleapis.com",
  "docs.googleapis.com",
  "gmail.googleapis.com",
  "calendar-json.googleapis.com"
];

const tokenCache = new Map(); // scopeKey -> { accessToken, expiresAtMs }

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 1200) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeScope(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Common non-URL OpenID scopes.
  if (raw === "openid" || raw === "email" || raw === "profile") {
    return raw;
  }

  // Keep strict: most Google API scopes are URLs under www.googleapis.com/auth/...
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

function normalizeProjectId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^projects\//i, "");
}

function normalizeServiceName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9.-]+\.googleapis\.com$/.test(raw)) return "";
  return raw;
}

function normalizeServiceNameList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const normalized = items
    .map((item) => normalizeServiceName(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeProjectNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{6,22}$/.test(raw)) return "";
  return raw;
}

function normalizeProjectKey(value) {
  const raw = normalizeProjectId(value);
  if (!raw) return "";
  return /^\d+$/.test(raw) ? raw : raw.toLowerCase();
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "*".repeat(text.length);
  return `${text.slice(0, 4)}${"*".repeat(Math.max(4, text.length - 8))}${text.slice(-4)}`;
}

function resolveServiceAccountConfig() {
  const secret = getSecret(GCP_SERVICE_ACCOUNT_SECRET, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const sa = value.serviceAccount && typeof value.serviceAccount === "object" ? value.serviceAccount : {};
  const envAllowedAdminServices = normalizeServiceNameList(process.env.ASOLARIA_GCP_ALLOWED_ADMIN_SERVICES || "");

  const clientEmail = String(sa.client_email || "").trim();
  const privateKey = String(sa.private_key || "").trim();
  const projectId = String(sa.project_id || "").trim();
  const projectNumber = normalizeProjectNumber(value.projectNumber || "");
  const privateKeyId = String(sa.private_key_id || "").trim();
  const clientId = String(sa.client_id || "").trim();

  const defaultProject = normalizeProjectId(value.defaultProject || projectId);
  const allowedProjects = Array.isArray(value.allowedProjects)
    ? value.allowedProjects.map((p) => normalizeProjectId(p)).filter(Boolean)
    : normalizeProjectId(value.allowedProjects || "");
  const defaultScopes = normalizeScopeList(value.defaultScopes || value.scopes || []);
  const allowedAdminServicesRaw = value.allowedAdminServices === undefined
    ? envAllowedAdminServices
    : value.allowedAdminServices;
  let allowedAdminServices = normalizeServiceNameList(allowedAdminServicesRaw || []);
  if (!allowedAdminServices.length) {
    allowedAdminServices = DEFAULT_ALLOWED_ADMIN_SERVICES.slice(0);
  }

  return {
    serviceAccount: sa,
    clientEmail,
    privateKey,
    projectId,
    projectNumber,
    privateKeyId,
    clientId,
    defaultProject,
    allowedProjects: Array.isArray(allowedProjects) ? Array.from(new Set(allowedProjects)) : (allowedProjects ? [allowedProjects] : []),
    defaultScopes,
    allowedAdminServices,
    updatedAt: secret?.updatedAt || null,
    source: clientEmail && privateKey ? "vault" : "none"
  };
}

function enforceAllowedProjects(project) {
  const resolved = resolveServiceAccountConfig();
  const allowed = Array.isArray(resolved.allowedProjects) ? resolved.allowedProjects : [];
  if (!allowed.length) {
    return;
  }
  const wanted = normalizeProjectKey(project);
  const allowedKeys = allowed.map(normalizeProjectKey).filter(Boolean);
  if (!wanted || !allowedKeys.includes(wanted)) {
    throw new Error(`Project ${project || "(missing)"} is not allowed. Allowed projects: ${allowed.join(", ")}`);
  }
}

function getGcpConfigSummary(policy = {}) {
  const resolved = resolveServiceAccountConfig();
  const scopes = resolved.defaultScopes.length ? resolved.defaultScopes : DEFAULT_SCOPES;
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.clientEmail && resolved.privateKey),
    configSource: resolved.source,
    clientEmail: resolved.clientEmail,
    projectId: resolved.projectId,
    projectNumber: resolved.projectNumber,
    privateKeyIdHint: resolved.privateKeyId ? maskSecret(resolved.privateKeyId) : "",
    defaultProject: resolved.defaultProject,
    allowedProjects: resolved.allowedProjects,
    defaultScopes: scopes,
    allowedAdminServices: resolved.allowedAdminServices,
    updatedAt: resolved.updatedAt || null
  };
}

function parseServiceAccountJson(rawJson) {
  const text = String(rawJson || "").trim();
  if (!text) {
    throw new Error("Service account JSON is required.");
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Service account JSON is invalid.");
  }

  const type = String(parsed.type || "").trim();
  const clientEmail = String(parsed.client_email || "").trim();
  const privateKey = String(parsed.private_key || "").trim();
  if (type !== "service_account") {
    throw new Error("Service account JSON type must be \"service_account\".");
  }
  if (!clientEmail || !clientEmail.includes("@")) {
    throw new Error("Service account JSON is missing client_email.");
  }
  if (!privateKey || !privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Service account JSON is missing private_key.");
  }

  return {
    type,
    project_id: String(parsed.project_id || "").trim(),
    private_key_id: String(parsed.private_key_id || "").trim(),
    private_key: privateKey,
    client_email: clientEmail,
    client_id: String(parsed.client_id || "").trim()
  };
}

function setGcpServiceAccountConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(GCP_SERVICE_ACCOUNT_SECRET, { namespace: "owner" });
    tokenCache.clear();
    return getGcpConfigSummary();
  }

  const current = resolveServiceAccountConfig();
  const serviceAccountJson = String(input.serviceAccountJson || input.json || "").trim();
  const hasServiceAccountJson = Boolean(serviceAccountJson);
  let serviceAccount = null;
  if (hasServiceAccountJson) {
    serviceAccount = parseServiceAccountJson(serviceAccountJson);
  } else if (current.clientEmail && current.privateKey) {
    serviceAccount = {
      type: "service_account",
      project_id: String(current.projectId || "").trim(),
      private_key_id: String(current.privateKeyId || "").trim(),
      private_key: String(current.privateKey || "").trim(),
      client_email: String(current.clientEmail || "").trim(),
      client_id: String(current.clientId || "").trim()
    };
  } else {
    throw new Error("Service account JSON is required.");
  }

  const hasDefaultProjectInput = Object.prototype.hasOwnProperty.call(input, "defaultProject")
    || Object.prototype.hasOwnProperty.call(input, "projectId");
  const defaultProjectCandidate = normalizeProjectId(input.defaultProject || input.projectId || "");
  const defaultProject = hasDefaultProjectInput
    ? defaultProjectCandidate
    : (normalizeProjectId(current.defaultProject || current.projectId || serviceAccount.project_id || ""));

  const hasAllowedProjectsInput = Object.prototype.hasOwnProperty.call(input, "allowedProjects");
  let allowedProjectsList = [];
  if (hasAllowedProjectsInput) {
    const allowed = Array.isArray(input.allowedProjects)
      ? input.allowedProjects
      : String(input.allowedProjects || "").trim();
    allowedProjectsList = Array.isArray(allowed)
      ? allowed.map((p) => normalizeProjectId(p)).filter(Boolean)
      : String(allowed || "")
        .split(/[,;\n]/)
        .map((p) => normalizeProjectId(p))
        .filter(Boolean);
  } else {
    allowedProjectsList = Array.isArray(current.allowedProjects) ? current.allowedProjects : [];
  }

  const hasDefaultScopesInput = Object.prototype.hasOwnProperty.call(input, "defaultScopes")
    || Object.prototype.hasOwnProperty.call(input, "scopes");
  const defaultScopes = hasDefaultScopesInput
    ? normalizeScopeList(input.defaultScopes || input.scopes || [])
    : (Array.isArray(current.defaultScopes) ? current.defaultScopes : []);

  const hasAllowedAdminServicesInput = Object.prototype.hasOwnProperty.call(input, "allowedAdminServices")
    || Object.prototype.hasOwnProperty.call(input, "allowedMutationServices");
  const allowedAdminServices = hasAllowedAdminServicesInput
    ? normalizeServiceNameList(input.allowedAdminServices || input.allowedMutationServices || [])
    : (Array.isArray(current.allowedAdminServices) ? current.allowedAdminServices : DEFAULT_ALLOWED_ADMIN_SERVICES);

  const hasProjectNumberInput = Object.prototype.hasOwnProperty.call(input, "projectNumber");
  const projectNumber = hasProjectNumberInput
    ? normalizeProjectNumber(input.projectNumber || "")
    : normalizeProjectNumber(current.projectNumber || "");

  setSecret(GCP_SERVICE_ACCOUNT_SECRET, {
    serviceAccount,
    defaultProject,
    allowedProjects: Array.from(new Set(allowedProjectsList)),
    defaultScopes,
    allowedAdminServices,
    projectNumber,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "gcp-service-account",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  tokenCache.clear();
  return getGcpConfigSummary();
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signJwt(payload, privateKeyPem) {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${message}.${base64url(signature)}`;
}

function scopesCacheKey(scopes) {
  const normalized = normalizeScopeList(scopes);
  return normalized.slice().sort().join(" ");
}

async function fetchServiceAccountToken({ clientEmail, privateKey, scopes }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 3600; // max 1 hour
  const scopeList = normalizeScopeList(scopes);
  if (!scopeList.length) {
    throw new Error("At least one OAuth scope is required for service account token.");
  }

  const assertion = signJwt({
    iss: clientEmail,
    scope: scopeList.join(" "),
    aud: GOOGLE_TOKEN_URL,
    exp: expSec,
    iat: nowSec
  }, privateKey);

  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  body.set("assertion", assertion);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
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
    throw new Error(`Service account token request failed: ${msg}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Service account token request returned invalid JSON.");
  }

  const accessToken = String(parsed.access_token || "").trim();
  const expiresIn = Number(parsed.expires_in || 0);
  if (!accessToken) {
    throw new Error("Service account token response missing access_token.");
  }
  const expiresAtMs = expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + 55 * 60 * 1000;

  return { accessToken, expiresAtMs };
}

async function getServiceAccountAccessToken(scopes) {
  const resolved = resolveServiceAccountConfig();
  if (!resolved.clientEmail || !resolved.privateKey) {
    throw new Error("GCP service account is not configured.");
  }

  const scopeKey = scopesCacheKey(scopes && scopes.length ? scopes : resolved.defaultScopes);
  const effectiveScopes = scopeKey ? scopeKey.split(" ").filter(Boolean) : (resolved.defaultScopes.length ? resolved.defaultScopes : DEFAULT_SCOPES);

  const cached = tokenCache.get(scopeKey);
  const now = Date.now();
  if (cached && cached.accessToken && cached.expiresAtMs > now + 2 * 60 * 1000) {
    return { accessToken: cached.accessToken, scopes: effectiveScopes };
  }

  const fresh = await fetchServiceAccountToken({
    clientEmail: resolved.clientEmail,
    privateKey: resolved.privateKey,
    scopes: effectiveScopes
  });
  tokenCache.set(scopeKey, fresh);
  return { accessToken: fresh.accessToken, scopes: effectiveScopes };
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

function deepRedactLinks(value, options = {}, depth = 0) {
  const maxDepth = clampInt(options.maxDepth, 6, 1, 12);
  const maxEntries = clampInt(options.maxEntries, 240, 10, 4000);
  const maxString = clampInt(options.maxString, 2000, 120, 120000);

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

async function googleApiFetchJson(url, accessToken, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json"
  };
  let body = undefined;
  if (options.body !== undefined && options.body !== null && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(String(url), {
    method,
    headers,
    body
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
  if (!text) {
    return null;
  }
  if (parsed && typeof parsed === "object") {
    return parsed;
  }
  // Some Google APIs can return non-JSON text bodies even on success.
  return { raw: clipText(redactLinksOnly(text), 6000), nonJson: true };
}

function looksLikePermissionDenied(message) {
  const text = String(message || "");
  return /permission[ _-]?denied/i.test(text) || /PERMISSION_DENIED/i.test(text);
}

function buildServiceUsageRoleHint({ project, action, principalEmail, roleId, roleName }) {
  const proj = normalizeProjectId(project);
  const principal = String(principalEmail || "").trim();
  const role = String(roleId || "").trim();
  const roleLabel = roleName ? `${roleName} (${role})` : role;

  const lines = [];
  lines.push(`GCP: Permission denied while trying to ${action} on project ${proj || project}.`);
  if (principal) {
    lines.push(`Service account: ${principal}`);
  }
  if (roleLabel) {
    lines.push(`Required IAM role: ${roleLabel}`);
  }
  lines.push("");
  lines.push("Fix (Console): IAM & Admin -> IAM -> Grant access -> add the service account above -> assign the role -> Save.");
  if (proj && principal && role) {
    lines.push("");
    lines.push("Fix (CLI):");
    lines.push(`gcloud projects add-iam-policy-binding ${proj} --member=\"serviceAccount:${principal}\" --role=\"${role}\"`);
  }
  return clipText(lines.join("\n"), 1800);
}

async function gcpApiRequest(input = {}, policy = {}) {
  const method = String(input.method || "GET").trim().toUpperCase() || "GET";
  const urlRaw = String(input.url || "").trim();
  if (!urlRaw) {
    throw new Error("url is required.");
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(urlRaw);
  } catch (_error) {
    parsedUrl = null;
  }
  if (!parsedUrl) {
    throw new Error("url is not valid.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only https URLs are allowed.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URL must not include credentials.");
  }
  if (parsedUrl.port && parsedUrl.port !== "443") {
    throw new Error("URL must not include a custom port.");
  }
  if (!isAllowedGoogleApiHost(parsedUrl.hostname)) {
    throw new Error("Host is not allowed (only *.googleapis.com).");
  }

  const { accessToken, scopes } = await getServiceAccountAccessToken(input.scopes);

  const body = input.body;
  if ((method === "GET" || method === "HEAD") && body !== undefined && body !== null && String(body) !== "") {
    throw new Error("GET/HEAD requests must not include a body.");
  }
  if (body !== undefined && body !== null) {
    // Keep it strict: require JSON objects/arrays for safety.
    const t = typeof body;
    if (!(t === "object")) {
      throw new Error("body must be a JSON object or array.");
    }
    const lengthHint = JSON.stringify(body).length;
    if (lengthHint > clampInt(policy.maxBodyChars, 90000, 2000, 500000)) {
      throw new Error("body is too large.");
    }
  }

  const data = await googleApiFetchJson(parsedUrl.toString(), accessToken, {
    method,
    body
  });

  const safe = deepRedactLinks(data, {
    maxDepth: clampInt(policy.maxDepth, 6, 1, 12),
    maxEntries: clampInt(policy.maxEntries, 240, 10, 4000),
    maxString: clampInt(policy.maxString, 2000, 120, 120000)
  });

  return {
    method,
    url: parsedUrl.toString(),
    scopes,
    data: safe
  };
}

async function listEnabledServices(input = {}, policy = {}) {
  const project = normalizeProjectId(input.project || input.projectId || input.projectNumber || "");
  if (!project) {
    throw new Error("project is required.");
  }
  enforceAllowedProjects(project);

  const pageSize = clampInt(input.pageSize, 60, 1, 200);
  const pageToken = String(input.pageToken || "").trim();
  const url = new URL(`https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(project)}/services`);
  url.searchParams.set("filter", "state:ENABLED");
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  let result = null;
  try {
    result = await gcpApiRequest({
      method: "GET",
      url: url.toString(),
      scopes: policy.scopes
    }, policy);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (looksLikePermissionDenied(message)) {
      const resolved = resolveServiceAccountConfig();
      const hint = buildServiceUsageRoleHint({
        project,
        action: "list enabled APIs (Service Usage)",
        principalEmail: resolved.clientEmail,
        roleId: "roles/serviceusage.serviceUsageViewer",
        roleName: "Service Usage Viewer"
      });
      throw new Error(`${message}\n\n${hint}`.trim());
    }
    throw error;
  }

  const raw = result.data && typeof result.data === "object" ? result.data : {};
  const services = Array.isArray(raw.services) ? raw.services : [];
  const nextPageToken = String(raw.nextPageToken || "").trim();
  return {
    project,
    services: services.map((svc) => {
      const name = String(svc?.config?.name || svc?.name || "").trim();
      const state = String(svc?.state || "").trim();
      return { name, state };
    }).filter((svc) => svc.name),
    nextPageToken: nextPageToken || "",
    hasMore: Boolean(nextPageToken)
  };
}

async function enableService(input = {}, policy = {}) {
  const project = normalizeProjectId(input.project || input.projectId || input.projectNumber || "");
  const serviceName = normalizeServiceName(input.serviceName || input.service || "");
  if (!project) {
    throw new Error("project is required.");
  }
  enforceAllowedProjects(project);
  if (!serviceName) {
    throw new Error("serviceName must look like example.googleapis.com");
  }

  const resolved = resolveServiceAccountConfig();
  const allowedAdminServices = Array.isArray(resolved.allowedAdminServices)
    ? normalizeServiceNameList(resolved.allowedAdminServices)
    : [];
  if (allowedAdminServices.length && !allowedAdminServices.includes(serviceName)) {
    throw new Error(
      `Service ${serviceName} is not in allowedAdminServices. Allowed: ${allowedAdminServices.join(", ")}`
    );
  }

  const url = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(project)}/services/${encodeURIComponent(serviceName)}:enable`;
  let result = null;
  try {
    result = await gcpApiRequest({
      method: "POST",
      url,
      body: {},
      scopes: policy.scopes
    }, policy);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (looksLikePermissionDenied(message)) {
      const resolved = resolveServiceAccountConfig();
      const hint = buildServiceUsageRoleHint({
        project,
        action: `enable API ${serviceName}`,
        principalEmail: resolved.clientEmail,
        roleId: "roles/serviceusage.serviceUsageAdmin",
        roleName: "Service Usage Admin"
      });
      throw new Error(`${message}\n\n${hint}`.trim());
    }
    throw error;
  }

  return {
    project,
    serviceName,
    operation: result.data || null
  };
}

module.exports = {
  DEFAULT_SCOPES,
  getGcpConfigSummary,
  setGcpServiceAccountConfig,
  getServiceAccountAccessToken,
  gcpApiRequest,
  listEnabledServices,
  enableService
};
