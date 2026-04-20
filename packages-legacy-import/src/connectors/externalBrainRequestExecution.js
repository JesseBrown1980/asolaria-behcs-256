"use strict";

const {
  DEFAULT_MCP_PROMPT_TOKEN_LIMIT,
  DEFAULT_MCP_TOKEN_REDUCTION_PROFILE,
  MCP_TOKEN_REDUCTION_PROFILES,
  normalizeMcpPromptTokenLimit,
  normalizeMcpTokenReductionProfile
} = require("./externalBrainMcpConfig");
const { normalizeBool } = require("./externalBrainProviderStatus");
const {
  buildMcpToolDefinition,
  buildMcpRuntime,
  persistMcpResponseState
} = require("./externalBrainMcpRuntime");

const API_MODEL_FALLBACKS = Object.freeze({
  "gpt-5.3-codex": "gpt-5.2-codex",
  "gpt-5.3-codex-spark": "gpt-5.2-codex"
});

function asNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function resolveApiModelForRequest(provider, requestedModel) {
  const requested = String(requestedModel || provider?.model || "").trim();
  if (!requested) {
    return { model: "", fallbackFrom: "" };
  }

  const normalizedRequested = requested.toLowerCase();
  const mappedFallback = API_MODEL_FALLBACKS[normalizedRequested] || "";
  const allowGpt53ViaApi = normalizeBool(process.env.ASOLARIA_ALLOW_GPT53_CODEX_API, false);
  const shouldFallback = (
    !allowGpt53ViaApi
    && provider?.apiStyle === "openai_responses"
    && Boolean(provider?.officialApi)
    && Boolean(mappedFallback)
  );

  if (shouldFallback) {
    return {
      model: mappedFallback,
      fallbackFrom: requested
    };
  }

  return {
    model: requested,
    fallbackFrom: ""
  };
}

function extractTextFromResponse(body) {
  if (!body || typeof body !== "object") {
    return "";
  }

  const openaiChoiceText = body?.choices?.[0]?.message?.content;
  if (typeof openaiChoiceText === "string" && openaiChoiceText.trim()) {
    return openaiChoiceText.trim();
  }
  if (Array.isArray(openaiChoiceText)) {
    const joined = openaiChoiceText
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
    if (joined) return joined;
  }

  const responseApiText = body?.output_text;
  if (typeof responseApiText === "string" && responseApiText.trim()) {
    return responseApiText.trim();
  }

  const outputs = Array.isArray(body?.output) ? body.output : [];
  for (const item of outputs) {
    const contentParts = Array.isArray(item?.content) ? item.content : [];
    const text = contentParts
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }

  const nestedText = body?.output?.[0]?.content?.[0]?.text;
  if (typeof nestedText === "string" && nestedText.trim()) {
    return nestedText.trim();
  }

  return "";
}

function estimateTokenCount(text = "") {
  const raw = String(text || "");
  if (!raw) return 0;
  return Math.max(1, Math.ceil(raw.length / 4));
}

function compactPromptForTokenBudget(prompt = "", maxTokens = 0) {
  const input = String(prompt || "").replace(/\r/g, "").trim();
  const budget = normalizeMcpPromptTokenLimit(maxTokens, DEFAULT_MCP_PROMPT_TOKEN_LIMIT);
  if (!input || budget < 1) {
    return {
      text: input,
      compacted: false,
      omitted: false
    };
  }

  const lines = input
    .split(/\n+/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const deduped = [];
  const seenTail = new Set();
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seenTail.has(key)) continue;
    seenTail.add(key);
    deduped.push(line);
  }
  const normalized = deduped.join("\n").trim();
  const tokenCount = estimateTokenCount(normalized);
  if (tokenCount <= budget) {
    return {
      text: normalized,
      compacted: normalized !== input,
      omitted: false
    };
  }

  const approxBudgetChars = Math.max(280, budget * 4);
  const marker = "\n\n[Asolaria token reduction: middle context omitted]\n\n";
  const headChars = Math.max(120, Math.floor(approxBudgetChars * 0.58));
  const tailChars = Math.max(120, approxBudgetChars - headChars);
  let head = normalized.slice(0, headChars).trimEnd();
  let tail = normalized.slice(Math.max(0, normalized.length - tailChars)).trimStart();
  if (head && !/[.!?:;\]\)]$/.test(head)) {
    head += "...";
  }
  if (tail && !/^[\[(A-Za-z0-9]/.test(tail)) {
    tail = tail.replace(/^[^\w\[(]+/, "");
  }
  const compacted = [head, tail].filter(Boolean).join(marker).trim();
  return {
    text: compacted || normalized,
    compacted: true,
    omitted: true
  };
}

function applyPromptTokenReduction(prompt = "", mcpRuntime = null) {
  const rawPrompt = String(prompt || "").trim();
  const beforeTokens = estimateTokenCount(rawPrompt);
  if (!rawPrompt || !mcpRuntime) {
    return {
      prompt: rawPrompt,
      profile: "off",
      beforeTokens,
      afterTokens: beforeTokens,
      compacted: false,
      omitted: false,
      promptTokenLimit: 0
    };
  }

  const profile = normalizeMcpTokenReductionProfile(
    mcpRuntime.tokenReductionProfile,
    DEFAULT_MCP_TOKEN_REDUCTION_PROFILE
  );
  const policy = MCP_TOKEN_REDUCTION_PROFILES[profile] || MCP_TOKEN_REDUCTION_PROFILES[DEFAULT_MCP_TOKEN_REDUCTION_PROFILE];
  const effectivePromptTokenLimit = normalizeMcpPromptTokenLimit(
    mcpRuntime.promptTokenLimit,
    policy.promptTokenLimit
  );
  if (profile === "off" || effectivePromptTokenLimit < 1) {
    return {
      prompt: rawPrompt,
      profile,
      beforeTokens,
      afterTokens: beforeTokens,
      compacted: false,
      omitted: false,
      promptTokenLimit: effectivePromptTokenLimit
    };
  }

  const compacted = compactPromptForTokenBudget(rawPrompt, effectivePromptTokenLimit);
  const reducedPrompt = String(compacted.text || rawPrompt).trim();
  return {
    prompt: reducedPrompt,
    profile,
    beforeTokens,
    afterTokens: estimateTokenCount(reducedPrompt),
    compacted: Boolean(compacted.compacted),
    omitted: Boolean(compacted.omitted),
    promptTokenLimit: effectivePromptTokenLimit
  };
}

function supportsTemperatureParameter(model = "") {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.includes("codex")) {
    return false;
  }
  return !/^gpt-5([.-]|$)/i.test(normalized);
}

function buildExternalRequestBody(provider, prompt, temperature, maxTokens, modelOverride = "", options = {}) {
  const model = String(modelOverride || provider.model || "").trim();
  const mcpRuntime = options.mcpRuntime || null;
  const includeTemperature = Number.isFinite(temperature) && supportsTemperatureParameter(model);
  if (provider.apiStyle === "openai_responses") {
    const body = {
      model,
      input: prompt,
      max_output_tokens: maxTokens
    };
    if (includeTemperature) {
      body.temperature = temperature;
    }
    if (mcpRuntime) {
      const mcpTool = buildMcpToolDefinition(mcpRuntime);
      if (mcpTool) {
        body.tools = [mcpTool];
      }
      if (mcpRuntime.previousResponseId) {
        body.previous_response_id = mcpRuntime.previousResponseId;
      }
    }
    return body;
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    max_tokens: maxTokens
  };
  if (includeTemperature) {
    body.temperature = temperature;
  }
  return body;
}

function buildExternalRequestHeaders(provider) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
    "User-Agent": "Asolaria/0.1"
  };
  if (provider.organization) {
    headers["OpenAI-Organization"] = provider.organization;
  }
  return headers;
}

async function runExternalProvider(provider, payload = {}) {
  const timeoutMs = Math.max(15000, Number(payload.timeoutMs || 90000));
  const maxTokens = Math.max(100, Math.min(1800, Math.round(asNumber(payload.maxTokens, 700))));
  const temperature = Math.max(0, Math.min(1, asNumber(payload.temperature, 0.2)));
  const prompt = String(payload.prompt || "").trim();
  const requestedModel = String(payload.model || provider.model || "").trim();
  const modelResolution = resolveApiModelForRequest(provider, requestedModel);
  const model = String(modelResolution.model || provider.model || "").trim();
  if (!prompt) {
    throw new Error("External provider prompt is required.");
  }
  const mcpRuntime = buildMcpRuntime(provider, payload, prompt);
  const reductionRuntime = applyPromptTokenReduction(prompt, mcpRuntime);
  const reducedPrompt = String(reductionRuntime.prompt || prompt).trim() || prompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${provider.apiBaseUrl}${provider.apiPath}`;
    const response = await fetch(url, {
      method: "POST",
      headers: buildExternalRequestHeaders(provider),
      body: JSON.stringify(
        buildExternalRequestBody(provider, reducedPrompt, temperature, maxTokens, model, { mcpRuntime })
      ),
      signal: controller.signal
    });

    const bodyText = await response.text();
    let body;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch (_error) {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      const summary = typeof body?.error?.message === "string"
        ? body.error.message
        : bodyText;
      throw new Error(`${provider.id} API ${response.status}: ${String(summary || "request failed").slice(0, 300)}`);
    }

    const reply = extractTextFromResponse(body);
    if (!reply) {
      throw new Error(`${provider.id} API returned no assistant text.`);
    }

    persistMcpResponseState(provider, mcpRuntime, body);

    return {
      provider: provider.id,
      model: model || provider.model,
      requestedModel: requestedModel || provider.model,
      modelFallback: modelResolution.fallbackFrom
        ? {
          from: modelResolution.fallbackFrom,
          to: model || provider.model,
          bypassEnv: "ASOLARIA_ALLOW_GPT53_CODEX_API=true"
        }
        : null,
      reply,
      tokenReduction: {
        profile: reductionRuntime.profile,
        promptTokenLimit: reductionRuntime.promptTokenLimit,
        beforePromptTokens: reductionRuntime.beforeTokens,
        afterPromptTokens: reductionRuntime.afterTokens,
        compacted: reductionRuntime.compacted,
        omittedMiddleContext: reductionRuntime.omitted,
        schemaMode: mcpRuntime?.toolSchemaMode || null,
        usedPreviousResponseId: Boolean(mcpRuntime?.previousResponseId),
        allowedToolsCount: Array.isArray(mcpRuntime?.allowedTools) ? mcpRuntime.allowedTools.length : 0
      },
      mcp: mcpRuntime
        ? {
          enabled: true,
          serverLabel: mcpRuntime.serverLabel,
          usedPreviousResponseId: Boolean(mcpRuntime.previousResponseId),
          contextKey: mcpRuntime.contextKey || "",
          allowedTools: mcpRuntime.allowedTools || [],
          preset: mcpRuntime.preset || "",
          requireApproval: mcpRuntime.requireApproval,
          tokenReductionProfile: mcpRuntime.tokenReductionProfile || DEFAULT_MCP_TOKEN_REDUCTION_PROFILE,
          promptTokenLimit: mcpRuntime.promptTokenLimit || 0,
          toolSchemaMode: mcpRuntime.toolSchemaMode || null,
          skillHints: mcpRuntime.skillHints || [],
          webMcpHints: mcpRuntime.webMcpHints || []
        }
        : null,
      raw: body
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  applyPromptTokenReduction,
  buildExternalRequestBody,
  buildExternalRequestHeaders,
  compactPromptForTokenBudget,
  estimateTokenCount,
  extractTextFromResponse,
  resolveApiModelForRequest,
  runExternalProvider,
  supportsTemperatureParameter
};
