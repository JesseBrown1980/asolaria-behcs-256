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

function resolveGeminiExecutable(options = {}) {
  const explicit = String(options.executable || "").trim();
  if (explicit) {
    return explicit;
  }

  const envOverride = String(process.env.ASOLARIA_GEMINI_PATH || "").trim();
  if (envOverride) {
    return envOverride;
  }

  const toolPaths = resolveToolPaths();
  const detected = String(toolPaths.geminiPath || "").trim();
  if (detected) {
    return detected;
  }

  return "gemini";
}

function inferAuthIssue(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return "";
  if (
    value.includes("api key")
    || value.includes("login")
    || value.includes("authenticate")
    || value.includes("oauth")
    || value.includes("unauthorized")
  ) {
    return "Gemini CLI appears unauthenticated. Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) or run Gemini login.";
  }
  return "";
}

function runGeminiCliRaw(args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = resolveGeminiExecutable(options);
    const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000));

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
        env: process.env
      });
    } else {
      child = spawn(executable, args, {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    }

    const pidFns = getSpawnPidFns();
    let spawnPid = null;
    if (pidFns) {
      try { spawnPid = pidFns.generate("gemini-cli"); pidFns.register("gemini-cli", spawnPid); } catch (_) {}
    }

    let stdout = "";
    let stderr = "";
    if (child.stdin && typeof child.stdin.end === "function") {
      child.stdin.end();
    }
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Gemini CLI timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Gemini CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (spawnPid && pidFns) { try { pidFns.despawn("gemini-cli"); } catch (_) {} }
      const cleanStdout = String(stdout || "").trim();
      const cleanStderr = String(stderr || "").trim();
      if (code !== 0) {
        const summary = clipText(cleanStderr || cleanStdout || `exit code ${code}`, 450);
        return reject(new Error(`Gemini CLI exited with code ${code}. ${summary}`.trim()));
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

async function runGeminiCli(prompt, options = {}) {
  const text = String(prompt || "").trim();
  if (!text) {
    throw new Error("Prompt is required for Gemini CLI execution.");
  }

  const timeoutMs = Math.max(15000, Number(options.timeoutMs || 120000));
  const outputFormat = String(options.outputFormat || "text").trim() || "text";
  const args = ["--prompt", text, "--output-format", outputFormat];

  const model = String(options.model || "").trim();
  if (model) {
    args.push("--model", model);
  }

  const approvalMode = String(options.approvalMode || "").trim().toLowerCase();
  if (["default", "auto_edit", "yolo", "plan"].includes(approvalMode)) {
    args.push("--approval-mode", approvalMode);
  }

  const raw = await runGeminiCliRaw(args, {
    timeoutMs,
    executable: options.executable
  });
  const reply = String(raw.stdout || "").trim();
  if (!reply) {
    const combined = [raw.stderr, raw.stdout].filter(Boolean).join("\n");
    const authHint = inferAuthIssue(combined);
    const hint = authHint || "Gemini CLI returned no reply text.";
    throw new Error(`${hint} ${clipText(combined, 400)}`.trim());
  }

  return {
    reply,
    raw
  };
}

function detectAuthSourceFromEnv() {
  if (String(process.env.GEMINI_API_KEY || "").trim()) {
    return "env:GEMINI_API_KEY";
  }
  if (String(process.env.GOOGLE_API_KEY || "").trim()) {
    if (String(process.env.GOOGLE_GENAI_USE_VERTEXAI || "").trim().toLowerCase() === "true") {
      return "env:GOOGLE_API_KEY+GOOGLE_GENAI_USE_VERTEXAI";
    }
    return "env:GOOGLE_API_KEY";
  }
  if (
    String(process.env.GOOGLE_GENAI_USE_VERTEXAI || "").trim().toLowerCase() === "true"
    && String(process.env.GOOGLE_CLOUD_PROJECT || "").trim()
  ) {
    return "env:GOOGLE_GENAI_USE_VERTEXAI+GOOGLE_CLOUD_PROJECT";
  }
  return "";
}

async function getGeminiCliStatus(options = {}) {
  const executable = resolveGeminiExecutable(options);
  const timeoutMs = Math.max(15000, Number(options.timeoutMs || 30000));
  const verifyCapabilities = Boolean(options.verifyCapabilities);

  try {
    const versionResult = await runGeminiCliRaw(["--version"], {
      timeoutMs,
      executable
    });
    const version = firstNonEmptyLine(versionResult.stdout || versionResult.stderr) || null;

    let supportsHeadless = true;
    if (verifyCapabilities) {
      try {
        const helpResult = await runGeminiCliRaw(["--help"], {
          timeoutMs,
          executable
        });
        const helpText = [helpResult.stdout, helpResult.stderr].filter(Boolean).join("\n");
        supportsHeadless = /--prompt/i.test(helpText) && /--output-format/i.test(helpText);
      } catch (_error) {
        supportsHeadless = true;
      }
    }

    const authSource = detectAuthSourceFromEnv();
    const authVerified = authSource ? true : false;
    const statusText = authSource
      ? `Detected ${authSource}.`
      : "Authentication not verified from environment variables.";

    if (!supportsHeadless) {
      return {
        available: false,
        executable,
        version,
        authenticated: authVerified,
        authentication: authSource || "unknown",
        statusText,
        error: "Installed Gemini CLI does not expose required non-interactive flags (`--prompt`, `--output-format`)."
      };
    }

    return {
      available: true,
      executable,
      version,
      authenticated: authVerified,
      authentication: authSource || "unknown",
      statusText,
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
    id: "gemini_cli",
    version: "1.0.0",
    description: "Gemini CLI connector — headless prompt execution via local gemini binary with model/approval-mode selection and auth detection",
    capabilities: ["run_prompt", "status_check", "version_check", "auth_detection"],
    readScopes: ["gemini_cli_status", "gemini_cli_version"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 120000,
    secretRequirements: ["GEMINI_API_KEY or GOOGLE_API_KEY (env variable)"],
    sideEffects: ["spawns gemini CLI process", "sends prompts to Google Gemini via CLI"],
    failureModes: ["gemini_cli_not_found", "gemini_cli_timeout", "gemini_cli_unauthenticated", "gemini_cli_no_reply", "headless_flags_unsupported"],
    emittedEvents: ["gemini_cli.prompt_completed", "gemini_cli.status_checked"]
  };
}

module.exports = {
  runGeminiCliRaw,
  runGeminiCli,
  getGeminiCliStatus,
  manifest
};
