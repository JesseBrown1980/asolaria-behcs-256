// Item 119 · Provenance tag copy-vs-original for farmed files

const crypto = require("node:crypto");
const fs = require("node:fs");

function tagProvenance({ file_path, origin_device, origin_hw_pid, original_sha256 = null }) {
  if (!fs.existsSync(file_path)) return { ok: false, reason: "no-file" };
  const buf = fs.readFileSync(file_path);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const verdict = original_sha256 ? (original_sha256 === sha ? "original" : "copy-modified") : "unknown";
  return {
    ok: true,
    file_path,
    bytes: buf.length,
    sha256: sha,
    origin_device,
    origin_hw_pid,
    original_sha256,
    verdict,
    tagged_at: new Date().toISOString(),
  };
}

module.exports = { tagProvenance };
