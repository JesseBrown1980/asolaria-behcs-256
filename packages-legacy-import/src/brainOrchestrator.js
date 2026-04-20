const { runCodex } = require("./connectors/codexConnector");
const { runVertexGemini } = require("./connectors/vertexConnector");
const { runGeminiApiGenerateContent } = require("./connectors/geminiApiConnector");
const { runAnthropicCli } = require("./connectors/anthropicCliConnector");
const { runGeminiCli } = require("./connectors/geminiCliConnector");
const {
  listConfiguredExternalProviders,
  runExternalProvider
} = require("./connectors/externalBrainConnector");
const { buildBrainSafetyPrefix } = require("./brainPolicy");
const { appendGraphEvent } = require("./graphRuntimeStore");
const DEFAULT_PROVIDER_CHAIN = Object.freeze([
  "anthropic",
  "codex",
  "gemini-api",
  "vertex",
  "gemini-cli",
  "cursor",
  "antigravity"
]);

function shouldFallbackToAlternateProvider(error) {
  const text = String(error?.message || error || "").toLowerCase();
  if (!text) {
    return true;
  }

  const hardStops = [
    "guardian blocked",
    "blocked by policy",
    "owner denied",
    "approval denied",
    "deny",
    "denied"
  ];
  if (hardStops.some((term) => text.includes(term))) {
    return false;
  }

  const triggers = [
    "429",
    "quota",
    "credit",
    "insufficient",
    "rate limit",
    "temporarily unavailable",
    "timed out",
    "failed to start codex",
    "not configured",
    "forbidden",
    "unauthorized",
    "authentication",
    "model",
    "unavailable"
  ];
  return triggers.some((term) => text.includes(term)) || text.length > 0;
}

function buildLowCostResponse(message, providersTried) {
  const prompt = String(message || "").trim();
  return [
    "Asolaria switched to low-cost fallback mode.",
    `Providers tried: ${providersTried.join(" -> ") || "none"}.`,
    `I could not complete full reasoning for: "${prompt}".`,
    "Next step: use routed tools (screenshot, Chrome inspect, PAD, local ops) until provider health recovers."
  ].join("\n");
}

function clampMemoryForCost(memoryContext, costMode) {
  const text = String(memoryContext || "").trim();
  if (!text) {
    return "";
  }

  if (costMode === "quality") {
    return text;
  }

  if (costMode === "balanced") {
    const lines = text.split("\n");
    return lines.slice(-10).join("\n");
  }

  const lines = text.split("\n");
  return lines.slice(-6).join("\n");
}

function providerBudgetForCost(costMode) {
  if (costMode === "quality") {
    return { timeoutMs: 300000, maxTokens: 1200, temperature: 0.2 };
  }
  if (costMode === "balanced") {
    return { timeoutMs: 90000, maxTokens: 850, temperature: 0.2 };
  }
  return { timeoutMs: 70000, maxTokens: 600, temperature: 0.1 };
}

function orderExternalProviders(providers) {
  const priority = {
    cursor: 0,
    antigravity: 1
  };
  return [...(Array.isArray(providers) ? providers : [])]
    .sort((a, b) => {
      const left = priority[String(a?.id || "").toLowerCase()] ?? 99;
      const right = priority[String(b?.id || "").toLowerCase()] ?? 99;
      if (left !== right) {
        return left - right;
      }
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
}

function normalizeBrainProviderId(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw) return "";
  if (raw === "gemini" || raw === "gemini-api" || raw === "geminiapi") return "gemini-api";
  if (raw === "gemini-cli" || raw === "google-cli") return "gemini-cli";
  if (raw === "vertex" || raw === "vertex-ai") return "vertex";
  if (raw === "anthropic" || raw === "claude" || raw === "anthropic-cli") return "anthropic";
  if (raw === "codex") return "codex";
  if (raw === "cursor") return "cursor";
  if (raw === "antigravity") return "antigravity";
  return "";
}

function parseBrainProviderOrder(value, fallback = []) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n|]/)
      : [];
  const parsed = [];
  for (const entry of source) {
    const provider = normalizeBrainProviderId(entry);
    if (!provider) continue;
    parsed.push(provider);
  }
  if (parsed.length > 0) {
    return parsed;
  }
  return Array.isArray(fallback) ? fallback.map((entry) => normalizeBrainProviderId(entry)).filter(Boolean) : [];
}

function dedupeProviderOrder(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const provider = normalizeBrainProviderId(item);
    if (!provider || seen.has(provider)) {
      continue;
    }
    seen.add(provider);
    out.push(provider);
  }
  return out;
}

function buildEffectiveProviderOrder(settings = {}) {
  const primary = normalizeBrainProviderId(settings.brainPrimaryProvider) || "anthropic";
  const fallback = parseBrainProviderOrder(
    settings.brainFallbackOrder,
    ["anthropic", "gemini-api", "vertex", "gemini-cli", "cursor", "antigravity"]
  );
  return dedupeProviderOrder([primary, ...fallback, ...DEFAULT_PROVIDER_CHAIN]);
}

function redactSensitiveFragments(text) {
  const raw = String(text || "");
  if (!raw) {
    return "";
  }
  return raw
    .replace(/\b(password|passphrase|token|api key|secret|private key|session cookie)\b\s*[:=]\s*[^\s,\n]+/gi, "$1=[REDACTED]")
    .replace(/\b(bearer)\s+[a-z0-9._~+/=-]{16,}\b/gi, "$1 [REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (match) => {
      const at = match.indexOf("@");
      if (at <= 1) return "[REDACTED_EMAIL]";
      return `${match.slice(0, 1)}***${match.slice(at)}`;
    });
}

function containsSensitiveMaterial(text) {
  const value = String(text || "");
  if (!value) {
    return false;
  }
  const patterns = [
    /\b(password|passphrase|token|api key|secret|private key|session cookie|oauth)\b/i,
    /\b(bearer)\s+[a-z0-9._~+/=-]{16,}\b/i
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function providerCriticality(providerId = "") {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (normalized === "codex" || normalized === "vertex") return "high";
  if (normalized === "cursor" || normalized === "antigravity") return "high";
  return "medium";
}

function recordProviderEvent(action, providerId, details = {}) {
  appendGraphEvent({
    component: "brain-orchestrator",
    category: "provider",
    action,
    status: details.status || "",
    actor: {
      type: "orchestrator",
      id: "asolaria"
    },
    target: {
      type: "provider",
      id: providerId,
      criticality: providerCriticality(providerId)
    },
    context: {
      mode: details.mode || "",
      tool: providerId,
      costMode: details.costMode || "",
      providersTried: Array.isArray(details.providersTried) ? details.providersTried.slice(0, 12).join(",") : ""
    },
    policy: {
      mode: details.mode || "",
      approvalState: details.approvalState || "",
      autonomous: true
    },
    detail: {
      note: details.note || "",
      error: details.error || ""
    }
  });
}

async function runBrainTask({ message, images, files, memoryContext, settings, toolPaths, onApprovalEscalated, codexOptions, executionProfile }) {
  const safeSettings = settings || {};
  const safeImages = Array.isArray(images) ? images : [];
  const safeFiles = Array.isArray(files) ? files : [];
  const safeExecutionProfile = executionProfile && typeof executionProfile === "object"
    ? executionProfile
    : {};
  const costMode = String(safeSettings.costMode || "low").toLowerCase();
  const providersTried = [];
  const policyPrefix = buildBrainSafetyPrefix(safeSettings);
  const slimMemory = clampMemoryForCost(memoryContext, costMode);
  const composedPrompt = [policyPrefix, "Task:", String(message || "").trim()].join("\n\n");
  const budget = providerBudgetForCost(costMode);
  const externalProviders = orderExternalProviders(listConfiguredExternalProviders());
  const externalById = new Map(
    externalProviders.map((provider) => [String(provider?.id || "").trim().toLowerCase(), provider])
  );
  const requestedProviderOrder = parseBrainProviderOrder(safeExecutionProfile.providerOrder, []);
  const providerOrder = requestedProviderOrder.length > 0
    ? dedupeProviderOrder(requestedProviderOrder)
    : buildEffectiveProviderOrder(safeSettings);
  const strictProviderMode = Boolean(safeExecutionProfile.disableFallback) || providerOrder.length <= 1;
  const internalOnly = Boolean(safeExecutionProfile.internalOnly);
  const externalBlockedForSensitiveData =
    safeImages.length > 0
    || safeFiles.length > 0
    || containsSensitiveMaterial(message)
    || containsSensitiveMaterial(memoryContext);
  let externalSensitiveBlockNoted = false;
  const requestedCodexSandbox = String(codexOptions?.sandbox || "").trim().toLowerCase();
  const codexSandbox = ["read-only", "workspace-write", "danger-full-access"].includes(requestedCodexSandbox)
    ? requestedCodexSandbox
    : "workspace-write";
  const requestedCodexApprovalMode = String(codexOptions?.askForApproval || "").trim().toLowerCase();
  const codexAskForApproval = ["untrusted", "on-failure", "on-request", "never"].includes(requestedCodexApprovalMode)
    ? requestedCodexApprovalMode
    : "never";
  const codexWebSearch = typeof safeExecutionProfile.codexWebSearch === "boolean"
    ? safeExecutionProfile.codexWebSearch
    : Boolean(safeSettings.codexWebSearch);

  for (const providerKey of providerOrder) {
    if (internalOnly && providerKey !== "codex") {
      providersTried.push(`${providerKey}-blocked-internal`);
      recordProviderEvent("provider_skipped", providerKey, {
        status: "blocked",
        mode: "brain",
        costMode,
        providersTried,
        note: "Execution profile restricted this run to the internal Codex lane."
      });
      continue;
    }

    if (providerKey === "codex") {
      const codexEnabled = Boolean(toolPaths?.codexPath);
      if (!codexEnabled) {
        providersTried.push("codex-unavailable");
        recordProviderEvent("provider_unavailable", "codex", {
          status: "blocked",
          mode: "brain",
          costMode,
          providersTried,
          note: "Codex path is unavailable."
        });
        if (strictProviderMode || safeExecutionProfile.failIfUnavailable) {
          throw new Error("Direct Codex lane is unavailable.");
        }
        continue;
      }
      providersTried.push("codex");
      recordProviderEvent("provider_attempt", "codex", {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const timeoutMs = costMode === "quality" ? 240000 : costMode === "balanced" ? 150000 : 90000;
        // Keep brain responses bounded for interactive channels even when policy prefers pay-priority approvals.
        // Approval windows still apply inside the connector, but the outer task should not stall for 20 minutes.
        const effectiveTimeoutMs = Math.max(60000, Math.min(300000, Number(timeoutMs || 90000)));
        const result = await runCodex({
          prompt: composedPrompt,
          images: safeImages,
          memoryContext: slimMemory,
          model: String(safeSettings.codexModel || "").trim(),
          modelReasoningEffort: String(safeSettings.codexModelReasoningEffort || "").trim().toLowerCase(),
          approvalMode: safeSettings.approvalMode || "smart",
          approvalPreference: safeSettings.approvalPreference || "balanced",
          webSearch: codexWebSearch,
          sandbox: codexSandbox,
          askForApproval: codexAskForApproval,
          timeoutMs: effectiveTimeoutMs,
          approvalWaitMs: Number(safeSettings.approvalWaitMs || 20 * 60 * 1000),
          onApprovalEscalated
        });
        recordProviderEvent("provider_succeeded", "codex", {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: "codex",
          model: String(result?.resolvedModel || result?.model || safeSettings.codexModel || "").trim(),
          providersTried,
          ...result
        };
      } catch (error) {
        recordProviderEvent("provider_failed", "codex", {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "codex_failed").slice(0, 220)
        });
        if (strictProviderMode) {
          throw error;
        }
        if (!shouldFallbackToAlternateProvider(error)) {
          throw error;
        }
        continue;
      }
    }

    if (providerKey === "vertex") {
      providersTried.push("vertex");
      recordProviderEvent("provider_attempt", "vertex", {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const prompt = [
          policyPrefix,
          "Task:",
          String(message || "").trim(),
          slimMemory ? `Context:\n${slimMemory}` : ""
        ].filter(Boolean).join("\n\n");
        const result = await runVertexGemini({
          prompt,
          maxOutputTokens: budget.maxTokens,
          temperature: budget.temperature
        }, {
          enabled: true
        });
        recordProviderEvent("provider_succeeded", "vertex", {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: "vertex",
          model: String(result?.model || "").trim(),
          providersTried,
          reply: result.reply,
          approvals: [],
          imagesUsed: safeImages,
          raw: result.raw,
          budget: result.budget || null
        };
      } catch (error) {
        recordProviderEvent("provider_failed", "vertex", {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "vertex_failed").slice(0, 220)
        });
        if (!shouldFallbackToAlternateProvider(error)) {
          throw error;
        }
        continue;
      }
    }

    if (providerKey === "anthropic") {
      providersTried.push("anthropic");
      recordProviderEvent("provider_attempt", "anthropic", {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const prompt = [
          policyPrefix,
          "Task:",
          String(message || "").trim(),
          slimMemory ? `Context:\n${slimMemory}` : ""
        ].filter(Boolean).join("\n\n");
        const result = await runAnthropicCli(prompt, {
          timeoutMs: budget.timeoutMs,
          model: String(safeSettings.anthropicModel || process.env.ASOLARIA_ANTHROPIC_MODEL || "").trim()
        });
        recordProviderEvent("provider_succeeded", "anthropic", {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: "anthropic",
          model: String(result?.model || safeSettings.anthropicModel || process.env.ASOLARIA_ANTHROPIC_MODEL || "").trim(),
          providersTried,
          reply: result.reply,
          approvals: [],
          imagesUsed: safeImages,
          raw: result.raw
        };
      } catch (error) {
        recordProviderEvent("provider_failed", "anthropic", {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "anthropic_failed").slice(0, 220)
        });
        if (!shouldFallbackToAlternateProvider(error)) {
          throw error;
        }
        continue;
      }
    }

    if (providerKey === "gemini-cli") {
      providersTried.push("gemini-cli");
      recordProviderEvent("provider_attempt", "gemini-cli", {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const prompt = [
          policyPrefix,
          "Task:",
          String(message || "").trim(),
          slimMemory ? `Context:\n${slimMemory}` : ""
        ].filter(Boolean).join("\n\n");
        const result = await runGeminiCli(prompt, {
          timeoutMs: budget.timeoutMs,
          model: String(safeSettings.geminiCliModel || process.env.ASOLARIA_GEMINI_MODEL || "").trim()
        });
        recordProviderEvent("provider_succeeded", "gemini-cli", {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: "gemini-cli",
          model: String(result?.model || safeSettings.geminiCliModel || process.env.ASOLARIA_GEMINI_MODEL || "").trim(),
          providersTried,
          reply: result.reply,
          approvals: [],
          imagesUsed: safeImages,
          raw: result.raw
        };
      } catch (error) {
        recordProviderEvent("provider_failed", "gemini-cli", {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "gemini_cli_failed").slice(0, 220)
        });
        if (!shouldFallbackToAlternateProvider(error)) {
          throw error;
        }
        continue;
      }
    }

    if (providerKey === "gemini-api") {
      providersTried.push("gemini-api");
      recordProviderEvent("provider_attempt", "gemini-api", {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const prompt = [
          "Task:",
          String(message || "").trim(),
          slimMemory ? `Context:\n${slimMemory}` : ""
        ].filter(Boolean).join("\n\n");
        const result = await runGeminiApiGenerateContent({
          prompt,
          system: policyPrefix,
          maxOutputTokens: budget.maxTokens,
          temperature: budget.temperature
        }, {
          enabled: true
        });
        recordProviderEvent("provider_succeeded", "gemini-api", {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: "gemini-api",
          model: String(result?.model || "").trim(),
          providersTried,
          reply: result.reply,
          approvals: [],
          imagesUsed: safeImages,
          raw: result.raw
        };
      } catch (error) {
        recordProviderEvent("provider_failed", "gemini-api", {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "gemini_api_failed").slice(0, 220)
        });
        if (!shouldFallbackToAlternateProvider(error)) {
          throw error;
        }
        continue;
      }
    }

    if (providerKey === "cursor" || providerKey === "antigravity") {
      if (externalBlockedForSensitiveData) {
        if (!externalSensitiveBlockNoted) {
          providersTried.push("external-blocked-sensitive");
          externalSensitiveBlockNoted = true;
        }
        recordProviderEvent("provider_skipped", providerKey, {
          status: "blocked",
          mode: "brain",
          costMode,
          providersTried,
          note: "External provider blocked for sensitive data."
        });
        continue;
      }
      const provider = externalById.get(providerKey);
      if (!provider) {
        providersTried.push(`${providerKey}-not-configured`);
        recordProviderEvent("provider_unavailable", providerKey, {
          status: "blocked",
          mode: "brain",
          costMode,
          providersTried,
          note: "External provider not configured."
        });
        continue;
      }
      providersTried.push(provider.id);
      recordProviderEvent("provider_attempt", provider.id, {
        status: "attempting",
        mode: "brain",
        costMode,
        providersTried
      });
      try {
        const result = await runExternalProvider(provider, {
          prompt: [
            policyPrefix,
            "Task:",
            redactSensitiveFragments(String(message || "").trim()),
            slimMemory ? `Context:\n${redactSensitiveFragments(slimMemory)}` : ""
          ].filter(Boolean).join("\n\n"),
          timeoutMs: budget.timeoutMs,
          maxTokens: budget.maxTokens,
          temperature: budget.temperature
        });
        recordProviderEvent("provider_succeeded", provider.id, {
          status: "ok",
          mode: "brain",
          costMode,
          providersTried
        });
        return {
          provider: provider.id,
          model: String(result?.model || "").trim(),
          providersTried,
          reply: result.reply,
          approvals: [],
          imagesUsed: safeImages,
          raw: result.raw
        };
      } catch (error) {
        recordProviderEvent("provider_failed", provider.id, {
          status: "failed",
          mode: "brain",
          costMode,
          providersTried,
          error: String(error?.message || error || "external_provider_failed").slice(0, 220)
        });
        // Continue to next external provider in configured order.
        continue;
      }
    }
  }

  if (strictProviderMode || safeExecutionProfile.failIfUnavailable) {
    throw new Error("Direct Codex lane did not complete successfully.");
  }

  providersTried.push("template-fallback");
  recordProviderEvent("provider_fallback", "template-fallback", {
    status: "degraded",
    mode: "brain",
    costMode,
    providersTried,
    note: "All configured providers failed or were unavailable."
  });
  return {
    provider: "template-fallback",
    providersTried,
    reply: buildLowCostResponse(message, providersTried),
    approvals: [],
    imagesUsed: safeImages
  };
}

module.exports = {
  runBrainTask
};
