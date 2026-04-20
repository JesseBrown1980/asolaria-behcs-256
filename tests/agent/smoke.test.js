// Item 058 · 3-agent smoke test (lifecycle + bind-check + mistake-log)

const { canTransition, transition, STATES } = require("../../src/agent/lifecycle.js");
const { bindCheck } = require("../../src/agent/bind-check.js");
const { logMistake } = require("../../src/agent/mistake-log.js");
const path = require("node:path");
const fs = require("node:fs");

let pass = 0, fail = 0;
function t(name, cond, d = "") { if (cond) { console.log("[PASS]", name, d); pass++; } else { console.log("[FAIL]", name, d); fail++; } }

// lifecycle
{
  t("lifecycle-SPAWN-to-RUN",   canTransition(STATES.SPAWN, STATES.RUN));
  t("lifecycle-RUN-to-PAUSE",   canTransition(STATES.RUN,   STATES.PAUSE));
  t("lifecycle-RUN-to-CLOSE",   canTransition(STATES.RUN,   STATES.CLOSE));
  t("lifecycle-CLOSE-terminal", !canTransition(STATES.CLOSE, STATES.RUN));
  t("lifecycle-bad-SPAWN-to-PAUSE", !canTransition(STATES.SPAWN, STATES.PAUSE));
  const a = { named_agent: "test-agent-1", state: STATES.SPAWN };
  const r = transition(a, STATES.RUN);
  t("transition-fires-envelope", r.envelope && r.envelope.kind === "EVT-AGENT-RUN");
}

// bind-check
{
  t("bind-any",       bindCheck({ device_binding: "any" }).ok);
  t("bind-none",      bindCheck({}).ok);
  t("bind-mismatch", !bindCheck({ device_binding: "mars" }).ok);
}

// mistake log — use temp dir so we don't pollute the real mistakes tree
{
  const tmpDir = path.join(__dirname, "..", "..", "tmp-test-mistakes");
  process.env.ASOLARIA_MISTAKES_DIR = tmpDir;
  const { logMistake: logFresh } = require("../../src/agent/mistake-log.js");
  const r = logFresh({ named_agent: "test-agent-1", mistake_class: "bind-mismatch", summary: "unit test", context: { k: 1 }, chain: ["IX-001"] });
  t("mistake-log-writes-file", fs.existsSync(r.path));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
