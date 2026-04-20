const fs = require("fs");
const path = require("path");

function createSpawnStateSignalsRuntime(input = {}) {
  const runtimeRoot = String(input.runtimeRoot || "").trim();
  const adminTerminalsRoot = String(input.adminTerminalsRoot || "").trim();
  const healthPath = String(input.healthPath || "").trim();
  const driftPath = String(input.driftPath || "").trim();
  const adminTerminals = Array.isArray(input.adminTerminals) && input.adminTerminals.length > 0
    ? input.adminTerminals
    : ["helm", "sentinel"];

  function readHealthState() {
    try {
      if (healthPath && fs.existsSync(healthPath)) {
        const raw = JSON.parse(fs.readFileSync(healthPath, "utf8"));
        return {
          status: String(raw.status || "unknown"),
          blockers: Array.isArray(raw.blockers) ? raw.blockers : [],
          checkedAt: raw.checkedAt || null,
          services: raw.services || {}
        };
      }
    } catch (_) { /* fall through to flag-file check */ }

    const blockers = [];
    const flagsRoot = runtimeRoot ? path.join(runtimeRoot, "flags") : "";
    const healthFlag = flagsRoot ? path.join(flagsRoot, "health-ok.flag") : "";
    if (flagsRoot && fs.existsSync(flagsRoot) && !fs.existsSync(healthFlag)) {
      blockers.push("health-ok.flag absent");
    }
    return { status: blockers.length > 0 ? "degraded" : "unknown", blockers, checkedAt: null, services: {} };
  }

  function getCurrentBlockers() {
    const blockers = [];
    for (const terminal of adminTerminals) {
      const statusPath = adminTerminalsRoot ? path.join(adminTerminalsRoot, terminal, "status.json") : "";
      try {
        if (statusPath && fs.existsSync(statusPath)) {
          const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
          if (status.state === "error" || status.state === "crashed") {
            blockers.push({ source: `admin-terminal/${terminal}`, state: status.state, detail: status.lastError || "" });
          }
        }
      } catch (_) { /* skip */ }
    }
    return blockers;
  }

  function readDriftSignals() {
    try {
      if (driftPath && fs.existsSync(driftPath)) {
        const raw = JSON.parse(fs.readFileSync(driftPath, "utf8"));
        return {
          signals: Array.isArray(raw.signals) ? raw.signals.slice(-10) : [],
          lastUpdate: raw.lastUpdate || null,
          mqttTraffic: raw.mqttTraffic || null,
          inboxDelta: raw.inboxDelta || 0
        };
      }
    } catch (_) { /* fall through to inbox mtime check */ }

    const signals = [];
    const inboxes = [
      { name: "gaia", path: runtimeRoot ? path.join(runtimeRoot, "gaia-inbox.ndjson") : "" },
      { name: "dasein", path: runtimeRoot ? path.join(runtimeRoot, "dasein-inbox.ndjson") : "" },
      { name: "helm", path: adminTerminalsRoot ? path.join(adminTerminalsRoot, "helm", "inbox.ndjson") : "" }
    ];

    for (const inbox of inboxes) {
      try {
        if (inbox.path && fs.existsSync(inbox.path)) {
          const stat = fs.statSync(inbox.path);
          const ageMs = Date.now() - stat.mtimeMs;
          if (ageMs < 300000) {
            signals.push({ source: `inbox/${inbox.name}`, age: `${Math.round(ageMs / 1000)}s ago`, type: "recent-message" });
          }
        }
      } catch (_) { /* skip */ }
    }

    return { signals, lastUpdate: null, mqttTraffic: null, inboxDelta: 0 };
  }

  return {
    readHealthState,
    getCurrentBlockers,
    readDriftSignals
  };
}

module.exports = {
  createSpawnStateSignalsRuntime
};
