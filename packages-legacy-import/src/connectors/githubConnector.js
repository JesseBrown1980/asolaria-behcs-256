const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const GITHUB_SECRET_NAME = "integrations.github";
const DEFAULT_API_BASE = "https://api.github.com";

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  if (!token) return "";
  if (token.length < 20) return "";
  if (/\s/.test(token)) return "";

  // Common GitHub token prefixes (classic + fine-grained).
  if (/^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}$/.test(token)) return token;
  if (/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) return token;

  return "";
}

function maskToken(token) {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 10) return "*".repeat(value.length);
  return `${value.slice(0, 6)}${"*".repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

function resolveGithubConfig() {
  const envToken = normalizeToken(
    process.env.ASOLARIA_GITHUB_TOKEN
    || process.env.ASOLARIA_GITHUB_API_KEY
    || ""
  );
  const envBaseUrl = normalizeBaseUrl(process.env.ASOLARIA_GITHUB_API_URL || process.env.ASOLARIA_GITHUB_API_BASE || DEFAULT_API_BASE);
  const envDefaultOwner = String(process.env.ASOLARIA_GITHUB_DEFAULT_OWNER || "").trim();
  const envDefaultRepo = String(process.env.ASOLARIA_GITHUB_DEFAULT_REPO || "").trim();

  if (envToken) {
    return {
      token: envToken,
      source: "env",
      updatedAt: null,
      baseUrl: envBaseUrl || DEFAULT_API_BASE,
      defaultOwner: envDefaultOwner,
      defaultRepo: envDefaultRepo
    };
  }

  const secret = getSecret(GITHUB_SECRET_NAME, { namespace: "owner" });
  const vaultToken = normalizeToken(secret?.value?.token || secret?.value?.pat || "");
  const vaultBaseUrl = normalizeBaseUrl(secret?.value?.baseUrl || DEFAULT_API_BASE);
  if (vaultToken) {
    return {
      token: vaultToken,
      source: "vault",
      updatedAt: secret.updatedAt || null,
      baseUrl: vaultBaseUrl || DEFAULT_API_BASE,
      defaultOwner: String(secret.value?.defaultOwner || "").trim(),
      defaultRepo: String(secret.value?.defaultRepo || "").trim()
    };
  }

  return {
    token: "",
    source: "none",
    updatedAt: null,
    baseUrl: envBaseUrl || DEFAULT_API_BASE,
    defaultOwner: envDefaultOwner,
    defaultRepo: envDefaultRepo
  };
}

function getGithubConfigSummary(policy = {}) {
  const resolved = resolveGithubConfig();
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.token),
    tokenSource: resolved.source,
    tokenHint: maskToken(resolved.token),
    baseUrl: resolved.baseUrl || DEFAULT_API_BASE,
    defaultOwner: resolved.defaultOwner || "",
    defaultRepo: resolved.defaultRepo || "",
    updatedAt: resolved.updatedAt || null
  };
}

function setGithubConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(GITHUB_SECRET_NAME, { namespace: "owner" });
    return getGithubConfigSummary();
  }

  const token = normalizeToken(input.token || input.pat || input.apiKey);
  if (!token) {
    throw new Error("A valid GitHub token is required (expected ghp_/gho_/github_pat_...).");
  }

  const payload = {
    token,
    baseUrl: normalizeBaseUrl(input.baseUrl || input.apiBaseUrl || DEFAULT_API_BASE) || DEFAULT_API_BASE,
    defaultOwner: String(input.defaultOwner || "").trim(),
    defaultRepo: String(input.defaultRepo || "").trim(),
    updatedAt: new Date().toISOString()
  };

  setSecret(
    GITHUB_SECRET_NAME,
    payload,
    {
      app: "Asolaria",
      component: "github-integration",
      credentialOwner: "owner",
      actor: "owner",
      updatedBy: "api"
    },
    { namespace: "owner" }
  );

  return getGithubConfigSummary();
}

async function githubApiCall(pathname, options = {}) {
  const resolved = resolveGithubConfig();
  if (!resolved.token) {
    throw new Error("GitHub integration is not configured.");
  }

  const method = String(options.method || "GET").trim().toUpperCase();
  const query = options.query && typeof options.query === "object" ? options.query : null;
  const body = options.body === undefined ? undefined : options.body;

  const base = normalizeBaseUrl(options.baseUrl || resolved.baseUrl || DEFAULT_API_BASE) || DEFAULT_API_BASE;
  const url = new URL(String(pathname || "/").startsWith("/") ? String(pathname) : `/${pathname}`, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(String(key), String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${resolved.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Asolaria/0.1",
      ...(body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : null)
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const scopes = String(response.headers.get("x-oauth-scopes") || "").trim();
  const rateRemaining = String(response.headers.get("x-ratelimit-remaining") || "").trim();
  const rateReset = String(response.headers.get("x-ratelimit-reset") || "").trim();

  let parsed;
  const text = await response.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const msg = typeof parsed?.message === "string"
      ? parsed.message
      : typeof parsed?.error?.message === "string"
        ? parsed.error.message
        : text;
    throw new Error(`GitHub API ${method} ${url.pathname} HTTP ${response.status}: ${String(msg || "request failed").slice(0, 260)}`);
  }

  return {
    ok: true,
    data: parsed,
    meta: {
      scopes,
      rateRemaining: rateRemaining ? Number(rateRemaining) : null,
      rateReset: rateReset ? Number(rateReset) : null
    }
  };
}

function normalizeRepo(repo) {
  return {
    id: Number(repo?.id || 0) || null,
    name: String(repo?.name || ""),
    fullName: String(repo?.full_name || ""),
    private: Boolean(repo?.private),
    fork: Boolean(repo?.fork),
    archived: Boolean(repo?.archived),
    defaultBranch: String(repo?.default_branch || ""),
    htmlUrl: String(repo?.html_url || ""),
    updatedAt: String(repo?.updated_at || "")
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function getGithubIntegrationStatus(policy = {}) {
  const summary = getGithubConfigSummary(policy);
  const status = {
    ...summary,
    connection: {
      ok: false,
      error: summary.configured ? "not_tested" : "not_configured"
    },
    user: null,
    meta: null
  };
  if (!summary.enabled || !summary.configured) {
    return status;
  }

  try {
    const whoami = await githubApiCall("/user", { method: "GET" });
    const user = whoami?.data || {};
    status.connection.ok = true;
    status.connection.error = "";
    status.user = {
      login: String(user.login || ""),
      id: Number(user.id || 0) || null,
      name: String(user.name || ""),
      url: String(user.html_url || "")
    };
    status.meta = whoami.meta || null;
  } catch (error) {
    status.connection.ok = false;
    status.connection.error = String(error?.message || error || "auth_failed");
  }
  return status;
}

async function listGithubRepos(input = {}, policy = {}) {
  if (policy.enabled === false) {
    throw new Error("GitHub integration is disabled by policy.");
  }

  const limit = clampInt(input.limit, 30, 1, 100);
  const response = await githubApiCall("/user/repos", {
    method: "GET",
    query: {
      per_page: limit,
      sort: "updated",
      direction: "desc"
    }
  });

  const repos = Array.isArray(response?.data) ? response.data.map(normalizeRepo) : [];
  return {
    repos,
    meta: response.meta || null
  };
}

module.exports = {
  GITHUB_SECRET_NAME,
  getGithubConfigSummary,
  setGithubConfig,
  getGithubIntegrationStatus,
  listGithubRepos
};

