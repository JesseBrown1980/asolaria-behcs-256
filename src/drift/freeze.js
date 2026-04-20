// Item 080 · freezeDevice · halt writes on CRITICAL drift
// Sets a marker file + env flag; callers check before writing.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const FREEZE_MARKER = path.join(os.homedir(), ".asolaria-freeze");

function freezeDevice(reason) {
  const body = JSON.stringify({ frozen_at: new Date().toISOString(), reason, pid: process.pid }, null, 2);
  fs.writeFileSync(FREEZE_MARKER, body);
  process.env.ASOLARIA_FROZEN = "1";
  return { ok: true, marker: FREEZE_MARKER, reason };
}

function isFrozen() {
  return fs.existsSync(FREEZE_MARKER) || process.env.ASOLARIA_FROZEN === "1";
}

function unfreezeDevice(operatorToken) {
  if (operatorToken !== "JESSE-UNFREEZE-AUTHORIZED") {
    return { ok: false, reason: "operator-token-required" };
  }
  try { fs.unlinkSync(FREEZE_MARKER); } catch {}
  delete process.env.ASOLARIA_FROZEN;
  return { ok: true };
}

module.exports = { freezeDevice, isFrozen, unfreezeDevice, FREEZE_MARKER };
