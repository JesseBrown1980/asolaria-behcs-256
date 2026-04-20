const os = require("os");
const { spawnSync } = require("child_process");

function clipOneLine(value, maxChars = 200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function detectCommand(command, args = ["--version"]) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 3500,
      windowsHide: true,
      shell: process.platform === "win32"
    });
    const ok = result && result.status === 0;
    const merged = `${result?.stdout || ""}\n${result?.stderr || ""}`.trim();
    return {
      found: ok,
      version: ok ? clipOneLine(merged, 180) : "",
      error: ok ? "" : clipOneLine(merged || `exit_${String(result?.status ?? "unknown")}`, 180)
    };
  } catch (error) {
    return {
      found: false,
      version: "",
      error: clipOneLine(error?.message || "not_found", 180)
    };
  }
}

function parseMajor(versionText) {
  const text = String(versionText || "");
  const match = text.match(/v?(\d+)\./i);
  if (!match) return 0;
  return Number(match[1] || 0) || 0;
}

function recommendPlans({ platform, isWindows, toolPaths, checks, publicProfileEnabled }) {
  const plans = [];

  plans.push({
    id: "public_web_only",
    label: "Public Web-Only",
    recommended: true,
    description: "Safe public baseline with no local automation or private connectors.",
    supported: true,
    supports: {
      approvals: true,
      mobileConsole: true,
      desktopControl: false,
      localOps: false
    }
  });

  plans.push({
    id: "public_desktop_assist",
    label: "Public Desktop Assist",
    recommended: false,
    description: "Public profile plus desktop screenshots/window status.",
    supported: isWindows,
    supports: {
      approvals: true,
      mobileConsole: true,
      desktopControl: isWindows,
      localOps: false
    }
  });

  plans.push({
    id: "private_master",
    label: "Private Master",
    recommended: false,
    description: "Full private control plane (owner-managed).",
    supported: true,
    supports: {
      approvals: true,
      mobileConsole: true,
      desktopControl: isWindows,
      localOps: true
    }
  });

  const notes = [];
  if (!isWindows) {
    notes.push("Desktop input automation scripts are Windows-first. Non-Windows hosts should use web-only/public profile.");
  }
  if (!checks.npm.found) {
    notes.push("npm not found. Install Node.js with npm before first start.");
  }
  if (!toolPaths.codexPath) {
    notes.push("Codex CLI not detected; brain fallback paths may be limited.");
  }
  notes.push("OpenClaw CLI is intentionally absent on Liris; use the documented Asolaria skill/MCP set instead.");
  if (publicProfileEnabled) {
    notes.push("Host is currently running in public profile mode (sensitive endpoints are locked).");
  }

  const installSteps = [];
  installSteps.push("Install Node.js 20+ and npm.");
  installSteps.push("Clone or copy the Asolaria project folder.");
  installSteps.push("Run `npm install` inside the project.");
  installSteps.push("Start public-safe profile with `tools/Start-Asolaria-Public.ps1` (Windows) or set equivalent env vars on other OS.");
  installSteps.push("Open `/api/health` and verify `paths.instanceRoot` points to your intended runtime root.");

  if (isWindows) {
    installSteps.push("Optional: install Android SDK platform-tools for ADB phone bridge.");
  } else {
    installSteps.push("For phone control on non-Windows hosts, use mobile web/PWA flows first.");
  }

  return {
    plans,
    notes,
    installSteps
  };
}

function buildInstallProbe({ toolPaths, settings, publicProfileEnabled }) {
  const platform = process.platform;
  const release = os.release();
  const arch = process.arch;
  const hostname = os.hostname();
  const isWindows = platform === "win32";

  const checks = {
    node: {
      found: true,
      version: process.version,
      major: parseMajor(process.version)
    },
    npm: detectCommand("npm", ["--version"]),
    git: detectCommand("git", ["--version"]),
    adb: detectCommand("adb", ["version"]),
    python: isWindows
      ? detectCommand("py", ["-V"])
      : detectCommand("python3", ["--version"])
  };

  const capabilities = {
    platform,
    windowsDesktopAutomation: isWindows,
    codexCli: Boolean(toolPaths?.codexPath),
    chromeInstalled: Boolean(toolPaths?.chromePath),
    padInstalled: Boolean(toolPaths?.padRobotPath || toolPaths?.padConsolePath),
    publicProfileEnabled: Boolean(publicProfileEnabled)
  };

  const recommendations = recommendPlans({
    platform,
    isWindows,
    toolPaths: toolPaths || {},
    checks,
    publicProfileEnabled
  });

  return {
    ok: true,
    host: {
      platform,
      release,
      arch,
      hostname
    },
    checks,
    toolPaths: toolPaths || {},
    settingsSummary: {
      approvalMode: settings?.approvalMode || "",
      guardianMode: settings?.guardianMode || "",
      connectionPreference: Array.isArray(settings?.connectionPreference) ? settings.connectionPreference : []
    },
    capabilities,
    recommendations
  };
}

module.exports = {
  buildInstallProbe
};
