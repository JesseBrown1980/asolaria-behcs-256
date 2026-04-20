/** Colony Daemon — unified runtime: auto-recorder, conflict detector, ASO digest.
 *  Run: node src/colony-daemon.js | Import: require('./src/colony-daemon').start()
 *  LX chain: LX-290, LX-153, LX-154 */
process.env.ASOLARIA_AGENT_NAME = process.env.ASOLARIA_AGENT_NAME || "colony-daemon";
const aso = require("./aso-boot"); // registers via aso-boot
const fs = require("fs"), path = require("path");
const autoRecorder = require("./aso-auto-recorder");
const { detectConflicts } = require("./aso-conflict-detector");

const AGENT = "colony-daemon";
const CONFLICT_MS = 30 * 60 * 1000, DIGEST_MS = 60 * 60 * 1000;
let _conflictTimer = null, _digestTimer = null, _running = false;

const log = (msg) => console.log(`[${new Date().toISOString()}] [${AGENT}] ${msg}`);
const observe = (summary) => {
  try { aso.observe("agent-lifecycle", summary, { source: AGENT }); } catch (_) {}
};

function runConflictDetector() {
  try {
    const result = detectConflicts();
    const msg = `conflict-scan: ${result.topicsScanned} topics, ` +
      `${result.conflictsAdded} added, ${result.conflictsSkipped} skipped`;
    log(msg);
    observe(msg);
  } catch (err) {
    log(`conflict-scan error: ${err.message}`);
  }
}

function runDigest() {
  try {
    const asoKernel = require("./index-kernel/aso");
    const tblPath = (name) => path.join(asoKernel.ASO_DATA_DIR, "tables", `${name}.json`);
    const readRows = (name) => {
      try { return JSON.parse(fs.readFileSync(tblPath(name), "utf8")).rows || []; }
      catch (_) { return []; }
    };
    const status = asoKernel.getAsoStatus();
    const topics = asoKernel.listTopics();
    const obs = readRows("observations");
    const rels = readRows("relations");
    const conflicts = readRows("conflicts").filter(r => r.resolutionState === "open");

    const summary = `digest: ${status.counts.topics || topics.length} topics, ` +
      `${obs.length} observations, ${rels.length} relations, ` +
      `${conflicts.length} open conflicts`;

    // Write DIGEST.md
    const outPath = path.join(asoKernel.ASO_DATA_DIR, "DIGEST.md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const md = `# ASO Digest\n> Generated ${ts} by ${AGENT}\n\n` +
      `Topics: ${topics.length} | Observations: ${obs.length} | ` +
      `Relations: ${rels.length} | Open conflicts: ${conflicts.length}\n`;
    fs.writeFileSync(outPath, md, "utf8");

    log(summary);
    observe(summary);
  } catch (err) {
    log(`digest error: ${err.message}`);
  }
}

function start() {
  if (_running) return;
  _running = true;
  log("starting colony daemon"); observe("colony-daemon started");
  autoRecorder.start();
  runConflictDetector();
  _conflictTimer = setInterval(runConflictDetector, CONFLICT_MS);
  _digestTimer = setInterval(runDigest, DIGEST_MS);
  log("all subsystems active");
}

function stop() {
  if (!_running) return;
  _running = false;

  if (_conflictTimer) { clearInterval(_conflictTimer); _conflictTimer = null; }
  if (_digestTimer) { clearInterval(_digestTimer); _digestTimer = null; }
  autoRecorder.stop();

  const msg = "colony-daemon stopped — all timers cleared";
  log(msg);
  observe(msg);
}

const onSignal = (sig) => { log(`received ${sig}`); stop(); process.exit(0); };
process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);

module.exports = { start, stop };
if (require.main === module) start();
