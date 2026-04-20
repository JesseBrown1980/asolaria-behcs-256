const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { projectRoot } = require("../runtimePaths");

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_CHARS = 12000;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(text, limit = MAX_OUTPUT_CHARS) {
  const value = String(text || "");
  if (value.length <= limit) {
    return value;
  }
  return value.slice(0, limit);
}

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function latestReportPaths() {
  const root = path.join(projectRoot, "reports", "ui-visual-audit");
  return {
    jsonPath: path.join(root, "latest.json"),
    markdownPath: path.join(root, "latest.md")
  };
}

function buildReportSummary() {
  const { jsonPath, markdownPath } = latestReportPaths();
  const parsed = readJsonSafe(jsonPath);
  return {
    jsonPath,
    markdownPath,
    exists: fs.existsSync(jsonPath),
    ok: Boolean(parsed?.ok),
    generatedAt: String(parsed?.generatedAt || ""),
    baseUrl: String(parsed?.baseUrl || ""),
    checks: Number(parsed?.checks || 0),
    issues: Number(parsed?.issues || 0),
    webChecks: Number(parsed?.webChecks || parsed?.checks || 0),
    webIssues: Number(parsed?.webIssues || 0),
    localWindowStatus: String(parsed?.localWindowAudit?.status || ""),
    localWindowMatchCount: Number(parsed?.localWindowAudit?.matchCount || 0),
    localWindowChecks: Array.isArray(parsed?.localWindowAudit?.checks)
      ? parsed.localWindowAudit.checks.length
      : 0
  };
}

function runUiVisualAudit(options = {}) {
  const scriptPath = path.join(projectRoot, "tools", "Run-Asolaria-UiVisualAudit.js");
  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error(`UI visual audit script not found: ${scriptPath}`));
  }

  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 60 * 1000, 60 * 60 * 1000);
  const baseUrl = String(options.baseUrl || "").trim();
  const includeLocalWindows = parseOptionalBool(options.includeLocalWindows);
  const includePinchZoom = parseOptionalBool(options.includePinchZoom);

  const env = {
    ...process.env
  };
  if (baseUrl) {
    env.ASOLARIA_UI_BASE_URL = baseUrl;
  }
  if (includeLocalWindows !== undefined) {
    env.ASOLARIA_UI_AUDIT_INCLUDE_LOCAL_WINDOWS = includeLocalWindows ? "true" : "false";
  }
  if (includePinchZoom !== undefined) {
    env.ASOLARIA_UI_AUDIT_INCLUDE_PINCH_ZOOM = includePinchZoom ? "true" : "false";
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      windowsHide: true,
      env
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const startedAtMs = Date.now();

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch (_error) {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = clipText(`${stdout}${String(chunk || "")}`);
    });
    child.stderr.on("data", (chunk) => {
      stderr = clipText(`${stderr}${String(chunk || "")}`);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to start UI visual audit script: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        return reject(new Error(`UI visual audit timed out after ${timeoutMs}ms.`));
      }

      const exitCode = Number.isInteger(code) ? code : -1;
      const reportSummary = buildReportSummary();
      const durationMs = Date.now() - startedAtMs;
      const response = {
        ok: exitCode === 0,
        completedWithIssues: exitCode === 2,
        issuesDetected: exitCode === 2 || reportSummary.issues > 0,
        exitCode,
        durationMs,
        baseUrl: reportSummary.baseUrl || baseUrl || "",
        generatedAt: reportSummary.generatedAt || "",
        checks: reportSummary.checks,
        issues: reportSummary.issues,
        webChecks: reportSummary.webChecks,
        webIssues: reportSummary.webIssues,
        localWindowStatus: reportSummary.localWindowStatus || "",
        localWindowMatchCount: reportSummary.localWindowMatchCount,
        localWindowChecks: reportSummary.localWindowChecks,
        reportPath: reportSummary.jsonPath,
        reportMarkdownPath: reportSummary.markdownPath,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim()
      };

      if (exitCode === 0 || exitCode === 2) {
        return resolve(response);
      }

      const detail = clipText(response.stderr || response.stdout || `exit code ${exitCode}`, 320);
      return reject(new Error(`UI visual audit failed (${exitCode}): ${detail}`));
    });
  });
}

function manifest() {
  return {
    id: "ui-visual-audit",
    version: "1.0.0",
    description: "Runs automated UI visual audits against web pages and local windows, producing JSON and Markdown reports",
    capabilities: ["visual-audit", "web-audit", "local-window-audit", "report-generation"],
    readScopes: ["filesystem:reports"],
    writeScopes: ["filesystem:reports"],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: [],
    sideEffects: ["child-process-spawn", "filesystem-write-report"],
    failureModes: ["audit-script-not-found", "audit-timeout", "audit-nonzero-exit"],
    emittedEvents: []
  };
}

module.exports = {
  runUiVisualAudit,
  manifest
};
