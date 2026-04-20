/** ASO Auto-Recorder — health checks + ops-log watcher daemon.
 * Exports start() and stop(). LX chain: LX-290, LX-153, LX-154 */
const fs = require("fs");
const path = require("path");
const { instanceRoot } = require("./runtimePaths");

const OPS_LOG_PATH = path.join(instanceRoot, "data", "aso", "ops-log.ndjson");
const HEALTH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WATCH_INTERVAL_MS = 2000; // poll every 2s
const AGENT_NAME = "auto-recorder";

let _healthTimer = null;
let _watchTimer = null;
let _lastLogSize = 0;
let _running = false;

// --- Lazy-load aso-client to avoid circular boot issues ---
let _aso = null;
function aso() {
  if (!_aso) _aso = require("./aso-client");
  return _aso;
}

// --- Colony health reporter (run in-process) ---
async function runHealthReport() {
  try {
    const { buildColonyBody } = require("./colonyAnatomy");
    const body = buildColonyBody();
    const bootResult = await body.boot();
    const diagnosis = await body.diagnoseAll();
    const counts = { total: 0, passed: 0, failed: 0 };

    for (const [, sysResult] of Object.entries(diagnosis.results)) {
      for (const check of sysResult.checks || []) {
        counts.total++;
        if (check.status === "ok") counts.passed++;
        else counts.failed++;
      }
    }

    const summary = `health-check: ${counts.passed}/${counts.total} passed, ` +
      `${counts.failed} failed, colony=${diagnosis.overall}, ` +
      `boot=${bootResult.preBoot}->${bootResult.postBoot}`;
    log(summary);

    // Find or create a topic for the auto-recorder health log
    const topics = aso().list({ type: "topic" });
    const existing = (Array.isArray(topics) ? topics : []).find(
      (t) => t.name === "auto-recorder/health-log"
    );
    const topicId = existing
      ? existing.asoId
      : (aso().topic("auto-recorder/health-log", "topic", {
          tier: "operational",
          tags: ["auto-recorder", "health"],
          summary: "Aggregated health check results from auto-recorder daemon",
          createdBy: AGENT_NAME
        }).id || "unknown");

    if (topicId && topicId !== "unknown") {
      aso().observe(topicId, summary, { observedBy: AGENT_NAME });
    }
  } catch (err) {
    log(`health-report error: ${err.message}`);
  }
}

// --- Ops-log watcher (tail pattern via fs.statSync polling) ---
function watchOpsLog() {
  try {
    if (!fs.existsSync(OPS_LOG_PATH)) return;
    const stat = fs.statSync(OPS_LOG_PATH);
    const currentSize = stat.size;

    if (currentSize > _lastLogSize && _lastLogSize > 0) {
      // Read only the new bytes
      const fd = fs.openSync(OPS_LOG_PATH, "r");
      const buf = Buffer.alloc(currentSize - _lastLogSize);
      fs.readSync(fd, buf, 0, buf.length, _lastLogSize);
      fs.closeSync(fd);

      const newLines = buf.toString("utf8").trim().split("\n").filter(Boolean);
      if (newLines.length > 0) {
        const opCounts = {};
        for (const line of newLines) {
          try {
            const rec = JSON.parse(line);
            opCounts[rec.op] = (opCounts[rec.op] || 0) + 1;
          } catch (_) { /* skip malformed */ }
        }
        const parts = Object.entries(opCounts).map(([op, n]) => `${op}:${n}`);
        log(`ops-log activity: ${newLines.length} new ops [${parts.join(", ")}]`);
      }
    }
    _lastLogSize = currentSize;
  } catch (err) {
    log(`ops-log watch error: ${err.message}`);
  }
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [auto-recorder] ${msg}`);
}

// --- Public API ---
function start() {
  if (_running) return;
  _running = true;

  // Snapshot current log size so we only report new activity
  try {
    if (fs.existsSync(OPS_LOG_PATH)) {
      _lastLogSize = fs.statSync(OPS_LOG_PATH).size;
    }
  } catch (_) { _lastLogSize = 0; }

  log("auto-recorder daemon started");

  // Record startup observation
  try {
    const bootTopics = aso().list({ tier: "boot" });
    const target = (Array.isArray(bootTopics) && bootTopics.length > 0)
      ? bootTopics[0].asoId
      : null;
    if (target) {
      aso().observe(target, "auto-recorder daemon started", {
        observedBy: AGENT_NAME
      });
    }
  } catch (_) { /* best-effort */ }

  // Schedule health reports every 5 minutes
  _healthTimer = setInterval(runHealthReport, HEALTH_INTERVAL_MS);

  // Schedule ops-log watcher
  _watchTimer = setInterval(watchOpsLog, WATCH_INTERVAL_MS);
}

function stop() {
  if (!_running) return;
  _running = false;
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
  if (_watchTimer) { clearInterval(_watchTimer); _watchTimer = null; }
  log("auto-recorder daemon stopped");
}

module.exports = { start, stop };
