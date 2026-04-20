// Item 133 · v1 → v2 migrator (sha-walk preserving)

const fs = require("node:fs");
const crypto = require("node:crypto");

function migrateEntryV1toV2(v1, { parent_chain_hash = null, scale_tier = "N-A", mode = "real" } = {}) {
  const agents = [];
  if (v1.a?.actor) agents.push(v1.a.actor);
  if (v1.b?.actor) agents.push(v1.b.actor);
  if (!agents.length && Array.isArray(v1.agents)) agents.push(...v1.agents);
  const entry = {
    ts:          v1.ts || new Date().toISOString(),
    envelope_id: v1.envelope_id,
    sha256:      v1.sha256,
    agents,
    parent_chain_hash,
    scale_tier,
    mode,
    schema_version: 2,
  };
  // chain_hash recomputed over (v1 fields + parent_chain_hash) for Merkle linkage
  const preHash = JSON.stringify({
    ts: entry.ts, envelope_id: entry.envelope_id, sha256: entry.sha256,
    agents: entry.agents.slice().sort(), parent_chain_hash,
  });
  entry.chain_hash = crypto.createHash("sha256").update(preHash).digest("hex");
  return entry;
}

function migrateFile({ v1_path, v2_path }) {
  if (!fs.existsSync(v1_path)) return { ok: false, reason: "no-v1" };
  const lines = fs.readFileSync(v1_path, "utf8").split("\n").filter(Boolean);
  let parent = null;
  const out = [];
  for (const l of lines) {
    let v1; try { v1 = JSON.parse(l); } catch { continue; }
    const v2 = migrateEntryV1toV2(v1, { parent_chain_hash: parent });
    parent = v2.chain_hash;
    out.push(v2);
  }
  fs.writeFileSync(v2_path, out.map(e => JSON.stringify(e)).join("\n") + "\n");
  return { ok: true, migrated: out.length, last_chain_hash: parent };
}

module.exports = { migrateEntryV1toV2, migrateFile };
