const { spawn } = require("child_process");
const path = require("path");
const { resolveToolPaths } = require("./systemPaths");

let _spawnPidFns = null;
function getSpawnPidFns() {
  if (_spawnPidFns === null) {
    try {
      const scb = require("../spawnContextBuilder");
      _spawnPidFns = { register: scb.registerSpawnPid, despawn: scb.despawnPid, generate: scb.generateVirtualPid };
    } catch (_) { _spawnPidFns = false; }
  }
  return _spawnPidFns || null;
}

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

function resolveClaudeExecutable(options = {}) {
  const explicit = String(options.executable || "").trim();
  if (explicit) {
    return explicit;
  }

  const envOverride = String(process.env.ASOLARIA_CLAUDE_PATH || "").trim();
  if (envOverride) {
    return envOverride;
  }

  const toolPaths = resolveToolPaths();
  const detected = String(toolPaths.claudePath || "").trim();
  if (detected) {
    return detected;
  }

  return "claude";
}

function inferAuthIssue(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return "";
  if (
    value.includes("api key")
    || value.includes("not authenticated")
    || value.includes("login")
    || value.includes("subscription")
    || value.includes("auth")
    || value.includes("token")
  ) {
    return "Anthropic CLI appears unauthenticated. Set `ANTHROPIC_API_KEY` or run Claude login/setup.";
  }
  return "";
}

function buildClaudeCliEnv(options = {}) {
  const env = { ...process.env };
  const preferSubscriptionAuth = options.preferSubscriptionAuth !== false;
  if (preferSubscriptionAuth) {
    delete env.ANTHROPIC_API_KEY;
    delete env.CLAUDE_API_KEY;
  }
  return env;
}

function runClaudeCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = resolveClaudeExecutable(options);
    const timeoutMs = Math.max(10000, Number(options.timeoutMs || 300000));
    const childEnv = buildClaudeCliEnv(options);

    let child;
    if (process.platform === "win32") {
      const parsed = path.parse(executable);
      const hasDir = Boolean(parsed.dir);
      const hasSpaces = /\s/.test(executable);
      const launchCommand = (hasDir && hasSpaces) ? parsed.base : executable;
      const launchCwd = (hasDir && hasSpaces) ? parsed.dir : process.cwd();
      child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", launchCommand, ...args], {
        windowsHide: true,
        cwd: launchCwd,
        env: childEnv
      });
    } else {
      child = spawn(executable, args, {
        windowsHide: true,
        cwd: process.cwd(),
        env: childEnv
      });
    }

    const pidFns = getSpawnPidFns();
    let spawnPid = null;
    if (pidFns) {
      try { spawnPid = pidFns.generate("anthropic-cli"); pidFns.register("anthropic-cli", spawnPid); } catch (_) {}
    }

    let stdout = "";
    let stderr = "";
    const stdinText = options.stdinText === undefined || options.stdinText === null
      ? ""
      : String(options.stdinText);
    if (child.stdin && typeof child.stdin.end === "function") {
      if (stdinText) {
        child.stdin.write(stdinText);
      }
      child.stdin.end();
    }
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Anthropic CLI timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Anthropic CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (spawnPid && pidFns) { try { pidFns.despawn("anthropic-cli"); } catch (_) {} }
      const cleanStdout = String(stdout || "").trim();
      const cleanStderr = String(stderr || "").trim();
      if (code !== 0) {
        const summary = clipText(cleanStderr || cleanStdout || `exit code ${code}`, 450);
        return reject(new Error(`Anthropic CLI exited with code ${code}. ${summary}`.trim()));
      }
      return resolve({
        executable,
        exitCode: Number(code || 0),
        stdout: cleanStdout,
        stderr: cleanStderr
      });
    });
  });
}

async function runAnthropicCli(prompt, options = {}) {
  const text = String(prompt || "").trim();
  if (!text) {
    throw new Error("Prompt is required for Anthropic CLI execution.");
  }

  const timeoutMs = Math.max(15000, Number(options.timeoutMs || 300000));
  const outputFormat = String(options.outputFormat || "text").trim() || "text";
  const permissionMode = String(options.permissionMode || "plan").trim() || "plan";
  const args = ["-p", "--output-format", outputFormat, "--input-format", "text", "--permission-mode", permissionMode];

  const model = String(options.model || "").trim();
  if (model) {
    args.push("--model", model);
  }

  const maxBudgetUsd = Number(options.maxBudgetUsd);
  if (Number.isFinite(maxBudgetUsd) && maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  const raw = await runClaudeCli(args, {
    timeoutMs,
    executable: options.executable,
    stdinText: `${text}\n`
  });
  const reply = String(raw.stdout || "").trim();
  if (!reply) {
    const combined = [raw.stderr, raw.stdout].filter(Boolean).join("\n");
    const authHint = inferAuthIssue(combined);
    const hint = authHint || "Anthropic CLI returned no reply text.";
    throw new Error(`${hint} ${clipText(combined, 400)}`.trim());
  }

  return {
    reply,
    raw
  };
}

function detectAuthSourceFromEnv() {
  if (String(process.env.ANTHROPIC_API_KEY || "").trim()) {
    return "env:ANTHROPIC_API_KEY";
  }
  if (String(process.env.CLAUDE_CODE_OAUTH_TOKEN || "").trim()) {
    return "env:CLAUDE_CODE_OAUTH_TOKEN";
  }
  if (String(process.env.CLAUDE_API_KEY || "").trim()) {
    return "env:CLAUDE_API_KEY";
  }
  return "";
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(String(text || "").trim() || "{}");
  } catch {
    return null;
  }
}

async function getAnthropicCliStatus(options = {}) {
  const executable = resolveClaudeExecutable(options);
  const timeoutMs = Math.max(8000, Number(options.timeoutMs || 15000));
  const verifyCapabilities = Boolean(options.verifyCapabilities);
  const preferSubscriptionAuth = options.preferSubscriptionAuth !== false;

  try {
    const versionResult = await runClaudeCli(["--version"], {
      timeoutMs,
      executable,
      preferSubscriptionAuth
    });
    const version = firstNonEmptyLine(versionResult.stdout || versionResult.stderr) || null;

    let supportsHeadless = true;
    if (verifyCapabilities) {
      try {
        const helpResult = await runClaudeCli(["--help"], {
          timeoutMs,
          executable,
          preferSubscriptionAuth
        });
        const helpText = [helpResult.stdout, helpResult.stderr].filter(Boolean).join("\n");
        supportsHeadless = /--print/i.test(helpText) && /--output-format/i.test(helpText);
      } catch (_error) {
        supportsHeadless = true;
      }
    }

    let authSource = preferSubscriptionAuth ? "" : detectAuthSourceFromEnv();
    let authVerified = authSource ? true : false;
    let statusText = authSource
      ? `Detected ${authSource}.`
      : "Authentication not verified from environment variables.";
    let authMetadata = {};
    if (!authVerified) {
      try {
        const authResult = await runClaudeCli(["auth", "status"], {
          timeoutMs,
          executable,
          preferSubscriptionAuth
        });
        const authPayload = parseJsonSafe(authResult.stdout || authResult.stderr);
        if (authPayload && typeof authPayload === "object") {
          authVerified = Boolean(authPayload.loggedIn);
          authSource = authVerified
            ? `cli:${String(authPayload.authMethod || "claude.ai").trim() || "claude.ai"}`
            : authSource;
          authMetadata = authPayload;
          const authParts = [];
          if (authPayload.loggedIn !== undefined) {
            authParts.push(`loggedIn=${authPayload.loggedIn ? "true" : "false"}`);
          }
          if (authPayload.authMethod) {
            authParts.push(`method=${String(authPayload.authMethod).trim()}`);
          }
          if (authPayload.apiProvider) {
            authParts.push(`provider=${String(authPayload.apiProvider).trim()}`);
          }
          if (authPayload.subscriptionType) {
            authParts.push(`plan=${String(authPayload.subscriptionType).trim()}`);
          }
          statusText = authParts.length > 0
            ? authParts.join(" | ")
            : statusText;
        }
      } catch (_error) {
        // Keep the environment-based fallback summary.
      }
    }

    if (!supportsHeadless) {
      return {
        available: false,
        executable,
        version,
        authenticated: authVerified,
        authentication: authSource || "unknown",
        statusText,
        authMetadata,
        error: "Installed Claude CLI does not expose required non-interactive flags (`--print`, `--output-format`)."
      };
    }

    return {
      available: true,
      executable,
      version,
      authenticated: authVerified,
      authentication: authSource || "unknown",
      statusText,
      authMetadata,
      error: null
    };
  } catch (error) {
    return {
      available: false,
      executable,
      version: null,
      authenticated: false,
      authentication: "unknown",
      statusText: "",
      error: clipText(error.message, 800)
    };
  }
}

function manifest() {
  return {
    id: "anthropicCli",
    version: "1.0.0",
    description: "Anthropic/Claude CLI connector — local Claude Code and Anthropic API execution",
    capabilities: ["claude_cli_run", "anthropic_api_run", "status_check"],
    readScopes: ["local_filesystem"],
    writeScopes: ["local_filesystem"],
    approvalRequired: false,
    healthCheck: true,
    retrySemantics: "none",
    timeoutMs: 180000,
    secretRequirements: ["ANTHROPIC_API_KEY (env)"],
    sideEffects: ["executes CLI subprocess", "consumes Anthropic API quota"],
    failureModes: ["cli_not_found", "auth_failed", "rate_limited", "timeout", "process_crash"],
    emittedEvents: ["anthropic.cli_run", "anthropic.completed", "anthropic.error"]
  };
}

module.exports = {
  runClaudeCli,
  runAnthropicCli,
  getAnthropicCliStatus,
  manifest
};
