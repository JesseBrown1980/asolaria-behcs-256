"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const {
  normalizeChannels,
  choosePreferredChannel,
  deriveDefaultPreferredList,
  enforceChannelPrivacyPolicy
} = require("../connectionPolicy");

function normalizePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return Math.round(parsed);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function readUtf8Trim(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function parseBool(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeBaseUrl(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    let href = parsed.toString();
    while (href.endsWith("/")) {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return fallback;
  }
}

function isLoopbackHost(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "localhost";
}

function isPrivateIpv4(hostname) {
  const value = String(hostname || "").trim();
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const numbers = [];
  for (const part of parts) {
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
      return false;
    }
    numbers.push(parsed);
  }
  if (numbers[0] === 10) return true;
  if (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) return true;
  if (numbers[0] === 192 && numbers[1] === 168) return true;
  return false;
}

function hasExternalNetworkInterface() {
  try {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces || {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || entry.internal) continue;
        const family = String(entry.family || "");
        if (family === "IPv4" || family === "IPv6" || family === "4" || family === "6") {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function readPidFile(filePath) {
  const raw = readUtf8Trim(filePath);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isProcessRunning(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value < 1) {
    return false;
  }
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

function findLatestFile(directoryPath, pattern) {
  try {
    const rows = fs.readdirSync(directoryPath)
      .filter((name) => pattern.test(name))
      .map((name) => {
        const filePath = path.join(directoryPath, name);
        const stat = fs.statSync(filePath);
        return { filePath, stat };
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

function readTail(filePath, maxLines = 8) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, maxLines)).join(" | ");
  } catch {
    return "";
  }
}

function staleSecondsFromStat(stat) {
  if (!stat || !Number.isFinite(stat.mtimeMs)) {
    return -1;
  }
  return Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000));
}

function parseTunnelSmokePass(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(/^- pass:\s+(true|false)$/im);
    if (!match) {
      return null;
    }
    return match[1].toLowerCase() === "true";
  } catch {
    return null;
  }
}

function classifyBaseUrlChannel(baseUrl, allowPublicInternet = false) {
  const normalized = normalizeBaseUrl(baseUrl, "");
  if (!normalized) {
    return "";
  }
  try {
    const parsed = new URL(normalized);
    const hostname = String(parsed.hostname || "").trim().toLowerCase();
    if (isLoopbackHost(hostname)) {
      return "usb";
    }
    if (hostname.endsWith(".ts.net")) {
      return "vpn";
    }
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) {
      return "vpn";
    }
    if (isPrivateIpv4(hostname)) {
      return "private_internet";
    }
    return allowPublicInternet ? "public_internet" : "private_internet";
  } catch {
    return "";
  }
}

function deriveAvailableChannels(env = {}, options = {}) {
  const explicitAvailableRaw = String(env.ASOLARIA_CONNECTION_AVAILABLE || "").trim();
  if (explicitAvailableRaw) {
    return normalizeChannels(explicitAvailableRaw);
  }

  const derived = [];
  if (hasExternalNetworkInterface()) {
    derived.push("private_internet");
  }

  const remoteBaseUrl = normalizeBaseUrl(options.remoteBaseUrl, "");
  const localCompatBaseUrl = normalizeBaseUrl(options.localCompatBaseUrl, "");
  const remoteChannel = remoteBaseUrl && remoteBaseUrl !== localCompatBaseUrl
    ? classifyBaseUrlChannel(remoteBaseUrl, options.allowPublicInternet)
    : "";
  if (remoteChannel && remoteChannel !== "usb") {
    derived.push(remoteChannel);
  }

  return normalizeChannels(derived);
}

function createCompat4781Runtime(input = {}) {
  const repoRoot = String(input.repoRoot || "").trim();
  if (!repoRoot) throw new Error("repoRoot is required.");
  const env = input.env && typeof input.env === "object" ? input.env : process.env;

  const bind = String(env.ASOLARIA_COMPAT_4781_BIND || "127.0.0.1").trim() || "127.0.0.1";
  const port = normalizePort(env.ASOLARIA_COMPAT_4781_PORT, 4781);
  const gatewayPort = normalizePort(env.ASOLARIA_GATEWAY_PORT, 4791);
  const gatewayHost = String(env.ASOLARIA_GATEWAY_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const httpsPort = normalizePort(env.ASOLARIA_HTTPS_PORT, 5443);
  const gatewayBaseUrl = `http://${gatewayHost}:${gatewayPort}`;
  const publicRoot = path.resolve(repoRoot, "public");
  const workerRouterHtmlPath = path.join(publicRoot, "worker-router.html");
  const workerRuntimeHtmlPath = path.join(publicRoot, "worker-runtime.html");
  const civilizationPreviewHtmlPath = path.join(publicRoot, "swarm-civilization-preview.html");
  const defaultGatewayTokenPath = path.resolve(repoRoot, "data", "vault", "owner", "gateway", "gateway.token.txt");

  function localCompatBaseUrl() {
    return `http://127.0.0.1:${port}`;
  }

  function createRuntimeState() {
    const fallbackPreferred = deriveDefaultPreferredList();
    const preference = normalizeChannels(env.ASOLARIA_CONNECTION_PREFERENCE || fallbackPreferred);
    const allowPublicInternet = parseBool(env.ASOLARIA_ALLOW_PUBLIC_INTERNET, false);
    const remoteBaseUrl = normalizeBaseUrl(env.ASOLARIA_REMOTE_APPROVAL_BASE_URL, localCompatBaseUrl());
    const available = deriveAvailableChannels(env, {
      allowPublicInternet,
      remoteBaseUrl,
      localCompatBaseUrl: localCompatBaseUrl()
    });
    const gatewayToken = String(env.ASOLARIA_GATEWAY_TOKEN || "").trim() || readUtf8Trim(defaultGatewayTokenPath);
    const mobileSeed = String(env.ASOLARIA_COMPAT_4781_MOBILE_TOKEN || "").trim()
      || gatewayToken
      || `${repoRoot}|${port}|proxy_4781_mobile`;
    const mobileToken = crypto.createHash("sha256").update(`${mobileSeed}|proxy_4781_mobile`).digest("hex");

    return {
      gatewayToken,
      mobileToken,
      connection: {
        preference: preference.length ? preference : fallbackPreferred,
        available,
        allowPublicInternet,
        publicInternetPrivate: parseBool(env.ASOLARIA_PUBLIC_INTERNET_IS_PRIVATE, false),
        remoteAuthRequired: parseBool(env.ASOLARIA_NETWORK_REMOTE_AUTH_REQUIRED, true),
        requireEncryptedRemote: parseBool(env.ASOLARIA_NETWORK_REQUIRE_ENCRYPTED_REMOTE, true),
        stealthDeny: parseBool(env.ASOLARIA_NETWORK_STEALTH_DENY, true),
        remoteBaseUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: "bootstrap"
      },
      control: {
        armedUntilMs: 0,
        armedBy: "",
        lastAction: "",
        lastError: "",
        updatedAt: new Date().toISOString()
      },
      settings: {
        approvalMode: "smart",
        approvalPreference: "balanced",
        viewerDefault: "liris",
        voiceEnabled: false,
        voiceOutputMode: "text",
        voiceAutoSpeakReplies: false,
        voiceWakeWord: "asolaria"
      }
    };
  }

  const runtimeState = createRuntimeState();

  function remoteBaseUrlFromState() {
    return normalizeBaseUrl(runtimeState.connection.remoteBaseUrl, localCompatBaseUrl());
  }

  function readJson(urlPath) {
    return new Promise((resolve, reject) => {
      const request = http.request(
        `${gatewayBaseUrl}${urlPath}`,
        { method: "GET", timeout: 5000 },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`gateway_status_${response.statusCode || 0}`));
              return;
            }
            try {
              resolve(JSON.parse(body || "{}"));
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      request.on("timeout", () => {
        request.destroy(new Error("gateway_timeout"));
      });
      request.on("error", reject);
      request.end();
    });
  }

  function maskToken(token) {
    const value = String(token || "");
    if (!value) {
      return "";
    }
    if (value.length <= 8) {
      return `${"*".repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`;
    }
    return `${"*".repeat(value.length - 6)}${value.slice(-6)}`;
  }

  function resolveViewer(req) {
    const raw = String(req?.query?.viewer || req?.headers?.["x-asolaria-viewer"] || runtimeState.settings.viewerDefault || "liris").trim();
    return raw || "liris";
  }

  function resolveRequestedChannel(req) {
    return normalizeChannels([
      String(req?.query?.channel || req?.headers?.["x-asolaria-channel"] || "").trim()
    ])[0] || "";
  }

  function classifyRemoteChannel(baseUrl) {
    const normalizedRemoteBase = normalizeBaseUrl(baseUrl, "");
    if (normalizedRemoteBase && normalizedRemoteBase === localCompatBaseUrl()) {
      return buildConnectionRouting("").selected?.channel || "private_internet";
    }
    return classifyBaseUrlChannel(normalizedRemoteBase, runtimeState.connection.allowPublicInternet) || "private_internet";
  }

  function buildConnectionRouting(requestedChannel = "") {
    const preferred = normalizeChannels(runtimeState.connection.preference);
    const available = normalizeChannels(runtimeState.connection.available);
    const enforced = enforceChannelPrivacyPolicy(available, {
      allowPublicInternet: runtimeState.connection.allowPublicInternet,
      publicInternetIsPrivate: runtimeState.connection.publicInternetPrivate
    });
    let selected = choosePreferredChannel(
      enforced.allowed,
      preferred.length ? preferred : deriveDefaultPreferredList()
    );

    const requested = normalizeChannels([requestedChannel])[0] || "";
    if (requested) {
      if (enforced.allowed.includes(requested)) {
        selected = {
          channel: requested,
          reason: `Requested channel accepted: ${requested}.`,
          fallbackUsed: false
        };
      } else {
        selected = {
          ...selected,
          reason: `Requested channel ${requested} is not allowed. ${selected.reason}`
        };
      }
    }

    return {
      preferred,
      detectedAvailable: available,
      filteredAvailable: enforced.allowed,
      removedChannels: enforced.removed.map((item) => item.channel),
      removedDetails: enforced.removed,
      selected,
      remoteBaseUrl: remoteBaseUrlFromState(),
      policy: {
        remoteBaseUrl: remoteBaseUrlFromState(),
        allowPublicInternet: runtimeState.connection.allowPublicInternet,
        publicInternetPrivate: runtimeState.connection.publicInternetPrivate,
        remoteAuthRequired: runtimeState.connection.remoteAuthRequired,
        requireEncryptedRemote: runtimeState.connection.requireEncryptedRemote,
        stealthDeny: runtimeState.connection.stealthDeny
      }
    };
  }

  function buildUiPaths(viewer = "liris") {
    const localBase = localCompatBaseUrl();
    const remoteBase = remoteBaseUrlFromState();
    const token = encodeURIComponent(runtimeState.mobileToken);
    const viewerParam = encodeURIComponent(viewer || runtimeState.settings.viewerDefault || "liris");
    const localChannel = buildConnectionRouting("").selected?.channel || "private_internet";
    const remoteChannel = classifyRemoteChannel(remoteBase);
    const localConsole = `${localBase}/mobile-console.html?token=${token}&viewer=${viewerParam}&channel=${localChannel}`;
    const remoteConsole = `${remoteBase}/mobile-console.html?token=${token}&viewer=${viewerParam}&channel=${remoteChannel}`;
    const localApprovals = `${localBase}/mobile-approvals.html?token=${token}&viewer=${viewerParam}&channel=${localChannel}`;
    const remoteApprovals = `${remoteBase}/mobile-approvals.html?token=${token}&viewer=${viewerParam}&channel=${remoteChannel}`;

    return {
      local: localConsole,
      remote: remoteConsole,
      localConsole,
      remoteConsole,
      localApprovals,
      remoteApprovals,
      local_console: localConsole,
      remote_console: remoteConsole,
      local_approvals: localApprovals,
      remote_approvals: remoteApprovals
    };
  }

  function buildUiControl(viewer = "liris") {
    return {
      enabled: true,
      viewerDefault: runtimeState.settings.viewerDefault,
      tokenHint: maskToken(runtimeState.mobileToken),
      paths: buildUiPaths(viewer)
    };
  }

  function phoneBridgeKeeperStatus() {
    const logsDir = path.join(repoRoot, "logs");
    const pidFile = path.join(logsDir, "phone-link-keeper.pid");
    const pid = readPidFile(pidFile);
    const latestLog = findLatestFile(logsDir, /^phone-link-keeper-.*\.log$/i);

    return {
      running: isProcessRunning(pid),
      pid,
      pidFile,
      latestLogPath: latestLog ? latestLog.filePath : "",
      latestLogUpdatedAt: latestLog ? latestLog.stat.mtime.toISOString() : "",
      latestLogStaleSeconds: latestLog ? staleSecondsFromStat(latestLog.stat) : -1,
      latestLogTail: latestLog ? readTail(latestLog.filePath) : ""
    };
  }

  function phoneTunnelMonitorStatus() {
    const logsDir = path.join(repoRoot, "logs");
    const reportsDir = path.join(repoRoot, "reports");
    const pidFile = path.join(logsDir, "phone-tunnel-smoke-monitor.pid");
    const pid = readPidFile(pidFile);
    const latestLog = findLatestFile(logsDir, /^phone-tunnel-smoke-monitor-.*\.log$/i);
    const reportPath = path.join(reportsDir, "phone-tunnel-smoke-latest.md");
    let latestReportUpdatedAt = "";
    let latestReportStaleSeconds = -1;
    let latestReportPass = null;

    try {
      const stat = fs.statSync(reportPath);
      latestReportUpdatedAt = stat.mtime.toISOString();
      latestReportStaleSeconds = staleSecondsFromStat(stat);
      latestReportPass = parseTunnelSmokePass(reportPath);
    } catch {
      latestReportUpdatedAt = "";
      latestReportStaleSeconds = -1;
      latestReportPass = null;
    }

    return {
      running: isProcessRunning(pid),
      pid,
      pidFile,
      latestLogPath: latestLog ? latestLog.filePath : "",
      latestLogUpdatedAt: latestLog ? latestLog.stat.mtime.toISOString() : "",
      latestLogStaleSeconds: latestLog ? staleSecondsFromStat(latestLog.stat) : -1,
      latestLogTail: latestLog ? readTail(latestLog.filePath) : "",
      latestReportPath: reportPath,
      latestReportUpdatedAt,
      latestReportStaleSeconds,
      latestReportPass
    };
  }

  function mobilePushState() {
    return {
      enabled: false,
      subscriptions: 0,
      reason: "push_not_implemented_on_proxy_4781"
    };
  }

  function guardianState() {
    return {
      mode: "compat_local",
      source: "proxy_4781"
    };
  }

  const workOrgRuntimeState = {
    activeOrg: "",
    activeOrgLabel: "",
    profiles: {}
  };

  function workOrgState() {
    return workOrgRuntimeState;
  }

  function approvalState() {
    return {
      mode: runtimeState.settings.approvalMode,
      preference: runtimeState.settings.approvalPreference
    };
  }

  return {
    bind,
    port,
    gatewayPort,
    gatewayHost,
    httpsPort,
    gatewayBaseUrl,
    publicRoot,
    workerRouterHtmlPath,
    workerRuntimeHtmlPath,
    civilizationPreviewHtmlPath,
    runtimeState,
    clampNumber,
    normalizeBaseUrl,
    localCompatBaseUrl,
    remoteBaseUrlFromState,
    readJson,
    maskToken,
    resolveViewer,
    resolveRequestedChannel,
    buildConnectionRouting,
    buildUiPaths,
    buildUiControl,
    phoneBridgeKeeperStatus,
    phoneTunnelMonitorStatus,
    mobilePushState,
    guardianState,
    workOrgState,
    approvalState
  };
}

module.exports = {
  createCompat4781Runtime,
  normalizePort,
  clampNumber,
  parseBool,
  normalizeBaseUrl
};
