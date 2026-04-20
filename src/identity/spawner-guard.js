// Item 066 · Refuses spawn if identity.shape_fingerprint != current hardware fingerprint
// Covers the "USB moves between machines" scenario.

const { readIdentity } = require("./reader.js");
const { fingerprint } = require("./fingerprint.js");

async function guardSpawn({ identityPath = null, allowFirstBoot = false } = {}) {
  const read = readIdentity(identityPath);
  if (!read.ok) {
    if (allowFirstBoot) return { ok: true, first_boot: true, note: "no identity file, first-boot allowed" };
    return { ok: false, reason: "no-identity-found", searched: read.searched };
  }
  const current = await fingerprint();
  const expected = read.identity.shape_fingerprint;
  if (expected !== current.shape_fingerprint) {
    return {
      ok: false,
      reason: "identity-mismatch",
      expected,
      current: current.shape_fingerprint,
      identity_path: read.path,
      hostname: current.hostname,
      action: "REFUSE-SPAWN · emit EVT-IDENTITY-MISMATCH · operator must re-anchor",
    };
  }
  return { ok: true, identity_path: read.path, hw_pid: read.identity.hw_pid, current_fingerprint: current.shape_fingerprint };
}

module.exports = { guardSpawn };
