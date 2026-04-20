// Item 081 · drift → halt wiring per feedback_halt_pattern

const { broadcastDrift } = require("./broadcast.js");
const { freezeDevice } = require("./freeze.js");

async function handleDrift(drift /* { class, hw_pid, expected_fp, actual_fp, surface } */, sendFn) {
  const cls = drift.class || "NONE";
  if (cls === "NONE") return { action: "noop" };

  // Always announce
  const bcast = await broadcastDrift(drift, sendFn);

  if (cls === "CRITICAL") {
    const freeze = freezeDevice(`drift-CRITICAL · expected=${drift.expected_fp?.slice(0,24)} actual=${drift.actual_fp?.slice(0,24)}`);
    return { action: "announced+frozen", bcast, freeze };
  }
  if (cls === "HARD") {
    return { action: "announced+spawn-blocked", bcast };
  }
  // SOFT
  return { action: "announced", bcast };
}

module.exports = { handleDrift };
