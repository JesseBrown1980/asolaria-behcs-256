// Item 067 · Resolver · logical name → current hw_pid
// Reads identity + caches mappings. Lets callers say "liris" and get the right PID today.

const { readIdentity } = require("./reader.js");

const LOGICAL_MAP = {
  "acer":   { surface_hint: "acer-desktop" },
  "liris":  { surface_hint: "liris-rayssa" },
  "falcon": { surface_hint: "falcon-s24fe" },
  "aether": { surface_hint: "aether-a06" },
  "rose":   { surface_hint: "rose-pending" },
  "oracle-of-amy": { surface_hint: "oracle-of-amy-pending" },
};

function resolveLocal(logicalName) {
  const map = LOGICAL_MAP[logicalName];
  if (!map) return { ok: false, reason: "unknown-logical-name" };
  const read = readIdentity();
  if (!read.ok) return { ok: false, reason: "no-local-identity", hint: map.surface_hint };
  if (read.identity.surface && read.identity.surface.includes(logicalName)) {
    return { ok: true, hw_pid: read.identity.hw_pid, surface: read.identity.surface, source: "self" };
  }
  return { ok: false, reason: "logical-name-does-not-match-local-identity", local_surface: read.identity.surface };
}

module.exports = { resolveLocal, LOGICAL_MAP };
