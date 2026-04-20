#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_LEVEL_EXCLUDES = new Set([
  ".git",
  ".idea",
  ".next",
  ".turbo",
  ".vscode",
  "backups",
  "captures",
  "certs",
  "coverage",
  "data",
  "logs",
  "node_modules",
  "private",
  "runtime"
]);
const ASOLARIA_ROOT_ALLOWLIST = new Set([
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "REFERENCES.md",
  "TASKS.md",
  "PHONE-URLS.md",
  "PUBLIC_DEPLOYMENT.md",
  "reports",
  "server.js",
  "package.json",
  "package-lock.json",
  "Start-Asolaria-ControlPlane-Sandbox.cmd",
  "Start-Asolaria-ControlPlane.cmd",
  "Start-Asolaria-Core.cmd",
  "Start-Asolaria-OneButton.cmd",
  "Start-Asolaria-OneWindow.cmd",
  "Start-Asolaria-Phone.cmd",
  "Start-Asolaria.cmd",
  "Stop-Asolaria-ControlPlane.cmd",
  "Stop-Asolaria.cmd",
  "src",
  "public",
  "docs",
  "config",
  "scripts",
  "services",
  "skills",
  "tools",
  "tools-manifests",
  "infra",
  "legal"
]);

function fail(message) {
  console.error(String(message || "workspace bootstrap failed"));
  process.exit(1);
}

function parseSourceSpec(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^file:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol.toLowerCase() === "file:") {
        let pathname = decodeURIComponent(parsed.pathname || "");
        if (/^\/[A-Za-z]:\//.test(pathname)) {
          pathname = pathname.slice(1);
        }
        return path.resolve(pathname);
      }
    } catch (_error) {
      return "";
    }
  }
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
    return path.resolve(raw);
  }
  return raw;
}

function isExistingDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch (_error) {
    return false;
  }
}

function isGitRepo(targetPath) {
  const result = spawnSync("git", ["-C", targetPath, "rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
    windowsHide: true,
    timeout: 15000
  });
  return result.status === 0;
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    fail(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
}

function shouldSkipCopy(sourceRoot, currentPath) {
  const relative = path.relative(sourceRoot, currentPath);
  if (!relative) return false;
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length === 1 && isAsolariaSource(sourceRoot) && !ASOLARIA_ROOT_ALLOWLIST.has(parts[0])) {
    return true;
  }
  if (parts.some((part) => part === ".git" || part === "node_modules")) {
    return true;
  }
  const first = parts[0];
  if (ROOT_LEVEL_EXCLUDES.has(first)) {
    return true;
  }
  if (parts.length === 1 && /^\.env(\.|$)/i.test(first)) {
    return true;
  }
  return false;
}

function isAsolariaSource(sourceRoot) {
  const root = path.resolve(sourceRoot);
  return (
    fs.existsSync(path.join(root, "server.js"))
    && fs.existsSync(path.join(root, "package.json"))
    && String(path.basename(root || "")).toLowerCase() === "asolaria"
  );
}

function copyDirectoryContents(sourceRoot, destinationRoot) {
  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    if (shouldSkipCopy(sourceRoot, sourcePath)) {
      continue;
    }
    fs.cpSync(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      filter: (currentPath) => !shouldSkipCopy(sourceRoot, currentPath)
    });
  }
}

function cloneGitRepository(sourceSpec, workspaceRoot) {
  runGit(["clone", "--depth", "1", sourceSpec, "."], workspaceRoot);
}

async function fetchJsonWithTimeout(url, timeoutMs = 4000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch (_error) {
          // ignore
        }
      }, timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    });
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: String(error?.message || error || "request_failed")
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? String(fs.readFileSync(filePath, "utf8") || "") : "";
  } catch (_error) {
    return "";
  }
}

async function writeHelperLiveNote(workspaceRoot, sourceSpec) {
  const docsRoot = path.join(workspaceRoot, "docs");
  ensureDirExists(docsRoot);

  const [fastHealth, symphonyStatus, abacusStatus, abacusStrategy, augmentStatus, geminiApiStatus, geminiLiveStatus] = await Promise.all([
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/health/fast", 4200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/symphony/status", 5200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/abacus/status", 4200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/abacus/strategy", 4200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/augment-context/status", 4200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/gemini_api/status", 4200),
    fetchJsonWithTimeout("http://127.0.0.1:4781/api/integrations/gemini_live/status", 4200)
  ]);

  const sourceRoot = isExistingDirectory(sourceSpec) ? path.resolve(sourceSpec) : "";
  const phoneSmokePath = sourceRoot ? path.join(sourceRoot, "reports", "phone-tunnel-smoke-latest.md") : "";
  const phoneSmokeText = readTextIfExists(phoneSmokePath);

  const fast = fastHealth?.payload || {};
  const symphony = symphonyStatus?.payload?.status || {};
  const symphonyLive = symphonyStatus?.payload?.liveState || {};
  const abacus = abacusStatus?.payload?.status || {};
  const strategy = abacusStrategy?.payload?.strategy || {};
  const augment = augmentStatus?.payload?.status || {};
  const geminiApi = geminiApiStatus?.payload?.status || {};
  const geminiLive = geminiLiveStatus?.payload?.status || {};

  const lines = [
    "# Symphony Helpers Live",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Symphony: configured=${Boolean(symphony.configured)} running=${Boolean(symphony.process?.running)} liveRunning=${Number(symphonyLive.summary?.running || 0) || 0} issues=${Array.isArray(symphonyLive.summary?.issueIdentifiers) ? symphonyLive.summary.issueIdentifiers.join(", ") || "(none)" : "(unknown)"}`,
    `- Abacus: configured=${Boolean(abacus.configured)} browserReady=${Boolean(abacus.capabilities?.browser?.ready)} desktopInstalled=${Boolean(abacus.surfaces?.desktop?.installed)} headlessReady=${Boolean(strategy.recommendations?.cliPrintReady)}`,
    `- Augment/Auggie: configured=${Boolean(augment.configured)} mode=${String(augment.mode || "unknown")} providerApplyReady=${Boolean(augment.providerApplyReady)} localRuntimeAvailable=${Boolean(augment.localRuntime?.available)}`,
    `- Gemini API: configured=${Boolean(geminiApi.configured)} model=${String(geminiApi.defaultModel || "(unknown)")}`,
    `- Gemini Live: textConfigured=${Boolean(geminiLive.text?.configured)} audioConfigured=${Boolean(geminiLive.audio?.configured)}`,
    `- Phone: route=${String(fast.connectionRouting?.selected?.channel || "unknown")} keeperRunning=${Boolean(fast.networkPolicy?.phoneBridgeKeeper?.running)} tunnelPass=${Boolean(fast.networkPolicy?.phoneTunnelMonitor?.latestReportPass)} controlModeUseCare=${Boolean(!fast.networkPolicy?.phoneTunnelMonitor?.latestReportPass)}`,
    "",
    "## Notes",
    "- Use Abacus only for sanitized external/browser/orchestration help and import results back through Asolaria.",
    "- Use Augment/Auggie only for read-only retrieval. Do not widen it into a writer or controller.",
    "- Gemini is available as a sidecar for text/audio support, not as the final source of truth for repo state.",
    "- Treat the phone lane as degraded whenever the latest tunnel smoke is failing, even if control/status still responds.",
    "",
    "## Fast Local Checks",
    "- `GET http://127.0.0.1:4781/api/integrations/symphony/status`",
    "- `GET http://127.0.0.1:4781/api/integrations/abacus/status`",
    "- `GET http://127.0.0.1:4781/api/integrations/augment-context/status`",
    "- `GET http://127.0.0.1:4781/api/integrations/gemini_api/status`",
    "- `GET http://127.0.0.1:4781/api/integrations/gemini_live/status`",
    "- `GET http://127.0.0.1:4781/api/health/fast`"
  ];

  if (phoneSmokeText) {
    lines.push("", "## Phone Smoke Snapshot", phoneSmokeText.trim());
  }

  fs.writeFileSync(path.join(docsRoot, "SYMPHONY_HELPERS_LIVE.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const workspaceRoot = process.cwd();
  const sourceSpec = parseSourceSpec(process.env.SOURCE_REPO_URL || "");
  if (!sourceSpec) {
    fail("SOURCE_REPO_URL is required.");
  }
  if (!isExistingDirectory(workspaceRoot)) {
    fail(`workspace does not exist: ${workspaceRoot}`);
  }

  if (isExistingDirectory(sourceSpec)) {
    const normalizedSource = path.resolve(sourceSpec);
    const normalizedWorkspace = path.resolve(workspaceRoot);
    if (normalizedWorkspace === normalizedSource || normalizedWorkspace.startsWith(`${normalizedSource}${path.sep}`)) {
      fail(`workspace must be outside source tree: workspace=${normalizedWorkspace} source=${normalizedSource}`);
    }
    if (isGitRepo(sourceSpec)) {
      cloneGitRepository(sourceSpec, workspaceRoot);
      await writeHelperLiveNote(workspaceRoot, sourceSpec);
      return;
    }
    copyDirectoryContents(sourceSpec, workspaceRoot);
    await writeHelperLiveNote(workspaceRoot, sourceSpec);
    return;
  }

  cloneGitRepository(sourceSpec, workspaceRoot);
  await writeHelperLiveNote(workspaceRoot, sourceSpec);
}

main().catch((error) => {
  fail(error?.message || error);
});
