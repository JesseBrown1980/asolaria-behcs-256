const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { projectRoot } = require("../runtimePaths");
const { resolveToolPaths } = require("./systemPaths");

function createAugmentContextRuntime(deps = {}) {
  const runtimeFs = deps.fs || fs;
  const runtimePath = deps.path || path;
  const runtimeChildProcess = deps.childProcess || childProcess;
  const runtimeEnv = deps.env || process.env;
  const runtimeProjectRoot = deps.projectRoot || projectRoot;
  const runtimeResolveToolPaths = deps.resolveToolPaths || resolveToolPaths;
  const normalizeText = deps.normalizeText || ((value, maxLen = 400) => String(value || "").trim().slice(0, maxLen));
  const normalizeBaseUrl = deps.normalizeBaseUrl || ((value) => String(value || "").trim().replace(/\/+$/, ""));
  const normalizePath = deps.normalizePath || ((inputPath) => {
    const raw = String(inputPath || "").trim();
    if (!raw) return "";
    try {
      return runtimePath.resolve(raw);
    } catch (_error) {
      return "";
    }
  });
  const fileExists = deps.fileExists || ((targetPath) => {
    try {
      return Boolean(targetPath) && runtimeFs.existsSync(targetPath);
    } catch (_error) {
      return false;
    }
  });
  const commandExists = deps.commandExists || ((name) => {
    const command = String(name || "").trim();
    if (!command) return "";
    try {
      const result = runtimeChildProcess.spawnSync("where", [command], {
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
  });
  const defaultToolName = deps.defaultToolName || "codebase-retrieval";
  const bridgeStatusFile = deps.bridgeStatusFile || runtimePath.join(runtimeProjectRoot, "logs", "augment-mcp-bridge-status.json");
  const bridgeTokenFile = deps.bridgeTokenFile || runtimePath.join(runtimeProjectRoot, "logs", "augment-mcp-bridge-token.txt");
  const bridgeUrlFile = deps.bridgeUrlFile || runtimePath.join(runtimeProjectRoot, "logs", "augment-mcp-bridge-url.txt");

  function readJsonFile(targetPath) {
    try {
      return JSON.parse(runtimeFs.readFileSync(targetPath, "utf8"));
    } catch (_error) {
      return null;
    }
  }

  function readTextFile(targetPath) {
    try {
      return runtimeFs.readFileSync(targetPath, "utf8");
    } catch (_error) {
      return "";
    }
  }

  function getLocalBridgeRuntime() {
    const status = readJsonFile(bridgeStatusFile);
    const localUrl = normalizeBaseUrl(status?.localUrl || "");
    const publicBaseUrl = normalizeBaseUrl(readTextFile(bridgeUrlFile).trim());
    const publicMcpUrl = publicBaseUrl ? `${publicBaseUrl}/mcp` : "";
    const tokenFile = fileExists(bridgeTokenFile) ? bridgeTokenFile : "";
    return {
      available: Boolean(status?.ok && status?.upstream?.ready && localUrl),
      localUrl: localUrl || "",
      publicMcpUrl,
      tokenFile,
      mode: normalizeText(status?.upstream?.mode || "", 80) || "",
      note: normalizeText(status?.upstream?.note || "", 240) || "",
      startedAt: normalizeText(status?.startedAt || "", 80) || "",
      toolName: normalizeText(status?.upstream?.toolName || defaultToolName, 120) || defaultToolName
    };
  }

  function resolveAuggiePath(configuredPath = "") {
    const explicit = normalizePath(configuredPath);
    if (fileExists(explicit)) {
      return explicit;
    }

    const tools = runtimeResolveToolPaths();
    const appData = runtimeEnv.APPDATA || "";
    const localAppData = tools.localAppData || runtimeEnv.LOCALAPPDATA || "";
    const candidates = [
      commandExists("auggie"),
      commandExists("auggie.cmd"),
      commandExists("auggie.exe"),
      appData ? runtimePath.join(appData, "npm", "auggie.cmd") : "",
      localAppData ? runtimePath.join(localAppData, "Programs", "auggie", "auggie.exe") : "",
      "C:\\nvm4w\\nodejs\\auggie.cmd"
    ]
      .map((candidate) => normalizePath(candidate))
      .filter(Boolean);

    return candidates.find((candidate) => fileExists(candidate)) || "";
  }

  function listWslDistros() {
    const tools = runtimeResolveToolPaths();
    if (!tools.wslPath || !fileExists(tools.wslPath)) {
      return {
        available: false,
        distros: [],
        defaultDistro: ""
      };
    }
    try {
      const result = runtimeChildProcess.spawnSync(tools.wslPath, ["-l", "-q"], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 5000
      });
      const distros = String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/\0/g, "").trim())
        .filter(Boolean);
      return {
        available: true,
        distros,
        defaultDistro: distros[0] || ""
      };
    } catch (_error) {
      return {
        available: true,
        distros: [],
        defaultDistro: ""
      };
    }
  }

  return {
    getLocalBridgeRuntime,
    resolveAuggiePath,
    listWslDistros
  };
}

module.exports = {
  createAugmentContextRuntime
};
