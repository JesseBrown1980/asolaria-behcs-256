// Item 055 · device-binding check before spawn

const os = require("node:os");

const HOSTNAME = os.hostname().toLowerCase();

function currentDeviceName() {
  if (HOSTNAME.includes("desktop-j99vcnh")) return "liris";
  if (HOSTNAME.includes("acer")) return "acer";
  if (HOSTNAME.includes("falcon")) return "falcon";
  if (HOSTNAME.includes("aether") || HOSTNAME.includes("felipe")) return "aether";
  return "unknown";
}

function bindCheck(profile) {
  if (!profile.device_binding) return { ok: true, reason: "no-binding-required" };
  const current = currentDeviceName();
  if (profile.device_binding === "any") return { ok: true, reason: "binding=any" };
  if (profile.device_binding === current) return { ok: true, reason: "binding-match", current };
  return { ok: false, reason: "binding-mismatch", required: profile.device_binding, current };
}

module.exports = { bindCheck, currentDeviceName };
