const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const { getGcpConfigSummary, gcpApiRequest } = require("./gcpConnector");

const VERTEX_CONFIG_SECRET = "integrations.vertex.gemini";
const VERTEX_BUDGET_CONFIG_SECRET = "integrations.vertex.budget_config";
const VERTEX_BUDGET_USAGE_SECRET = "integrations.vertex.budget_usage";

const DEFAULT_VERTEX_MAX_OUTPUT_TOKENS = 600;
const DEFAULT_BUDGET_CONFIG = Object.freeze({
  enabled: true,
  maxRequestsPerDay: 40,
  maxPromptTokensPerDay: 120000,
  maxOutputTokensPerDay: 40000,
  warnPercent: 80
});

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 1200) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeProjectId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^projects\//i, "");
}

function normalizeProjectKey(value) {
  const raw = normalizeProjectId(value);
  if (!raw) return "";
  return /^\d+$/.test(raw) ? raw : raw.toLowerCase();
}

function normalizeLocation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9-]{2,40}$/i.test(raw)) return "";
  return raw;
}

function normalizeModel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z0-9._-]{3,80}$/i.test(raw)) return "";
  return raw;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).trim().toLowerCase() !== "false";
}

function normalizeBudgetLimit(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return clampInt(value, fallback, 0, 20000000);
}

function normalizeWarnPercent(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return clampInt(value, fallback, 50, 99);
}

function toUtcDayString(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isDayString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function resolveVertexConfig() {
  const envEnabled = process.env.ASOLARIA_VERTEX_ENABLED;
  const envProject = normalizeProjectId(process.env.ASOLARIA_VERTEX_PROJECT || "");
  const envLocation = normalizeLocation(process.env.ASOLARIA_VERTEX_LOCATION || "");
  const envModel = normalizeModel(process.env.ASOLARIA_VERTEX_MODEL || "");

  if (envEnabled !== undefined || envProject || envLocation || envModel) {
    return {
      enabled: String(envEnabled || "true").toLowerCase() !== "false",
      project: envProject,
      location: envLocation,
      model: envModel,
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(VERTEX_CONFIG_SECRET, { namespace: "owner" });
  const value = secret && typeof secret.value === "object" ? secret.value : {};
  return {
    enabled: value.enabled !== false,
    project: normalizeProjectId(value.project || value.defaultProject || ""),
    location: normalizeLocation(value.location || "") || "",
    model: normalizeModel(value.model || "") || "",
    source: secret ? "vault" : "none",
    updatedAt: secret && secret.updatedAt ? secret.updatedAt : null
  };
}

function hasBudgetEnvOverride() {
  return [
    process.env.ASOLARIA_VERTEX_BUDGET_ENABLED,
    process.env.ASOLARIA_VERTEX_BUDGET_MAX_REQUESTS_PER_DAY,
    process.env.ASOLARIA_VERTEX_BUDGET_MAX_PROMPT_TOKENS_PER_DAY,
    process.env.ASOLARIA_VERTEX_BUDGET_MAX_OUTPUT_TOKENS_PER_DAY,
    process.env.ASOLARIA_VERTEX_BUDGET_WARN_PERCENT
  ].some((v) => v !== undefined && v !== null && String(v).trim() !== "");
}

function resolveVertexBudgetConfig() {
  if (hasBudgetEnvOverride()) {
    return {
      enabled: toBool(process.env.ASOLARIA_VERTEX_BUDGET_ENABLED, DEFAULT_BUDGET_CONFIG.enabled),
      maxRequestsPerDay: normalizeBudgetLimit(process.env.ASOLARIA_VERTEX_BUDGET_MAX_REQUESTS_PER_DAY, DEFAULT_BUDGET_CONFIG.maxRequestsPerDay),
      maxPromptTokensPerDay: normalizeBudgetLimit(process.env.ASOLARIA_VERTEX_BUDGET_MAX_PROMPT_TOKENS_PER_DAY, DEFAULT_BUDGET_CONFIG.maxPromptTokensPerDay),
      maxOutputTokensPerDay: normalizeBudgetLimit(process.env.ASOLARIA_VERTEX_BUDGET_MAX_OUTPUT_TOKENS_PER_DAY, DEFAULT_BUDGET_CONFIG.maxOutputTokensPerDay),
      warnPercent: normalizeWarnPercent(process.env.ASOLARIA_VERTEX_BUDGET_WARN_PERCENT, DEFAULT_BUDGET_CONFIG.warnPercent),
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(VERTEX_BUDGET_CONFIG_SECRET, { namespace: "owner" });
  const value = secret && typeof secret.value === "object" ? secret.value : {};
  return {
    enabled: toBool(value.enabled, DEFAULT_BUDGET_CONFIG.enabled),
    maxRequestsPerDay: normalizeBudgetLimit(value.maxRequestsPerDay, DEFAULT_BUDGET_CONFIG.maxRequestsPerDay),
    maxPromptTokensPerDay: normalizeBudgetLimit(value.maxPromptTokensPerDay, DEFAULT_BUDGET_CONFIG.maxPromptTokensPerDay),
    maxOutputTokensPerDay: normalizeBudgetLimit(value.maxOutputTokensPerDay, DEFAULT_BUDGET_CONFIG.maxOutputTokensPerDay),
    warnPercent: normalizeWarnPercent(value.warnPercent, DEFAULT_BUDGET_CONFIG.warnPercent),
    source: secret ? "vault" : "defaults",
    updatedAt: secret && secret.updatedAt ? secret.updatedAt : null
  };
}

function readBudgetUsageRecord() {
  const secret = getSecret(VERTEX_BUDGET_USAGE_SECRET, { namespace: "owner" });
  const value = secret && typeof secret.value === "object" ? secret.value : {};
  return {
    day: isDayString(value.day) ? value.day : "",
    requests: clampInt(value.requests, 0, 0, 20000000),
    promptTokens: clampInt(value.promptTokens, 0, 0, 2000000000),
    outputTokens: clampInt(value.outputTokens, 0, 0, 2000000000),
    totalTokens: clampInt(value.totalTokens, 0, 0, 4000000000),
    updatedAt: secret && secret.updatedAt ? secret.updatedAt : null
  };
}

function writeBudgetUsageRecord(input = {}) {
  const day = isDayString(input.day) ? input.day : toUtcDayString();
  const record = {
    day,
    requests: clampInt(input.requests, 0, 0, 20000000),
    promptTokens: clampInt(input.promptTokens, 0, 0, 2000000000),
    outputTokens: clampInt(input.outputTokens, 0, 0, 2000000000),
    totalTokens: clampInt(input.totalTokens, 0, 0, 4000000000),
    updatedAt: new Date().toISOString()
  };
  setSecret(VERTEX_BUDGET_USAGE_SECRET, record, {
    app: "Asolaria",
    component: "vertex-budget",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "runtime"
  }, { namespace: "owner" });
  return record;
}

function getBudgetUsageForDay(day = toUtcDayString()) {
  const raw = readBudgetUsageRecord();
  if (raw.day !== day) {
    return {
      day,
      requests: 0,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      updatedAt: raw.updatedAt || null
    };
  }
  return {
    day,
    requests: raw.requests,
    promptTokens: raw.promptTokens,
    outputTokens: raw.outputTokens,
    totalTokens: raw.totalTokens,
    updatedAt: raw.updatedAt || null
  };
}

function calcPercent(used, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Number(((used / limit) * 100).toFixed(2));
}

function calcRemaining(used, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, limit - used);
}

function buildBudgetStatus(config, usage, policy = {}) {
  const effectiveEnabled = policy.enabled !== false && config.enabled !== false;
  const limits = {
    requestsPerDay: config.maxRequestsPerDay,
    promptTokensPerDay: config.maxPromptTokensPerDay,
    outputTokensPerDay: config.maxOutputTokensPerDay,
    warnPercent: config.warnPercent
  };
  const percentUsed = {
    requests: calcPercent(usage.requests, limits.requestsPerDay),
    promptTokens: calcPercent(usage.promptTokens, limits.promptTokensPerDay),
    outputTokens: calcPercent(usage.outputTokens, limits.outputTokensPerDay)
  };
  const maxPercent = Math.max(
    percentUsed.requests || 0,
    percentUsed.promptTokens || 0,
    percentUsed.outputTokens || 0
  );
  const exhausted = (
    (limits.requestsPerDay > 0 && usage.requests >= limits.requestsPerDay)
    || (limits.promptTokensPerDay > 0 && usage.promptTokens >= limits.promptTokensPerDay)
    || (limits.outputTokensPerDay > 0 && usage.outputTokens >= limits.outputTokensPerDay)
  );
  return {
    enabled: effectiveEnabled,
    source: config.source,
    updatedAt: config.updatedAt || usage.updatedAt || null,
    day: usage.day,
    limits,
    usage: {
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens
    },
    remaining: {
      requests: calcRemaining(usage.requests, limits.requestsPerDay),
      promptTokens: calcRemaining(usage.promptTokens, limits.promptTokensPerDay),
      outputTokens: calcRemaining(usage.outputTokens, limits.outputTokensPerDay)
    },
    percentUsed,
    maxPercent,
    nearLimit: effectiveEnabled && maxPercent >= limits.warnPercent,
    exhausted: effectiveEnabled && exhausted
  };
}

function getVertexBudgetStatus(policy = {}) {
  const day = toUtcDayString();
  const config = resolveVertexBudgetConfig();
  const usage = getBudgetUsageForDay(day);
  return buildBudgetStatus(config, usage, policy);
}

function setVertexBudgetConfig(input = {}) {
  if (input && input.clear === true) {
    if (hasBudgetEnvOverride()) {
      throw new Error("Vertex budget config is controlled by environment variables and cannot be cleared via API.");
    }
    deleteSecret(VERTEX_BUDGET_CONFIG_SECRET, { namespace: "owner" });
    return getVertexBudgetStatus();
  }

  if (hasBudgetEnvOverride()) {
    throw new Error("Vertex budget config is controlled by environment variables and cannot be changed via API.");
  }

  const current = resolveVertexBudgetConfig();
  const next = {
    enabled: input.enabled === undefined ? current.enabled : toBool(input.enabled, current.enabled),
    maxRequestsPerDay: normalizeBudgetLimit(input.maxRequestsPerDay, current.maxRequestsPerDay),
    maxPromptTokensPerDay: normalizeBudgetLimit(input.maxPromptTokensPerDay, current.maxPromptTokensPerDay),
    maxOutputTokensPerDay: normalizeBudgetLimit(input.maxOutputTokensPerDay, current.maxOutputTokensPerDay),
    warnPercent: normalizeWarnPercent(input.warnPercent, current.warnPercent),
    updatedAt: new Date().toISOString()
  };

  setSecret(VERTEX_BUDGET_CONFIG_SECRET, next, {
    app: "Asolaria",
    component: "vertex-budget",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getVertexBudgetStatus();
}

function resetVertexBudgetUsage(input = {}) {
  const targetDay = isDayString(input.day) ? String(input.day) : toUtcDayString();
  writeBudgetUsageRecord({
    day: targetDay,
    requests: 0,
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  });
  return getVertexBudgetStatus();
}

function estimatePromptTokens(prompt, system) {
  const text = `${String(system || "")}\n${String(prompt || "")}`.trim();
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function assertBudgetAllowance(budgetStatus, plannedUsage) {
  if (!budgetStatus || budgetStatus.enabled === false) {
    return;
  }

  const limits = budgetStatus.limits || {};
  const usage = budgetStatus.usage || {};
  const nextRequests = Number(usage.requests || 0) + Number(plannedUsage.requests || 0);
  const nextPrompt = Number(usage.promptTokens || 0) + Number(plannedUsage.promptTokens || 0);
  const nextOutput = Number(usage.outputTokens || 0) + Number(plannedUsage.outputTokens || 0);

  if (Number(limits.requestsPerDay || 0) > 0 && nextRequests > Number(limits.requestsPerDay)) {
    throw new Error(`Vertex daily request budget exceeded (${nextRequests}/${limits.requestsPerDay}).`);
  }
  if (Number(limits.promptTokensPerDay || 0) > 0 && nextPrompt > Number(limits.promptTokensPerDay)) {
    throw new Error(`Vertex daily prompt-token budget exceeded (${nextPrompt}/${limits.promptTokensPerDay}).`);
  }
  if (Number(limits.outputTokensPerDay || 0) > 0 && nextOutput > Number(limits.outputTokensPerDay)) {
    throw new Error(`Vertex daily output-token budget exceeded (${nextOutput}/${limits.outputTokensPerDay}).`);
  }
}

function registerBudgetUsage(budgetStatus, payload = {}, plannedUsage = {}) {
  const usageMeta = payload && typeof payload === "object" ? payload.usageMetadata || {} : {};
  const promptTokens = clampInt(
    usageMeta.promptTokenCount,
    clampInt(plannedUsage.promptTokens, 0, 0, 2000000000),
    0,
    2000000000
  );
  const outputTokens = clampInt(
    usageMeta.candidatesTokenCount,
    clampInt(plannedUsage.outputTokens, 0, 0, 2000000000),
    0,
    2000000000
  );
  const totalTokens = clampInt(
    usageMeta.totalTokenCount,
    Math.max(0, promptTokens + outputTokens),
    0,
    4000000000
  );

  const next = {
    day: budgetStatus.day,
    requests: Number(budgetStatus.usage.requests || 0) + 1,
    promptTokens: Number(budgetStatus.usage.promptTokens || 0) + promptTokens,
    outputTokens: Number(budgetStatus.usage.outputTokens || 0) + outputTokens,
    totalTokens: Number(budgetStatus.usage.totalTokens || 0) + totalTokens
  };

  writeBudgetUsageRecord(next);
  return getVertexBudgetStatus();
}

function enforceProjectAllowed(project) {
  const gcp = getGcpConfigSummary({});
  const allowed = Array.isArray(gcp.allowedProjects) ? gcp.allowedProjects : [];
  if (!allowed.length) return;
  const wanted = normalizeProjectKey(project);
  const allowedKeys = allowed.map(normalizeProjectKey).filter(Boolean);
  if (!wanted || !allowedKeys.includes(wanted)) {
    throw new Error(`Project ${project || "(missing)"} is not allowed. Allowed projects: ${allowed.join(", ")}`);
  }
}

function getVertexConfigSummary(policy = {}) {
  const gcp = getGcpConfigSummary({});
  const resolved = resolveVertexConfig();
  const location = resolved.location || "us-central1";
  const model = resolved.model || "";
  const project = resolved.project || gcp.defaultProject || "";
  const enabled = policy.enabled !== false && resolved.enabled !== false;

  return {
    enabled,
    configured: Boolean(gcp.configured && project && location && model),
    source: resolved.source,
    project,
    location,
    model,
    gcpConfigured: Boolean(gcp.configured),
    serviceAccountEmail: gcp.clientEmail || "",
    allowedProjects: gcp.allowedProjects || [],
    updatedAt: resolved.updatedAt || null
  };
}

function setVertexConfig(input = {}) {
  if (input && input.clear === true) {
    deleteSecret(VERTEX_CONFIG_SECRET, { namespace: "owner" });
    return getVertexConfigSummary();
  }

  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const project = normalizeProjectId(input.project || input.defaultProject || input.projectId || "");
  const location = normalizeLocation(input.location || "") || "";
  const model = normalizeModel(input.model || "") || "";

  setSecret(VERTEX_CONFIG_SECRET, {
    enabled,
    project,
    location,
    model,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "vertex-gemini",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getVertexConfigSummary();
}

function extractGeminiText(payload) {
  const data = payload && typeof payload === "object" ? payload : {};

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates && candidates[0] && candidates[0].content ? candidates[0].content.parts : null;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }

  const predictions = Array.isArray(data.predictions) ? data.predictions : [];
  const predContent = predictions && predictions[0] ? predictions[0].content : null;
  if (predContent && typeof predContent === "string" && predContent.trim()) {
    return predContent.trim();
  }

  const outputText = data.outputText;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  return "";
}

function looksLikePermissionDenied(message) {
  const text = String(message || "");
  return /PERMISSION_DENIED/i.test(text)
    || /permission[ _-]?denied/i.test(text)
    || (/\bpermission\b/i.test(text) && /\bdenied\b/i.test(text));
}

function looksLikeApiNotEnabled(message) {
  const text = String(message || "");
  return /has not been used in project/i.test(text) || /\bAPI\b[\s\S]*\bdisabled\b/i.test(text);
}

function buildVertexRoleHint({ project, principalEmail }) {
  const proj = normalizeProjectId(project);
  const principal = String(principalEmail || "").trim();

  const lines = [];
  lines.push(`Vertex (Gemini) permission denied for project ${proj || project}.`);
  if (principal) {
    lines.push(`Service account: ${principal}`);
  }
  lines.push("Suggested IAM role: Vertex AI User (roles/aiplatform.user)");
  lines.push("");
  lines.push("Fix (Console): IAM & Admin -> IAM -> Grant access -> add the service account above -> assign Vertex AI User -> Save.");
  return clipText(lines.join("\n"), 1800);
}

function buildVertexEnableApiHint() {
  return clipText([
    "Vertex (Gemini) API may be disabled.",
    "Enable (Console): APIs & Services -> Library -> enable Vertex AI API (aiplatform.googleapis.com).",
    "If you are using a specific Gemini/GCP API product, also enable the corresponding API shown in your API list.",
  ].join("\n"), 1800);
}

async function runVertexGemini(input = {}, policy = {}) {
  const status = getVertexConfigSummary(policy);
  if (!status.enabled) {
    throw new Error("Vertex (Gemini) integration is disabled.");
  }
  if (!status.gcpConfigured) {
    throw new Error("GCP service account is not configured. Configure it under Admin -> Integrations -> Google Cloud (Service Account).");
  }
  if (!status.project || !status.location || !status.model) {
    throw new Error("Vertex config requires project, location, and model.");
  }

  enforceProjectAllowed(status.project);

  const prompt = String(input.prompt || input.message || "").trim();
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const system = String(input.system || "").trim();
  const temperature = input.temperature === undefined ? undefined : Number(input.temperature);
  const maxOutputTokens = input.maxOutputTokens === undefined ? undefined : clampInt(input.maxOutputTokens, DEFAULT_VERTEX_MAX_OUTPUT_TOKENS, 1, 8192);
  const effectiveMaxOutputTokens = maxOutputTokens || DEFAULT_VERTEX_MAX_OUTPUT_TOKENS;

  const budgetBefore = getVertexBudgetStatus(policy);
  const plannedUsage = {
    requests: 1,
    promptTokens: estimatePromptTokens(prompt, system),
    outputTokens: effectiveMaxOutputTokens
  };
  assertBudgetAllowance(budgetBefore, plannedUsage);

  const contents = [
    {
      role: "user",
      parts: [{ text: prompt }]
    }
  ];
  const body = {
    contents
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const genConfig = {};
  if (Number.isFinite(temperature)) {
    genConfig.temperature = Math.max(0, Math.min(2, temperature));
  }
  if (maxOutputTokens) {
    genConfig.maxOutputTokens = maxOutputTokens;
  }
  if (Object.keys(genConfig).length) {
    body.generationConfig = genConfig;
  }

  const host = status.location === "global"
    ? "aiplatform.googleapis.com"
    : `${status.location}-aiplatform.googleapis.com`;

  const url = `https://${host}/v1/projects/${encodeURIComponent(status.project)}/locations/${encodeURIComponent(status.location)}/publishers/google/models/${encodeURIComponent(status.model)}:generateContent`;

  let result = null;
  try {
    result = await gcpApiRequest({
      method: "POST",
      url,
      body,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    }, {
      maxDepth: clampInt(policy.maxDepth, 8, 1, 12),
      maxEntries: clampInt(policy.maxEntries, 800, 50, 4000),
      maxString: clampInt(policy.maxString, 120000, 1200, 120000),
      maxBodyChars: clampInt(policy.maxBodyChars, 45000, 2000, 200000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (looksLikePermissionDenied(message)) {
      throw new Error(`${message}\n\n${buildVertexRoleHint({
        project: status.project,
        principalEmail: status.serviceAccountEmail
      })}`.trim());
    }
    if (looksLikeApiNotEnabled(message)) {
      throw new Error(`${message}\n\n${buildVertexEnableApiHint()}`.trim());
    }
    throw error;
  }

  const reply = extractGeminiText(result.data);
  if (!reply) {
    throw new Error("Vertex (Gemini) returned no text output.");
  }

  const budgetAfter = registerBudgetUsage(budgetBefore, result.data, plannedUsage);

  return {
    project: status.project,
    location: status.location,
    model: status.model,
    reply,
    raw: result.data,
    budget: budgetAfter
  };
}

module.exports = {
  VERTEX_CONFIG_SECRET,
  VERTEX_BUDGET_CONFIG_SECRET,
  VERTEX_BUDGET_USAGE_SECRET,
  getVertexConfigSummary,
  setVertexConfig,
  getVertexBudgetStatus,
  setVertexBudgetConfig,
  resetVertexBudgetUsage,
  runVertexGemini
};