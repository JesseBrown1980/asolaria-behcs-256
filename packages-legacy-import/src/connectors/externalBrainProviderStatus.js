"use strict";

const { getSecret } = require("../secureVault");
const {
  DEFAULT_MCP_CONTEXT_TTL_SECONDS,
  DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX,
  DEFAULT_MCP_PROMPT_TOKEN_LIMIT,
  DEFAULT_MCP_TOKEN_REDUCTION_PROFILE,
  DEFAULT_MCP_TOOL_SCHEMA_MODE,
  normalizeMcpConfig,
  normalizeMcpContextTtlSeconds,
  normalizeMcpDynamicAllowlistMax,
  normalizeMcpPromptTokenLimit,
  normalizeMcpTokenReductionProfile,
  normalizeMcpToolSchemaMode
} = require("./externalBrainMcpConfig");

const PROVIDER_IDS = ["cursor", "antigravity"];
const EXTERNAL_SECRET_PREFIX = "integrations.external.";
const DEFAULT_API_STYLE = "openai_chat_completions";
const SUPPORTED_API_STYLES = new Set(["openai_chat_completions", "openai_responses"]);
const OFFICIAL_OPENAI_HOSTS = new Set(["api.openai.com"]);
const OFFICIAL_OPENAI_HOST_SUFFIXES = [".openai.azure.com"];

function normalizeProviderId(value) {
  const id = String(value || "").trim().toLowerCase();
  return PROVIDER_IDS.includes(id) ? id : "";
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

function normalizeApiPath(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function normalizeApiStyle(value, fallback = DEFAULT_API_STYLE) {
  const style = String(value || "").trim().toLowerCase();
  return SUPPORTED_API_STYLES.has(style) ? style : fallback;
}

function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length < 16 || /\s/.test(key)) return "";
  return key;
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function defaultPathForStyle(apiStyle) {
  return apiStyle === "openai_responses" ? "/v1/responses" : "/v1/chat/completions";
}

function providerSecretName(providerId) {
  return `${EXTERNAL_SECRET_PREFIX}${providerId}`;
}

function defaultRequireOfficialApi(providerId) {
  return providerId === "antigravity";
}

function readProviderEnv(providerId, env = process.env) {
  const prefix = providerId.toUpperCase();
  return {
    enabled: normalizeBool(env[`ASOLARIA_${prefix}_ENABLED`], true),
    apiBaseUrl: normalizeBaseUrl(
      env[`ASOLARIA_${prefix}_API_URL`]
      || env[`ASOLARIA_${prefix}_API_BASE`]
      || ""
    ),
    apiPath: String(env[`ASOLARIA_${prefix}_API_PATH`] || "").trim(),
    apiStyle: normalizeApiStyle(env[`ASOLARIA_${prefix}_API_STYLE`] || "", DEFAULT_API_STYLE),
    model: String(env[`ASOLARIA_${prefix}_MODEL`] || "").trim(),
    organization: String(env[`ASOLARIA_${prefix}_ORGANIZATION`] || "").trim(),
    apiKey: normalizeApiKey(env[`ASOLARIA_${prefix}_API_KEY`] || "")
  };
}

function isOfficialApiEndpoint(baseUrl, apiStyle) {
  if (!baseUrl || !SUPPORTED_API_STYLES.has(apiStyle)) {
    return false;
  }
  try {
    const parsed = new URL(baseUrl);
    const host = String(parsed.hostname || "").toLowerCase();
    if (parsed.protocol !== "https:") return false;
    if (OFFICIAL_OPENAI_HOSTS.has(host)) return true;
    return OFFICIAL_OPENAI_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch (_error) {
    return false;
  }
}

function providerConfig(id, env = process.env) {
  const providerId = normalizeProviderId(id);
  if (!providerId) return null;

  const providerEnv = readProviderEnv(providerId, env);
  const secret = getSecret(providerSecretName(providerId), { namespace: "owner" });
  const secretValue = secret?.value && typeof secret.value === "object" ? secret.value : {};

  const apiStyle = normalizeApiStyle(
    secretValue.apiStyle || secretValue.mode || secretValue.format || providerEnv.apiStyle,
    DEFAULT_API_STYLE
  );
  const apiPath = normalizeApiPath(
    secretValue.apiPath || secretValue.path || providerEnv.apiPath,
    defaultPathForStyle(apiStyle)
  );
  const apiBaseUrl = normalizeBaseUrl(
    secretValue.apiBaseUrl || secretValue.baseUrl || secretValue.apiUrl || providerEnv.apiBaseUrl
  );
  const model = String(secretValue.model || providerEnv.model || "").trim();
  const apiKey = normalizeApiKey(secretValue.apiKey || secretValue.token || secretValue.key || "");
  const enabled = normalizeBool(secretValue.enabled, providerEnv.enabled);
  const organization = String(secretValue.organization || providerEnv.organization || "").trim();
  const requireOfficialApi = normalizeBool(
    secretValue.requireOfficialApi,
    defaultRequireOfficialApi(providerId)
  );
  const mcp = normalizeMcpConfig(
    secretValue.mcp || {
      enabled: secretValue.mcpEnabled,
      serverLabel: secretValue.mcpServerLabel,
      serverUrl: secretValue.mcpServerUrl,
      connectorId: secretValue.mcpConnectorId,
      authorization: secretValue.mcpAuthorization,
      headers: secretValue.mcpHeaders,
      allowedTools: secretValue.mcpAllowedTools,
      approvalMode: secretValue.mcpApprovalMode,
      dynamicAllowlistMax: secretValue.mcpDynamicAllowlistMax,
      contextTtlSeconds: secretValue.mcpContextTtlSeconds,
      tokenReductionProfile: secretValue.mcpTokenReductionProfile,
      promptTokenLimit: secretValue.mcpPromptTokenLimit,
      toolSchemaMode: secretValue.mcpToolSchemaMode,
      skillHints: secretValue.mcpSkillHints,
      webMcpHints: secretValue.mcpWebMcpHints
    },
    {}
  );
  const mcpUnsupportedStyle = mcp.enabled && apiStyle !== "openai_responses";
  const mcpConfigError = mcp.presetInvalid
    ? "invalid_mcp_preset"
    : !mcp.enabled
      ? ""
      : mcpUnsupportedStyle
        ? "mcp_requires_openai_responses"
        : mcp.configError || "";
  const officialApi = isOfficialApiEndpoint(apiBaseUrl, apiStyle);
  const configured = Boolean(apiBaseUrl && apiKey && model && (!requireOfficialApi || officialApi));
  const configError = !apiBaseUrl || !apiKey || !model
    ? "missing_config"
    : requireOfficialApi && !officialApi
      ? "non_official_api_endpoint"
      : "";

  return {
    id: providerId,
    enabled,
    configured,
    source: secret ? "vault" : "none",
    updatedAt: secret?.updatedAt || null,
    apiStyle,
    apiBaseUrl,
    apiPath,
    baseUrl: apiBaseUrl,
    path: apiPath,
    model,
    apiKey,
    organization,
    requireOfficialApi,
    officialApi,
    configError,
    mcp: {
      ...mcp,
      configError: mcpConfigError
    },
    legacyEnvApiKeyDetected: Boolean(providerEnv.apiKey)
  };
}

function listConfiguredExternalProviders(env = process.env) {
  return PROVIDER_IDS
    .map((id) => providerConfig(id, env))
    .filter((provider) => provider && provider.enabled && provider.configured);
}

function findProviderById(id, env = process.env) {
  const requested = normalizeProviderId(id);
  return requested ? providerConfig(requested, env) : null;
}

function getExternalProvider(id, env = process.env) {
  const provider = findProviderById(id, env);
  if (!provider) throw new Error(`Unsupported external provider: ${id}`);
  if (!provider.enabled) throw new Error(`${provider.id} provider is disabled.`);
  if (!provider.apiBaseUrl || !provider.apiKey || !provider.model) {
    throw new Error(`${provider.id} provider is not configured.`);
  }
  if (provider.requireOfficialApi && !provider.officialApi) {
    throw new Error(`${provider.id} provider must use an official API endpoint.`);
  }
  if (provider.mcp?.enabled && provider.mcp?.configError) {
    throw new Error(`${provider.id} MCP config error: ${provider.mcp.configError}`);
  }
  return provider;
}

function statusShapeFromConfig(provider) {
  const warning = provider.legacyEnvApiKeyDetected
    ? "Legacy env API key detected but ignored. Store API keys in the encrypted vault only."
    : "";
  const mcp = provider.mcp && typeof provider.mcp === "object" ? provider.mcp : {};
  return {
    id: provider.id,
    configured: Boolean(provider.configured),
    enabled: Boolean(provider.enabled),
    model: provider.model || null,
    baseUrl: provider.apiBaseUrl || null,
    apiPath: provider.apiPath || null,
    organization: provider.organization || null,
    apiStyle: provider.apiStyle || DEFAULT_API_STYLE,
    officialApi: Boolean(provider.officialApi),
    requireOfficialApi: Boolean(provider.requireOfficialApi),
    source: provider.source || "none",
    updatedAt: provider.updatedAt || null,
    configError: provider.configError || null,
    mcpEnabled: Boolean(mcp.enabled),
    mcpConfigured: Boolean(mcp.configured),
    mcpConfigError: mcp.configError || null,
    mcpServerLabel: mcp.serverLabel || null,
    mcpServerUrl: mcp.serverUrl || null,
    mcpConnectorId: mcp.connectorId || null,
    mcpAllowedToolsCount: Array.isArray(mcp.allowedTools) ? mcp.allowedTools.length : 0,
    mcpPreset: mcp.preset || null,
    mcpApprovalMode: mcp.approvalMode || "auto",
    mcpDynamicAllowlistMax: normalizeMcpDynamicAllowlistMax(mcp.dynamicAllowlistMax, DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX),
    mcpContextTtlSeconds: normalizeMcpContextTtlSeconds(mcp.contextTtlSeconds, DEFAULT_MCP_CONTEXT_TTL_SECONDS),
    mcpTokenReductionProfile: normalizeMcpTokenReductionProfile(mcp.tokenReductionProfile, DEFAULT_MCP_TOKEN_REDUCTION_PROFILE),
    mcpPromptTokenLimit: normalizeMcpPromptTokenLimit(mcp.promptTokenLimit, DEFAULT_MCP_PROMPT_TOKEN_LIMIT),
    mcpToolSchemaMode: normalizeMcpToolSchemaMode(mcp.toolSchemaMode, DEFAULT_MCP_TOOL_SCHEMA_MODE),
    mcpSkillHintsCount: Array.isArray(mcp.skillHints) ? mcp.skillHints.length : 0,
    mcpWebMcpHintsCount: Array.isArray(mcp.webMcpHints) ? mcp.webMcpHints.length : 0,
    warning: warning || null
  };
}

function getExternalProviderStatus(env = process.env) {
  return PROVIDER_IDS
    .map((id) => providerConfig(id, env))
    .filter(Boolean)
    .map((provider) => statusShapeFromConfig(provider));
}

function getExternalProviderStatusById(id, env = process.env) {
  const wanted = normalizeProviderId(id);
  if (!wanted) return null;
  return getExternalProviderStatus(env).find((item) => item.id === wanted) || null;
}

module.exports = {
  DEFAULT_API_STYLE,
  defaultPathForStyle,
  defaultRequireOfficialApi,
  findProviderById,
  getExternalProvider,
  getExternalProviderStatus,
  getExternalProviderStatusById,
  isOfficialApiEndpoint,
  listConfiguredExternalProviders,
  normalizeApiKey,
  normalizeApiPath,
  normalizeApiStyle,
  normalizeBaseUrl,
  normalizeBool,
  normalizeProviderId,
  providerConfig,
  providerSecretName,
  readProviderEnv,
  statusShapeFromConfig
};
