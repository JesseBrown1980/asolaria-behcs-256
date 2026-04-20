const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { projectRoot } = require("../runtimePaths");

const VALID_ACTIONS = new Set([
  "move",
  "click",
  "double_click",
  "scroll",
  "type",
  "key",
  "window_list",
  "window_active",
  "window_focus",
  "window_minimize",
  "window_maximize",
  "window_restore",
  "window_close"
]);

const DEFAULT_TIMEOUT_MS = 9000;

function resolveDesktopInputScriptPath() {
  return path.join(projectRoot, "tools", "Invoke-DesktopInput.ps1");
}

function resolveDesktopInputHostScriptPath() {
  return path.join(projectRoot, "tools", "DesktopInputHost.ps1");
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

function addArg(args, name, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  args.push(name, String(value));
}

function invokeDesktopInputSpawn(options = {}) {
  return new Promise((resolve, reject) => {
    const action = String(options.action || "").trim().toLowerCase();
    if (!VALID_ACTIONS.has(action)) {
      return reject(new Error(`Unsupported desktop control action: ${action || "unknown"}`));
    }

    const scriptPath = resolveDesktopInputScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Desktop input script not found: ${scriptPath}`));
    }

    const timeoutMs = Math.max(
      2000,
      Math.min(30000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))
    );

    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      scriptPath,
      "-Action",
      action
    ];
    addArg(args, "-X", options.x);
    addArg(args, "-Y", options.y);
    addArg(args, "-XNorm", options.xNorm);
    addArg(args, "-YNorm", options.yNorm);
    addArg(args, "-Button", options.button);
    addArg(args, "-WheelDelta", options.wheelDelta);
    addArg(args, "-Text", options.text);
    addArg(args, "-Key", options.key);
    addArg(args, "-WindowId", options.windowId);
    addArg(args, "-WindowTitle", options.windowTitle);
    addArg(args, "-Limit", options.limit);
    addArg(args, "-DisplayIndex", options.displayIndex);

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
      reject(new Error(`Desktop control failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error(`Desktop control timed out after ${timeoutMs}ms.`));
      }
      if (code !== 0) {
        const detail = String(stderr || stdout || "").trim() || "Unknown error.";
        return reject(new Error(`Desktop control failed (exit ${code}): ${detail}`));
      }
      const parsed = parseJsonObject(stdout);
      if (parsed) {
        return resolve(parsed);
      }
      return resolve({
        ok: true,
        action,
        output: String(stdout || "").trim()
      });
    });
  });
}

function clampTimeoutMs(value, fallback) {
  return Math.max(
    2000,
    Math.min(30000, Number(value || fallback || DEFAULT_TIMEOUT_MS))
  );
}

function requestId() {
  return `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class DesktopInputHost {
  constructor() {
    this.child = null;
    this.readline = null;
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.started = false;
    this.lastStderr = "";
  }

  start() {
    if (this.started && this.child && !this.child.killed) {
      return;
    }

    const scriptPath = resolveDesktopInputHostScriptPath();
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Desktop input host script not found: ${scriptPath}`);
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
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child = child;
    this.started = true;

    const rl = readline.createInterface({ input: child.stdout });
    this.readline = rl;

    rl.on("line", (line) => {
      this.handleLine(line);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      if (!text) return;
      this.lastStderr = `${this.lastStderr}${text}`.slice(-2000);
    });

    child.on("error", (error) => {
      const detail = this.lastStderr.trim();
      const suffix = detail ? ` ${detail}` : "";
      this.handleCrash(new Error(`Desktop input host failed to start: ${error.message}${suffix}`));
    });

    child.on("close", (code) => {
      const detail = this.lastStderr.trim();
      const suffix = detail ? ` ${detail}` : "";
      this.handleCrash(new Error(`Desktop input host exited (${code}).${suffix}`));
    });
  }

  stop() {
    if (this.readline) {
      try {
        this.readline.close();
      } catch (_error) {
        // ignore
      }
      this.readline = null;
    }
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch (_error) {
        // ignore
      }
    }
    this.child = null;
    this.started = false;
  }

  handleCrash(error) {
    const pending = Array.from(this.pending.values());
    this.pending.clear();
    for (const entry of pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.stop();
  }

  handleLine(line) {
    const text = String(line || "").trim();
    if (!text) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const id = String(parsed.id || "").trim();
    if (!id) return;
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (parsed.ok === false) {
      entry.reject(new Error(String(parsed.error || "Desktop input host error.")));
      return;
    }
    entry.resolve(parsed.result ?? parsed);
  }

  send(options = {}, timeoutMs) {
    const payload = options && typeof options === "object" ? options : {};
    return (this.queue = this.queue.then(() => this.sendNow(payload, timeoutMs)));
  }

  sendNow(payload, timeoutMs) {
    this.start();
    if (!this.child || !this.child.stdin || !this.child.stdin.writable) {
      return Promise.reject(new Error("Desktop input host is not writable."));
    }

    const id = requestId();
    const request = { id, ...payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Desktop input host timed out after ${timeoutMs}ms.`));
        this.stop();
      }, clampTimeoutMs(timeoutMs, DEFAULT_TIMEOUT_MS));

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.child.stdin.write(`${JSON.stringify(request)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
}

function resolveDesktopInputMode() {
  const raw = String(process.env.ASOLARIA_DESKTOP_INPUT_MODE || "").trim().toLowerCase();
  if (!raw || raw === "auto") {
    return process.platform === "win32" ? "host" : "spawn";
  }
  if (raw === "host" || raw === "spawn") {
    return raw;
  }
  return process.platform === "win32" ? "host" : "spawn";
}

let sharedHost = null;
function getSharedHost() {
  if (!sharedHost) {
    sharedHost = new DesktopInputHost();
  }
  return sharedHost;
}

function invokeDesktopInput(options = {}) {
  const action = String(options.action || "").trim().toLowerCase();
  if (!VALID_ACTIONS.has(action)) {
    return Promise.reject(new Error(`Unsupported desktop control action: ${action || "unknown"}`));
  }

  const timeoutMs = clampTimeoutMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const mode = resolveDesktopInputMode();
  if (mode !== "host") {
    return invokeDesktopInputSpawn({ ...options, action, timeoutMs });
  }

  try {
    return getSharedHost()
      .send({ ...options, action }, timeoutMs)
      .catch((_error) => invokeDesktopInputSpawn({ ...options, action, timeoutMs }));
  } catch (_error) {
    return invokeDesktopInputSpawn({ ...options, action, timeoutMs });
  }
}

process.once("exit", () => {
  if (sharedHost) {
    sharedHost.stop();
    sharedHost = null;
  }
});

module.exports = {
  invokeDesktopInput
};
