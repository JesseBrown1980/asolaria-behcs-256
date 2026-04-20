const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { projectRoot, resolveCapturePath } = require("../runtimePaths");

const DEFAULT_TIMEOUT_MS = Math.max(
  5000,
  Math.min(90000, Number(process.env.ASOLARIA_DESKTOP_CAPTURE_TIMEOUT_MS || 25000))
);

function safeDesktopFileName(raw, fallbackPrefix = "desktop") {
  const seed = `${fallbackPrefix}-${Date.now()}.png`;
  const value = String(raw || "").trim();
  const base = value || seed;
  const withExt = base.toLowerCase().endsWith(".png") ? base : `${base}.png`;
  const sanitized = withExt.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  if (!sanitized) {
    return seed;
  }
  return sanitized;
}

function safeCaptureTag(raw, fallbackPrefix = "capture") {
  const seed = `${fallbackPrefix}-${Date.now()}`;
  const value = String(raw || "").trim();
  const base = value || seed;
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  if (!sanitized) {
    return seed;
  }
  return sanitized;
}

function resolveCaptureScriptPath() {
  return path.join(projectRoot, "tools", "Capture-PrimaryScreen.ps1");
}

function resolveDualCaptureScriptPath() {
  return path.join(projectRoot, "tools", "Capture-Layout-And-Window.ps1");
}

function parseJsonFromOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) {
    throw new Error("No JSON output from PowerShell script.");
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Failed to parse JSON output from PowerShell script.");
  }
}

async function captureDesktopSnapshot(options = {}) {
  const timeoutMs = Math.max(
    5000,
    Math.min(120000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))
  );
  const outputDir = resolveCapturePath("desktop");
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = safeDesktopFileName(options.fileName, "desktop");
  const outputPath = path.join(outputDir, fileName);
  const scriptPath = resolveCaptureScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Desktop capture script not found: ${scriptPath}`);
  }

  await new Promise((resolve, reject) => {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      // Screen capture via System.Drawing is more reliable in STA mode on Windows.
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-OutputPath",
      outputPath
    ];
    if (Number.isInteger(Number(options.screenIndex)) && Number(options.screenIndex) >= 0) {
      args.push("-ScreenIndex", String(Number(options.screenIndex)));
    }
    if (Boolean(options.captureAll)) {
      args.push("-CaptureAll");
    }
    const child = spawn("powershell.exe", args, { windowsHide: true });
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
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error(`Desktop capture timed out after ${timeoutMs}ms.`));
      }
      if (code !== 0) {
        const detail = String(stderr || stdout || "").trim() || "Unknown error.";
        return reject(new Error(`Desktop capture failed (exit ${code}): ${detail}`));
      }
      return resolve();
    });
  });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Desktop capture succeeded but file was not found: ${outputPath}`);
  }

  const stat = fs.statSync(outputPath);
  return {
    outputPath,
    fileName,
    sizeBytes: Number(stat.size || 0),
    capturedAt: new Date().toISOString(),
    screenIndex: Number.isInteger(Number(options.screenIndex)) ? Number(options.screenIndex) : -1,
    captureAll: Boolean(options.captureAll)
  };
}

async function captureDesktopLayoutAndWindow(options = {}) {
  const timeoutMs = Math.max(
    5000,
    Math.min(180000, Number(options.timeoutMs || 45000))
  );
  const outputRoot = resolveCapturePath("vision");
  fs.mkdirSync(outputRoot, { recursive: true });

  const tag = safeCaptureTag(options.tag, "dual-capture");
  const scriptPath = resolveDualCaptureScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Desktop dual capture script not found: ${scriptPath}`);
  }

  const result = await new Promise((resolve, reject) => {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      // Screen capture via System.Drawing is more reliable in STA mode on Windows.
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-OutputRoot",
      outputRoot,
      "-Tag",
      tag,
      "-Json"
    ];

    const windowId = Number(options.windowId || 0);
    const windowTitle = String(options.windowTitle || "").trim();
    if (windowId > 0) {
      args.push("-WindowId", String(Math.round(windowId)));
    } else if (windowTitle) {
      args.push("-WindowTitle", windowTitle);
    }

    if (options.includeVirtualDesktop !== false) {
      args.push("-IncludeVirtualDesktop");
    }
    if (Boolean(options.skipPerScreen)) {
      args.push("-SkipPerScreen");
    }

    const child = spawn("powershell.exe", args, { windowsHide: true });
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
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error(`Desktop dual capture timed out after ${timeoutMs}ms.`));
      }
      if (code !== 0) {
        const detail = String(stderr || stdout || "").trim() || "Unknown error.";
        return reject(new Error(`Desktop dual capture failed (exit ${code}): ${detail}`));
      }
      try {
        return resolve(parseJsonFromOutput(stdout));
      } catch (error) {
        return reject(error);
      }
    });
  });

  const runDir = String(result?.runDir || "").trim();
  if (!runDir || !fs.existsSync(runDir)) {
    throw new Error("Desktop dual capture completed but output directory is missing.");
  }

  return {
    ...result,
    tag,
    timeoutMs
  };
}

module.exports = {
  captureDesktopSnapshot,
  safeDesktopFileName,
  safeCaptureTag,
  captureDesktopLayoutAndWindow
};
