const { spawn } = require("child_process");
const { resolveToolPaths } = require("./systemPaths");

const READ_ONLY_ACTIONS = {
  gateway_status: ["gateway", "status", "--json"],
  models_status: ["models", "status", "--json"],
  cron_list: ["cron", "list", "--all", "--json"],
  approvals_get: ["approvals", "get", "--json"],
  nodes_list: ["nodes", "list", "--json"],
  daemon_status: ["daemon", "status", "--json"]
};

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    return null;
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{") && !line.startsWith("[")) {
      continue;
    }
    try {
      return JSON.parse(line);
    } catch (_error) {
      // keep scanning
    }
  }
  return null;
}

function runOpenclawCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const toolPaths = resolveToolPaths();
    const executable = toolPaths.openclawPath || "openclaw";
    const timeoutMs = Math.max(10000, Number(options.timeoutMs || 60000));

    let child;
    if (process.platform === "win32" && executable.toLowerCase().endsWith(".cmd")) {
      child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", executable, ...args], {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    } else {
      child = spawn(executable, args, {
        windowsHide: true,
        cwd: process.cwd(),
        env: process.env
      });
    }

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("OpenClaw command timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start OpenClaw CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`OpenClaw exited with code ${code}. ${stderr.trim() || stdout.trim()}`.trim()));
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        parsed: parseJsonFromStdout(stdout)
      });
    });
  });
}

function readOnlyOpenclaw(action, timeoutMs = 60000) {
  const args = READ_ONLY_ACTIONS[String(action || "").trim()];
  if (!args) {
    throw new Error(`Unsupported OpenClaw read action: ${action}`);
  }
  return runOpenclawCli(args, { timeoutMs });
}

function sanitizeCronJobName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 90 || !/^[a-zA-Z0-9._:-]+$/.test(name)) {
    throw new Error("Invalid cron job name for OpenClaw action.");
  }
  return name;
}

function governedActionArgs(action, payload = {}) {
  const normalizedAction = String(action || "").trim();
  if (READ_ONLY_ACTIONS[normalizedAction]) {
    return READ_ONLY_ACTIONS[normalizedAction];
  }

  if (normalizedAction === "gateway_start") return ["gateway", "start", "--json"];
  if (normalizedAction === "gateway_stop") return ["gateway", "stop", "--json"];
  if (normalizedAction === "gateway_restart") return ["gateway", "restart", "--json"];
  if (normalizedAction === "daemon_start") return ["daemon", "start", "--json"];
  if (normalizedAction === "daemon_stop") return ["daemon", "stop", "--json"];
  if (normalizedAction === "daemon_restart") return ["daemon", "restart", "--json"];
  if (normalizedAction === "cron_run") {
    return ["cron", "run", sanitizeCronJobName(payload.name), "--json"];
  }

  throw new Error(`Unsupported OpenClaw governed action: ${normalizedAction}`);
}

function governedOpenclaw(action, payload = {}, timeoutMs = 80000) {
  const args = governedActionArgs(action, payload);
  return runOpenclawCli(args, { timeoutMs });
}

function extractAgentReply(result) {
  const parsed = result?.parsed;
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.reply === "string" && parsed.reply.trim()) return parsed.reply.trim();
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text.trim();
    if (typeof parsed.output === "string" && parsed.output.trim()) return parsed.output.trim();
    if (typeof parsed.output?.text === "string" && parsed.output.text.trim()) return parsed.output.text.trim();
  }

  const stdout = String(result?.stdout || "").trim();
  if (stdout) {
    return stdout;
  }
  return "OpenClaw completed with no reply text.";
}

async function runOpenclawAgent(prompt, options = {}) {
  const text = String(prompt || "").trim();
  if (!text) {
    throw new Error("Prompt is required for OpenClaw agent.");
  }

  const timeoutSec = Math.max(20, Math.min(300, Math.round((options.timeoutMs || 120000) / 1000)));
  const result = await runOpenclawCli(
    ["agent", "--local", "--json", "-m", text, "--timeout", String(timeoutSec)],
    { timeoutMs: Number(options.timeoutMs || 120000) + 5000 }
  );

  return {
    reply: extractAgentReply(result),
    raw: result
  };
}

module.exports = {
  runOpenclawCli,
  readOnlyOpenclaw,
  governedOpenclaw,
  runOpenclawAgent
};
