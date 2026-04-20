// Item 069 · copy-vs-original shape_fingerprint + provenance tracking
// Marks an identity file as "copy" if the local shape_fingerprint != the file's shape_fingerprint.

const { readIdentity } = require("./reader.js");
const { fingerprint } = require("./fingerprint.js");

async function classifyLocal() {
  const read = readIdentity();
  if (!read.ok) return { ok: false, reason: "no-identity" };
  const local = await fingerprint();
  const expected = read.identity.shape_fingerprint;
  const actual = local.shape_fingerprint;
  const verdict = expected === actual ? "original" : "copy";
  return {
    ok: true,
    verdict,
    identity_path: read.path,
    expected, actual,
    hw_pid: read.identity.hw_pid,
    provenance: read.identity.provenance || null,
    note: verdict === "copy" ? "identity file is a COPY carried to a host that doesn't match its fingerprint — spawner-guard will refuse" : "original",
  };
}

module.exports = { classifyLocal };
