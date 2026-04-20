const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { projectRoot } = require("../runtimePaths");

const DEFAULT_TIMEOUT_MS = 10000;

function resolveDisplayScriptPath() {
  return path.join(projectRoot, "tools", "Get-DesktopDisplays.ps1");
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (_error) {
    // fall through
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function listDesktopDisplays(options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Math.max(2000, Math.min(30000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)));
    const scriptPath = resolveDisplayScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Desktop display script not found: ${scriptPath}`));
    }

    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      scriptPath
    ];

    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      cwd: projectRoot,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Desktop display listing failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error(`Desktop display listing timed out after ${timeoutMs}ms.`));
      }
      if (code !== 0) {
        const detail = String(stderr || stdout || "").trim() || "Unknown error.";
        return reject(new Error(`Desktop display listing failed (exit ${code}): ${detail}`));
      }
      const parsed = parseJsonObject(stdout);
      if (!parsed) {
        return reject(new Error("Desktop display listing returned invalid JSON."));
      }
      return resolve(parsed);
    });
  });
}

module.exports = {
  listDesktopDisplays
};
