function createSymphonyConfigRuntime(input = {}) {
  const fs = input.fs || require("fs");
  const path = input.path || require("path");
  const getSecret = typeof input.getSecret === "function"
    ? input.getSecret
    : () => null;
  const stateFile = String(input.stateFile || "");
  const secretName = String(input.secretName || "integrations.symphony");
  const defaultRuntimeKind = String(input.defaultRuntimeKind || "elixir_reference");
  const defaultLogsRoot = String(input.defaultLogsRoot || "");
  const defaultSourceRepoUrl = String(input.defaultSourceRepoUrl || "https://github.com/openai/symphony.git");
  const templateWorkflowPath = String(input.templateWorkflowPath || "");
  const validRuntimeKinds = input.validRuntimeKinds instanceof Set
    ? input.validRuntimeKinds
    : new Set(["elixir_reference", "custom"]);

  function normalizeText(value, maxLen = 600) {
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
      return process.env.USERPROFILE || process.env.HOME || raw;
    }
    if (raw.startsWith("~/") || raw.startsWith("~\\")) {
      return path.join(process.env.USERPROFILE || process.env.HOME || "", raw.slice(2));
    }
    return raw;
  }

  function normalizePath(inputPath) {
    const expanded = expandUserHome(inputPath);
    if (!expanded) return "";
    try {
      return path.resolve(expanded);
    } catch (_error) {
      return "";
    }
  }

  function normalizeRuntimeKind(value) {
    const runtime = normalizeText(value, 80).toLowerCase();
    if (!runtime) return defaultRuntimeKind;
    if (validRuntimeKinds.has(runtime)) {
      return runtime;
    }
    return defaultRuntimeKind;
  }

  function normalizeApiKey(value) {
    const raw = normalizeText(value, 400);
    if (!raw) return "";
    if (raw.length < 16) return "";
    if (/\s/.test(raw)) return "";
    return raw;
  }

  function maskToken(value) {
    const token = String(value || "");
    if (!token) return "";
    if (token.length <= 10) {
      return "*".repeat(token.length);
    }
    return `${token.slice(0, 4)}${"*".repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
  }

  function ensureDirExists(folderPath) {
    if (!folderPath) return;
    fs.mkdirSync(folderPath, { recursive: true });
  }

  function readJsonSafe(filePath, fallback = null) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_error) {
      return fallback;
    }
  }

  function writeJsonSafe(filePath, payload) {
    ensureDirExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  function readState() {
    return readJsonSafe(stateFile, {
      lastStartedAt: "",
      lastStoppedAt: "",
      lastError: "",
      lastLaunchCommand: "",
      lastLaunchCwd: "",
      lastPid: 0,
      lastResolvedCodexCommand: ""
    });
  }

  function writeState(next) {
    const current = readState();
    writeJsonSafe(stateFile, {
      ...current,
      ...(next && typeof next === "object" ? next : {})
    });
  }

  function resolveSymphonyConfig() {
    const envEnabled = process.env.ASOLARIA_SYMPHONY_ENABLED;
    const envRepoRoot = process.env.ASOLARIA_SYMPHONY_REPO_ROOT || "";
    const envWorkflowPath = process.env.ASOLARIA_SYMPHONY_WORKFLOW_PATH || "";
    const envLogsRoot = process.env.ASOLARIA_SYMPHONY_LOGS_ROOT || "";
    const envRuntime = process.env.ASOLARIA_SYMPHONY_RUNTIME || "";
    const envPort = process.env.ASOLARIA_SYMPHONY_PORT || "";
    const envCommand = process.env.ASOLARIA_SYMPHONY_COMMAND || "";
    const envWorkingDirectory = process.env.ASOLARIA_SYMPHONY_WORKDIR || process.env.ASOLARIA_SYMPHONY_WORKING_DIRECTORY || "";
    const envProjectSlug = process.env.ASOLARIA_SYMPHONY_LINEAR_PROJECT_SLUG || "";
    const envLinearApiKey = process.env.LINEAR_API_KEY || process.env.ASOLARIA_SYMPHONY_LINEAR_API_KEY || "";
    const envSourceRepoUrl = process.env.ASOLARIA_SYMPHONY_SOURCE_REPO_URL || "";
    const envWorkspaceRoot = process.env.ASOLARIA_SYMPHONY_WORKSPACE_ROOT || "";
    const envCodexCommand = process.env.ASOLARIA_SYMPHONY_CODEX_COMMAND || "";

    if (normalizeText(envRepoRoot) || normalizeApiKey(envLinearApiKey) || normalizeText(envCommand)) {
      return {
        enabled: normalizeBool(envEnabled, true),
        source: "env",
        updatedAt: null,
        repoRoot: normalizePath(envRepoRoot),
        workflowPath: normalizePath(envWorkflowPath),
        logsRoot: normalizePath(envLogsRoot) || defaultLogsRoot,
        runtime: normalizeRuntimeKind(envRuntime),
        port: normalizeInt(envPort, 4792, 0, 65535),
        command: normalizeText(envCommand, 1000),
        workingDirectory: normalizePath(envWorkingDirectory),
        linearProjectSlug: normalizeText(envProjectSlug, 160),
        linearApiKey: normalizeApiKey(envLinearApiKey),
        sourceRepoUrl: normalizeText(envSourceRepoUrl, 400) || defaultSourceRepoUrl,
        workspaceRoot: normalizePath(envWorkspaceRoot),
        codexCommand: normalizeText(envCodexCommand, 500) || "codex app-server"
      };
    }

    const secret = getSecret(secretName, { namespace: "owner" });
    const value = secret?.value || {};
    return {
      enabled: normalizeBool(value.enabled, false),
      source: secret ? "vault" : "none",
      updatedAt: secret?.updatedAt || null,
      repoRoot: normalizePath(value.repoRoot),
      workflowPath: normalizePath(value.workflowPath),
      logsRoot: normalizePath(value.logsRoot) || defaultLogsRoot,
      runtime: normalizeRuntimeKind(value.runtime),
      port: normalizeInt(value.port, 4792, 0, 65535),
      command: normalizeText(value.command, 1000),
      workingDirectory: normalizePath(value.workingDirectory),
      linearProjectSlug: normalizeText(value.linearProjectSlug, 160),
      linearApiKey: normalizeApiKey(value.linearApiKey),
      sourceRepoUrl: normalizeText(value.sourceRepoUrl, 400) || defaultSourceRepoUrl,
      workspaceRoot: normalizePath(value.workspaceRoot),
      codexCommand: normalizeText(value.codexCommand, 500) || "codex app-server"
    };
  }

  function summarizeConfig(config) {
    return {
      enabled: Boolean(config.enabled),
      configured: Boolean(config.repoRoot && config.workflowPath && config.linearProjectSlug && config.linearApiKey),
      source: config.source,
      updatedAt: config.updatedAt || null,
      runtime: config.runtime,
      port: Number(config.port || 0) || 0,
      repoRoot: config.repoRoot || "",
      workflowPath: config.workflowPath || "",
      logsRoot: config.logsRoot || "",
      command: config.command || "",
      workingDirectory: config.workingDirectory || "",
      linearProjectSlug: config.linearProjectSlug || "",
      linearApiKeyConfigured: Boolean(config.linearApiKey),
      linearApiKeyHint: maskToken(config.linearApiKey),
      sourceRepoUrl: config.sourceRepoUrl || "",
      workspaceRoot: config.workspaceRoot || "",
      codexCommand: config.codexCommand || "codex app-server",
      templateWorkflowPath
    };
  }

  return {
    normalizeText,
    normalizeBool,
    normalizeInt,
    expandUserHome,
    normalizePath,
    normalizeRuntimeKind,
    normalizeApiKey,
    maskToken,
    ensureDirExists,
    readJsonSafe,
    writeJsonSafe,
    readState,
    writeState,
    resolveSymphonyConfig,
    summarizeConfig
  };
}

module.exports = {
  createSymphonyConfigRuntime
};
