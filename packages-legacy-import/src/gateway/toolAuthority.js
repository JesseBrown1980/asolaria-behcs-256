const path = require("path");
const { appendGraphEvent, appendActionManifest } = require("../graphRuntimeStore");
const { createGatewayToolApprovalStore, redactPreview } = require("./toolApprovalStore");

const localOpsConnector = require("../connectors/localOpsConnector");
const screenshotConnector = require("../connectors/screenshotConnector");
const githubConnector = require("../connectors/githubConnector");

function toError(message, status = 400, code = "bad_request", details = null) {
  const err = new Error(String(message || "request_failed"));
  err.status = status;
  err.code = code;
  if (details !== null && details !== undefined) {
    err.details = details;
  }
  return err;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function splitList(value) {
  return String(value || "")
    .split(/[;,]/g)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function parseListEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) {
    return Array.from(new Set((Array.isArray(fallback) ? fallback : []).filter(Boolean)));
  }
  return Array.from(new Set(splitList(raw)));
}

function parseJsonEnv(name, fallback = {}) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return fallback;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPattern(value, pattern) {
  const rawPattern = String(pattern || "").trim();
  if (!rawPattern) return false;
  if (rawPattern === "*") return true;
  const regexBody = rawPattern.split("*").map((part) => escapeRegex(part)).join(".*");
  const re = new RegExp(`^${regexBody}$`);
  return re.test(String(value || "").trim());
}

function parseApprovalTtlMs(config) {
  return clampInt(config?.tools?.approvals?.ttlMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000);
}

function toPolicy(config, repoRoot) {
  const allowPatterns = Array.isArray(config?.tools?.allow) ? config.tools.allow.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const requireApprovalPatterns = Array.isArray(config?.tools?.requireApproval)
    ? config.tools.requireApproval.map((item) => String(item || "").trim()).filter(Boolean)
    : ["localops.run", "sandbox.execute"];
  const toolsEnabled = parseBoolean(config?.tools?.enabled, true);

  const fallbackLocalRoots = [
    repoRoot,
    path.resolve(repoRoot, "..", "ai_healthcare_project"),
    path.resolve(repoRoot, "..", "source")
  ];
  const localOpsPolicy = {
    enabled: parseBoolean(process.env.ASOLARIA_LOCAL_OPS_ENABLED, true),
    allowedRoots: parseListEnv("ASOLARIA_LOCAL_OPS_ALLOWED_ROOTS", fallbackLocalRoots),
    aliases: {
      asolaria: repoRoot,
      ...parseJsonEnv("ASOLARIA_LOCAL_OPS_ALIASES", {})
    },
    defaultTimeoutMs: clampInt(process.env.ASOLARIA_LOCAL_OPS_TIMEOUT_MS, 15 * 60 * 1000, 10 * 1000, 30 * 60 * 1000),
    maxTimeoutMs: clampInt(process.env.ASOLARIA_LOCAL_OPS_MAX_TIMEOUT_MS, 30 * 60 * 1000, 10 * 1000, 60 * 60 * 1000),
    defaultMaxOutputChars: clampInt(process.env.ASOLARIA_LOCAL_OPS_MAX_OUTPUT_CHARS, 120000, 4000, 500000)
  };

  const browserPolicy = {
    enabled: parseBoolean(process.env.ASOLARIA_BROWSER_TASKS_ENABLED, true),
    allowLoopback: parseBoolean(process.env.ASOLARIA_BROWSER_TASKS_ALLOW_LOOPBACK, true),
    allowPrivateNetwork: parseBoolean(process.env.ASOLARIA_BROWSER_TASKS_ALLOW_PRIVATE_NETWORK, false),
    allowedHosts: parseListEnv("ASOLARIA_BROWSER_TASKS_ALLOWED_HOSTS", []),
    maxSteps: clampInt(process.env.ASOLARIA_BROWSER_TASKS_MAX_STEPS, 20, 1, 80),
    actionTimeoutMs: clampInt(process.env.ASOLARIA_BROWSER_TASKS_ACTION_TIMEOUT_MS, 12000, 1000, 60000)
  };

  const githubEnabled = parseBoolean(process.env.ASOLARIA_GITHUB_ENABLED, true);
  const sandboxBaseUrlRaw = String(config?.sandbox?.baseUrl || "").trim();
  const sandboxBaseUrl = sandboxBaseUrlRaw ? sandboxBaseUrlRaw.replace(/\/+$/, "") : "";

  return {
    toolsEnabled,
    allowPatterns,
    requireApprovalPatterns,
    approvalTtlMs: parseApprovalTtlMs(config),
    approvalStorePath: path.resolve(repoRoot, String(config?.tools?.approvals?.storeFile || "data/gateway-approvals.json")),
    localOpsPolicy,
    browserPolicy,
    githubEnabled,
    sandboxBaseUrl
  };
}

function createToolAuthority(input = {}) {
  const repoRoot = String(input.repoRoot || "").trim();
  if (!repoRoot) throw new Error("repoRoot is required.");
  const config = input.config || {};
  const onEvent = typeof input.onEvent === "function" ? input.onEvent : null;
  const authorityMode = input.authorityMode || null;
  const policy = toPolicy(config, repoRoot);

  const handlers = {
    "github.status": async () => githubConnector.getGithubIntegrationStatus({ enabled: policy.githubEnabled }),
    "github.repos": async ({ payload }) => githubConnector.listGithubRepos(payload || {}, { enabled: policy.githubEnabled }),
    "browser.task": async ({ payload }) => {
      if (!policy.browserPolicy.enabled) {
        throw toError("Browser tasks are disabled by policy.", 403, "tool_disabled");
      }
      return screenshotConnector.runBrowserTask({
        ...(payload || {}),
        allowLoopback: policy.browserPolicy.allowLoopback,
        allowPrivateNetwork: policy.browserPolicy.allowPrivateNetwork,
        allowedHosts: policy.browserPolicy.allowedHosts,
        maxSteps: policy.browserPolicy.maxSteps,
        actionTimeoutMs: policy.browserPolicy.actionTimeoutMs
      });
    },
    "localops.run": async ({ payload }) => {
      if (!policy.localOpsPolicy.enabled) {
        throw toError("Local ops are disabled by policy.", 403, "tool_disabled");
      }
      return localOpsConnector.runLocalProjectTask(payload || {}, policy.localOpsPolicy);
    },
    "sandbox.execute": async ({ payload }) => {
      const base = policy.sandboxBaseUrl;
      if (!base) {
        throw toError(
          "Sandbox endpoint is not configured.",
          503,
          "sandbox_not_configured"
        );
      }
      const res = await fetch(`${base}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload || {})
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { raw: text };
      }
      if (!res.ok) {
        throw toError(
          `Sandbox execute failed (HTTP ${res.status}).`,
          502,
          "sandbox_execute_failed",
          parsed
        );
      }
      return parsed;
    }
  };

  function emit(type, payload) {
    if (!onEvent) return;
    try {
      onEvent(type, payload);
    } catch {}
  }

  function isToolAllowed(tool) {
    if (!policy.toolsEnabled) return false;
    if (!policy.allowPatterns.length) return false;
    return policy.allowPatterns.some((pattern) => matchesPattern(tool, pattern));
  }

  function isApprovalRequired(tool) {
    return policy.requireApprovalPatterns.some((pattern) => matchesPattern(tool, pattern));
  }

  const approvalStore = createGatewayToolApprovalStore({
    storePath: policy.approvalStorePath,
    approvalTtlMs: policy.approvalTtlMs,
    emit,
    isApprovalRequired,
    errorFactory: toError
  });

  async function invoke(inputInvoke = {}) {
    const tool = String(inputInvoke.tool || "").trim();
    const actor = String(inputInvoke.actor || "unknown").trim().slice(0, 120);
    const payload = inputInvoke.payload && typeof inputInvoke.payload === "object" ? inputInvoke.payload : {};
    const approvalId = String(inputInvoke.approvalId || "").trim();

    if (!tool) throw toError("Tool is required.", 400, "tool_required");
    if (!isToolAllowed(tool)) throw toError(`Tool "${tool}" is not allowed by gateway policy.`, 403, "tool_not_allowed");
    const handler = handlers[tool];
    if (!handler) throw toError(`Unsupported tool "${tool}".`, 404, "tool_not_supported");

    let authorityGate = {
      allowed: true,
      mode: "operator_primary",
      autonomous: false
    };
    if (authorityMode && typeof authorityMode.evaluateInvocation === "function") {
      authorityGate = authorityMode.evaluateInvocation({ actor, tool, payload }) || authorityGate;
      if (!authorityGate.allowed) {
        throw toError(
          authorityGate.reason || `Authority mode blocked actor "${actor}" for tool "${tool}".`,
          403,
          "authority_mode_blocked",
          authorityGate
        );
      }
    }

    if (isApprovalRequired(tool)) {
      if (!approvalId) {
        const approval = approvalStore.createApproval({ tool, payload, actor });
        throw toError(
          `Tool "${tool}" requires approval.`,
          403,
          "approval_required",
          {
            approval
          }
        );
      }
      approvalStore.consumeApproval(approvalId, tool, payload, actor);
    }

    appendActionManifest({
      component: "gateway-tool-authority",
      action: tool,
      status: "requested",
      actor: {
        type: "gateway_actor",
        id: actor
      },
      target: {
        type: "gateway_tool",
        id: tool,
        criticality: isApprovalRequired(tool) ? "high" : "medium"
      },
      reason: `Gateway invoke requested for tool "${tool}".`,
      context: {
        tool
      },
      policy: {
        approvalState: isApprovalRequired(tool) ? (approvalId ? "approved" : "required") : "not_required",
        mode: authorityGate.mode || "",
        autonomous: Boolean(authorityGate.autonomous),
        rollbackRequired: isApprovalRequired(tool)
      },
      evidence: {
        inputPreview: JSON.stringify(redactPreview(payload || {})).slice(0, 320)
      }
    });

    try {
      const result = await handler({ tool, payload, actor });
      emit("tool.invoked", {
        tool,
        actor,
        mode: authorityGate.mode || "",
        ok: true,
        at: new Date().toISOString()
      });
      appendGraphEvent({
        component: "gateway-tool-authority",
        category: "gateway_invoke",
        action: "tool_invoked",
        status: "ok",
        actor: {
          type: "gateway_actor",
          id: actor
        },
        target: {
          type: "gateway_tool",
          id: tool,
          criticality: isApprovalRequired(tool) ? "high" : "medium"
        },
        context: {
          tool,
          mode: authorityGate.mode || ""
        },
        policy: {
          approvalState: isApprovalRequired(tool) ? "approved" : "not_required",
          mode: authorityGate.mode || "",
          autonomous: Boolean(authorityGate.autonomous)
        }
      });
      return {
        tool,
        actor,
        mode: authorityGate.mode || "",
        autonomous: Boolean(authorityGate.autonomous),
        result
      };
    } catch (error) {
      emit("tool.invoked", {
        tool,
        actor,
        mode: authorityGate.mode || "",
        ok: false,
        error: String(error?.message || error || "invoke_failed"),
        at: new Date().toISOString()
      });
      appendGraphEvent({
        component: "gateway-tool-authority",
        category: "gateway_invoke",
        action: "tool_failed",
        status: "failed",
        actor: {
          type: "gateway_actor",
          id: actor
        },
        target: {
          type: "gateway_tool",
          id: tool,
          criticality: isApprovalRequired(tool) ? "high" : "medium"
        },
        context: {
          tool,
          mode: authorityGate.mode || ""
        },
        policy: {
          approvalState: isApprovalRequired(tool) ? (approvalId ? "approved" : "required") : "not_required",
          mode: authorityGate.mode || "",
          autonomous: Boolean(authorityGate.autonomous)
        },
        detail: {
          error: String(error?.message || error || "invoke_failed").slice(0, 220)
        }
      });
      if (error && error.status) throw error;
      throw toError(String(error?.message || error || "invoke_failed"), 500, "tool_invoke_failed");
    }
  }

  return {
    invoke,
    listApprovals: approvalStore.listApprovals,
    decideApproval: approvalStore.decideApproval,
    getSummary: approvalStore.getSummary,
    getPolicy: () => ({
      toolsEnabled: policy.toolsEnabled,
      allowPatterns: policy.allowPatterns,
      requireApprovalPatterns: policy.requireApprovalPatterns,
      supportedTools: Object.keys(handlers).sort(),
      authorityMode: authorityMode && typeof authorityMode.getMode === "function"
        ? authorityMode.getMode()
        : ""
    })
  };
}

module.exports = {
  createToolAuthority,
  toError
};
