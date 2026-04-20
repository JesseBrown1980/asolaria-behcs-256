const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { projectRoot } = require("../runtimePaths");
const { resolveToolPaths } = require("./systemPaths");
const { createAugmentContextRuntime } = require("./augmentContextRuntime");
const {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_APPROVAL_MODE,
  DEFAULT_CONTEXT_TTL_SECONDS,
  DEFAULT_PRESET,
  DEFAULT_SERVER_LABEL,
  DEFAULT_TOKEN_REDUCTION_PROFILE,
  createAugmentContextConfigRuntime
} = require("./augmentContextConfig");

const AUGMENT_BRIDGE_STATUS_FILE = path.join(projectRoot, "logs", "augment-mcp-bridge-status.json");
const AUGMENT_BRIDGE_TOKEN_FILE = path.join(projectRoot, "logs", "augment-mcp-bridge-token.txt");
const AUGMENT_BRIDGE_URL_FILE = path.join(projectRoot, "logs", "augment-mcp-bridge-url.txt");

function normalizeText(value, maxLen = 400) {
  return String(value || "").trim().slice(0, maxLen);
}

function normalizeBaseUrl(value) {
  return normalizeText(value, 800).replace(/\/+$/, "");
}

function normalizePath(inputPath) {
  const raw = normalizeText(inputPath, 1200);
  if (!raw) return "";
  try {
    return path.resolve(raw);
  } catch (_error) {
    return "";
  }
}

function fileExists(targetPath) {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch (_error) {
    return false;
  }
}

function commandExists(name) {
  const command = normalizeText(name, 120);
  if (!command) return "";
  try {
    const result = childProcess.spawnSync("where", [command], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000
    });
    if (result.status !== 0) return "";
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "";
  } catch (_error) {
    return "";
  }
}

function readJsonFile(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function readTextFile(targetPath) {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (_error) {
    return "";
  }
}

const augmentRuntime = createAugmentContextRuntime({
  fs,
  path,
  childProcess,
  projectRoot,
  resolveToolPaths,
  bridgeStatusFile: AUGMENT_BRIDGE_STATUS_FILE,
  bridgeTokenFile: AUGMENT_BRIDGE_TOKEN_FILE,
  bridgeUrlFile: AUGMENT_BRIDGE_URL_FILE,
  defaultToolName: DEFAULT_ALLOWED_TOOLS[0],
  normalizeText,
  normalizeBaseUrl,
  normalizePath,
  fileExists,
  commandExists
});

const augmentConfigRuntime = createAugmentContextConfigRuntime({
  path,
  projectRoot,
  augmentRuntime
});

function buildLocalMcpInstructions(config) {
  const workspaceRoot = augmentConfigRuntime.normalizePath(config.workspaceRoot || projectRoot) || projectRoot;
  const bridge = augmentRuntime.getLocalBridgeRuntime();
  if (bridge.available && bridge.localUrl) {
    return {
      recommended: "Use the local Asolaria MCP bridge. It is the owned runtime on this machine and does not require Auggie.",
      codexAddCommand: `codex mcp add augment-context --transport http \"${bridge.localUrl}\" --header \"Authorization: Bearer <bridge token>\"`,
      workspaceRoot,
      localUrl: bridge.localUrl,
      publicMcpUrl: bridge.publicMcpUrl || null,
      tokenFile: bridge.tokenFile || null,
      mode: bridge.mode || "local_workspace_search"
    };
  }
  const auggiePath = augmentRuntime.resolveAuggiePath(config.auggiePath || "");
  const executable = auggiePath || "auggie";
  const command = `codex mcp add augment-context -- \"${executable}\" --mcp --mcp-auto-workspace`;
  return {
    recommended: "Run Auggie locally as a sidecar for Codex sessions on the machine that owns the checked-out workspace.",
    codexAddCommand: command,
    workspaceRoot
  };
}

function getAugmentContextStatus() {
  const resolved = augmentConfigRuntime.resolveAugmentContextConfig();
  const wsl = augmentRuntime.listWslDistros();
  const bridgeRuntime = augmentRuntime.getLocalBridgeRuntime();
  const workspaceRoot = augmentConfigRuntime.normalizePath(resolved.workspaceRoot || projectRoot) || projectRoot;
  const workspaceExists = fileExists(workspaceRoot);
  const workspaceHasAugmentIgnore = fileExists(path.join(workspaceRoot, ".augmentignore"));
  const remoteConfigured = Boolean(resolved.serverLabel && (resolved.serverUrl || resolved.connectorId));
  const localRuntimeAvailable = Boolean(bridgeRuntime.available) || Boolean(resolved.auggiePath) || (resolved.useWsl && wsl.available);
  const warnings = [];

  if (resolved.mode === "remote_mcp" && !remoteConfigured) {
    warnings.push("Remote MCP mode is enabled but serverUrl/connectorId is missing.");
  }
  if (resolved.mode === "local_cli" && !localRuntimeAvailable) {
    warnings.push("Local bridge or Auggie runtime was not detected on this machine. Start the Asolaria bridge or switch to remote_mcp.");
  }
  if (resolved.mode === "local_cli") {
    warnings.push("Asolaria can surface the local read-only sidecar, but direct external-provider MCP apply currently requires remote_mcp.");
  }
  if (resolved.useWsl && !wsl.available) {
    warnings.push("useWsl is enabled but WSL was not detected.");
  }
  if (!workspaceExists) {
    warnings.push("workspaceRoot does not exist.");
  }
  if (workspaceExists && !workspaceHasAugmentIgnore) {
    warnings.push("workspaceRoot is missing .augmentignore. Indexing may include runtime or private state.");
  }

  let providerPatch = null;
  let applyReady = false;
  try {
    providerPatch = augmentConfigRuntime.buildAugmentContextProviderPatch(resolved);
    applyReady = true;
  } catch (_error) {
    providerPatch = null;
    applyReady = false;
  }

  return {
    enabled: Boolean(resolved.enabled),
    configured: resolved.mode === "remote_mcp" ? remoteConfigured : localRuntimeAvailable,
    mode: resolved.mode,
    source: resolved.source,
    updatedAt: resolved.updatedAt || null,
    serverLabel: resolved.serverLabel || DEFAULT_SERVER_LABEL,
    serverUrl: resolved.serverUrl || null,
    connectorId: resolved.connectorId || null,
    authorizationHint: augmentConfigRuntime.maskToken(resolved.authorization),
    headersConfigured: Object.keys(resolved.headers || {}).length > 0,
    allowedTools: augmentConfigRuntime.normalizeAllowedTools(resolved.allowedTools),
    preset: DEFAULT_PRESET,
    approvalMode: DEFAULT_APPROVAL_MODE,
    tokenReductionProfile: augmentConfigRuntime.normalizeTokenReductionProfile(
      resolved.tokenReductionProfile,
      DEFAULT_TOKEN_REDUCTION_PROFILE
    ),
    toolSchemaMode: augmentConfigRuntime.chooseToolSchemaMode(resolved.toolSchemaMode, resolved),
    contextTtlSeconds: augmentConfigRuntime.normalizeInt(
      resolved.contextTtlSeconds,
      DEFAULT_CONTEXT_TTL_SECONDS,
      60,
      24 * 60 * 60
    ),
    workspaceRoot,
    workspaceExists,
    workspaceHasAugmentIgnore,
    localRuntime: {
      available: localRuntimeAvailable,
      bridge: bridgeRuntime,
      auggiePath: resolved.auggiePath || null,
      useWsl: Boolean(resolved.useWsl),
      wslAvailable: Boolean(wsl.available),
      wslDistro: resolved.wslDistro || null,
      wslKnownDistros: wsl.distros
    },
    providerApplyReady: applyReady,
    providerPatch: augmentConfigRuntime.redactAugmentContextProviderPatch(providerPatch),
    localMcp: buildLocalMcpInstructions(resolved),
    warnings
  };
}

function setAugmentContextConfig(input = {}) {
  return augmentConfigRuntime.setAugmentContextConfig(input, getAugmentContextStatus);
}

module.exports = {
  resolveAugmentContextConfig: augmentConfigRuntime.resolveAugmentContextConfig,
  buildAugmentContextProviderPatch: augmentConfigRuntime.buildAugmentContextProviderPatch,
  redactAugmentContextProviderPatch: augmentConfigRuntime.redactAugmentContextProviderPatch,
  getAugmentContextStatus,
  setAugmentContextConfig
};
