function clampSchedulerInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function probeJson(url) {
  function summarizeProbeJson(json) {
    if (!json || typeof json !== "object") return null;
    const summary = {};
    const scalarKeys = ["ok", "status", "service", "bind", "port", "time", "startedAt"];
    for (const key of scalarKeys) {
      const value = json[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "object") continue;
      summary[key] = value;
    }
    if (json.authority && typeof json.authority === "object") {
      const mode = json.authority.mode;
      if (mode !== null && mode !== undefined && typeof mode !== "object") {
        summary.authorityMode = mode;
      }
    }
    if (json.audit && typeof json.audit === "object") {
      const gateLocked = json.audit.gateLocked;
      if (gateLocked !== null && gateLocked !== undefined && typeof gateLocked !== "object") {
        summary.auditGateLocked = gateLocked;
      }
    }
    if (json.heartbeat && typeof json.heartbeat === "object") {
      const heartbeat = json.heartbeat;
      const keys = ["lastRunAt", "lastOkAt", "consecutiveFailures", "nextDelayMs"];
      for (const key of keys) {
        const value = heartbeat[key];
        if (value === null || value === undefined) continue;
        if (typeof value === "object") continue;
        summary[`heartbeat_${key}`] = value;
      }
      const ack = heartbeat?.lastResult?.ack;
      if (ack !== null && ack !== undefined && typeof ack !== "object") {
        summary.heartbeatAck = ack;
      }
    }
    return Object.keys(summary).length > 0 ? summary : null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      url,
      summary: summarizeProbeJson(json)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      error: String(error && error.message ? error.message : error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createGatewayScheduler(input = {}) {
  const bind = input.bind || "127.0.0.1";
  const port = Number(input.port || 4791);
  const config = input.config || {};
  const state = input.state || {};
  const broadcast = typeof input.broadcast === "function" ? input.broadcast : () => {};
  const refreshAuditIntegrity = typeof input.refreshAuditIntegrity === "function"
    ? input.refreshAuditIntegrity
    : () => ({ ok: true });
  const auditPolicy = input.auditPolicy || {};
  const cronMatches = typeof input.cronMatches === "function" ? input.cronMatches : () => false;
  const probeJsonImpl = typeof input.probeJson === "function" ? input.probeJson : probeJson;
  const scheduleTimeout = typeof input.setTimeoutImpl === "function" ? input.setTimeoutImpl : setTimeout;

  async function runHeartbeat(trigger = "timer") {
    const checks = [];
    checks.push(await probeJsonImpl(`http://${bind}:${port}/health`));
    const sandboxUrl = String(config?.sandbox?.baseUrl || "").trim();
    if (sandboxUrl) {
      checks.push(await probeJsonImpl(`${sandboxUrl.replace(/\/$/, "")}/health`));
    }
    const memoryIndexerUrl = String(config?.memory?.indexerUrl || "").trim();
    if (memoryIndexerUrl) {
      checks.push(await probeJsonImpl(`${memoryIndexerUrl.replace(/\/$/, "")}/health`));
    }

    const now = new Date().toISOString();
    const failedChecks = checks.filter((check) => !check.ok);
    const ok = failedChecks.length === 0;
    const baseDelay = Math.max(60_000, Number(config?.scheduler?.heartbeatEveryMinutes || 15) * 60_000);
    const maxMultiplier = Math.max(1, Number(config?.scheduler?.heartbeatRetryBackoff?.maxMultiplier || 8));

    state.heartbeat.lastRunAt = now;
    if (ok) {
      state.heartbeat.lastOkAt = now;
      state.heartbeat.consecutiveFailures = 0;
      state.heartbeat.nextDelayMs = baseDelay;
    } else {
      state.heartbeat.consecutiveFailures += 1;
      state.heartbeat.nextDelayMs = Math.min(
        baseDelay * Math.pow(2, state.heartbeat.consecutiveFailures),
        baseDelay * maxMultiplier
      );
    }

    state.heartbeat.lastResult = {
      trigger,
      at: now,
      ok,
      ack: ok ? "HEARTBEAT_OK" : "HEARTBEAT_DEGRADED",
      checks
    };
    broadcast({
      type: "heartbeat.result",
      payload: state.heartbeat.lastResult
    });
    return state.heartbeat.lastResult;
  }

  function cronActionName(jobName) {
    const lower = String(jobName || "").toLowerCase();
    if (lower.includes("health")) return "heartbeat";
    if (lower.includes("router")) return "router_check";
    if (lower.includes("security")) return "security_audit";
    return "noop";
  }

  async function runCronJob(jobName, reason) {
    const action = cronActionName(jobName);
    const startedAt = new Date().toISOString();
    let result = null;
    let ok = true;
    try {
      if (action === "heartbeat") {
        result = await runHeartbeat(`cron:${jobName}`);
        ok = Boolean(result?.ok);
      } else if (action === "security_audit") {
        const verify = refreshAuditIntegrity(`cron:${jobName}`);
        result = {
          ok: Boolean(verify?.ok),
          verify
        };
        ok = Boolean(verify?.ok);
      } else {
        result = { ok: true, note: `Scaffold job ${jobName} executed.` };
      }
    } catch (error) {
      ok = false;
      result = {
        ok: false,
        error: String(error && error.message ? error.message : error)
      };
    }

    const record = {
      job: jobName,
      reason,
      action,
      at: startedAt,
      ok,
      result
    };
    state.cron.executions.push(record);
    if (state.cron.executions.length > 200) {
      state.cron.executions = state.cron.executions.slice(-200);
    }
    broadcast({
      type: "cron.executed",
      payload: record
    });
    return record;
  }

  function startCronTicker() {
    const jobs = config?.scheduler?.jobs || {};
    const lastRunByJobMinute = new Map();

    setInterval(() => {
      const now = new Date();
      state.cron.lastTickAt = now.toISOString();
      const minuteKey = now.toISOString().slice(0, 16);
      for (const [jobName, expression] of Object.entries(jobs)) {
        if (!cronMatches(expression, now)) {
          continue;
        }
        const prior = lastRunByJobMinute.get(jobName);
        if (prior === minuteKey) {
          continue;
        }
        lastRunByJobMinute.set(jobName, minuteKey);
        void runCronJob(jobName, "schedule");
      }
    }, 15_000);
  }

  function scheduleHeartbeatLoop(initialDelayMs = 8_000) {
    scheduleTimeout(async () => {
      try {
        await runHeartbeat("timer");
      } finally {
        scheduleHeartbeatLoop(state.heartbeat.nextDelayMs);
      }
    }, Math.max(1_000, Number(initialDelayMs || 8_000)));
  }

  function scheduleAuditVerifyLoop(initialDelayMs = 12_000) {
    if (!auditPolicy.enabled) {
      return;
    }
    scheduleTimeout(() => {
      try {
        refreshAuditIntegrity("timer");
      } finally {
        scheduleAuditVerifyLoop(auditPolicy.verifyEveryMs);
      }
    }, Math.max(1_000, Number(initialDelayMs || 12_000)));
  }

  return {
    clampSchedulerInt,
    cronActionName,
    probeJson: probeJsonImpl,
    runHeartbeat,
    runCronJob,
    scheduleAuditVerifyLoop,
    scheduleHeartbeatLoop,
    startCronTicker
  };
}

module.exports = {
  clampSchedulerInt,
  createGatewayScheduler,
  probeJson
};
