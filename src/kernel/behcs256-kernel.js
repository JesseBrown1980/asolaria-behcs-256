// Item 012 · BEHCS-256 canonical kernel
// This is the thin entry point that pulls the runtime primitives into a single import.

const codex    = require("../../tools/behcs/codex-bridge.js");
const bus      = require("../../tools/behcs/behcs-bus.js");
const fileCap  = require("../../tools/behcs/behcs-file-cap.js");
const gulp     = require("../../tools/behcs/behcs-gulp-runtime.js");
const encoder  = require("../../tools/behcs/d0-behcs-encoder.js");
const cascade  = require("../../tools/behcs/behcs-deep-cascade-v6.js");

/**
 * hilbertAddress(axis, value) → 8-char glyph.
 * Canonical namespace axes: "actor", "verb", "promotion", "artifact".
 */
function hilbertAddress(axis, value) { return codex.hilbertAddress(axis, value); }

module.exports = {
  codex, bus, fileCap, gulp, encoder, cascade,
  hilbertAddress,
  ROOM_MAP_CANONICAL: {
    24: "GC", 25: "GNN", 26: "UNISON-PROCESSOR", 27: "SUPERVISOR-DAEMON",
    28: "BUS-MIRROR", 29: "BUS-AND-KICK", 30: "AGENT-AUDITOR",
    31: "AGENT-GULP-STATE", 32: "AGENT-HEARTBEAT-WATCHER", 33: "AGENT-BUS-INSPECTOR",
    34: "AGENT-WHITEROOM-DIGESTER", 35: "GC-INBOX-SUPERVISOR",
    36: "MESSAGE-TRACKER (liris)", 37: "SUPER-GULP-SUPERVISOR",
    38: "GC-GNN-FEEDER", 39: "FALCON-FRONT-END-KICKER (falcon)",
    40: "AETHER-EDGE-AGENT (felipe)", 41: "META-SUPERVISOR-HERMES",
    42: "ROSE (reserved)", 43: "ORACLE-OF-AMY (reserved)",
  },
  LAW_001: { primary_port: 4947, backup_port: 4950, always_open: true },
  HALT_CANON_11: ["HALT","BLOCKED","STALE","FAIL","DENIED","EMERGENCY","STOP","KILL","ABORT","TERMINATE","DIVERGE"],
};
