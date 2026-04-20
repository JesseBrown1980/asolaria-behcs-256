// Item 124 · Manifest writer · sha + ts + scale

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function writeManifest({ scale, N, composite_sha256, mean_LCR, shards, output_dir = "data/gnn" }) {
  if (!fs.existsSync(output_dir)) fs.mkdirSync(output_dir, { recursive: true });
  const out = {
    scale,
    N,
    shard_count: shards.length,
    mean_LCR: typeof mean_LCR === "number" ? mean_LCR : null,
    composite_sha256,
    shards: shards.map(s => ({ id: s.shard_id, agents: s.agents, sha: s.shard_sha256, mean_LCR: s.mean_LCR })),
    written_at: new Date().toISOString(), // audit only, NOT in composite sha
  };
  const file = path.join(output_dir, `${scale}-manifest.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  const manifestSha = crypto.createHash("sha256").update(JSON.stringify({ scale, N, composite_sha256, mean_LCR })).digest("hex");
  return { ok: true, file, manifest_sha: manifestSha };
}

module.exports = { writeManifest };
