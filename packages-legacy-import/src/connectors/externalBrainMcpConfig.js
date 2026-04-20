const MAX_MCP_ALLOWED_TOOLS = 64;
const DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX = 5;
const DEFAULT_MCP_CONTEXT_TTL_SECONDS = 30 * 60;
const MAX_MCP_CONTEXT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_MCP_TOKEN_REDUCTION_PROFILE = "balanced";
const DEFAULT_MCP_PROMPT_TOKEN_LIMIT = 1600;
const MAX_MCP_PROMPT_TOKEN_LIMIT = 12000;
const DEFAULT_MCP_TOOL_SCHEMA_MODE = "compact";

const MCP_POLICY_PRESETS = Object.freeze({
  read_only: Object.freeze({
    approvalMode: "never",
    dynamicAllowlistMax: 12
  }),
  balanced: Object.freeze({
    approvalMode: "auto",
    dynamicAllowlistMax: 8
  }),
  write_guarded: Object.freeze({
    approvalMode: "always",
    dynamicAllowlistMax: 6
  })
});

const MCP_TOKEN_REDUCTION_PROFILES = Object.freeze({
  off: Object.freeze({
    promptTokenLimit: 0,
    toolSchemaMode: "full",
    dynamicAllowlistCap: MAX_MCP_ALLOWED_TOOLS
  }),
  balanced: Object.freeze({
    promptTokenLimit: 1600,
    toolSchemaMode: "compact",
    dynamicAllowlistCap: 8
  }),
  aggressive: Object.freeze({
    promptTokenLimit: 900,
    toolSchemaMode: "pointer",
    dynamicAllowlistCap: 5
  })
});

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeText(value, maxLen = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizeList(value, maxItems = 64, maxItemLen = 120) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const out = [];
  const seen = new Set();
  for (const rawItem of source) {
    const item = normalizeText(rawItem, maxItemLen);
    if (!item) continue;
    if (/[\r\n\t]/.test(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

function normalizeHeaderMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const out = {};
  const keys = Object.keys(source).slice(0, 20);
  for (const key of keys) {
    const header = String(key || "").trim();
    if (!header) continue;
    if (!/^[A-Za-z0-9-]{1,80}$/.test(header)) continue;
    const headerValue = normalizeText(source[key], 400);
    if (!headerValue) continue;
    out[header] = headerValue;
  }
  return out;
}

function pickFirst(source, keys, fallbackSource, fallbackKeys = keys, defaultValue = undefined) {
  const primary = source && typeof source === "object" ? source : {};
  const secondary = fallbackSource && typeof fallbackSource === "object" ? fallbackSource : {};
  for (const key of keys || []) {
    if (hasOwn(primary, key) && primary[key] !== undefined) {
      return primary[key];
    }
  }
  for (const key of fallbackKeys || []) {
    if (hasOwn(secondary, key) && secondary[key] !== undefined) {
      return secondary[key];
    }
  }
  return defaultValue;
}

function normalizeMcpApprovalMode(value, fallback = "auto") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "always" || mode === "never") {
    return mode;
  }
  if (mode === "auto" || mode === "smart" || mode === "default") {
    return "auto";
  }
  return fallback;
}

function normalizeMcpDynamicAllowlistMax(value, fallback = DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(MAX_MCP_ALLOWED_TOOLS, Number(fallback || DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX)));
  }
  return Math.max(0, Math.min(MAX_MCP_ALLOWED_TOOLS, Math.round(parsed)));
}

function normalizeMcpContextTtlSeconds(value, fallback = DEFAULT_MCP_CONTEXT_TTL_SECONDS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(60, Math.min(MAX_MCP_CONTEXT_TTL_SECONDS, Math.round(Number(fallback || DEFAULT_MCP_CONTEXT_TTL_SECONDS))));
  }
  return Math.max(60, Math.min(MAX_MCP_CONTEXT_TTL_SECONDS, Math.round(parsed)));
}

function normalizeMcpTokenReductionProfile(value, fallback = DEFAULT_MCP_TOKEN_REDUCTION_PROFILE) {
  const profile = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (MCP_TOKEN_REDUCTION_PROFILES[profile]) {
    return profile;
  }
  const fallbackKey = String(fallback || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (MCP_TOKEN_REDUCTION_PROFILES[fallbackKey]) {
    return fallbackKey;
  }
  return DEFAULT_MCP_TOKEN_REDUCTION_PROFILE;
}

function normalizeMcpPromptTokenLimit(value, fallback = DEFAULT_MCP_PROMPT_TOKEN_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(
      0,
      Math.min(MAX_MCP_PROMPT_TOKEN_LIMIT, Math.round(Number(fallback || DEFAULT_MCP_PROMPT_TOKEN_LIMIT)))
    );
  }
  return Math.max(0, Math.min(MAX_MCP_PROMPT_TOKEN_LIMIT, Math.round(parsed)));
}

function normalizeMcpToolSchemaMode(value, fallback = DEFAULT_MCP_TOOL_SCHEMA_MODE) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "full" || mode === "compact" || mode === "pointer") {
    return mode;
  }
  const fallbackMode = String(fallback || "").trim().toLowerCase();
  if (fallbackMode === "full" || fallbackMode === "compact" || fallbackMode === "pointer") {
    return fallbackMode;
  }
  return DEFAULT_MCP_TOOL_SCHEMA_MODE;
}

function normalizeMcpPresetName(value, fallback = "") {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (MCP_POLICY_PRESETS[raw]) {
    return raw;
  }
  const safeFallback = String(fallback || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (MCP_POLICY_PRESETS[safeFallback]) {
    return safeFallback;
  }
  return "";
}

function getExternalMcpPolicyPresets() {
  return MCP_POLICY_PRESETS;
}

function getExternalMcpTokenReductionProfiles() {
  return MCP_TOKEN_REDUCTION_PROFILES;
}

function normalizeAllowedTools(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(value.tool_names)) {
      return normalizeList(value.tool_names, MAX_MCP_ALLOWED_TOOLS, 120);
    }
    if (Array.isArray(value.names)) {
      return normalizeList(value.names, MAX_MCP_ALLOWED_TOOLS, 120);
    }
  }
  return normalizeList(value, MAX_MCP_ALLOWED_TOOLS, 120);
}

function normalizeMcpConfig(sourceValue = {}, fallbackValue = {}) {
  const source = sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue)
    ? sourceValue
    : {};
  const fallback = fallbackValue && typeof fallbackValue === "object" && !Array.isArray(fallbackValue)
    ? fallbackValue
    : {};
  const rawPreset = normalizeText(
    pickFirst(
      source,
      ["preset", "policyPreset", "policy_preset", "presetName"],
      fallback,
      ["preset", "policyPreset", "policy_preset", "presetName"],
      ""
    ),
    48
  ).toLowerCase();
  const preset = normalizeMcpPresetName(rawPreset, fallback.preset);
  const presetInvalid = Boolean((rawPreset && !preset) || source.presetInvalid === true);
  const presetPolicy = preset ? MCP_POLICY_PRESETS[preset] : null;
  const enabled = normalizeBool(
    pickFirst(source, ["enabled"], fallback, ["enabled"], false),
    normalizeBool(fallback.enabled, false)
  );
  const serverLabel = normalizeText(
    pickFirst(
      source,
      ["serverLabel", "server_label", "label"],
      fallback,
      ["serverLabel", "server_label", "label"],
      ""
    ),
    80
  );
  const serverUrl = normalizeBaseUrl(
    pickFirst(
      source,
      ["serverUrl", "server_url", "url"],
      fallback,
      ["serverUrl", "server_url", "url"],
      ""
    )
  );
  const connectorId = normalizeText(
    pickFirst(
      source,
      ["connectorId", "connector_id"],
      fallback,
      ["connectorId", "connector_id"],
      ""
    ),
    180
  );
  const authorization = normalizeText(
    pickFirst(source, ["authorization", "auth"], fallback, ["authorization", "auth"], ""),
    400
  );
  const headers = normalizeHeaderMap(
    pickFirst(source, ["headers"], fallback, ["headers"], {})
  );
  const allowedTools = normalizeAllowedTools(
    pickFirst(
      source,
      ["allowedTools", "allowed_tools", "tool_names", "tools"],
      fallback,
      ["allowedTools", "allowed_tools", "tool_names", "tools"],
      []
    )
  );
  const approvalModeProvided = hasOwn(source, "approvalMode")
    || hasOwn(source, "requireApproval")
    || hasOwn(source, "require_approval");
  let approvalMode = normalizeMcpApprovalMode(
    pickFirst(
      source,
      ["approvalMode", "requireApproval", "require_approval"],
      fallback,
      ["approvalMode", "requireApproval", "require_approval"],
      "auto"
    ),
    "auto"
  );
  const dynamicAllowlistProvided = hasOwn(source, "dynamicAllowlistMax")
    || hasOwn(source, "dynamic_allowlist_max");
  let dynamicAllowlistMax = normalizeMcpDynamicAllowlistMax(
    pickFirst(
      source,
      ["dynamicAllowlistMax", "dynamic_allowlist_max"],
      fallback,
      ["dynamicAllowlistMax", "dynamic_allowlist_max"],
      DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX
    ),
    DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX
  );
  if (presetPolicy) {
    if (!approvalModeProvided) {
      approvalMode = normalizeMcpApprovalMode(presetPolicy.approvalMode, approvalMode);
    }
    if (!dynamicAllowlistProvided) {
      dynamicAllowlistMax = normalizeMcpDynamicAllowlistMax(
        presetPolicy.dynamicAllowlistMax,
        dynamicAllowlistMax
      );
    }
  }
  const tokenReductionProfile = normalizeMcpTokenReductionProfile(
    pickFirst(
      source,
      ["tokenReductionProfile", "token_reduction_profile"],
      fallback,
      ["tokenReductionProfile", "token_reduction_profile"],
      DEFAULT_MCP_TOKEN_REDUCTION_PROFILE
    ),
    DEFAULT_MCP_TOKEN_REDUCTION_PROFILE
  );
  const tokenReductionPolicy = MCP_TOKEN_REDUCTION_PROFILES[tokenReductionProfile] || MCP_TOKEN_REDUCTION_PROFILES[DEFAULT_MCP_TOKEN_REDUCTION_PROFILE];
  const promptTokenLimitProvided = hasOwn(source, "promptTokenLimit")
    || hasOwn(source, "prompt_token_limit");
  let promptTokenLimit = normalizeMcpPromptTokenLimit(
    pickFirst(
      source,
      ["promptTokenLimit", "prompt_token_limit"],
      fallback,
      ["promptTokenLimit", "prompt_token_limit"],
      DEFAULT_MCP_PROMPT_TOKEN_LIMIT
    ),
    DEFAULT_MCP_PROMPT_TOKEN_LIMIT
  );
  if (!promptTokenLimitProvided && tokenReductionPolicy) {
    promptTokenLimit = normalizeMcpPromptTokenLimit(
      tokenReductionPolicy.promptTokenLimit,
      promptTokenLimit
    );
  }
  const toolSchemaModeProvided = hasOwn(source, "toolSchemaMode")
    || hasOwn(source, "tool_schema_mode");
  let toolSchemaMode = normalizeMcpToolSchemaMode(
    pickFirst(
      source,
      ["toolSchemaMode", "tool_schema_mode"],
      fallback,
      ["toolSchemaMode", "tool_schema_mode"],
      DEFAULT_MCP_TOOL_SCHEMA_MODE
    ),
    DEFAULT_MCP_TOOL_SCHEMA_MODE
  );
  if (!toolSchemaModeProvided && tokenReductionPolicy) {
    toolSchemaMode = normalizeMcpToolSchemaMode(tokenReductionPolicy.toolSchemaMode, toolSchemaMode);
  }
  if (tokenReductionPolicy) {
    dynamicAllowlistMax = Math.min(
      dynamicAllowlistMax,
      normalizeMcpDynamicAllowlistMax(tokenReductionPolicy.dynamicAllowlistCap, dynamicAllowlistMax)
    );
  }
  const skillHints = normalizeList(
    pickFirst(source, ["skillHints", "skill_hints"], fallback, ["skillHints", "skill_hints"], []),
    24,
    72
  );
  const webMcpHints = normalizeList(
    pickFirst(source, ["webMcpHints", "web_mcp_hints", "webHints", "web_hints"], fallback, ["webMcpHints", "web_mcp_hints", "webHints", "web_hints"], []),
    24,
    72
  );
  const contextTtlSeconds = normalizeMcpContextTtlSeconds(
    pickFirst(
      source,
      ["contextTtlSeconds", "context_ttl_seconds"],
      fallback,
      ["contextTtlSeconds", "context_ttl_seconds"],
      DEFAULT_MCP_CONTEXT_TTL_SECONDS
    ),
    DEFAULT_MCP_CONTEXT_TTL_SECONDS
  );
  const configured = Boolean(serverLabel && (serverUrl || connectorId));
  const configError = enabled && !configured ? "missing_mcp_server_config" : "";

  return {
    enabled,
    configured,
    configError,
    serverLabel,
    serverUrl,
    connectorId,
    authorization,
    headers,
    allowedTools,
    approvalMode,
    dynamicAllowlistMax,
    tokenReductionProfile,
    promptTokenLimit,
    toolSchemaMode,
    skillHints,
    webMcpHints,
    contextTtlSeconds,
    preset,
    presetInvalid
  };
}

function buildMcpConfigPatch(input = {}) {
  const body = input && typeof input === "object" ? input : {};
  const hasDefined = (key) => hasOwn(body, key) && body[key] !== undefined;
  const nested = body.mcp && typeof body.mcp === "object" && !Array.isArray(body.mcp)
    ? body.mcp
    : null;
  const clear = normalizeBool(
    nested && hasOwn(nested, "clear")
      ? nested.clear
      : pickFirst(body, ["mcpClear", "clearMcp"], null, null, false),
    false
  );
  const hasAny = Boolean(
    nested
    || hasDefined("mcpEnabled")
    || hasDefined("mcpServerLabel")
    || hasDefined("mcpServerUrl")
    || hasDefined("mcpConnectorId")
    || hasDefined("mcpAuthorization")
    || hasDefined("mcpHeaders")
    || hasDefined("mcpAllowedTools")
    || hasDefined("mcpApprovalMode")
    || hasDefined("mcpDynamicAllowlistMax")
    || hasDefined("mcpContextTtlSeconds")
    || hasDefined("mcpTokenReductionProfile")
    || hasDefined("mcpPromptTokenLimit")
    || hasDefined("mcpToolSchemaMode")
    || hasDefined("mcpSkillHints")
    || hasDefined("mcpWebMcpHints")
    || hasDefined("mcpPreset")
    || hasDefined("mcpPolicyPreset")
    || clear
  );
  if (!hasAny) {
    return { hasPatch: false, clear: false, value: {} };
  }

  const raw = {};
  if (nested) {
    Object.assign(raw, nested);
  }
  if (hasDefined("mcpEnabled")) raw.enabled = body.mcpEnabled;
  if (hasDefined("mcpServerLabel")) raw.serverLabel = body.mcpServerLabel;
  if (hasDefined("mcpServerUrl")) raw.serverUrl = body.mcpServerUrl;
  if (hasDefined("mcpConnectorId")) raw.connectorId = body.mcpConnectorId;
  if (hasDefined("mcpAuthorization")) raw.authorization = body.mcpAuthorization;
  if (hasDefined("mcpHeaders")) raw.headers = body.mcpHeaders;
  if (hasDefined("mcpAllowedTools")) raw.allowedTools = body.mcpAllowedTools;
  if (hasDefined("mcpApprovalMode")) raw.approvalMode = body.mcpApprovalMode;
  if (hasDefined("mcpDynamicAllowlistMax")) raw.dynamicAllowlistMax = body.mcpDynamicAllowlistMax;
  if (hasDefined("mcpContextTtlSeconds")) raw.contextTtlSeconds = body.mcpContextTtlSeconds;
  if (hasDefined("mcpTokenReductionProfile")) raw.tokenReductionProfile = body.mcpTokenReductionProfile;
  if (hasDefined("mcpPromptTokenLimit")) raw.promptTokenLimit = body.mcpPromptTokenLimit;
  if (hasDefined("mcpToolSchemaMode")) raw.toolSchemaMode = body.mcpToolSchemaMode;
  if (hasDefined("mcpSkillHints")) raw.skillHints = body.mcpSkillHints;
  if (hasDefined("mcpWebMcpHints")) raw.webMcpHints = body.mcpWebMcpHints;
  if (hasDefined("mcpPreset")) raw.preset = body.mcpPreset;
  if (hasDefined("mcpPolicyPreset")) raw.preset = body.mcpPolicyPreset;

  return {
    hasPatch: true,
    clear,
    value: raw
  };
}

module.exports = {
  DEFAULT_MCP_CONTEXT_TTL_SECONDS,
  DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX,
  DEFAULT_MCP_PROMPT_TOKEN_LIMIT,
  DEFAULT_MCP_TOKEN_REDUCTION_PROFILE,
  DEFAULT_MCP_TOOL_SCHEMA_MODE,
  MAX_MCP_ALLOWED_TOOLS,
  MCP_POLICY_PRESETS,
  MCP_TOKEN_REDUCTION_PROFILES,
  buildMcpConfigPatch,
  getExternalMcpPolicyPresets,
  getExternalMcpTokenReductionProfiles,
  normalizeAllowedTools,
  normalizeMcpApprovalMode,
  normalizeMcpConfig,
  normalizeMcpContextTtlSeconds,
  normalizeMcpDynamicAllowlistMax,
  normalizeMcpPresetName,
  normalizeMcpPromptTokenLimit,
  normalizeMcpTokenReductionProfile,
  normalizeMcpToolSchemaMode
};
