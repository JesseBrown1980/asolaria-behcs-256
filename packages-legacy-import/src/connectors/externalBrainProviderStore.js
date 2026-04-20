"use strict";

const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const {
  MCP_POLICY_PRESETS,
  buildMcpConfigPatch,
  normalizeMcpConfig
} = require("./externalBrainMcpConfig");
const {
  DEFAULT_API_STYLE,
  defaultPathForStyle,
  defaultRequireOfficialApi,
  getExternalProviderStatusById,
  isOfficialApiEndpoint,
  normalizeApiKey,
  normalizeApiPath,
  normalizeApiStyle,
  normalizeBaseUrl,
  normalizeBool,
  normalizeProviderId,
  providerSecretName
} = require("./externalBrainProviderStatus");

function setExternalProviderConfig(input = {}) {
  const providerId = normalizeProviderId(input.provider || input.id);
  if (!providerId) {
    throw new Error("provider is required (cursor or antigravity).");
  }

  const clear = normalizeBool(input.clear, false);
  if (clear) {
    deleteSecret(providerSecretName(providerId), { namespace: "owner" });
    return getExternalProviderStatusById(providerId);
  }

  const secret = getSecret(providerSecretName(providerId), { namespace: "owner" });
  const previous = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const merged = {
    ...previous
  };

  if (input.enabled !== undefined) {
    merged.enabled = normalizeBool(input.enabled, true);
  } else if (merged.enabled === undefined) {
    merged.enabled = true;
  }

  if (input.apiStyle !== undefined || input.style !== undefined || input.mode !== undefined) {
    merged.apiStyle = normalizeApiStyle(input.apiStyle || input.style || input.mode, DEFAULT_API_STYLE);
  } else {
    merged.apiStyle = normalizeApiStyle(merged.apiStyle, DEFAULT_API_STYLE);
  }

  if (input.apiBaseUrl !== undefined || input.baseUrl !== undefined || input.apiUrl !== undefined || input.url !== undefined) {
    const nextUrl = normalizeBaseUrl(input.apiBaseUrl || input.baseUrl || input.apiUrl || input.url);
    if (!nextUrl) {
      throw new Error("apiBaseUrl is required when updating external provider config.");
    }
    merged.apiBaseUrl = nextUrl;
  } else {
    merged.apiBaseUrl = normalizeBaseUrl(merged.apiBaseUrl || merged.baseUrl || merged.apiUrl || "");
  }

  if (input.apiPath !== undefined || input.path !== undefined) {
    merged.apiPath = normalizeApiPath(input.apiPath || input.path, defaultPathForStyle(merged.apiStyle));
  } else {
    merged.apiPath = normalizeApiPath(merged.apiPath || merged.path, defaultPathForStyle(merged.apiStyle));
  }

  if (input.model !== undefined) {
    const model = String(input.model || "").trim();
    if (!model) {
      throw new Error("model is required.");
    }
    merged.model = model;
  } else {
    merged.model = String(merged.model || "").trim();
  }

  if (input.organization !== undefined) {
    merged.organization = String(input.organization || "").trim();
  } else {
    merged.organization = String(merged.organization || "").trim();
  }

  if (input.requireOfficialApi !== undefined) {
    merged.requireOfficialApi = normalizeBool(input.requireOfficialApi, defaultRequireOfficialApi(providerId));
  } else if (merged.requireOfficialApi === undefined) {
    merged.requireOfficialApi = defaultRequireOfficialApi(providerId);
  } else {
    merged.requireOfficialApi = normalizeBool(merged.requireOfficialApi, defaultRequireOfficialApi(providerId));
  }

  const providedApiKey = input.apiKey !== undefined || input.token !== undefined || input.key !== undefined;
  if (providedApiKey) {
    const apiKey = normalizeApiKey(input.apiKey || input.token || input.key);
    if (!apiKey) {
      throw new Error("A valid API key is required.");
    }
    merged.apiKey = apiKey;
  } else {
    merged.apiKey = normalizeApiKey(merged.apiKey || merged.token || merged.key || "");
  }

  const previousMcp = normalizeMcpConfig(
    previous.mcp || {
      enabled: previous.mcpEnabled,
      serverLabel: previous.mcpServerLabel,
      serverUrl: previous.mcpServerUrl,
      connectorId: previous.mcpConnectorId,
      authorization: previous.mcpAuthorization,
      headers: previous.mcpHeaders,
      allowedTools: previous.mcpAllowedTools,
      approvalMode: previous.mcpApprovalMode,
      dynamicAllowlistMax: previous.mcpDynamicAllowlistMax,
      contextTtlSeconds: previous.mcpContextTtlSeconds,
      tokenReductionProfile: previous.mcpTokenReductionProfile,
      promptTokenLimit: previous.mcpPromptTokenLimit,
      toolSchemaMode: previous.mcpToolSchemaMode,
      skillHints: previous.mcpSkillHints,
      webMcpHints: previous.mcpWebMcpHints
    },
    {}
  );
  const mcpPatch = buildMcpConfigPatch(input);
  if (mcpPatch.hasPatch && mcpPatch.clear) {
    merged.mcp = normalizeMcpConfig({}, {});
  } else if (mcpPatch.hasPatch) {
    merged.mcp = normalizeMcpConfig(mcpPatch.value, previousMcp);
  } else {
    merged.mcp = previousMcp;
  }
  const normalizedMcp = normalizeMcpConfig(merged.mcp || {}, {});
  if (normalizedMcp.presetInvalid) {
    throw new Error(`Unsupported MCP preset. Allowed: ${Object.keys(MCP_POLICY_PRESETS).join(", ")}.`);
  }

  const effectiveEnabled = normalizeBool(merged.enabled, true);
  const officialApi = isOfficialApiEndpoint(merged.apiBaseUrl, merged.apiStyle);
  if (effectiveEnabled) {
    if (!merged.apiBaseUrl || !merged.model || !merged.apiKey) {
      throw new Error("apiBaseUrl, model, and apiKey are required for enabled providers.");
    }
    if (normalizeBool(merged.requireOfficialApi, defaultRequireOfficialApi(providerId)) && !officialApi) {
      throw new Error("External provider must use an official API endpoint (https://api.openai.com or Azure OpenAI endpoint).");
    }
    if (normalizedMcp.enabled && normalizeApiStyle(merged.apiStyle, DEFAULT_API_STYLE) !== "openai_responses") {
      throw new Error("MCP requires apiStyle=openai_responses.");
    }
    if (normalizedMcp.enabled && !normalizedMcp.configured) {
      throw new Error("MCP is enabled but missing server_label and server_url/connector_id.");
    }
  }

  const payload = {
    provider: providerId,
    enabled: effectiveEnabled,
    apiStyle: normalizeApiStyle(merged.apiStyle, DEFAULT_API_STYLE),
    apiBaseUrl: normalizeBaseUrl(merged.apiBaseUrl),
    apiPath: normalizeApiPath(merged.apiPath, defaultPathForStyle(merged.apiStyle)),
    model: String(merged.model || "").trim(),
    organization: String(merged.organization || "").trim(),
    requireOfficialApi: normalizeBool(merged.requireOfficialApi, defaultRequireOfficialApi(providerId)),
    apiKey: normalizeApiKey(merged.apiKey || ""),
    mcp: normalizedMcp,
    updatedAt: new Date().toISOString()
  };

  setSecret(
    providerSecretName(providerId),
    payload,
    {
      app: "Asolaria",
      component: "external-provider",
      provider: providerId,
      credentialOwner: "owner",
      actor: "owner",
      updatedBy: "api"
    },
    { namespace: "owner" }
  );

  return getExternalProviderStatusById(providerId);
}

module.exports = {
  setExternalProviderConfig
};
