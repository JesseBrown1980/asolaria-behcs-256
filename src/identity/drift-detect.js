// Item 070 · Identity-drift detector
// Compares expected vs actual fingerprint; categorizes drift severity.

const { classifyLocal } = require("./provenance.js");

const DRIFT_CLASSES = Object.freeze({
  NONE:     "NONE",
  SOFT:     "SOFT",     // trivial: hostname rename, MAC change on NIC swap
  HARD:     "HARD",     // cpu_id or mobo_uuid changed (likely host-move)
  CRITICAL: "CRITICAL", // all tuple items differ (wrong machine entirely)
});

async function detectDrift() {
  const c = await classifyLocal();
  if (!c.ok) return { ok: false, reason: c.reason, class: DRIFT_CLASSES.CRITICAL };
  if (c.verdict === "original") return { ok: true, class: DRIFT_CLASSES.NONE, hw_pid: c.hw_pid };
  // copy → score how many tuple items mismatch to classify
  // We can't access the original tuple from classifyLocal — use fingerprint equality count
  // Fallback: full-mismatch ⇒ CRITICAL
  return {
    ok: true, class: DRIFT_CLASSES.CRITICAL,
    hw_pid: c.hw_pid, expected: c.expected, actual: c.actual,
    recommendation: "freezeDevice writes + emit drift.announce + operator re-anchor",
  };
}

module.exports = { detectDrift, DRIFT_CLASSES };
