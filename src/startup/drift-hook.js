// Item 171 · startup-diff → drift broadcast SOFT class wiring

const { diff } = require("./diff.js");
const { broadcastDrift } = require("../drift/broadcast.js");

async function runAndHook(sendFn) {
  const d = await diff();
  if (d.ok) return { action: "noop", diff: d };
  // missing daemons → SOFT drift (not CRITICAL; recoverable by restart)
  const payload = {
    class: "SOFT",
    hw_pid: "acer-startup",
    expected_fp: "manifest-OK",
    actual_fp: `missing:${d.missing.join(",")}`,
    surface: "acer-startup",
  };
  const r = await broadcastDrift(payload, sendFn);
  return { action: "SOFT-announced", diff: d, bcast: r };
}

module.exports = { runAndHook };
