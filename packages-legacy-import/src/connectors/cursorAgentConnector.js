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

function resolveAgentCommand(options = {}) {
  const explicit = String(options.executable || "").trim();
  if (explicit) {
    return {
      executable: explicit,
      prependArgs: [],
      mode: "explicit",
      display: explicit
    };
  }

  const envOverride = String(process.env.ASOLARIA_CURSOR_AGENT_PATH || "").trim();
  if (envOverride) {
    return {
      executable: envOverride,
      prependArgs: [],
      mode: "cursor-agent",
      display: envOverride
    };
  }

  const toolPaths = resolveToolPaths();
  const direct = String(toolPaths.cursorAgentPath || "").trim();
  if (direct) {
    return {
      executable: direct,
      prependArgs: [],
      mode: "cursor-agent",
      display: direct
    };
  }

  const cursorCli = String(toolPaths.cursorPath || "").trim();
  if (cursorCli) {
    return {
      executable: cursorCli,
      prependArgs: ["agent"],
      mode: "cursor-subcommand",
      display: `${cursorCli} agent`
    };
  }

  return {
    executable: "cursor-agent",
    prependArgs: [],
    mode: "cursor-agent",
    display: "cursor-agent"
  };
}

function firstNonEmptyLine(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function inferAuthenticated(statusText) {
  const text = String(statusText || "").toLowerCase();
  if (!text) {
    return false;
  }

  const negative = [
    "not authenticated",
    "not logged in",
    "login required",
    "sign in required",
    "run cursor-agent login",
    "unauthorized",
    "invalid api key",
    "missing api key"
  ];
  if (negative.some((term) => text.includes(term))) {
    return false;
  }

  const positive = [
    "authenticated",
    "logged in",
    "signed in",
    "active account",
    "subscription"
  ];
  return positive.some((term) => text.includes(term));
}

function runCursorAgentCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const commandInfo = resolveAgentCommand(options);
    const executable = commandInfo.executable;
    const fullArgs = [...commandInfo.prependArgs, ...args];
    const timeoutMs = Math.max(10000, Number(options.timeoutMs || 90000));

    let child;
    if (process.platform === "win32") {
      const parsed = path.parse(executable);
      const hasDir = Boolean(parsed.dir);
      const hasSpaces = /\s/.test(executable);
      const launchCommand = (hasDir && hasSpaces) ? parsed.base : executable;
      const launchCwd = (hasDir && hasSpaces) ? parsed.dir : process.cwd();
      child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", launchCommand, ...fullArgs], {
        windowsHide: true,
        cwd: launchCwd,
        env: process.env
      });
    } else {
      child = spawn(executable, fullArgs, {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    }

    const pidFns = getSpawnPidFns();
    let spawnPid = null;
    if (pidFns) {
      try { spawnPid = pidFns.generate("cursor-agent"); pidFns.register("cursor-agent", spawnPid); } catch (_) {}
    }

    let stdout = "";
    let stderr = "";
    if (child.stdin && typeof child.stdin.end === "function") {
      child.stdin.end();
    }
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Cursor Agent CLI timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Cursor Agent CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (spawnPid && pidFns) { try { pidFns.despawn("cursor-agent"); } catch (_) {} }
      const cleanStdout = String(stdout || "").trim();
      const cleanStderr = String(stderr || "").trim();
      if (code !== 0) {
        const summary = clipText(cleanStderr || cleanStdout || `exit code ${code}`, 450);
        return reject(new Error(`Cursor Agent CLI exited with code ${code}. ${summary}`.trim()));
      }
      return resolve({
        executable: commandInfo.display,
        commandMode: commandInfo.mode,
        exitCode: Number(code || 0),
        stdout: cleanStdout,
        stderr: cleanStderr
      });
    });
  });
}

async function runCursorAgent(prompt, options = {}) {
  const text = String(prompt || "").trim();
  if (!text) {
    throw new Error("Prompt is required for Cursor Agent execution.");
  }

  const timeoutMs = Math.max(15000, Number(options.timeoutMs || 90000));
  const outputFormat = String(options.outputFormat || "text").trim() || "text";
  const args = ["--print", "--output-format", outputFormat];

  const model = String(options.model || "").trim();
  if (model) {
    args.push("--model", model);
  }

  const apiKey = String(options.apiKey || "").trim();
  if (apiKey) {
    args.push("--api-key", apiKey);
  }
  args.push(text);

  const raw = await runCursorAgentCli(args, {
    timeoutMs,
    executable: options.executable
  });
  const combinedOutput = [raw.stdout, raw.stderr].filter(Boolean).join("\n");
  if (/not in the list of known options/i.test(combinedOutput) && /electron\/chromium/i.test(combinedOutput)) {
    throw new Error(
      "Installed Cursor CLI does not expose terminal agent flags. Install/upgrade the Cursor Agent CLI and run `cursor-agent login`."
    );
  }

  const reply = String(raw.stdout || "").trim();
  if (!reply) {
    const combined = [raw.stderr, raw.stdout].filter(Boolean).join("\n");
    const authHint = /not authenticated|not logged in|login required|api key|sign in required/i.test(combined)
      ? "Cursor Agent CLI appears unauthenticated. Run `cursor-agent login` (or set `CURSOR_API_KEY`)."
      : "Cursor Agent CLI returned no reply text.";
    throw new Error(`${authHint} ${clipText(combined, 400)}`.trim());
  }

  return {
    reply,
    raw
  };
}

async function getCursorAgentStatus(options = {}) {
  const commandInfo = resolveAgentCommand(options);
  const executable = commandInfo.display;
  const timeoutMs = Math.max(8000, Number(options.timeoutMs || 15000));

  try {
    const versionResult = await runCursorAgentCli(["--version"], {
      timeoutMs,
      executable: options.executable
    });
    const version = firstNonEmptyLine(versionResult.stdout || versionResult.stderr) || null;
    let supportsPrint = true;
    try {
      const helpResult = await runCursorAgentCli(["--help"], {
        timeoutMs,
        executable: options.executable
      });
      const helpText = [helpResult.stdout, helpResult.stderr].filter(Boolean).join("\n");
      supportsPrint = /(^|\s)(-p,?\s*)?--print(\s|$)|output-format/i.test(helpText);
      if (!supportsPrint && helpResult.commandMode === "cursor-subcommand") {
        return {
          available: false,
          executable: helpResult.executable,
          version,
          authenticated: false,
          statusText: "",
          error: "Cursor CLI is installed, but this build does not expose terminal agent flags (`--print`). Install standalone `cursor-agent` or update Cursor."
        };
      }
    } catch {
      supportsPrint = true;
    }

    try {
      const statusResult = await runCursorAgentCli(["status"], {
        timeoutMs,
        executable: options.executable
      });
      const statusText = [statusResult.stdout, statusResult.stderr].filter(Boolean).join("\n").trim();
      return {
        available: true,
        executable: statusResult.executable,
        version,
        authenticated: supportsPrint ? inferAuthenticated(statusText) : false,
        statusText: clipText(statusText, 800),
        error: null
      };
    } catch (statusError) {
      return {
        available: true,
        executable,
        version,
        authenticated: false,
        statusText: "",
        error: clipText(statusError.message, 800)
      };
    }
  } catch (error) {
    return {
      available: false,
      executable,
      version: null,
      authenticated: false,
      statusText: "",
      error: clipText(error.message, 800)
    };
  }
}

function manifest() {
  return {
    id: "cursor_agent",
    version: "1.0.0",
    description: "Cursor Agent CLI connector — headless prompt execution via cursor-agent binary with auth status detection and model selection",
    capabilities: ["run_prompt", "status_check", "version_check", "auth_detection"],
    readScopes: ["cursor_agent_status", "cursor_agent_version"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 90000,
    secretRequirements: ["cursor-agent login session or CURSOR_API_KEY (env variable)"],
    sideEffects: ["spawns cursor-agent CLI process", "sends prompts to Cursor AI backend"],
    failureModes: ["cursor_agent_not_found", "cursor_agent_timeout", "cursor_agent_unauthenticated", "cursor_agent_no_reply", "print_flags_unsupported"],
    emittedEvents: ["cursor_agent.prompt_completed", "cursor_agent.status_checked"]
  };
}

module.exports = {
  runCursorAgentCli,
  runCursorAgent,
  getCursorAgentStatus,
  manifest
};
