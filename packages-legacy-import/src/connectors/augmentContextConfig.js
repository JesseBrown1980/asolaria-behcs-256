const path = require("path");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const { projectRoot } = require("../runtimePaths");

const AUGMENT_CONTEXT_SECRET_NAME = "integrations.augment_context";
const DEFAULT_MODE = "local_cli";
const DEFAULT_SERVER_LABEL = "augment-context";
const DEFAULT_ALLOWED_TOOLS = Object.freeze(["codebase-retrieval"]);
const SAFE_ALLOWED_TOOLS = new Set(DEFAULT_ALLOWED_TOOLS);
const DEFAULT_TOKEN_REDUCTION_PROFILE = "aggressive";
const DEFAULT_CONTEXT_TTL_SECONDS = 30 * 60;
const DEFAULT_PRESET = "read_only";
const DEFAULT_APPROVAL_MODE = "never";
const VALID_MODES = new Set(["local_cli", "remote_mcp"]);
const VALID_TOKEN_REDUCTION_PROFILES = new Set(["off", "balanced", "aggressive"]);
const VALID_TOOL_SCHEMA_MODES = new Set(["pointer", "compact", "full"]);

function createAugmentContextConfigRuntime(deps = {}) {
  const runtimeGetSecret = deps.getSecret || getSecret;
  const runtimeSetSecret = deps.setSecret || setSecret;
  const runtimeDeleteSecret = deps.deleteSecret || deleteSecret;
  const runtimeProjectRoot = deps.projectRoot || projectRoot;
  const runtimePath = deps.path || path;
  const runtimeEnv = deps.env || process.env;
  const augmentRuntime = deps.augmentRuntime;

  function normalizeText(value, maxLen = 400) {
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

  function normalizeInt(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(parsed)));
  }

  function expandUserHome(inputPath) {
    const raw = normalizeText(inputPath, 1200);
    if (!raw) return "";
    if (raw === "~") {
      return runtimeEnv.USERPROFILE || runtimeEnv.HOME || raw;
    }
    if (raw.startsWith("~/") || raw.startsWith("~\\")) {
      return runtimePath.join(runtimeEnv.USERPROFILE || runtimeEnv.HOME || "", raw.slice(2));
    }
    return raw;
  }

  function normalizePath(inputPath) {
    const expanded = expandUserHome(inputPath);
    if (!expanded) return "";
    try {
      return runtimePath.resolve(expanded);
    } catch (_error) {
      return "";
    }
  }

  function normalizeBaseUrl(value) {
    const raw = normalizeText(value, 800);
    if (!raw) return "";
    return raw.replace(/\/+$/, "");
  }

  function normalizeMode(value, fallback = DEFAULT_MODE) {
    const mode = normalizeText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (VALID_MODES.has(mode)) {
      return mode;
    }
    return fallback;
  }

  function normalizeTokenReductionProfile(value, fallback = DEFAULT_TOKEN_REDUCTION_PROFILE) {
    const profile = normalizeText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (VALID_TOKEN_REDUCTION_PROFILES.has(profile)) {
      return profile;
    }
    return fallback;
  }

  function normalizeToolSchemaMode(value) {
    const mode = normalizeText(value, 40).toLowerCase();
    if (VALID_TOOL_SCHEMA_MODES.has(mode)) {
      return mode;
    }
    return "";
  }

  function normalizeList(value, maxItems = 16, maxItemLen = 120) {
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

  function normalizeAllowedTools(value) {
    const tools = normalizeList(value, 8, 120);
    if (tools.length < 1) {
      return DEFAULT_ALLOWED_TOOLS.slice();
    }
    const invalid = tools.filter((item) => !SAFE_ALLOWED_TOOLS.has(String(item || "").trim().toLowerCase()));
    if (invalid.length) {
      throw new Error(`Unsupported Augment MCP tool(s): ${invalid.join(", ")}. Allowed: ${Array.from(SAFE_ALLOWED_TOOLS).join(", ")}.`);
    }
    return tools;
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

  function parseJsonObject(value) {
    const raw = normalizeText(value, 4000);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return normalizeHeaderMap(parsed);
    } catch (_error) {
      return {};
    }
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
  }

  function hasDefined(obj, key) {
    return hasOwn(obj, key) && obj[key] !== undefined;
  }

  function maskToken(value) {
    const token = String(value || "");
    if (!token) return "";
    if (token.length <= 10) {
      return "*".repeat(token.length);
    }
    return `${token.slice(0, 4)}${"*".repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
  }

  function maskHeaderMap(headers = {}) {
    const out = {};
    for (const [key, value] of Object.entries(headers || {})) {
      out[String(key)] = maskToken(value);
    }
    return out;
  }

  function redactAugmentContextProviderPatch(patch = null) {
    if (!patch || typeof patch !== "object") {
      return patch;
    }
    const redacted = { ...patch };
    if (redacted.mcpAuthorization) {
      redacted.mcpAuthorization = maskToken(redacted.mcpAuthorization);
    }
    if (redacted.mcpHeaders && typeof redacted.mcpHeaders === "object") {
      redacted.mcpHeaders = maskHeaderMap(redacted.mcpHeaders);
    }
    return redacted;
  }

  function readEnvConfig() {
    const envHeaders = parseJsonObject(runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_HEADERS_JSON || runtimeEnv.ASOLARIA_AUGMENT_HEADERS_JSON || "");
    const configuredPath = normalizePath(
      runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_AUGGIE_PATH
      || runtimeEnv.ASOLARIA_AUGMENT_AUGGIE_PATH
      || ""
    );
    const workspaceRoot = normalizePath(
      runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_WORKSPACE_ROOT
      || runtimeEnv.ASOLARIA_AUGMENT_WORKSPACE_ROOT
      || runtimeProjectRoot
    );
    const modeRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_MODE || runtimeEnv.ASOLARIA_AUGMENT_MODE || "";
    const serverLabelRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_SERVER_LABEL || runtimeEnv.ASOLARIA_AUGMENT_SERVER_LABEL || "";
    const serverUrlRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_SERVER_URL || runtimeEnv.ASOLARIA_AUGMENT_SERVER_URL || "";
    const connectorIdRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_CONNECTOR_ID || runtimeEnv.ASOLARIA_AUGMENT_CONNECTOR_ID || "";
    const authorizationRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_AUTHORIZATION || runtimeEnv.ASOLARIA_AUGMENT_AUTHORIZATION || "";
    const allowedToolsRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_ALLOWED_TOOLS || runtimeEnv.ASOLARIA_AUGMENT_ALLOWED_TOOLS || "";
    const tokenReductionProfileRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_TOKEN_REDUCTION_PROFILE || runtimeEnv.ASOLARIA_AUGMENT_TOKEN_REDUCTION_PROFILE || "";
    const toolSchemaModeRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_TOOL_SCHEMA_MODE || runtimeEnv.ASOLARIA_AUGMENT_TOOL_SCHEMA_MODE || "";
    const contextTtlRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_CONTEXT_TTL_SECONDS || runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_TTL_SECONDS || "";
    const wslDistroRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_WSL_DISTRO || runtimeEnv.ASOLARIA_AUGMENT_WSL_DISTRO || "";
    const enabledRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_ENABLED || runtimeEnv.ASOLARIA_AUGMENT_ENABLED || "";
    const useWslRaw = runtimeEnv.ASOLARIA_AUGMENT_CONTEXT_USE_WSL || runtimeEnv.ASOLARIA_AUGMENT_USE_WSL || "";

    const hasAny = Boolean(
      modeRaw
      || serverLabelRaw
      || serverUrlRaw
      || connectorIdRaw
      || authorizationRaw
      || allowedToolsRaw
      || tokenReductionProfileRaw
      || toolSchemaModeRaw
      || contextTtlRaw
      || wslDistroRaw
      || enabledRaw
      || useWslRaw
      || configuredPath
      || Object.keys(envHeaders).length > 0
      || workspaceRoot !== runtimeProjectRoot
    );

    return {
      hasAny,
      value: {
        enabled: enabledRaw ? normalizeBool(enabledRaw, true) : undefined,
        mode: modeRaw ? normalizeMode(modeRaw, DEFAULT_MODE) : undefined,
        serverLabel: serverLabelRaw ? normalizeText(serverLabelRaw, 80) : undefined,
        serverUrl: serverUrlRaw ? normalizeBaseUrl(serverUrlRaw) : undefined,
        connectorId: connectorIdRaw ? normalizeText(connectorIdRaw, 220) : undefined,
        authorization: authorizationRaw ? normalizeText(authorizationRaw, 400) : undefined,
        headers: Object.keys(envHeaders).length > 0 ? envHeaders : undefined,
        allowedTools: allowedToolsRaw ? normalizeAllowedTools(allowedToolsRaw) : undefined,
        tokenReductionProfile: tokenReductionProfileRaw
          ? normalizeTokenReductionProfile(tokenReductionProfileRaw, DEFAULT_TOKEN_REDUCTION_PROFILE)
          : undefined,
        toolSchemaMode: toolSchemaModeRaw ? normalizeToolSchemaMode(toolSchemaModeRaw) : undefined,
        contextTtlSeconds: contextTtlRaw
          ? normalizeInt(contextTtlRaw, DEFAULT_CONTEXT_TTL_SECONDS, 60, 24 * 60 * 60)
          : undefined,
        workspaceRoot,
        useWsl: useWslRaw ? normalizeBool(useWslRaw, false) : undefined,
        wslDistro: wslDistroRaw ? normalizeText(wslDistroRaw, 120) : undefined,
        auggiePath: configuredPath || undefined
      }
    };
  }

  function readVaultConfig() {
    const secret = runtimeGetSecret(AUGMENT_CONTEXT_SECRET_NAME, { namespace: "owner" });
    const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
    return {
      value,
      updatedAt: secret?.updatedAt || null,
      configured: Boolean(secret)
    };
  }

  function chooseToolSchemaMode(rawMode, config = {}) {
    const requested = normalizeToolSchemaMode(rawMode);
    if (requested) {
      return requested;
    }
    const hasSecrets = Boolean(config.authorization) || Object.keys(config.headers || {}).length > 0;
    if (hasSecrets) {
      return "full";
    }
    if (config.connectorId || config.serverUrl) {
      return "pointer";
    }
    return "compact";
  }

  function normalizeConfigValue(source = {}) {
    const raw = source && typeof source === "object" ? source : {};
    return {
      enabled: normalizeBool(raw.enabled, false),
      mode: normalizeMode(raw.mode, DEFAULT_MODE),
      serverLabel: normalizeText(raw.serverLabel || DEFAULT_SERVER_LABEL, 80) || DEFAULT_SERVER_LABEL,
      serverUrl: normalizeBaseUrl(raw.serverUrl || raw.url || ""),
      connectorId: normalizeText(raw.connectorId || "", 220),
      authorization: normalizeText(raw.authorization || raw.auth || "", 400),
      headers: normalizeHeaderMap(raw.headers),
      allowedTools: normalizeAllowedTools(raw.allowedTools),
      tokenReductionProfile: normalizeTokenReductionProfile(raw.tokenReductionProfile, DEFAULT_TOKEN_REDUCTION_PROFILE),
      toolSchemaMode: normalizeToolSchemaMode(raw.toolSchemaMode),
      contextTtlSeconds: normalizeInt(raw.contextTtlSeconds, DEFAULT_CONTEXT_TTL_SECONDS, 60, 24 * 60 * 60),
      workspaceRoot: normalizePath(raw.workspaceRoot || raw.workspacePath || runtimeProjectRoot) || runtimeProjectRoot,
      useWsl: normalizeBool(raw.useWsl, false),
      wslDistro: normalizeText(raw.wslDistro || "", 120),
      auggiePath: normalizePath(raw.auggiePath || "")
    };
  }

  function resolveAugmentContextConfig() {
    const vault = readVaultConfig();
    const env = readEnvConfig();
    const mergedRaw = {
      ...normalizeConfigValue(vault.value || {}),
      ...(env.hasAny ? Object.fromEntries(Object.entries(env.value || {}).filter(([, value]) => value !== undefined)) : {})
    };
    const normalized = normalizeConfigValue(mergedRaw);
    const wsl = augmentRuntime.listWslDistros();
    if (normalized.useWsl && !normalized.wslDistro && wsl.defaultDistro) {
      normalized.wslDistro = wsl.defaultDistro;
    }
    normalized.auggiePath = augmentRuntime.resolveAuggiePath(normalized.auggiePath);
    normalized.toolSchemaMode = chooseToolSchemaMode(normalized.toolSchemaMode, normalized);
    return {
      ...normalized,
      source: env.hasAny ? "env" : vault.configured ? "vault" : "default",
      updatedAt: vault.updatedAt || null
    };
  }

  function buildAugmentContextProviderPatch(input = {}) {
    const overrides = input && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
      : {};
    const resolved = {
      ...resolveAugmentContextConfig(),
      ...overrides
    };
    const mode = normalizeMode(resolved.mode, DEFAULT_MODE);
    if (mode !== "remote_mcp") {
      throw new Error("Augment apply requires mode=remote_mcp because the current external-provider runtime only supports remote MCP servers.");
    }
    const serverLabel = normalizeText(resolved.serverLabel || DEFAULT_SERVER_LABEL, 80) || DEFAULT_SERVER_LABEL;
    const serverUrl = normalizeBaseUrl(resolved.serverUrl || "");
    const connectorId = normalizeText(resolved.connectorId || "", 220);
    if (!serverUrl && !connectorId) {
      throw new Error("Augment remote MCP config requires serverUrl or connectorId.");
    }
    const headers = normalizeHeaderMap(resolved.headers);
    const authorization = normalizeText(resolved.authorization || "", 400);
    return {
      mode,
      mcpEnabled: normalizeBool(resolved.enabled, true),
      mcpServerLabel: serverLabel,
      mcpServerUrl: serverUrl || undefined,
      mcpConnectorId: connectorId || undefined,
      mcpAuthorization: authorization || undefined,
      mcpHeaders: Object.keys(headers).length ? headers : undefined,
      mcpAllowedTools: normalizeAllowedTools(resolved.allowedTools),
      mcpPreset: DEFAULT_PRESET,
      mcpApprovalMode: DEFAULT_APPROVAL_MODE,
      mcpDynamicAllowlistMax: 1,
      mcpContextTtlSeconds: normalizeInt(resolved.contextTtlSeconds, DEFAULT_CONTEXT_TTL_SECONDS, 60, 24 * 60 * 60),
      mcpTokenReductionProfile: normalizeTokenReductionProfile(resolved.tokenReductionProfile, DEFAULT_TOKEN_REDUCTION_PROFILE),
      mcpToolSchemaMode: chooseToolSchemaMode(resolved.toolSchemaMode, resolved)
    };
  }

  function setAugmentContextConfig(input = {}, getStatusFn) {
    if (input?.clear === true) {
      runtimeDeleteSecret(AUGMENT_CONTEXT_SECRET_NAME, { namespace: "owner" });
      return getStatusFn();
    }

    const secret = runtimeGetSecret(AUGMENT_CONTEXT_SECRET_NAME, { namespace: "owner" });
    const previous = secret?.value && typeof secret.value === "object" ? secret.value : {};
    const merged = { ...previous };

    if (hasDefined(input, "enabled")) {
      merged.enabled = normalizeBool(input.enabled, true);
    } else if (!hasOwn(merged, "enabled")) {
      merged.enabled = true;
    }
    if (hasDefined(input, "mode")) {
      merged.mode = normalizeMode(input.mode, DEFAULT_MODE);
    } else if (!hasOwn(merged, "mode")) {
      merged.mode = DEFAULT_MODE;
    }
    if (hasDefined(input, "serverLabel")) {
      merged.serverLabel = normalizeText(input.serverLabel || DEFAULT_SERVER_LABEL, 80) || DEFAULT_SERVER_LABEL;
    } else if (!hasOwn(merged, "serverLabel")) {
      merged.serverLabel = DEFAULT_SERVER_LABEL;
    }
    if (hasDefined(input, "serverUrl")) {
      merged.serverUrl = normalizeBaseUrl(input.serverUrl || input.url || "");
    }
    if (hasDefined(input, "connectorId")) {
      merged.connectorId = normalizeText(input.connectorId || "", 220);
    }
    if (hasDefined(input, "authorization")) {
      merged.authorization = normalizeText(input.authorization || input.auth || "", 400);
    }
    if (hasDefined(input, "headers")) {
      merged.headers = normalizeHeaderMap(input.headers);
    }
    if (hasDefined(input, "allowedTools")) {
      merged.allowedTools = normalizeAllowedTools(input.allowedTools);
    } else if (!hasOwn(merged, "allowedTools")) {
      merged.allowedTools = DEFAULT_ALLOWED_TOOLS.slice();
    }
    if (hasDefined(input, "tokenReductionProfile")) {
      merged.tokenReductionProfile = normalizeTokenReductionProfile(input.tokenReductionProfile, DEFAULT_TOKEN_REDUCTION_PROFILE);
    } else if (!hasOwn(merged, "tokenReductionProfile")) {
      merged.tokenReductionProfile = DEFAULT_TOKEN_REDUCTION_PROFILE;
    }
    if (hasDefined(input, "toolSchemaMode")) {
      merged.toolSchemaMode = normalizeToolSchemaMode(input.toolSchemaMode);
    }
    if (hasDefined(input, "contextTtlSeconds")) {
      merged.contextTtlSeconds = normalizeInt(input.contextTtlSeconds, DEFAULT_CONTEXT_TTL_SECONDS, 60, 24 * 60 * 60);
    } else if (!hasOwn(merged, "contextTtlSeconds")) {
      merged.contextTtlSeconds = DEFAULT_CONTEXT_TTL_SECONDS;
    }
    if (hasDefined(input, "workspaceRoot") || hasDefined(input, "workspacePath")) {
      merged.workspaceRoot = normalizePath(input.workspaceRoot || input.workspacePath || runtimeProjectRoot) || runtimeProjectRoot;
    } else if (!hasOwn(merged, "workspaceRoot")) {
      merged.workspaceRoot = runtimeProjectRoot;
    }
    if (hasDefined(input, "useWsl")) {
      merged.useWsl = normalizeBool(input.useWsl, false);
    } else if (!hasOwn(merged, "useWsl")) {
      merged.useWsl = false;
    }
    if (hasDefined(input, "wslDistro")) {
      merged.wslDistro = normalizeText(input.wslDistro || "", 120);
    }
    if (hasDefined(input, "auggiePath")) {
      merged.auggiePath = normalizePath(input.auggiePath || "");
    }

    const payload = {
      enabled: normalizeBool(merged.enabled, true),
      mode: normalizeMode(merged.mode, DEFAULT_MODE),
      serverLabel: normalizeText(merged.serverLabel || DEFAULT_SERVER_LABEL, 80) || DEFAULT_SERVER_LABEL,
      serverUrl: normalizeBaseUrl(merged.serverUrl || ""),
      connectorId: normalizeText(merged.connectorId || "", 220),
      authorization: normalizeText(merged.authorization || "", 400),
      headers: normalizeHeaderMap(merged.headers),
      allowedTools: normalizeAllowedTools(merged.allowedTools),
      tokenReductionProfile: normalizeTokenReductionProfile(merged.tokenReductionProfile, DEFAULT_TOKEN_REDUCTION_PROFILE),
      toolSchemaMode: normalizeToolSchemaMode(merged.toolSchemaMode),
      contextTtlSeconds: normalizeInt(merged.contextTtlSeconds, DEFAULT_CONTEXT_TTL_SECONDS, 60, 24 * 60 * 60),
      workspaceRoot: normalizePath(merged.workspaceRoot || runtimeProjectRoot) || runtimeProjectRoot,
      useWsl: normalizeBool(merged.useWsl, false),
      wslDistro: normalizeText(merged.wslDistro || "", 120),
      auggiePath: normalizePath(merged.auggiePath || ""),
      updatedAt: new Date().toISOString()
    };

    runtimeSetSecret(
      AUGMENT_CONTEXT_SECRET_NAME,
      payload,
      {
        app: "Asolaria",
        component: "augment-context",
        credentialOwner: "owner",
        actor: "owner",
        updatedBy: "api"
      },
      { namespace: "owner" }
    );

    return getStatusFn();
  }

  return {
    normalizeAllowedTools,
    normalizeInt,
    normalizePath,
    normalizeTokenReductionProfile,
    chooseToolSchemaMode,
    maskToken,
    redactAugmentContextProviderPatch,
    resolveAugmentContextConfig,
    buildAugmentContextProviderPatch,
    setAugmentContextConfig
  };
}

module.exports = {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_APPROVAL_MODE,
  DEFAULT_CONTEXT_TTL_SECONDS,
  DEFAULT_PRESET,
  DEFAULT_SERVER_LABEL,
  DEFAULT_TOKEN_REDUCTION_PROFILE,
  createAugmentContextConfigRuntime
};
