#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTimestampForFile(date = new Date()) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate())
  ].join("") + "-" + [
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds())
  ].join("") + "Z";
}

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.ASOLARIA_BASE_URL || "http://127.0.0.1:4781",
    outDir: path.join(__dirname, "..", "reports"),
    timeoutMs: 25000,
    skipApi: false
  };
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < args.length; i += 1) {
    const raw = String(args[i] || "");
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    const key = (eq === -1 ? raw : raw.slice(0, eq)).replace(/^--/, "");
    const value = eq === -1 ? "" : raw.slice(eq + 1);
    const nextValue = () => {
      if (value) return value;
      const next = args[i + 1];
      if (next !== undefined && !String(next).startsWith("--")) {
        i += 1;
        return String(next);
      }
      return "";
    };
    if (key === "baseUrl") out.baseUrl = nextValue() || out.baseUrl;
    else if (key === "outDir") out.outDir = path.resolve(nextValue() || out.outDir);
    else if (key === "timeoutMs") out.timeoutMs = Math.max(2000, Math.min(180000, Number(nextValue() || out.timeoutMs)));
    else if (key === "skipApi") out.skipApi = true;
  }
  out.baseUrl = String(out.baseUrl || "").replace(/\/+$/, "");
  return out;
}

async function fetchJson(url, timeoutMs = 25000) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is unavailable in this Node.js runtime.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(timeoutMs || 25000)));
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_error) {
      parsed = null;
    }
    if (!response.ok) {
      const hint = parsed && typeof parsed === "object"
        ? (parsed.error || parsed.message || "")
        : String(text || "");
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${String(hint).slice(0, 260)}`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Expected JSON object from ${url}.`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function runNodeJson(scriptPath, args = [], timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.join(__dirname, ".."),
      windowsHide: true,
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new Error(`Timeout after ${timeoutMs}ms running ${path.basename(scriptPath)}.`));
    }, Math.max(2000, Number(timeoutMs || 20000)));

    child.stdout.on("data", (chunk) => { stdout += String(chunk || ""); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk || ""); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      const out = String(stdout || "").trim();
      if (code !== 0) {
        return reject(new Error(`Command failed (${code}): ${String(stderr || out).slice(0, 2400)}`));
      }
      if (!out) {
        return resolve(null);
      }
      try {
        return resolve(JSON.parse(out));
      } catch (_error) {
        return reject(new Error(`Non-JSON output: ${out.slice(0, 300)}`));
      }
    });
  });
}

function redactSecrets(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "<circular>";
  if (depth > 16) return "<max_depth>";
  seen.add(value);

  const shouldRedact = (key) => {
    const name = String(key || "");
    if (!name) return false;
    if (/(hint|masked|hash|count|ttl)$/i.test(name)) return false;
    return /(token|secret|password|authorization|api[_-]?key|private[_-]?key|cookie|session)/i.test(name);
  };

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1, seen));
  }

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = shouldRedact(key) ? "<redacted>" : redactSecrets(nested, depth + 1, seen);
  }
  return out;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function summarizeHealth(payload) {
  const health = payload && typeof payload === "object" ? payload : {};
  const selectedRaw = health?.connectionRouting?.selected;
  const selectedChannel = String(
    (selectedRaw && typeof selectedRaw === "object" ? selectedRaw.channel : selectedRaw)
    || health?.networkPolicy?.connectionSelectedChannel
    || ""
  ).trim();
  const configuredChannels = Array.isArray(health?.connectionRouting?.configuredAvailable)
    ? health.connectionRouting.configuredAvailable
    : Array.isArray(health?.connectionRouting?.configuredChannels)
      ? health.connectionRouting.configuredChannels
      : Array.isArray(health?.networkPolicy?.connectionConfiguredChannels)
        ? health.networkPolicy.connectionConfiguredChannels
        : [];
  const externalProviders = Array.isArray(health?.providers?.external) ? health.providers.external : [];
  return {
    ok: Boolean(health.ok),
    selectedChannel,
    configuredChannels,
    skillsLoaded: safeNumber(health?.skills?.total, 0),
    externalProviders: externalProviders.length
  };
}

function summarizeSkillsIndex(payload) {
  const index = payload && typeof payload === "object" ? payload.index : null;
  if (!index || typeof index !== "object") {
    return {
      generatedAt: "",
      skillsTotal: 0,
      actionsTotal: 0,
      mcpProviders: 0,
      mcpCache: {
        providerCatalogCount: 0,
        scopedContextCount: 0
      }
    };
  }
  const providers = Array.isArray(index?.mcp?.providers) ? index.mcp.providers : [];
  return {
    generatedAt: String(index.generatedAt || ""),
    skillsTotal: safeNumber(index?.skills?.total, 0),
    actionsTotal: safeNumber(index?.tools?.totalActions, 0),
    mcpProviders: providers.length,
    mcpProviderIds: providers.map((row) => String(row?.id || "").trim()).filter(Boolean),
    mcpCache: {
      providerCatalogCount: safeNumber(index?.mcp?.cache?.providerCatalogCount, 0),
      scopedContextCount: safeNumber(index?.mcp?.cache?.scopedContextCount, 0)
    }
  };
}

function summarizeExternalStatus(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const statusRows = Array.isArray(data.status) ? data.status : [];
  const presets = data.mcpPolicyPresets && typeof data.mcpPolicyPresets === "object"
    ? Object.keys(data.mcpPolicyPresets)
    : [];
  return {
    providerCount: statusRows.length,
    enabledMcp: statusRows.filter((row) => Boolean(row?.mcpEnabled)).length,
    configuredMcp: statusRows.filter((row) => Boolean(row?.mcpConfigured)).length,
    presetCount: presets.length,
    presets,
    cache: {
      providerCatalogCount: safeNumber(data?.mcpCache?.providerCatalogCount, 0),
      scopedContextCount: safeNumber(data?.mcpCache?.scopedContextCount, 0)
    }
  };
}

function summarizeMcpCache(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const cache = root.cache && typeof root.cache === "object" ? root.cache : {};
  const providerCatalog = Array.isArray(cache.providerCatalog) ? cache.providerCatalog : [];
  const scopedContexts = Array.isArray(cache.scopedContexts) ? cache.scopedContexts : [];
  return {
    providerCatalogCount: safeNumber(cache.providerCatalogCount, providerCatalog.length),
    scopedContextCount: safeNumber(cache.scopedContextCount, scopedContexts.length),
    providersWithCatalog: providerCatalog
      .map((row) => String(row?.provider || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((item, idx, arr) => arr.indexOf(item) === idx)
  };
}

function summarizeLocalOpsStatus(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const localOps = data.localOps && typeof data.localOps === "object" ? data.localOps : {};
  const browserTasks = data.browserTasks && typeof data.browserTasks === "object" ? data.browserTasks : {};
  const aliases = localOps.aliases && typeof localOps.aliases === "object"
    ? Object.keys(localOps.aliases)
    : [];
  const allowedRoots = Array.isArray(localOps.allowedRoots) ? localOps.allowedRoots : [];
  const tasks = Array.isArray(localOps.tasks) ? localOps.tasks : [];
  const browserAllowedHosts = Array.isArray(browserTasks.allowedHosts) ? browserTasks.allowedHosts : [];
  return {
    localOpsEnabled: Boolean(localOps.enabled),
    allowedRootsCount: allowedRoots.length,
    aliasCount: aliases.length,
    tasksCount: tasks.length,
    browserTasksEnabled: Boolean(browserTasks.enabled),
    browserAllowedHostsCount: browserAllowedHosts.length
  };
}

function markdownRow(label, value) {
  return `- ${label}: ${value}`;
}

function buildMarkdown(report, redacted = {}) {
  const lines = [];
  lines.push("# Codebase Review Composite Snapshot");
  lines.push("");
  lines.push(markdownRow("Generated", `\`${report.generatedAt}\``));
  lines.push(markdownRow("Base URL", `\`${report.baseUrl}\``));
  lines.push("");

  lines.push("## Local Skill Validation");
  const validate = report.local?.skillValidation || {};
  lines.push(markdownRow("OK", `\`${Boolean(validate.ok)}\``));
  lines.push(markdownRow("Skills", `\`${safeNumber(validate.total, 0)}\``));
  lines.push(markdownRow("Errors", `\`${Array.isArray(validate.errors) ? validate.errors.length : 0}\``));
  lines.push("");

  lines.push("## Composite Endpoint Snapshot");
  if (report.apiSkipped) {
    lines.push("- API checks skipped (`--skipApi`).");
    lines.push("");
  } else if (report.apiError) {
    lines.push(markdownRow("Status", `\`failed\` (${String(report.apiError || "").slice(0, 260)})`));
    lines.push("");
  } else {
    const health = report.api?.healthSummary || {};
    const index = report.api?.skillsIndexSummary || {};
    const external = report.api?.externalSummary || {};
    const localOps = report.api?.localOpsSummary || {};
    const mcpCache = report.api?.mcpCacheSummary || {};
    lines.push(markdownRow("Health OK", `\`${Boolean(health.ok)}\``));
    lines.push(markdownRow("Selected Channel", `\`${String(health.selectedChannel || "unknown")}\``));
    lines.push(markdownRow("Configured Channels", `\`${(health.configuredChannels || []).join(",") || "n/a"}\``));
    lines.push(markdownRow("Skills Loaded (index)", `\`${safeNumber(index.skillsTotal, 0)}\``));
    lines.push(markdownRow("Skill Actions", `\`${safeNumber(index.actionsTotal, 0)}\``));
    lines.push(markdownRow("MCP Providers (index)", `\`${safeNumber(index.mcpProviders, 0)}\``));
    lines.push(markdownRow("Local Ops Enabled", `\`${Boolean(localOps.localOpsEnabled)}\``));
    lines.push(markdownRow("Local Ops Allowed Roots", `\`${safeNumber(localOps.allowedRootsCount, 0)}\``));
    lines.push(markdownRow("Local Ops Aliases", `\`${safeNumber(localOps.aliasCount, 0)}\``));
    lines.push(markdownRow("Browser Tasks Enabled", `\`${Boolean(localOps.browserTasksEnabled)}\``));
    lines.push(markdownRow("External MCP Enabled", `\`${safeNumber(external.enabledMcp, 0)}\``));
    lines.push(markdownRow("External MCP Configured", `\`${safeNumber(external.configuredMcp, 0)}\``));
    lines.push(markdownRow("MCP Presets", `\`${(external.presets || []).join(",") || "n/a"}\``));
    lines.push(markdownRow("MCP Cache Provider Catalog", `\`${safeNumber(mcpCache.providerCatalogCount, 0)}\``));
    lines.push(markdownRow("MCP Cache Scoped Contexts", `\`${safeNumber(mcpCache.scopedContextCount, 0)}\``));
    lines.push("");
  }

  lines.push("## Artifacts");
  lines.push(markdownRow("JSON", `\`${report.paths?.json || ""}\``));
  lines.push(markdownRow("Markdown", `\`${report.paths?.markdown || ""}\``));
  lines.push("");

  lines.push("## Redacted Raw Snapshot");
  lines.push("```json");
  lines.push(JSON.stringify(redacted, null, 2));
  lines.push("```");

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv);
  fs.mkdirSync(options.outDir, { recursive: true });

  const stamp = formatTimestampForFile(new Date());
  const prefix = `codebase-review-composite-snapshot-${stamp}`;
  const jsonPath = path.join(options.outDir, `${prefix}.json`);
  const mdPath = path.join(options.outDir, `${prefix}.md`);
  const latestJsonPath = path.join(options.outDir, "codebase-review-composite-snapshot-latest.json");
  const latestMdPath = path.join(options.outDir, "codebase-review-composite-snapshot-latest.md");

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    apiSkipped: options.skipApi,
    local: {},
    api: null,
    apiError: "",
    paths: {
      json: jsonPath,
      markdown: mdPath
    }
  };

  try {
    const validation = await runNodeJson(path.join(__dirname, "validate-skills.js"), [], Math.max(6000, options.timeoutMs));
    report.local.skillValidation = validation || {};
  } catch (error) {
    report.ok = false;
    report.local.skillValidationError = String(error?.message || error).slice(0, 400);
  }

  if (!options.skipApi) {
    try {
      const [health, skillsIndex, externalStatus, mcpCache, localOpsStatus] = await Promise.all([
        fetchJson(`${options.baseUrl}/api/health`, options.timeoutMs),
        fetchJson(`${options.baseUrl}/api/skills/index?force=true`, options.timeoutMs),
        fetchJson(`${options.baseUrl}/api/integrations/external/status`, options.timeoutMs),
        fetchJson(`${options.baseUrl}/api/integrations/external/mcp-cache`, options.timeoutMs),
        fetchJson(`${options.baseUrl}/api/local/ops/status`, options.timeoutMs)
      ]);

      report.api = {
        healthSummary: summarizeHealth(health),
        skillsIndexSummary: summarizeSkillsIndex(skillsIndex),
        externalSummary: summarizeExternalStatus(externalStatus),
        mcpCacheSummary: summarizeMcpCache(mcpCache),
        localOpsSummary: summarizeLocalOpsStatus(localOpsStatus),
        raw: {
          health,
          skillsIndex,
          externalStatus,
          mcpCache,
          localOpsStatus
        }
      };
    } catch (error) {
      report.ok = false;
      report.apiError = String(error?.message || error).slice(0, 600);
    }
  }

  const redacted = redactSecrets(report);
  const markdown = buildMarkdown(report, redacted);

  fs.writeFileSync(jsonPath, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${markdown}\n`, "utf8");
  fs.writeFileSync(latestJsonPath, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestMdPath, `${markdown}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({
    ok: report.ok,
    generatedAt: report.generatedAt,
    apiSkipped: report.apiSkipped,
    apiError: report.apiError || null,
    jsonPath,
    markdownPath: mdPath,
    latestJsonPath,
    latestMarkdownPath: latestMdPath
  }, null, 2)}\n`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Run-CodebaseReviewCompositeSnapshot failed: ${error.message}\n`);
  process.exit(1);
});
