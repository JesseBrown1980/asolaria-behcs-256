// Item 201 · ASI-OS L5 · Shannon civ as reasoning core

const { runStages, civilizationVerdict } = require("../shannon/stage-runner.js");
const { roleForStage } = require("../shannon/roles.js");
const { checkConvergentTrap, applyCap } = require("../shannon/lens-calibration.js");

async function reason(envelope, handlers = null) {
  const { envelope: out, trace } = await runStages(envelope, handlers || {});
  const trap = checkConvergentTrap(trace);
  const safeTrace = trap.tripped ? applyCap(trace) : trace;
  const verdict = civilizationVerdict(safeTrace);
  return { envelope: out, trace: safeTrace, trap, verdict };
}

module.exports = { reason, roleForStage };
