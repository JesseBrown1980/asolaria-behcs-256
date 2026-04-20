/** ASO Boot — auto-wires ASO into any agent on require.
 *  Sets agent identity, records spawn/despawn observations.
 *  Usage: const aso = require('./src/aso-boot');
 */

// 1. Set agent name env if not already set
if (!process.env.ASOLARIA_AGENT_NAME) {
  process.env.ASOLARIA_AGENT_NAME = `agent-${process.pid}`;
}

const agentName = process.env.ASOLARIA_AGENT_NAME;
const spawnTs = new Date().toISOString();

// 2. Load aso-client
const aso = require("./aso-client");

// 3. Record spawn observation (fire-and-forget, don't block require)
const spawnSummary = `Agent "${agentName}" spawned — PID ${process.pid} at ${spawnTs}`;
try {
  const result = aso.observe("agent-lifecycle", spawnSummary, {
    source: "aso-boot",
    agentName,
    pid: process.pid,
    event: "spawn",
    ts: spawnTs,
  });
  // Handle promise rejection silently (kernel may not be available)
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
} catch (_) {
  // Kernel not available — silently continue
}

// 4. Register exit handler for despawn observation
let exitRecorded = false;
process.on("exit", () => {
  if (exitRecorded) return;
  exitRecorded = true;
  const despawnTs = new Date().toISOString();
  const despawnSummary = `Agent "${agentName}" despawned — PID ${process.pid} at ${despawnTs}`;
  try {
    aso.observe("agent-lifecycle", despawnSummary, {
      source: "aso-boot",
      agentName,
      pid: process.pid,
      event: "despawn",
      ts: despawnTs,
    });
  } catch (_) {
    // Best-effort on exit — sync context, no await
  }
});

// 5. Export the aso client
module.exports = aso;
