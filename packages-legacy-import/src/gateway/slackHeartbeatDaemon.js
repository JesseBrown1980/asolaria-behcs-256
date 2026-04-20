"use strict";

const fs = require("fs");

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cleanText(value, maxLen = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function appendNdjson(logPath, entry) {
  const target = cleanText(logPath, 4000);
  if (!target) return;
  try {
    fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (_error) {
    // Best effort only.
  }
}

function buildDefaultChecks(input = {}) {
  const bind = cleanText(input.bind, 120) || "127.0.0.1";
  const port = Number(input.port || 4791);
  const compatPort = Number(input.compatPort || process.env.ASOLARIA_COMPAT_4781_PORT || 4781);
  const commsPort = Number(input.commsPort || process.env.ASOLARIA_COMMS_4798_PORT || 4798);
  const checks = [
    {
      id: `gateway_${port}`,
      kind: "http",
      label: `Gateway ${port}`,
      url: `http://${bind}:${port}/health`
    },
    {
      id: `compat_${compatPort}`,
      kind: "http",
      label: `Compat ${compatPort}`,
      url: `http://127.0.0.1:${compatPort}/api/health/fast`
    },
    {
      id: `comms_${commsPort}`,
      kind: "http",
      label: `Comms ${commsPort}`,
      url: `http://127.0.0.1:${commsPort}/status`
    },
    {
      id: "federation_nodes",
      kind: "registry",
      label: "Federation Nodes"
    }
  ];
  const falconAgentUrl = cleanText(input.falconAgentUrl, 400);
  if (falconAgentUrl) {
    checks.splice(3, 0, {
      id: "falcon_agent",
      kind: "http",
      label: "Falcon Agent",
      url: falconAgentUrl
    });
  }
  return checks;
}

function summarizeRemoteNodes(summary = {}) {
  const nodes = Array.isArray(summary.nodes) ? summary.nodes : [];
  const offlineNodes = nodes
    .filter((node) => String(node?.status || "").trim().toLowerCase() === "offline")
    .map((node) => cleanText(node?.nodeId, 80))
    .filter(Boolean);
  const total = Number(summary.total || nodes.length || 0);
  const online = Number(summary.online || (total - offlineNodes.length) || 0);
  const offline = Number(summary.offline || offlineNodes.length || 0);
  return {
    ok: offline === 0,
    status: offline === 0 ? 200 : 503,
    summary: {
      total,
      online,
      offline,
      offlineNodes
    }
  };
}

function buildAlertKey(result = {}) {
  const failedChecks = Array.isArray(result.failedChecks) ? result.failedChecks : [];
  const checkKey = failedChecks
    .map((item) => `${cleanText(item.id, 80)}:${cleanText(item.error || item.status, 120)}`)
    .sort()
    .join("|");
  const offlineNodes = Array.isArray(result.remote?.offlineNodes) ? result.remote.offlineNodes : [];
  const remoteKey = offlineNodes
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .sort()
    .join(",");
  return `${result.ok ? "ok" : "degraded"}|${checkKey}|${remoteKey}`;
}

function buildDegradedMessage(result = {}, state = {}, input = {}) {
  const hostLabel = cleanText(input.hostLabel, 120) || "Kuromi";
  const failedChecks = Array.isArray(result.failedChecks) ? result.failedChecks : [];
  const offlineNodes = Array.isArray(result.remote?.offlineNodes) ? result.remote.offlineNodes : [];
  const lines = [
    `Heartbeat degraded on ${hostLabel}.`,
    `At: ${cleanText(result.at, 80)}`,
    `Interval: ${Number(state.intervalMs || input.intervalMs || 30000)}ms`
  ];
  if (failedChecks.length) {
    lines.push(`Failed: ${failedChecks.map((item) => {
      const detail = cleanText(item.error || item.status, 120);
      return `${cleanText(item.id, 80)}${detail ? ` (${detail})` : ""}`;
    }).join(", ")}`);
  }
  if (offlineNodes.length) {
    lines.push(`Offline nodes: ${offlineNodes.join(", ")}`);
  }
  return lines.join("\n");
}

function buildRecoveryMessage(result = {}, state = {}, input = {}) {
  const hostLabel = cleanText(input.hostLabel, 120) || "Kuromi";
  const checks = Array.isArray(result.checks) ? result.checks.length : 0;
  return [
    `Heartbeat recovered on ${hostLabel}.`,
    `At: ${cleanText(result.at, 80)}`,
    `Checks ok: ${checks}`,
    `Last degraded alert at: ${cleanText(state.lastSlackAlertAt, 80) || "n/a"}`
  ].join("\n");
}

function createSlackHeartbeatDaemon(input = {}) {
  const probeJson = typeof input.probeJson === "function"
    ? input.probeJson
    : async (url) => ({ ok: false, status: 0, url, error: "probe_unavailable" });
  const sendSlackMessage = typeof input.sendSlackMessage === "function" ? input.sendSlackMessage : null;
  const getSlackPolicy = typeof input.getSlackPolicy === "function" ? input.getSlackPolicy : () => ({});
  const getRemoteNodesSummary = typeof input.getRemoteNodesSummary === "function"
    ? input.getRemoteNodesSummary
    : () => ({ total: 0, online: 0, offline: 0, nodes: [] });
  const broadcast = typeof input.broadcast === "function" ? input.broadcast : () => {};
  const namedProfile = input.namedProfile && typeof input.namedProfile === "object" ? input.namedProfile : null;
  const checks = Array.isArray(input.checks) && input.checks.length ? input.checks : buildDefaultChecks(input);
  const intervalMs = clampInt(input.intervalMs, 30_000, 15_000, 5 * 60_000);
  const repeatAlertMs = clampInt(input.repeatAlertMs, 10 * 60_000, intervalMs, 24 * 60 * 60 * 1000);
  const slackChannel = cleanText(input.channel, 120);
  const alertsEnabled = input.alertsEnabled === true;
  const logPath = cleanText(input.logPath, 4000);
  const state = {
    running: false,
    busy: false,
    intervalMs,
    lastRunAt: "",
    lastOkAt: "",
    lastResult: null,
    lastError: "",
    runCount: 0,
    alertState: "unknown",
    lastAlertKey: "",
    lastSlackAlertAt: "",
    lastSlackMessageTs: "",
    recentAlerts: []
  };
  let intervalHandle = null;

  async function evaluateCheck(check = {}) {
    if (check.kind === "registry") {
      const remote = summarizeRemoteNodes(getRemoteNodesSummary());
      return {
        id: cleanText(check.id, 80) || "federation_nodes",
        label: cleanText(check.label, 120) || "Federation Nodes",
        kind: "registry",
        ok: remote.ok,
        status: remote.status,
        summary: remote.summary
      };
    }

    const url = cleanText(check.url, 400);
    const result = await probeJson(url);
    return {
      id: cleanText(check.id, 80) || url,
      label: cleanText(check.label, 120) || cleanText(check.id, 80) || url,
      kind: "http",
      ok: Boolean(result?.ok),
      status: Number(result?.status || 0),
      url,
      error: cleanText(result?.error, 200),
      summary: result?.summary && typeof result.summary === "object" ? result.summary : null
    };
  }

  function rememberAlert(entry = {}) {
    state.recentAlerts.push(entry);
    if (state.recentAlerts.length > 20) {
      state.recentAlerts = state.recentAlerts.slice(-20);
    }
  }

  async function postSlack(text, level) {
    if (!alertsEnabled) {
      return { ok: false, error: "slack_alerts_disabled" };
    }
    const policy = getSlackPolicy() || {};
    const channel = slackChannel || cleanText(policy.defaultChannel, 120);
    if (!sendSlackMessage || !channel) {
      return { ok: false, error: "slack_send_unavailable" };
    }
    try {
      const result = await sendSlackMessage({ channel, text }, policy);
      const at = new Date().toISOString();
      state.lastSlackAlertAt = at;
      state.lastSlackMessageTs = cleanText(result?.ts, 80);
      const entry = {
        at,
        level,
        channel,
        ok: true,
        ts: state.lastSlackMessageTs,
        text: cleanText(text, 500)
      };
      rememberAlert(entry);
      appendNdjson(logPath, { type: "slack_alert", ...entry });
      return { ok: true, result };
    } catch (error) {
      const at = new Date().toISOString();
      const entry = {
        at,
        level,
        channel,
        ok: false,
        error: cleanText(error?.message || error, 240),
        text: cleanText(text, 500)
      };
      rememberAlert(entry);
      appendNdjson(logPath, { type: "slack_alert", ...entry });
      return { ok: false, error: entry.error };
    }
  }

  async function run(trigger = "manual") {
    if (state.busy) {
      return state.lastResult || status();
    }
    state.busy = true;
    try {
      const at = new Date().toISOString();
      const checksResult = await Promise.all(checks.map((check) => evaluateCheck(check)));
      const failedChecks = checksResult.filter((item) => !item.ok);
      const remoteCheck = checksResult.find((item) => item.kind === "registry");
      const remoteSummary = remoteCheck?.summary || { total: 0, online: 0, offline: 0, offlineNodes: [] };
      const ok = failedChecks.length === 0;
      const result = {
        at,
        trigger: cleanText(trigger, 80) || "manual",
        profileId: cleanText(namedProfile?.id || namedProfile?.profileId, 120),
        surfaceId: cleanText(namedProfile?.surfaceId, 80),
        bundleIds: Array.isArray(namedProfile?.bundleIds) ? namedProfile.bundleIds.map((item) => cleanText(item, 120)).filter(Boolean) : [],
        ok,
        checks: checksResult,
        failedChecks,
        remote: remoteSummary
      };

      state.runCount += 1;
      state.lastRunAt = at;
      state.lastResult = result;
      state.lastError = "";
      if (ok) {
        state.lastOkAt = at;
      }

      const alertKey = buildAlertKey(result);
      const shouldRepeat = !ok
        && state.lastSlackAlertAt
        && (Date.now() - new Date(state.lastSlackAlertAt).getTime()) >= repeatAlertMs;
      if (!ok && (state.alertState !== "degraded" || state.lastAlertKey !== alertKey || shouldRepeat)) {
        await postSlack(buildDegradedMessage(result, state, input), "degraded");
      } else if (ok && state.alertState === "degraded") {
        await postSlack(buildRecoveryMessage(result, state, input), "recovered");
      }

      state.alertState = ok ? "ok" : "degraded";
      state.lastAlertKey = alertKey;

      broadcast({
        type: "heartbeat.daemon.result",
        payload: result
      });
      appendNdjson(logPath, { type: "heartbeat_result", ...result });
      return result;
    } catch (error) {
      state.lastError = cleanText(error?.message || error, 240);
      appendNdjson(logPath, {
        type: "heartbeat_error",
        at: new Date().toISOString(),
        error: state.lastError
      });
      throw error;
    } finally {
      state.busy = false;
    }
  }

  function start(options = {}) {
    if (state.running) {
      return status();
    }
    state.running = true;
    intervalHandle = setInterval(() => {
      void run("timer");
    }, state.intervalMs);
    broadcast({
      type: "heartbeat.daemon.started",
      payload: status()
    });
    if (options.immediate !== false) {
      void run("start");
    }
    return status();
  }

  function stop() {
    state.running = false;
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    broadcast({
      type: "heartbeat.daemon.stopped",
      payload: status()
    });
    return status();
  }

  function status() {
    return {
      running: state.running,
      intervalMs: state.intervalMs,
      alertsEnabled,
      runCount: state.runCount,
      lastRunAt: state.lastRunAt,
      lastOkAt: state.lastOkAt,
      lastError: state.lastError,
      alertState: state.alertState,
      lastAlertKey: state.lastAlertKey,
      lastSlackAlertAt: state.lastSlackAlertAt,
      lastSlackMessageTs: state.lastSlackMessageTs,
      namedProfile: namedProfile
        ? {
            id: cleanText(namedProfile.id, 120),
            surfaceId: cleanText(namedProfile.surfaceId, 80),
            profileId: cleanText(namedProfile.profileId, 120),
            bundleIds: Array.isArray(namedProfile.bundleIds) ? namedProfile.bundleIds.map((item) => cleanText(item, 120)).filter(Boolean) : [],
            abilityChain: Array.isArray(namedProfile.abilityChain) ? namedProfile.abilityChain.map((item) => cleanText(item, 120)).filter(Boolean) : [],
            tools: Array.isArray(namedProfile.tools) ? namedProfile.tools.map((item) => cleanText(item, 120)).filter(Boolean) : [],
            skills: Array.isArray(namedProfile.skills) ? namedProfile.skills.map((item) => cleanText(item, 120)).filter(Boolean) : []
          }
        : null,
      checks: checks.map((item) => ({
        id: cleanText(item.id, 80),
        label: cleanText(item.label, 120),
        kind: cleanText(item.kind, 40),
        url: cleanText(item.url, 400)
      })),
      lastResult: state.lastResult,
      recentAlerts: state.recentAlerts.slice(-10)
    };
  }

  return {
    run,
    start,
    stop,
    status
  };
}

module.exports = {
  buildDefaultChecks,
  buildDegradedMessage,
  buildRecoveryMessage,
  createSlackHeartbeatDaemon,
  summarizeRemoteNodes
};
