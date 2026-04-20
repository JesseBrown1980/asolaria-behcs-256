#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function nowIso() {
  return new Date().toISOString();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTimestampForFile(date = new Date()) {
  // YYYYMMDD-HHMMSSZ
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
    outDir: "",
    packageName: process.env.ASOLARIA_PLAY_PACKAGE || "com.jessebrown.asolaria",
    gcpProject: process.env.ASOLARIA_GCP_PROJECT || "",
    includeLocal: true,
    includePlay: true,
    includeGcp: true,
    latest: true,
    timeoutMs: 25000
  };

  const args = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < args.length; i += 1) {
    const raw = String(args[i] || "");
    if (!raw.startsWith("--")) {
      continue;
    }
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
    else if (key === "outDir") out.outDir = nextValue();
    else if (key === "package" || key === "packageName") out.packageName = nextValue() || out.packageName;
    else if (key === "project" || key === "gcpProject") out.gcpProject = nextValue() || out.gcpProject;
    else if (key === "timeoutMs") out.timeoutMs = Math.max(2000, Math.min(180000, Number(nextValue() || out.timeoutMs)));
    else if (key === "noLocal") out.includeLocal = false;
    else if (key === "noPlay") out.includePlay = false;
    else if (key === "noGcp") out.includeGcp = false;
    else if (key === "noLatest") out.latest = false;
  }

  if (!out.outDir) {
    out.outDir = path.join(__dirname, "..", "reports");
  }
  return out;
}

async function fetchJson(url, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is not available in this Node.js runtime.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(options.timeoutMs || 25000)));
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
        : "";
      const suffix = hint ? ` ${String(hint).slice(0, 220)}` : "";
      throw new Error(`HTTP ${response.status} ${response.statusText}.${suffix}`.trim());
    }
    if (parsed && typeof parsed === "object") return parsed;
    return { ok: true, nonJson: true, text: String(text || "").slice(0, 8000) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is not available in this Node.js runtime.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(options.timeoutMs || 25000)));
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: String(text || "")
    };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, Math.max(40, Number(max || 220)));
}

function cloneJsonValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function hasObjectValue(value) {
  return Boolean(value && typeof value === "object");
}

function isSuccessfulPayload(value) {
  return hasObjectValue(value) && value.ok !== false;
}

function pickFirstObject(...candidates) {
  for (const candidate of candidates) {
    if (hasObjectValue(candidate)) {
      return candidate;
    }
  }
  return null;
}

function wrapStatusPayload(status) {
  if (!hasObjectValue(status)) return null;
  if (Object.prototype.hasOwnProperty.call(status, "status") || Object.prototype.hasOwnProperty.call(status, "ok")) {
    return status;
  }
  return { ok: true, status };
}

function buildAutomationFallback(health, localOps) {
  const healthAutomation = hasObjectValue(health?.automation) ? health.automation : {};
  const fallback = {
    localOps: pickFirstObject(localOps?.localOps, healthAutomation.localOps),
    browserTasks: pickFirstObject(localOps?.browserTasks, healthAutomation.browserTasks),
    slack: pickFirstObject(localOps?.slack, healthAutomation.slack),
    github: pickFirstObject(localOps?.github, healthAutomation.github),
    microsoft: pickFirstObject(localOps?.microsoft, healthAutomation.microsoft),
    symphony: pickFirstObject(localOps?.symphony, healthAutomation.symphony),
    augmentContext: pickFirstObject(localOps?.augmentContext, healthAutomation.augmentContext),
    telegram: pickFirstObject(localOps?.telegram, healthAutomation.telegram),
    google: pickFirstObject(localOps?.google, healthAutomation.google),
    gcp: pickFirstObject(localOps?.gcp, healthAutomation.gcp),
    vertex: pickFirstObject(localOps?.vertex, healthAutomation.vertex),
    geminiApi: pickFirstObject(localOps?.geminiApi, healthAutomation.geminiApi),
    workLinks: pickFirstObject(localOps?.workLinks, healthAutomation.workLinks),
    workOrgs: pickFirstObject(localOps?.workOrgs, healthAutomation.workOrgs)
  };
  return Object.values(fallback).some((value) => hasObjectValue(value)) ? fallback : null;
}

async function waitForJob(baseUrl, jobId, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 60000));
  const pollMs = Math.max(250, Math.min(2500, Number(options.pollMs || 650)));

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for job ${jobId} after ${timeoutMs}ms.`);
    }
    const data = await fetchJson(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
      timeoutMs: Math.max(3000, Number(options.requestTimeoutMs || 15000))
    });
    const job = data && typeof data === "object" ? data.job : null;
    const status = String(job?.status || "");
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return job;
    }
    await sleep(pollMs);
  }
}

async function queueJobAndWait(baseUrl, relativeUrl, options = {}) {
  const queued = await fetchJson(`${baseUrl}${relativeUrl}`, {
    timeoutMs: Math.max(2000, Math.min(30000, Number(options.requestTimeoutMs || options.timeoutMs || 15000)))
  });
  const jobId = String(queued?.job?.id || "").trim();
  if (!jobId) {
    throw new Error(`No job id returned from ${relativeUrl}`);
  }
  return waitForJob(baseUrl, jobId, { timeoutMs: Math.max(5000, Number(options.timeoutMs || 90000)) });
}

function redactSecrets(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "<circular>";
  if (depth > 16) return "<max_depth>";
  seen.add(value);

  const redactKey = (key) => {
    const name = String(key || "");
    if (!name) return false;
    if (/(hint|masked|hash)$/i.test(name)) return false;
    return /(token|secret|private[_-]?key|api[_-]?key|refresh(?:[_-]?token)?|access[_-]?token|authorization|assertion)/i.test(name);
  };

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1, seen));
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (redactKey(k)) {
      out[k] = "<redacted>";
    } else {
      out[k] = redactSecrets(v, depth + 1, seen);
    }
  }
  return out;
}

function runPowerShellJson(command, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(String(command || ""), "utf16le").toString("base64");
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded
    ], {
      windowsHide: true,
      cwd: path.join(__dirname, ".."),
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new Error(`PowerShell timed out after ${timeoutMs}ms.`));
    }, Math.max(2000, Number(timeoutMs || 15000)));

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
      if (code !== 0) {
        const detail = String(stderr || stdout || "").trim().slice(0, 2000);
        return reject(new Error(`PowerShell failed (exit ${code}): ${detail || "unknown error"}`));
      }
      const text = String(stdout || "").trim();
      if (!text) {
        return resolve(null);
      }
      try {
        return resolve(JSON.parse(text));
      } catch (_error) {
        return reject(new Error(`PowerShell returned non-JSON output: ${text.slice(0, 400)}`));
      }
    });
  });
}

async function collectLocalState(targetPorts) {
  const ports = Array.isArray(targetPorts) ? targetPorts : [4781, 8788, 4791, 5443, 5444];
  const ps = `
$ErrorActionPreference='SilentlyContinue'
$ports = @(${ports.map((p) => Number(p)).filter((p) => Number.isFinite(p)).join(",")})
$listeners = Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | Select-Object LocalAddress,LocalPort,OwningProcess
$procMap = @{}
foreach ($row in $listeners) {
  $procId = [int]$row.OwningProcess
  $key = [string]$procId
  if (-not $procMap.ContainsKey($key)) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" | Select-Object Name,ProcessId,CommandLine
    if ($p) { $procMap[$key] = $p }
  }
}
$allProcs = Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','cloudflared.exe','python.exe','cmd.exe','powershell.exe') } | Select-Object Name,ProcessId,CommandLine
$openclawLike = $allProcs | Where-Object { $_.CommandLine -match '(?i)openclaw|\\\\.openclaw\\\\|gateway\\\\.cmd' }
$task = ""
try { $task = (schtasks /Query /TN "OpenClaw Gateway" /V /FO LIST) -join [Environment]::NewLine } catch { $task = "" }
$tools = [ordered]@{
  node     = (Get-Command node -ErrorAction SilentlyContinue).Source
  gcloud   = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
  gws      = (Get-Command gws -ErrorAction SilentlyContinue).Source
  firebase = (Get-Command firebase -ErrorAction SilentlyContinue).Source
  fastlane = (Get-Command fastlane -ErrorAction SilentlyContinue).Source
  adb      = (Get-Command adb -ErrorAction SilentlyContinue).Source
}
$adbDevices = ""
if ($tools.adb) {
  try { $adbDevices = ( & $tools.adb devices ) -join [Environment]::NewLine } catch { $adbDevices = "" }
}
[ordered]@{
  listeners = $listeners
  listenerProcesses = $procMap
  openclawLikeProcesses = $openclawLike
  openclawGatewayTask = $task
  tools = $tools
  adbDevices = $adbDevices
} | ConvertTo-Json -Depth 8 -Compress
`.trim();

  try {
    const raw = await runPowerShellJson(ps, 18000);
    const taskText = String(raw?.openclawGatewayTask || "");
    const disabled = /Status:\s+Desabilitado|Status:\s+Disabled/i.test(taskText);
    const normalizeArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === "object") {
        if (Object.keys(value).length === 0) return [];
        return [value];
      }
      return [];
    };
    return {
      ok: true,
      listeners: normalizeArray(raw?.listeners),
      listenerProcesses: raw?.listenerProcesses || {},
      openclawLikeProcesses: normalizeArray(raw?.openclawLikeProcesses),
      openclawGatewayTask: {
        present: Boolean(taskText.trim()),
        disabled,
        raw: taskText.trim().slice(0, 4000)
      },
      tools: raw?.tools || {},
      adbDevicesRaw: String(raw?.adbDevices || "").trim()
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error || "local_state_failed")
    };
  }
}

function markdownEscape(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return `${rounded} ${units[index]}`;
}

async function collectNotebookLmState(baseUrl, googleStatus, gcpStatus, options = {}) {
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000));
  const project = String(gcpStatus?.status?.defaultProject || gcpStatus?.status?.projectId || "").trim();
  const location = String(options.location || "global").trim() || "global";
  const google = googleStatus?.status || {};
  const defaultAccount = String(google.defaultAccount || "").trim();
  const primaryRuntimeAccount = String(google.primaryRuntimeAccount || "").trim();
  const connectedAccounts = asArray(google.connectedAccounts).map((item) => String(item?.email || "").trim()).filter(Boolean);
  const allowlistedConnected = asArray(google.allowlistedConnected).map((item) => String(item || "").trim()).filter(Boolean);
  const accounts = Array.from(new Set([...allowlistedConnected, ...connectedAccounts])).sort();

  const buildQuery = (email, limit) => {
    const parts = [];
    if (email) parts.push(`account=${encodeURIComponent(email)}`);
    if (project) parts.push(`project=${encodeURIComponent(project)}`);
    if (location) parts.push(`location=${encodeURIComponent(location)}`);
    if (limit) parts.push(`limit=${encodeURIComponent(String(limit))}`);
    return parts.length ? `?${parts.join("&")}` : "";
  };

  const collectAccount = async (email) => {
    try {
      const statusJob = await queueJobAndWait(
        baseUrl,
        `/api/integrations/notebooklm/enterprise/status${buildQuery(email, 0)}`,
        { timeoutMs }
      );
      let listJob = null;
      let listError = "";

      const result = statusJob.result || {};
      const shouldListNotebooks = Boolean(result.enterpriseReady || result.access || Number(result.recentNotebookCount || 0) > 0);
      const blockers = asArray(result.blockers).map((item) => compactText(item, 240)).filter(Boolean);

      if (statusJob.status === "completed" && shouldListNotebooks) {
        try {
          listJob = await queueJobAndWait(
            baseUrl,
            `/api/integrations/notebooklm/enterprise/notebooks${buildQuery(email, 5)}`,
            { timeoutMs }
          );
        } catch (error) {
          listError = String(error?.message || error || "notebook_list_failed");
        }
      }

      const notebooks = asArray(listJob?.result?.notebooks).map((item) => ({
        notebookId: String(item?.notebookId || "").trim(),
        title: String(item?.title || "").trim(),
        emoji: String(item?.emoji || "").trim()
      })).filter((item) => item.notebookId || item.title);

      let state = "unknown";
      if (result.enterpriseReady) state = "ready";
      else if (blockers.some((item) => /license config quota|subscription tier|license/i.test(item))) state = "seat_blocked";
      else if (blockers.length) state = "blocked";
      else if (statusJob.status === "completed") state = "degraded";

      return {
        account: email,
        state,
        access: Boolean(result.access),
        enterpriseReady: Boolean(result.enterpriseReady),
        apiEnabled: result.apiEnabled === null || result.apiEnabled === undefined ? null : Boolean(result.apiEnabled),
        recentNotebookCount: Number(result.recentNotebookCount || 0),
        blockers,
        notebooks,
        listError: compactText(listError, 240),
        statusJobId: String(statusJob.id || ""),
        listJobId: String(listJob?.id || "")
      };
    } catch (error) {
      return {
        account: email,
        state: "error",
        access: false,
        enterpriseReady: false,
        apiEnabled: null,
        recentNotebookCount: 0,
        blockers: [compactText(error?.message || error || "notebook_status_failed", 240)],
        notebooks: [],
        listError: "",
        statusJobId: "",
        listJobId: ""
      };
    }
  };

  let defaultProbe = null;
  try {
    const defaultStatusJob = await queueJobAndWait(
      baseUrl,
      `/api/integrations/notebooklm/enterprise/status${buildQuery("", 0)}`,
      { timeoutMs }
    );
    let defaultListJob = null;
    const defaultShouldList = Boolean(
      defaultStatusJob?.result?.enterpriseReady ||
      defaultStatusJob?.result?.access ||
      Number(defaultStatusJob?.result?.recentNotebookCount || 0) > 0
    );
    if (defaultShouldList) {
      defaultListJob = await queueJobAndWait(
        baseUrl,
        `/api/integrations/notebooklm/enterprise/notebooks${buildQuery("", 5)}`,
        { timeoutMs }
      );
    }
    defaultProbe = {
      account: String(defaultStatusJob?.result?.account || "").trim(),
      enterpriseReady: Boolean(defaultStatusJob?.result?.enterpriseReady),
      blockers: asArray(defaultStatusJob?.result?.blockers).map((item) => compactText(item, 240)).filter(Boolean),
      notebooks: asArray(defaultListJob?.result?.notebooks).map((item) => ({
        notebookId: String(item?.notebookId || "").trim(),
        title: String(item?.title || "").trim(),
        emoji: String(item?.emoji || "").trim()
      })).filter((item) => item.notebookId || item.title)
    };
  } catch (error) {
    defaultProbe = {
      account: "",
      enterpriseReady: false,
      blockers: [compactText(error?.message || error || "default_probe_failed", 240)],
      notebooks: []
    };
  }

  const rows = await Promise.all(accounts.map((email) => collectAccount(email)));

  const readyRows = rows.filter((item) => item.enterpriseReady);
  const seatBlockedRows = rows.filter((item) => item.state === "seat_blocked");
  const blockedRows = rows.filter((item) => item.state !== "ready");

  return {
    ok: true,
    project,
    location,
    defaultAccount,
    primaryRuntimeAccount,
    totalAccounts: rows.length,
    readyCount: readyRows.length,
    seatBlockedCount: seatBlockedRows.length,
    blockedCount: blockedRows.length,
    readyAccounts: readyRows.map((item) => item.account),
    blockedAccounts: blockedRows.map((item) => item.account),
    defaultProbe,
    accounts: rows
  };
}

function summarizeIntegrationClosure(snapshot) {
  const summary = {
    healthy: [],
    degraded: [],
    blocked: [],
    unconfigured: [],
    disabled: [],
    nextActions: []
  };
  const pushItem = (bucket, label, detail) => {
    if (!summary[bucket]) return;
    summary[bucket].push(detail ? `${label}: ${detail}` : label);
  };
  const isDisabled = (value) => Boolean(value) && value.enabled === false;
  const automation = snapshot?.asolaria?.automation || snapshot?.asolaria?.health?.automation || {};
  const notebooklm = snapshot?.asolaria?.integrations?.notebooklm || null;
  const abacus = snapshot?.asolaria?.integrations?.abacus || null;
  const external = snapshot?.asolaria?.integrations?.external || null;
  const network = snapshot?.asolaria?.networkPolicy || {};
  const selectedChannel = String(snapshot?.asolaria?.health?.connectionRouting?.selected?.channel || "").trim();

  const slack = automation.slack || {};
  if (isDisabled(slack)) {
    pushItem("disabled", "Slack", "disabled by policy");
  } else {
    pushItem(slack.configured ? "healthy" : "unconfigured", "Slack", slack.configured ? "workspace connected" : "token missing");
  }

  const google = automation.google || {};
  if (isDisabled(google)) {
    pushItem("disabled", "Google OAuth", "disabled by policy");
  } else {
    pushItem(
      google.configured && google.primaryConnected ? "healthy" : "blocked",
      "Google OAuth",
      google.configured
        ? `primary=${google.primaryRuntimeAccount || google.defaultAccount || "(none)"} connected=${asArray(google.allowlistedConnected).length}`
        : "OAuth client missing"
    );
  }

  const gcp = automation.gcp || {};
  if (isDisabled(gcp)) {
    pushItem("disabled", "GCP", "disabled by policy");
  } else {
    pushItem(gcp.configured ? "healthy" : "blocked", "GCP", gcp.configured ? `${gcp.defaultProject || gcp.projectId || "(no project)"}` : "service account missing");
  }

  const vertex = automation.vertex || {};
  if (isDisabled(vertex)) {
    pushItem("disabled", "Vertex", "disabled by policy");
  } else {
    pushItem(vertex.configured ? "healthy" : "blocked", "Vertex", vertex.configured ? `${vertex.project || ""}/${vertex.location || ""}` : "Vertex config missing");
  }

  const geminiApi = automation.geminiApi || {};
  if (isDisabled(geminiApi)) {
    pushItem("disabled", "Gemini API", "disabled by policy");
  } else {
    pushItem(geminiApi.configured ? "healthy" : "blocked", "Gemini API", geminiApi.configured ? `${geminiApi.defaultModel || "(model unknown)"}` : "API key missing");
  }

  const symphony = automation.symphony || {};
  if (isDisabled(symphony)) {
    pushItem("disabled", "Symphony", "disabled by policy");
  } else if (!symphony.configured) {
    pushItem("unconfigured", "Symphony", "workflow or Linear config missing");
  } else if (!symphony.process?.running) {
    pushItem("degraded", "Symphony", "configured but service is not running");
  } else {
    pushItem("healthy", "Symphony", `running on ${symphony.port || "(port unknown)"}`);
  }

  const augment = automation.augmentContext || {};
  if (isDisabled(augment)) {
    pushItem("disabled", "Augment Context", "disabled by policy");
  } else if (!augment.configured) {
    pushItem("unconfigured", "Augment Context", "remote MCP config missing");
  } else if (augment.providerApplyReady) {
    pushItem("healthy", "Augment Context", `${augment.mode || "unknown"} ${augment.preset || ""}`.trim());
  } else {
    pushItem("degraded", "Augment Context", "configured but provider patch is not ready");
  }

  if (notebooklm?.totalAccounts > 0) {
    const detail = `ready=${notebooklm.readyCount}/${notebooklm.totalAccounts}; seat_blocked=${notebooklm.seatBlockedCount}`;
    if (notebooklm.readyCount === notebooklm.totalAccounts) pushItem("healthy", "NotebookLM Enterprise", detail);
    else if (notebooklm.readyCount > 0) pushItem("degraded", "NotebookLM Enterprise", detail);
    else pushItem("blocked", "NotebookLM Enterprise", detail);
  }

  const github = automation.github || {};
  if (isDisabled(github)) {
    pushItem("disabled", "GitHub", "disabled by policy");
  } else {
    pushItem(github.configured ? "healthy" : "unconfigured", "GitHub", github.configured ? "token configured" : "token missing");
  }

  const microsoft = automation.microsoft || {};
  if (isDisabled(microsoft)) {
    pushItem("disabled", "Microsoft", "disabled by policy");
  } else {
    pushItem(microsoft.configured ? "healthy" : "unconfigured", "Microsoft", microsoft.configured ? `${asArray(microsoft.connectedAccounts).length} accounts connected` : "OAuth client missing");
  }

  const telegram = automation.telegram || {};
  if (isDisabled(telegram)) {
    pushItem("disabled", "Telegram", "disabled by policy");
  } else {
    pushItem(telegram.configured ? "healthy" : "unconfigured", "Telegram", telegram.configured ? "bot token configured" : "bot token missing");
  }

  const cursorExternal = asArray(external?.status).find((item) => String(item?.id || "") === "cursor");
  if (cursorExternal?.configured) {
    pushItem("healthy", "External Cursor", `${cursorExternal.model || "(model unknown)"} + MCP=${cursorExternal.mcpEnabled ? "on" : "off"}`);
  }
  const antigravityExternal = asArray(external?.status).find((item) => String(item?.id || "") === "antigravity");
  if (antigravityExternal?.enabled === false) {
    pushItem("disabled", "External Antigravity", "disabled by policy");
  } else if (antigravityExternal && !antigravityExternal.configured) {
    pushItem("unconfigured", "External Antigravity", "config missing");
  }

  if (abacus?.status?.configured) {
    const desktopRunning = Boolean(abacus.status?.capabilities?.desktop?.running);
    const printReady = Boolean(abacus.status?.capabilities?.cli?.printReady);
    if (desktopRunning && printReady) pushItem("healthy", "Abacus", "desktop + CLI print path ready");
    else pushItem("degraded", "Abacus", `desktop=${desktopRunning ? "on" : "off"}; cli_print=${printReady ? "ready" : "limited"}`);
  } else {
    pushItem("unconfigured", "Abacus", "config missing");
  }

  const pushSubscriptions = Number(network?.mobilePush?.subscriptions || 0);
  const keeperRunning = Boolean(network?.phoneBridgeKeeper?.running);
  const tunnelRunning = Boolean(network?.phoneTunnelMonitor?.running);
  const tunnelPass = Boolean(network?.phoneTunnelMonitor?.latestReportPass);
  const usbPreferred = selectedChannel === "usb";
  const usbDetail = `route=${selectedChannel || "unknown"}; keeper=${keeperRunning ? "on" : "off"}`;
  if (usbPreferred && keeperRunning) pushItem("healthy", "Computer-use USB lane", usbDetail);
  else pushItem("degraded", "Computer-use USB lane", usbDetail);

  const pushDetail = `subscriptions=${pushSubscriptions}`;
  if (pushSubscriptions > 0) pushItem("healthy", "Phone mobile push", pushDetail);
  else pushItem("degraded", "Phone mobile push", pushDetail);

  const tunnelDetail = `monitor=${tunnelRunning ? "on" : "off"}; latest=${tunnelPass ? "ok" : "degraded"}`;
  if (tunnelRunning && tunnelPass) pushItem("healthy", "Phone remote tunnel", tunnelDetail);
  else pushItem("degraded", "Phone remote tunnel", tunnelDetail);

  if (notebooklm?.readyCount < notebooklm?.totalAccounts) {
    summary.nextActions.push("NotebookLM: either keep runtime pinned to the single ready principal or add more AI Expanded Access seats before widening usage.");
  }
  if (!keeperRunning) {
    summary.nextActions.push("Phone: restart the phone bridge keeper or fix its supervisor path so USB/bridge recovery stays self-healing.");
  }
  if (pushSubscriptions < 1) {
    summary.nextActions.push("Phone: create at least one mobile push subscription and run a push test so failures do not stay silent.");
  }
  if (!tunnelPass) {
    summary.nextActions.push("Phone network: repair private-network/Tailscale health or explicitly accept USB-only mode so remote tunnel drift stops looking like a core blocker.");
  }
  if (!isDisabled(github) && !github.configured) {
    summary.nextActions.push("GitHub: configure a token or explicitly disable the connector so it stops looking half-present.");
  }
  if (!isDisabled(microsoft) && !microsoft.configured) {
    summary.nextActions.push("Microsoft: configure OAuth only if QDD/Teams flows are needed; otherwise disable it and keep the current Slack-only work-org profile.");
  }
  if (!isDisabled(telegram) && !telegram.configured) {
    summary.nextActions.push("Telegram: configure the bot or disable the connector to reduce false hanging pieces.");
  }
  if (abacus?.status?.configured && !Boolean(abacus.status?.capabilities?.cli?.printReady)) {
    summary.nextActions.push("Abacus: treat it as browser/desktop-only for now or repair the CLI print path before using it as a headless lane.");
  }

  return summary;
}

function toMarkdown(snapshot) {
  const lines = [];
  const capturedAt = String(snapshot?.capturedAt || "");
  lines.push(`# Asolaria Snapshot`);
  lines.push("");
  lines.push(`Captured: \`${markdownEscape(capturedAt)}\``);
  lines.push(`Base URL: \`${markdownEscape(snapshot?.baseUrl || "")}\``);
  lines.push("");

  const local = snapshot?.local || null;
  if (local) {
    lines.push("## Local");
    lines.push("");
    lines.push(`- OpenClaw gateway scheduled task: ${local.openclawGatewayTask?.present ? (local.openclawGatewayTask.disabled ? "present, disabled" : "present, enabled") : "not found"}`);
    lines.push(`- OpenClaw-like processes: ${Array.isArray(local.openclawLikeProcesses) ? local.openclawLikeProcesses.length : 0}`);
    lines.push(`- Listeners (selected ports): ${Array.isArray(local.listeners) ? local.listeners.length : 0}`);
    lines.push("");
    const tools = local.tools && typeof local.tools === "object" ? local.tools : {};
    const toolLine = (name) => `- ${name}: ${tools[name] ? `\`${markdownEscape(tools[name])}\`` : "_not found on PATH_"}`;
    lines.push(toolLine("node"));
    lines.push(toolLine("gcloud"));
    lines.push(toolLine("gws"));
    lines.push(toolLine("firebase"));
    lines.push(toolLine("fastlane"));
    lines.push(toolLine("adb"));
    if (local.adbDevicesRaw) {
      lines.push("");
      lines.push("ADB devices:");
      lines.push("");
      lines.push("```");
      lines.push(local.adbDevicesRaw);
      lines.push("```");
    }
    lines.push("");
  }

  const asolaria = snapshot?.asolaria || null;
  if (asolaria) {
    lines.push("## Asolaria");
    lines.push("");
    const health = asolaria.health || {};
    const settingsState = pickFirstObject(
      asolaria?.settings?.settings,
      isSuccessfulPayload(asolaria?.settings) ? asolaria.settings : null,
      health?.settings
    ) || {};
    lines.push(`- Uptime: \`${markdownEscape(health.uptimeSeconds)}s\``);
    lines.push(`- Settings: \`openclawMode=${markdownEscape(settingsState?.openclawMode || "")}\`, \`guardianMode=${markdownEscape(settingsState?.guardianMode || "")}\`, \`approvalMode=${markdownEscape(settingsState?.approvalMode || "")}\``);
    lines.push(`- Skills loaded: \`${markdownEscape(health?.skills?.total)}\``);
    lines.push("");

    const integrations = asolaria.integrations || {};
    const statusLine = (name, s) => {
      const enabled = s?.enabled ? "enabled" : "disabled";
      const configured = s?.configured ? "configured" : "not configured";
      return `- ${name}: ${enabled}, ${configured}`;
    };
    lines.push(statusLine("Google", integrations.google?.status || integrations.google));
    lines.push(statusLine("Slack", integrations.slack?.status || integrations.slack));
    lines.push(statusLine("GitHub", integrations.github?.status || integrations.github));
    lines.push(statusLine("Microsoft", integrations.microsoft?.status || integrations.microsoft));
    lines.push(statusLine("Telegram", integrations.telegram?.status || integrations.telegram));
    lines.push(statusLine("GCP", integrations.gcp?.status || integrations.gcp));
    lines.push(statusLine("Vertex", integrations.vertex?.status || integrations.vertex));
    lines.push(statusLine("Gemini API", integrations.geminiApi?.status || integrations.geminiApi));
    lines.push(statusLine("Symphony", integrations.symphony?.status || integrations.symphony));
    lines.push(statusLine("Augment Context", integrations.augmentContext?.status || integrations.augmentContext));
    lines.push(statusLine("Abacus", integrations.abacus?.status || integrations.abacus));
    lines.push("");

    const captures = asolaria.captures || {};
    const policy = captures.policy || {};
    const stats = captures.stats || {};
    if (captures.ok && stats.ok && stats.desktop) {
      lines.push(`- Captures desktop auto: \`${markdownEscape(stats.desktop.autoCount)}\` (${formatBytes(stats.desktop.autoBytes)})`);
      lines.push(`- Captures desktop manual: \`${markdownEscape(stats.desktop.manualCount)}\` (${formatBytes(stats.desktop.manualBytes)})`);
      lines.push(`- Captures important: \`${markdownEscape(stats.important?.count)}\` (${formatBytes(stats.important?.bytes)})`);
      lines.push(`- Captures trash: \`${markdownEscape(stats.trash?.count)}\` (${formatBytes(stats.trash?.bytes)})`);
      if (policy.desktopAuto) {
        lines.push(`- Retention desktopAuto: keep=\`${markdownEscape(policy.desktopAuto.keep)}\` minAgeMinutes=\`${markdownEscape(policy.desktopAuto.minAgeMinutes)}\` mode=\`${markdownEscape(policy.desktopAuto.pruneMode)}\``);
      }
      lines.push("");
    }
  }

  const integrationSummary = snapshot?.asolaria?.integrationSummary || null;
  if (integrationSummary) {
    lines.push("## Integration Summary");
    lines.push("");
    const renderBucket = (title, items) => {
      if (!Array.isArray(items) || items.length === 0) return;
      lines.push(`### ${title}`);
      lines.push("");
      for (const item of items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    };
    renderBucket("Healthy", integrationSummary.healthy);
    renderBucket("Degraded", integrationSummary.degraded);
    renderBucket("Blocked", integrationSummary.blocked);
    renderBucket("Unconfigured", integrationSummary.unconfigured);
    renderBucket("Disabled", integrationSummary.disabled);
    renderBucket("Next Actions", integrationSummary.nextActions);
  }

  const notebooklm = snapshot?.asolaria?.integrations?.notebooklm || null;
  if (notebooklm) {
    lines.push("## NotebookLM Enterprise");
    lines.push("");
    lines.push(`- Primary runtime account: \`${markdownEscape(notebooklm.primaryRuntimeAccount || notebooklm.defaultAccount || "(none)")}\``);
    lines.push(`- Ready accounts: \`${markdownEscape(notebooklm.readyCount)} / ${markdownEscape(notebooklm.totalAccounts)}\``);
    if (notebooklm.defaultProbe) {
      const titles = asArray(notebooklm.defaultProbe.notebooks).map((item) => String(item?.title || "").trim()).filter(Boolean);
      lines.push(`- Default no-account probe: account=\`${markdownEscape(notebooklm.defaultProbe.account || "(none)")}\`, ready=\`${markdownEscape(notebooklm.defaultProbe.enterpriseReady)}\`, notebooks=\`${markdownEscape(titles.join(", ") || "(none)")}\``);
    }
    lines.push("");
    for (const row of asArray(notebooklm.accounts)) {
      const titles = asArray(row.notebooks).map((item) => String(item?.title || "").trim()).filter(Boolean).join(", ");
      const blocker = asArray(row.blockers)[0] || row.listError || "";
      lines.push(`- \`${markdownEscape(row.account || "")}\`: state=\`${markdownEscape(row.state || "")}\`, access=\`${markdownEscape(row.access)}\`, ready=\`${markdownEscape(row.enterpriseReady)}\`, notebooks=\`${markdownEscape(titles || "(none)")}\`${blocker ? `, blocker=\`${markdownEscape(blocker)}\`` : ""}`);
    }
    lines.push("");
  }

  const network = snapshot?.asolaria?.networkPolicy || null;
  if (network) {
    lines.push("## Computer Use");
    lines.push("");
    lines.push(`- Selected route: \`${markdownEscape(snapshot?.asolaria?.health?.connectionRouting?.selected?.channel || "")}\``);
    lines.push(`- Mobile push subscriptions: \`${markdownEscape(network?.mobilePush?.subscriptions)}\``);
    lines.push(`- Phone bridge keeper running: \`${markdownEscape(network?.phoneBridgeKeeper?.running)}\``);
    lines.push(`- Phone tunnel monitor running: \`${markdownEscape(network?.phoneTunnelMonitor?.running)}\``);
    lines.push(`- Phone tunnel latest pass: \`${markdownEscape(network?.phoneTunnelMonitor?.latestReportPass)}\``);
    lines.push(`- Remote base: \`${markdownEscape(network?.connectionResolvedRemoteBaseUrl || network?.connectionRemoteBaseUrl || "")}\``);
    lines.push("");
  }

  const gcp = snapshot?.gcp || null;
  if (gcp) {
    lines.push("## Google Cloud");
    lines.push("");
    if (gcp.enabledServices) {
      const svc = gcp.enabledServices;
      lines.push(`- Enabled services for project \`${markdownEscape(svc.project || "")}\`: \`${markdownEscape(svc.count)}\``);
      if (Array.isArray(svc.services) && svc.services.length) {
        lines.push("");
        lines.push("Top enabled services:");
        lines.push("");
        for (const name of svc.services.slice(0, 30)) {
          lines.push(`- \`${markdownEscape(name)}\``);
        }
      }
      lines.push("");
    } else {
      lines.push("- Enabled services: _not captured_");
      lines.push("");
    }
  }

  const play = snapshot?.googlePlay || null;
  if (play) {
    lines.push("## Google Play");
    lines.push("");
    lines.push(`- Package: \`${markdownEscape(play.packageName || "")}\``);
    if (play.playStore) {
      lines.push(`- Play Store HTTP: \`${markdownEscape(play.playStore.status)}\` (${markdownEscape(play.playStore.statusText || "")})`);
    }
    if (play.androidPublisherApi) {
      lines.push(`- Android Publisher API: ${play.androidPublisherApi.ok ? "ok" : "failed"}`);
      if (play.androidPublisherApi.error) {
        lines.push(`  - Error: \`${markdownEscape(play.androidPublisherApi.error)}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const capturedAt = nowIso();
  const ts = formatTimestampForFile(new Date());

  fs.mkdirSync(args.outDir, { recursive: true });

  const snapshot = {
    snapshotVersion: 1,
    capturedAt,
    baseUrl: args.baseUrl,
    packageName: args.packageName,
    gcpProject: args.gcpProject,
    local: null,
    asolaria: {
      health: null,
      settings: null,
      captures: null,
      integrations: {
        slack: null,
        github: null,
        microsoft: null,
        symphony: null,
        augmentContext: null,
        abacus: null,
        external: null,
        notebooklm: null,
        telegram: null,
        google: null,
        gcp: null,
        vertex: null,
        geminiApi: null
      },
      automation: null,
      networkPolicy: null,
      integrationSummary: null
    },
    gcp: null,
    googlePlay: null,
    warnings: [],
    errors: []
  };

  if (args.includeLocal) {
    snapshot.local = await collectLocalState([4781, 8788, 4791, 5443, 5444]);
    if (snapshot.local && snapshot.local.ok !== true) {
      snapshot.warnings.push(`Local state collection failed: ${snapshot.local.error || "unknown error"}`);
    }
  }

  // Asolaria health/settings + integration status (best-effort).
  const healthP = fetchJson(`${args.baseUrl}/api/health`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "health_failed") }));
  const healthFastP = fetchJson(`${args.baseUrl}/api/health/fast`, {
    timeoutMs: Math.max(5000, Math.min(15000, Number(args.timeoutMs || 25000)))
  }).catch((error) => ({ ok: false, error: String(error?.message || error || "health_fast_failed") }));
  const localOpsP = fetchJson(`${args.baseUrl}/api/local/ops/status`, {
    timeoutMs: Math.max(5000, Math.min(15000, Number(args.timeoutMs || 25000)))
  }).catch((error) => ({ ok: false, error: String(error?.message || error || "local_ops_status_failed") }));
  const settingsP = fetchJson(`${args.baseUrl}/api/settings`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "settings_failed") }));
  const capturesP = fetchJson(`${args.baseUrl}/api/captures/stats`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "captures_stats_failed") }));
  const telegramP = fetchJson(`${args.baseUrl}/api/integrations/telegram/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "telegram_status_failed") }));
  const googleP = fetchJson(`${args.baseUrl}/api/integrations/google/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "google_status_failed") }));
  const gcpP = fetchJson(`${args.baseUrl}/api/integrations/gcp/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "gcp_status_failed") }));
  const vertexP = fetchJson(`${args.baseUrl}/api/integrations/vertex/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "vertex_status_failed") }));
  const geminiP = fetchJson(`${args.baseUrl}/api/integrations/gemini_api/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "gemini_status_failed") }));

  const [health, healthFast, localOps, settings, captures, telegram, google, gcp, vertex, geminiApi] = await Promise.all([
    healthP,
    healthFastP,
    localOpsP,
    settingsP,
    capturesP,
    telegramP,
    googleP,
    gcpP,
    vertexP,
    geminiP
  ]);

  const healthOk = isSuccessfulPayload(health) && String(health?.app || "").trim() === "Asolaria";
  const healthFastOk = isSuccessfulPayload(healthFast) && String(healthFast?.app || "").trim() === "Asolaria";
  const localOpsOk = isSuccessfulPayload(localOps);
  const settingsState = pickFirstObject(
    settings?.settings,
    isSuccessfulPayload(settings) ? settings : null,
    health?.settings,
    healthFast?.settings
  );
  const automationFallback = buildAutomationFallback(healthOk ? health : null, localOpsOk ? localOps : null);
  let effectiveHealth = health;

  if (!healthOk && healthFastOk) {
    effectiveHealth = {
      ...healthFast,
      settings: settingsState || healthFast?.settings || {},
      automation: automationFallback
    };
    snapshot.warnings.push(`Asolaria health fell back to /api/health/fast: ${compactText(health?.error || "health_unavailable", 180)}`);
  } else if (!healthOk) {
    snapshot.warnings.push(`Asolaria health failed: ${compactText(health?.error || healthFast?.error || "health_unavailable", 180)}`);
  }

  if (!isSuccessfulPayload(settings)) {
    snapshot.warnings.push(`Asolaria settings failed: ${compactText(settings?.error || "settings_unavailable", 180)}`);
  }
  if (!isSuccessfulPayload(captures)) {
    snapshot.warnings.push(`Capture stats failed: ${compactText(captures?.error || "captures_unavailable", 180)}`);
  }

  const effectiveAutomation = pickFirstObject(effectiveHealth?.automation, automationFallback);
  const telegramPayload = isSuccessfulPayload(telegram) ? telegram : wrapStatusPayload(pickFirstObject(localOps?.telegram, effectiveAutomation?.telegram));
  const googlePayload = isSuccessfulPayload(google) ? google : wrapStatusPayload(pickFirstObject(localOps?.google, effectiveAutomation?.google));
  const gcpPayload = isSuccessfulPayload(gcp) ? gcp : wrapStatusPayload(pickFirstObject(localOps?.gcp, effectiveAutomation?.gcp));
  const vertexPayload = isSuccessfulPayload(vertex) ? vertex : wrapStatusPayload(pickFirstObject(localOps?.vertex, effectiveAutomation?.vertex));
  const geminiPayload = isSuccessfulPayload(geminiApi) ? geminiApi : wrapStatusPayload(pickFirstObject(localOps?.geminiApi, effectiveAutomation?.geminiApi));

  snapshot.asolaria.health = cloneJsonValue(effectiveHealth);
  snapshot.asolaria.settings = cloneJsonValue(settings);
  snapshot.asolaria.captures = cloneJsonValue(captures);
  snapshot.asolaria.automation = cloneJsonValue(effectiveAutomation);
  snapshot.asolaria.networkPolicy = cloneJsonValue(pickFirstObject(effectiveHealth?.networkPolicy, health?.networkPolicy, healthFast?.networkPolicy));
  snapshot.asolaria.integrations.slack = cloneJsonValue(pickFirstObject(effectiveAutomation?.slack, localOps?.slack));
  snapshot.asolaria.integrations.github = cloneJsonValue(pickFirstObject(effectiveAutomation?.github, localOps?.github));
  snapshot.asolaria.integrations.microsoft = cloneJsonValue(pickFirstObject(effectiveAutomation?.microsoft, localOps?.microsoft));
  snapshot.asolaria.integrations.symphony = cloneJsonValue(pickFirstObject(effectiveAutomation?.symphony, localOps?.symphony));
  snapshot.asolaria.integrations.augmentContext = cloneJsonValue(pickFirstObject(effectiveAutomation?.augmentContext, localOps?.augmentContext));
  snapshot.asolaria.integrations.telegram = cloneJsonValue(telegramPayload);
  snapshot.asolaria.integrations.google = cloneJsonValue(googlePayload);
  snapshot.asolaria.integrations.gcp = cloneJsonValue(gcpPayload);
  snapshot.asolaria.integrations.vertex = cloneJsonValue(vertexPayload);
  snapshot.asolaria.integrations.geminiApi = cloneJsonValue(geminiPayload);

  const abacusP = fetchJson(`${args.baseUrl}/api/integrations/abacus/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "abacus_status_failed") }));
  const externalP = fetchJson(`${args.baseUrl}/api/integrations/external/status`, { timeoutMs: args.timeoutMs })
    .catch((error) => ({ ok: false, error: String(error?.message || error || "external_status_failed") }));
  const [abacus, external] = await Promise.all([abacusP, externalP]);
  snapshot.asolaria.integrations.abacus = cloneJsonValue(abacus);
  snapshot.asolaria.integrations.external = cloneJsonValue(external);

  try {
    const notebookLmTimeoutMs = Math.max(30000, Math.min(90000, Number(args.timeoutMs || 25000) * 2));
    snapshot.asolaria.integrations.notebooklm = await collectNotebookLmState(args.baseUrl, googlePayload, gcpPayload, { timeoutMs: notebookLmTimeoutMs });
  } catch (error) {
    snapshot.warnings.push(`NotebookLM state collection failed: ${String(error?.message || error || "unknown error").slice(0, 360)}`);
  }

  snapshot.asolaria.integrationSummary = summarizeIntegrationClosure(snapshot);

  // GCP enabled services (job-based).
  if (args.includeGcp) {
    let project = String(args.gcpProject || "").trim();
    if (!project) {
      const proj = gcpPayload?.status?.defaultProject || gcpPayload?.status?.projectId || "";
      project = String(proj || "").trim();
    }
    if (project) {
      try {
        const queued = await fetchJson(`${args.baseUrl}/api/integrations/gcp/services/enabled?project=${encodeURIComponent(project)}&pageSize=200`, {
          timeoutMs: Math.max(2000, Math.min(30000, args.timeoutMs))
        });
        const jobId = String(queued?.job?.id || "").trim();
        if (!jobId) {
          snapshot.warnings.push("GCP services enabled: no job id returned.");
        } else {
          const job = await waitForJob(args.baseUrl, jobId, { timeoutMs: 90000 });
          if (job.status === "completed") {
            const result = job.result || {};
            const services = Array.isArray(result.services) ? result.services : [];
            snapshot.gcp = {
              enabledServices: {
                jobId,
                project: String(result.project || project),
                count: services.length,
                services: services.map((row) => String(row?.name || "")).filter(Boolean).sort()
              }
            };
          } else {
            snapshot.warnings.push(`GCP services enabled job failed: ${String(job.error || "unknown error").slice(0, 360)}`);
          }
        }
      } catch (error) {
        snapshot.warnings.push(`GCP services enabled request failed: ${String(error?.message || error || "unknown error").slice(0, 360)}`);
      }
    } else {
      snapshot.warnings.push("GCP services enabled: project id not available (gcp integration may be unconfigured).");
    }
  }

  // Play Store + Android Publisher API (best-effort).
  if (args.includePlay) {
    const play = {
      packageName: args.packageName,
      playStore: null,
      androidPublisherApi: null
    };

    try {
      const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(args.packageName)}&hl=en_US&gl=US`;
      const resp = await fetchText(url, { timeoutMs: 20000 });
      play.playStore = {
        url,
        ok: Boolean(resp.ok),
        status: resp.status,
        statusText: resp.statusText,
        titleHint: (resp.text || "").match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || ""
      };
    } catch (error) {
      play.playStore = {
        url: "",
        ok: false,
        status: 0,
        statusText: "",
        error: String(error?.message || error || "play_store_failed").slice(0, 360)
      };
    }

    // Android Publisher API: list tracks (read-only) using GCP service account.
    try {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(args.packageName)}/tracks`;
      const queued = await fetchJson(`${args.baseUrl}/api/integrations/gcp/request`, {
        method: "POST",
        timeoutMs: Math.max(2000, Math.min(30000, args.timeoutMs)),
        body: {
          method: "GET",
          url,
          scopes: ["https://www.googleapis.com/auth/androidpublisher"]
        }
      });
      const jobId = String(queued?.job?.id || "").trim();
      if (!jobId) {
        play.androidPublisherApi = { ok: false, error: "No job id returned." };
      } else {
        const job = await waitForJob(args.baseUrl, jobId, { timeoutMs: 90000 });
        if (job.status === "completed") {
          const data = job.result?.data;
          const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
          play.androidPublisherApi = {
            ok: true,
            jobId,
            tracksCount: tracks.length,
            tracks: tracks.map((t) => String(t?.track || "")).filter(Boolean).slice(0, 40)
          };
        } else {
          play.androidPublisherApi = {
            ok: false,
            jobId,
            error: String(job.error || "unknown error").slice(0, 420)
          };
        }
      }
    } catch (error) {
      play.androidPublisherApi = {
        ok: false,
        error: String(error?.message || error || "android_publisher_failed").slice(0, 420)
      };
    }

    snapshot.googlePlay = play;
  }

  const redacted = redactSecrets(snapshot);

  const jsonName = `asolaria-snapshot-${ts}.json`;
  const mdName = `asolaria-snapshot-${ts}.md`;
  const jsonPath = path.join(args.outDir, jsonName);
  const mdPath = path.join(args.outDir, mdName);
  fs.writeFileSync(jsonPath, JSON.stringify(redacted, null, 2), "utf8");
  fs.writeFileSync(mdPath, toMarkdown(redacted), "utf8");

  if (args.latest) {
    fs.writeFileSync(path.join(args.outDir, "asolaria-snapshot-latest.json"), JSON.stringify(redacted, null, 2), "utf8");
    fs.writeFileSync(path.join(args.outDir, "asolaria-snapshot-latest.md"), toMarkdown(redacted), "utf8");
  }

  // Minimal console output for humans.
  process.stdout.write([
    `Wrote: ${jsonPath}`,
    `Wrote: ${mdPath}`,
    args.latest ? `Wrote: ${path.join(args.outDir, "asolaria-snapshot-latest.json")}` : "",
    args.latest ? `Wrote: ${path.join(args.outDir, "asolaria-snapshot-latest.md")}` : ""
  ].filter(Boolean).join("\n") + "\n");
}

main().catch((error) => {
  process.stderr.write(`snapshot-asolaria failed: ${String(error?.message || error || "unknown error")}\n`);
  process.exitCode = 1;
});
