const { spawn } = require("child_process");
const path = require("path");
const { resolveToolPaths } = require("./systemPaths");
const { ensureAccessToken, getGoogleIntegrationStatus } = require("./googleConnector");

function clipText(value, maxChars = 500) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 3)}...`;
}

function firstNonEmptyLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function safeJsonParse(text) {
  const source = String(text || "").trim();
  if (!source) {
    return null;
  }
  try {
    return JSON.parse(source);
  } catch (_error) {
    return null;
  }
}

function normalizeArgs(args) {
  if (!Array.isArray(args)) {
    throw new Error("Google Workspace CLI args must be an array.");
  }
  const normalized = args
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (normalized.length < 1) {
    throw new Error("Google Workspace CLI requires at least one argument.");
  }
  return normalized;
}

function resolveGoogleWorkspaceCliExecutable(options = {}) {
  const explicit = String(options.executable || "").trim();
  if (explicit) {
    return explicit;
  }

  const envOverride = String(process.env.ASOLARIA_GWS_PATH || "").trim();
  if (envOverride) {
    return envOverride;
  }

  const toolPaths = resolveToolPaths();
  const detected = String(toolPaths.gwsPath || "").trim();
  if (detected) {
    return detected;
  }

  return "gws";
}

async function buildGoogleWorkspaceCliEnv(options = {}) {
  const env = { ...process.env };
  const projectId = String(options.projectId || process.env.GOOGLE_WORKSPACE_PROJECT_ID || "").trim();
  if (projectId) {
    env.GOOGLE_WORKSPACE_PROJECT_ID = projectId;
  }

  let authSource = "";
  let accountEmail = "";
  if (options.useAsolariaAuth !== false) {
    const tokenInfo = await ensureAccessToken(String(options.account || options.email || "").trim());
    env.GOOGLE_WORKSPACE_CLI_TOKEN = String(tokenInfo.accessToken || "").trim();
    authSource = `asolaria_google:${String(tokenInfo.email || "").trim()}`;
    accountEmail = String(tokenInfo.email || "").trim();
  } else if (String(env.GOOGLE_WORKSPACE_CLI_TOKEN || "").trim()) {
    authSource = "env:GOOGLE_WORKSPACE_CLI_TOKEN";
  }

  return {
    env,
    authSource,
    accountEmail
  };
}

function spawnGoogleWorkspaceCli(executable, args, options = {}) {
  if (process.platform === "win32") {
    const parsed = path.parse(executable);
    const hasDir = Boolean(parsed.dir);
    const hasSpaces = /\s/.test(executable);
    const launchCommand = hasDir && hasSpaces ? parsed.base : executable;
    const launchCwd = hasDir && hasSpaces ? parsed.dir : process.cwd();
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", launchCommand, ...args], {
      windowsHide: true,
      cwd: launchCwd,
      env: options.env || process.env
    });
  }

  return spawn(executable, args, {
    windowsHide: true,
    cwd: process.cwd(),
    env: options.env || process.env
  });
}

function runGoogleWorkspaceCliRaw(args, options = {}) {
  return new Promise(async (resolve, reject) => {
    let normalizedArgs = [];
    try {
      normalizedArgs = normalizeArgs(args);
    } catch (error) {
      reject(error);
      return;
    }

    try {
      const executable = resolveGoogleWorkspaceCliExecutable(options);
      const timeoutMs = Math.max(10000, Math.min(180000, Number(options.timeoutMs || 120000)));
      const authContext = await buildGoogleWorkspaceCliEnv(options);
      const child = spawnGoogleWorkspaceCli(executable, normalizedArgs, { env: authContext.env });

      let stdout = "";
      let stderr = "";
      if (child.stdin && typeof child.stdin.end === "function") {
        child.stdin.end();
      }

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Google Workspace CLI timed out."));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Google Workspace CLI: ${error.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        const cleanStdout = String(stdout || "").trim();
        const cleanStderr = String(stderr || "").trim();
        if (code !== 0) {
          const summary = clipText(cleanStderr || cleanStdout || `exit code ${code}`, 450);
          return reject(new Error(`Google Workspace CLI exited with code ${code}. ${summary}`.trim()));
        }
        return resolve({
          executable,
          exitCode: Number(code || 0),
          stdout: cleanStdout,
          stderr: cleanStderr,
          authSource: authContext.authSource,
          accountEmail: authContext.accountEmail
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getGoogleWorkspaceCliStatus(options = {}) {
  const executable = resolveGoogleWorkspaceCliExecutable(options);
  const timeoutMs = Math.max(10000, Math.min(60000, Number(options.timeoutMs || 30000)));

  try {
    const versionResult = await runGoogleWorkspaceCliRaw(["schema", "drive.files.list"], {
      timeoutMs,
      executable,
      useAsolariaAuth: false
    });
    const versionProbe = await new Promise((resolve, reject) => {
      const child = spawnGoogleWorkspaceCli(executable, ["--version"], { env: process.env });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Google Workspace CLI version probe timed out."));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", () => {
        clearTimeout(timeout);
        resolve({
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim()
        });
      });
    });
    const version = firstNonEmptyLine(versionProbe.stdout || versionProbe.stderr) || null;
    const googleStatus = getGoogleIntegrationStatus();
    let authVerified = false;
    let authSource = "";
    let account = "";
    let authError = "";
    try {
      const tokenInfo = await ensureAccessToken(String(options.account || googleStatus.defaultAccount || "").trim());
      authVerified = Boolean(String(tokenInfo.accessToken || "").trim());
      authSource = `asolaria_google:${String(tokenInfo.email || "").trim()}`;
      account = String(tokenInfo.email || "").trim();
    } catch (error) {
      authError = String(error?.message || error || "google_auth_unavailable");
    }

    return {
      available: true,
      executable,
      version,
      schemaProbeOk: Boolean(versionResult?.stdout),
      authenticated: authVerified,
      authentication: authSource || "not_verified",
      account,
      connectedAccounts: Array.isArray(googleStatus.accounts) ? googleStatus.accounts : [],
      statusText: authVerified
        ? `Ready via ${authSource}.`
        : `Binary available, but Asolaria Google token bridge is not ready${authError ? `: ${clipText(authError, 180)}` : "."}`
    };
  } catch (error) {
    return {
      available: false,
      executable,
      authenticated: false,
      authentication: "unavailable",
      error: String(error?.message || error || "google_workspace_cli_unavailable"),
      statusText: clipText(error?.message || error || "google_workspace_cli_unavailable", 220)
    };
  }
}

async function runGoogleWorkspaceCli(args, options = {}) {
  const raw = await runGoogleWorkspaceCliRaw(args, options);
  const parsed = safeJsonParse(raw.stdout);
  return {
    account: raw.accountEmail || "",
    authSource: raw.authSource || "",
    output: parsed !== null ? parsed : raw.stdout,
    raw
  };
}

function manifest() {
  return {
    id: "google-workspace-cli",
    version: "1.0.0",
    description: "Bridges Asolaria Google OAuth tokens to the Google Workspace CLI (gws) for Drive, Docs, and Workspace API operations",
    capabilities: ["cli-execution", "token-bridge", "status-probe"],
    readScopes: ["google:drive", "google:docs", "google:workspace"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: [],
    sideEffects: ["child-process-spawn"],
    failureModes: ["cli-not-found", "cli-timeout", "auth-unavailable", "cli-nonzero-exit"],
    emittedEvents: []
  };
}

module.exports = {
  runGoogleWorkspaceCliRaw,
  runGoogleWorkspaceCli,
  getGoogleWorkspaceCliStatus,
  manifest
};
