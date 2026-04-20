"use strict";

const {
  DEFAULT_MCP_CONTEXT_TTL_SECONDS,
  DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX,
  DEFAULT_MCP_TOKEN_REDUCTION_PROFILE,
  DEFAULT_MCP_TOOL_SCHEMA_MODE,
  MAX_MCP_ALLOWED_TOOLS,
  MCP_POLICY_PRESETS,
  MCP_TOKEN_REDUCTION_PROFILES,
  buildMcpConfigPatch,
  normalizeAllowedTools,
  normalizeMcpApprovalMode,
  normalizeMcpConfig,
  normalizeMcpContextTtlSeconds,
  normalizeMcpDynamicAllowlistMax,
  normalizeMcpPromptTokenLimit,
  normalizeMcpTokenReductionProfile,
  normalizeMcpToolSchemaMode
} = require("./externalBrainMcpConfig");
const { normalizeProviderId } = require("./externalBrainProviderStatus");

const MCP_TOOL_LIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const READLIKE_VERBS = /\b(read|get|list|search|lookup|find|show|status|inspect|fetch|query|describe|summarize)\b/i;
const WRITELIKE_VERBS = /\b(write|edit|update|delete|create|send|post|upload|insert|replace|patch|remove|run|execute|deploy|restart|shutdown|approve|grant)\b/i;
const mcpToolCatalogByProvider = new Map();
const mcpResponseContextByKey = new Map();

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeText(value, maxLen = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
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

function pickFirst(source, keys, fallbackSource, fallbackKeys = keys, defaultValue = undefined) {
  if (source && typeof source === "object") {
    for (const key of keys) {
      if (hasOwn(source, key)) {
        return source[key];
      }
    }
  }
  if (fallbackSource && typeof fallbackSource === "object") {
    for (const key of fallbackKeys) {
      if (hasOwn(fallbackSource, key)) {
        return fallbackSource[key];
      }
    }
  }
  return defaultValue;
}

function buildMcpContextKey(providerId, contextKey) {
  const safeProviderId = String(providerId || "").trim().toLowerCase();
  const safeContextKey = normalizeText(contextKey, 180);
  if (!safeProviderId || !safeContextKey) {
    return "";
  }
  return `${safeProviderId}:${safeContextKey}`;
}

function pruneMcpCaches(nowMs = Date.now()) {
  for (const [key, value] of mcpToolCatalogByProvider.entries()) {
    const updatedAt = Number(value?.updatedAt || 0);
    if (!updatedAt || nowMs - updatedAt > MCP_TOOL_LIST_CACHE_TTL_MS) {
      mcpToolCatalogByProvider.delete(key);
    }
  }
  for (const [key, value] of mcpResponseContextByKey.entries()) {
    const expiresAt = Number(value?.expiresAt || 0);
    if (!expiresAt || nowMs >= expiresAt) {
      mcpResponseContextByKey.delete(key);
    }
  }
}

function cacheMcpToolNames(providerId, names = []) {
  const provider = String(providerId || "").trim().toLowerCase();
  const toolNames = normalizeAllowedTools(names);
  if (!provider || toolNames.length < 1) {
    return;
  }
  mcpToolCatalogByProvider.set(provider, {
    toolNames,
    updatedAt: Date.now()
  });
}

function getCachedMcpToolNames(providerId, contextKey = "") {
  pruneMcpCaches();
  const provider = String(providerId || "").trim().toLowerCase();
  if (!provider) {
    return [];
  }
  const names = [];
  const seen = new Set();

  const scopedKey = buildMcpContextKey(provider, contextKey);
  if (scopedKey) {
    const scoped = mcpResponseContextByKey.get(scopedKey);
    const scopedTools = Array.isArray(scoped?.toolNames) ? scoped.toolNames : [];
    for (const item of scopedTools) {
      const key = String(item || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(item);
      if (names.length >= MAX_MCP_ALLOWED_TOOLS) {
        return names;
      }
    }
  }

  const catalog = mcpToolCatalogByProvider.get(provider);
  const catalogTools = Array.isArray(catalog?.toolNames) ? catalog.toolNames : [];
  for (const item of catalogTools) {
    const key = String(item || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(item);
    if (names.length >= MAX_MCP_ALLOWED_TOOLS) {
      break;
    }
  }
  return names;
}

function getCachedPreviousResponseId(providerId, contextKey = "") {
  pruneMcpCaches();
  const scopedKey = buildMcpContextKey(providerId, contextKey);
  if (!scopedKey) {
    return "";
  }
  const entry = mcpResponseContextByKey.get(scopedKey);
  return normalizeText(entry?.previousResponseId || "", 220);
}

function cachePreviousResponse(providerId, contextKey, previousResponseId, ttlSeconds) {
  const scopedKey = buildMcpContextKey(providerId, contextKey);
  const responseId = normalizeText(previousResponseId, 220);
  if (!scopedKey || !responseId) {
    return;
  }
  const ttlMs = normalizeMcpContextTtlSeconds(ttlSeconds, DEFAULT_MCP_CONTEXT_TTL_SECONDS) * 1000;
  const previous = mcpResponseContextByKey.get(scopedKey);
  mcpResponseContextByKey.set(scopedKey, {
    ...previous,
    previousResponseId: responseId,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
}

function cacheScopedToolNames(providerId, contextKey, names, ttlSeconds) {
  const scopedKey = buildMcpContextKey(providerId, contextKey);
  const toolNames = normalizeAllowedTools(names);
  if (!scopedKey || toolNames.length < 1) {
    return;
  }
  const ttlMs = normalizeMcpContextTtlSeconds(ttlSeconds, DEFAULT_MCP_CONTEXT_TTL_SECONDS) * 1000;
  const previous = mcpResponseContextByKey.get(scopedKey);
  mcpResponseContextByKey.set(scopedKey, {
    ...previous,
    toolNames,
    updatedAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });
}

function summarizeMcpResponseContextEntry(key, value) {
  const rawKey = String(key || "");
  const splitAt = rawKey.indexOf(":");
  const provider = splitAt > 0 ? rawKey.slice(0, splitAt) : rawKey;
  const toolNames = normalizeAllowedTools(value?.toolNames || []);
  const hasPreviousResponseId = Boolean(normalizeText(value?.previousResponseId || "", 220));
  const updatedAt = Number(value?.updatedAt || 0);
  const expiresAt = Number(value?.expiresAt || 0);
  const ttlSecondsRemaining = expiresAt > 0
    ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
    : 0;
  return {
    provider: normalizeProviderId(provider) || provider,
    toolCount: toolNames.length,
    hasPreviousResponseId,
    updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : null,
    expiresAt: expiresAt > 0 ? new Date(expiresAt).toISOString() : null,
    ttlSecondsRemaining
  };
}

function getExternalMcpCacheStatus() {
  pruneMcpCaches();
  const providerCatalog = [];
  for (const [provider, value] of mcpToolCatalogByProvider.entries()) {
    const toolNames = normalizeAllowedTools(value?.toolNames || []);
    providerCatalog.push({
      provider,
      toolCount: toolNames.length,
      updatedAt: Number(value?.updatedAt || 0) > 0
        ? new Date(Number(value.updatedAt)).toISOString()
        : null
    });
  }
  providerCatalog.sort((a, b) => a.provider.localeCompare(b.provider));

  const scopedContexts = [];
  for (const [key, value] of mcpResponseContextByKey.entries()) {
    scopedContexts.push(summarizeMcpResponseContextEntry(key, value));
  }
  scopedContexts.sort((a, b) => {
    if (a.provider !== b.provider) {
      return String(a.provider || "").localeCompare(String(b.provider || ""));
    }
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });

  return {
    providerCatalogCount: providerCatalog.length,
    scopedContextCount: scopedContexts.length,
    providerCatalog,
    scopedContexts
  };
}

function clearExternalMcpCache(options = {}) {
  pruneMcpCaches();
  const provider = normalizeProviderId(options.provider || options.providerId || "");
  const contextKey = normalizeText(options.contextKey || options.mcpContextKey || "", 180);
  let removedProviderCatalog = 0;
  let removedContexts = 0;

  if (!provider && !contextKey) {
    removedProviderCatalog = mcpToolCatalogByProvider.size;
    removedContexts = mcpResponseContextByKey.size;
    mcpToolCatalogByProvider.clear();
    mcpResponseContextByKey.clear();
    return {
      scope: "all",
      removedProviderCatalog,
      removedContexts
    };
  }

  if (provider) {
    if (mcpToolCatalogByProvider.delete(provider)) {
      removedProviderCatalog += 1;
    }
  }

  if (provider && contextKey) {
    const scopedKey = buildMcpContextKey(provider, contextKey);
    if (scopedKey && mcpResponseContextByKey.delete(scopedKey)) {
      removedContexts += 1;
    }
  } else if (provider) {
    for (const key of Array.from(mcpResponseContextByKey.keys())) {
      if (!String(key || "").startsWith(`${provider}:`)) continue;
      mcpResponseContextByKey.delete(key);
      removedContexts += 1;
    }
  } else if (contextKey) {
    for (const key of Array.from(mcpResponseContextByKey.keys())) {
      const splitAt = String(key || "").indexOf(":");
      const suffix = splitAt >= 0 ? String(key).slice(splitAt + 1) : "";
      if (suffix !== contextKey) continue;
      mcpResponseContextByKey.delete(key);
      removedContexts += 1;
    }
  }

  return {
    scope: provider && contextKey
      ? "provider_context"
      : provider
        ? "provider"
        : "context",
    provider: provider || null,
    contextKey: contextKey || null,
    removedProviderCatalog,
    removedContexts
  };
}

function collectMcpToolNamesDeep(node, out, seen) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      collectMcpToolNamesDeep(item, out, seen);
      if (out.size >= MAX_MCP_ALLOWED_TOOLS) {
        return;
      }
    }
    return;
  }

  const maybeToolArrays = [];
  if (Array.isArray(node.tools)) maybeToolArrays.push(node.tools);
  if (Array.isArray(node.available_tools)) maybeToolArrays.push(node.available_tools);
  if (Array.isArray(node.tool_names)) maybeToolArrays.push(node.tool_names);
  if (Array.isArray(node.result?.tools)) maybeToolArrays.push(node.result.tools);
  if (Array.isArray(node.result?.available_tools)) maybeToolArrays.push(node.result.available_tools);
  if (Array.isArray(node.content?.tools)) maybeToolArrays.push(node.content.tools);

  for (const list of maybeToolArrays) {
    for (const item of list) {
      let name = "";
      if (typeof item === "string") {
        name = item;
      } else if (item && typeof item === "object") {
        name = item.name || item.tool_name || item.id || "";
      }
      const normalized = normalizeText(name, 120);
      if (!normalized) continue;
      out.add(normalized);
      if (out.size >= MAX_MCP_ALLOWED_TOOLS) {
        return;
      }
    }
  }

  for (const value of Object.values(node)) {
    if (!value || typeof value !== "object") continue;
    collectMcpToolNamesDeep(value, out, seen);
    if (out.size >= MAX_MCP_ALLOWED_TOOLS) {
      return;
    }
  }
}

function extractMcpToolNamesFromResponse(body) {
  const found = new Set();
  collectMcpToolNamesDeep(body, found, new Set());
  return normalizeAllowedTools(Array.from(found));
}

function selectDynamicAllowedTools(prompt, availableTools = [], maxItems = DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX, options = {}) {
  const tools = normalizeAllowedTools(availableTools);
  const limit = normalizeMcpDynamicAllowlistMax(maxItems, DEFAULT_MCP_DYNAMIC_ALLOWLIST_MAX);
  if (tools.length < 1 || limit < 1) {
    return [];
  }
  if (tools.length <= limit) {
    return tools;
  }

  const promptText = String(prompt || "");
  const skillHints = normalizeList(options.skillHints, 24, 72);
  const webMcpHints = normalizeList(options.webMcpHints, 24, 72);
  const queryText = [promptText, ...skillHints, ...webMcpHints].filter(Boolean).join(" ");
  const queryTokens = queryText.toLowerCase().match(/[a-z0-9_:-]{3,}/g) || [];
  const uniqueQueryTokens = Array.from(new Set(queryTokens)).slice(0, 60);

  const scored = tools.map((name) => {
    const lower = String(name || "").toLowerCase();
    let score = 0;
    for (const token of uniqueQueryTokens) {
      if (!token) continue;
      if (lower === token) score += 20;
      else if (lower.startsWith(token)) score += 8;
      else if (lower.includes(token)) score += 4;
    }
    if (READLIKE_VERBS.test(lower) && READLIKE_VERBS.test(queryText)) score += 2;
    if (WRITELIKE_VERBS.test(lower) && WRITELIKE_VERBS.test(queryText)) score += 5;
    return { name, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return normalizeAllowedTools(scored.slice(0, limit).map((item) => item.name));
}

function inferMcpRequireApproval(prompt = "", allowedTools = []) {
  const intentText = `${String(prompt || "")}\n${normalizeAllowedTools(allowedTools).join(" ")}`;
  const wantsWrite = WRITELIKE_VERBS.test(intentText);
  const wantsRead = READLIKE_VERBS.test(intentText);
  if (wantsWrite && wantsRead) {
    const writeTools = normalizeAllowedTools(allowedTools).filter((name) => WRITELIKE_VERBS.test(name));
    const readTools = normalizeAllowedTools(allowedTools).filter((name) => !WRITELIKE_VERBS.test(name));
    if (writeTools.length > 0 && readTools.length > 0) {
      return {
        always: { tool_names: writeTools },
        never: { tool_names: readTools }
      };
    }
    return "always";
  }
  if (wantsWrite) {
    return "always";
  }
  return "never";
}

function buildMcpRuntime(provider, payload = {}, prompt = "") {
  if (!provider || provider.apiStyle !== "openai_responses") {
    return null;
  }

  const providerMcp = normalizeMcpConfig(provider.mcp || {}, {});
  const patch = buildMcpConfigPatch(payload);
  const runtimeMcp = patch.hasPatch
    ? normalizeMcpConfig(patch.value, providerMcp)
    : providerMcp;
  if (runtimeMcp.presetInvalid) {
    throw new Error(`Invalid MCP preset override. Allowed: ${Object.keys(MCP_POLICY_PRESETS).join(", ")}.`);
  }
  const enabled = patch.hasPatch && patch.clear ? false : runtimeMcp.enabled;
  if (!enabled) {
    return null;
  }
  if (!runtimeMcp.configured) {
    throw new Error(`${provider.id} MCP is enabled but missing server_label and server_url/connector_id.`);
  }

  const contextKey = normalizeText(
    pickFirst(
      payload,
      ["mcpContextKey", "mcp_context_key", "contextKey", "context_key"],
      payload?.mcp,
      ["contextKey", "context_key"],
      ""
    ),
    180
  );
  const explicitAllowedTools = normalizeAllowedTools(
    pickFirst(
      payload,
      ["mcpAllowedTools", "allowedTools", "allowed_tools", "tool_names"],
      payload?.mcp,
      ["allowedTools", "allowed_tools", "tool_names"],
      runtimeMcp.allowedTools
    )
  );
  const dynamicAllowlistMax = normalizeMcpDynamicAllowlistMax(
    pickFirst(
      payload,
      ["mcpDynamicAllowlistMax", "dynamicAllowlistMax", "dynamic_allowlist_max"],
      payload?.mcp,
      ["dynamicAllowlistMax", "dynamic_allowlist_max"],
      runtimeMcp.dynamicAllowlistMax
    ),
    runtimeMcp.dynamicAllowlistMax
  );
  const tokenReductionProfile = normalizeMcpTokenReductionProfile(
    pickFirst(
      payload,
      ["mcpTokenReductionProfile", "tokenReductionProfile", "token_reduction_profile"],
      payload?.mcp,
      ["tokenReductionProfile", "token_reduction_profile"],
      runtimeMcp.tokenReductionProfile
    ),
    runtimeMcp.tokenReductionProfile
  );
  const tokenReductionPolicy = MCP_TOKEN_REDUCTION_PROFILES[tokenReductionProfile] || MCP_TOKEN_REDUCTION_PROFILES[DEFAULT_MCP_TOKEN_REDUCTION_PROFILE];
  const promptTokenLimit = normalizeMcpPromptTokenLimit(
    pickFirst(
      payload,
      ["mcpPromptTokenLimit", "promptTokenLimit", "prompt_token_limit"],
      payload?.mcp,
      ["promptTokenLimit", "prompt_token_limit"],
      runtimeMcp.promptTokenLimit
    ),
    runtimeMcp.promptTokenLimit
  );
  const toolSchemaMode = normalizeMcpToolSchemaMode(
    pickFirst(
      payload,
      ["mcpToolSchemaMode", "toolSchemaMode", "tool_schema_mode"],
      payload?.mcp,
      ["toolSchemaMode", "tool_schema_mode"],
      runtimeMcp.toolSchemaMode
    ),
    runtimeMcp.toolSchemaMode
  );
  const skillHints = normalizeList(
    pickFirst(
      payload,
      ["mcpSkillHints", "skillHints", "skill_hints"],
      payload?.mcp,
      ["skillHints", "skill_hints"],
      runtimeMcp.skillHints
    ),
    24,
    72
  );
  const webMcpHints = normalizeList(
    pickFirst(
      payload,
      ["mcpWebMcpHints", "webMcpHints", "web_mcp_hints", "webHints", "web_hints"],
      payload?.mcp,
      ["webMcpHints", "web_mcp_hints", "webHints", "web_hints"],
      runtimeMcp.webMcpHints
    ),
    24,
    72
  );
  const effectiveDynamicAllowlistMax = Math.min(
    dynamicAllowlistMax,
    normalizeMcpDynamicAllowlistMax(tokenReductionPolicy.dynamicAllowlistCap, dynamicAllowlistMax)
  );

  let allowedTools = explicitAllowedTools;
  if (allowedTools.length < 1 && effectiveDynamicAllowlistMax > 0) {
    const catalog = getCachedMcpToolNames(provider.id, contextKey);
    allowedTools = selectDynamicAllowedTools(prompt, catalog, effectiveDynamicAllowlistMax, {
      skillHints,
      webMcpHints
    });
  }

  const approvalMode = normalizeMcpApprovalMode(
    pickFirst(
      payload,
      ["mcpApprovalMode", "mcpRequireApproval", "requireApproval", "require_approval"],
      payload?.mcp,
      ["approvalMode", "requireApproval", "require_approval"],
      runtimeMcp.approvalMode
    ),
    runtimeMcp.approvalMode
  );
  const requireApproval = approvalMode === "auto"
    ? inferMcpRequireApproval(prompt, allowedTools)
    : approvalMode;

  const previousResponseId = contextKey
    ? getCachedPreviousResponseId(provider.id, contextKey)
    : "";

  return {
    enabled: true,
    serverLabel: runtimeMcp.serverLabel,
    serverUrl: runtimeMcp.serverUrl,
    connectorId: runtimeMcp.connectorId,
    authorization: runtimeMcp.authorization,
    headers: runtimeMcp.headers,
    allowedTools,
    requireApproval,
    contextKey,
    preset: runtimeMcp.preset || "",
    tokenReductionProfile,
    promptTokenLimit,
    toolSchemaMode,
    skillHints,
    webMcpHints,
    contextTtlSeconds: runtimeMcp.contextTtlSeconds,
    previousResponseId
  };
}

function persistMcpResponseState(provider, mcpRuntime, body) {
  if (!provider || !mcpRuntime || !body || typeof body !== "object") {
    return;
  }
  const responseId = normalizeText(body.id || body.response?.id || "", 220);
  if (mcpRuntime.contextKey && responseId) {
    cachePreviousResponse(provider.id, mcpRuntime.contextKey, responseId, mcpRuntime.contextTtlSeconds);
  }

  const discoveredTools = extractMcpToolNamesFromResponse(body);
  if (discoveredTools.length > 0) {
    cacheMcpToolNames(provider.id, discoveredTools);
    if (mcpRuntime.contextKey) {
      cacheScopedToolNames(
        provider.id,
        mcpRuntime.contextKey,
        discoveredTools,
        mcpRuntime.contextTtlSeconds
      );
    }
  }
}

function buildMcpToolDefinition(mcpRuntime) {
  if (!mcpRuntime) {
    return null;
  }
  const schemaMode = normalizeMcpToolSchemaMode(
    mcpRuntime.toolSchemaMode,
    DEFAULT_MCP_TOOL_SCHEMA_MODE
  );
  const tool = {
    type: "mcp",
    server_label: mcpRuntime.serverLabel
  };
  if (schemaMode === "pointer") {
    if (mcpRuntime.connectorId) {
      tool.connector_id = mcpRuntime.connectorId;
    } else if (mcpRuntime.serverUrl) {
      tool.server_url = mcpRuntime.serverUrl;
    }
  } else {
    if (mcpRuntime.serverUrl) {
      tool.server_url = mcpRuntime.serverUrl;
    }
    if (mcpRuntime.connectorId) {
      tool.connector_id = mcpRuntime.connectorId;
    }
    if (schemaMode === "full") {
      if (mcpRuntime.authorization) {
        tool.authorization = mcpRuntime.authorization;
      }
      if (mcpRuntime.headers && Object.keys(mcpRuntime.headers).length > 0) {
        tool.headers = mcpRuntime.headers;
      }
    }
  }
  if (Array.isArray(mcpRuntime.allowedTools) && mcpRuntime.allowedTools.length > 0) {
    tool.allowed_tools = mcpRuntime.allowedTools;
  }
  if (mcpRuntime.requireApproval) {
    tool.require_approval = mcpRuntime.requireApproval;
  }
  return tool;
}

module.exports = {
  buildMcpToolDefinition,
  buildMcpRuntime,
  clearExternalMcpCache,
  getExternalMcpCacheStatus,
  persistMcpResponseState
};
