// Item 134 · v2 appender with tamper-evident sha-walk

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function computeChainHash({ ts, envelope_id, sha256, agents, parent_chain_hash }) {
  const pre = JSON.stringify({ ts, envelope_id, sha256, agents: agents.slice().sort(), parent_chain_hash });
  return crypto.createHash("sha256").update(pre).digest("hex");
}

function lastEntry(path_) {
  if (!fs.existsSync(path_)) return null;
  const lines = fs.readFileSync(path_, "utf8").split("\n").filter(Boolean);
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

function appendV2({ chain_path, envelope_id, sha256, agents, dimensional_tags = null, scale_tier = "N-A", mode = "real" }) {
  const parent = lastEntry(chain_path);
  const parent_chain_hash = parent?.chain_hash || null;
  const ts = new Date().toISOString();
  const chain_hash = computeChainHash({ ts, envelope_id, sha256, agents, parent_chain_hash });
  const entry = { ts, envelope_id, sha256, agents, chain_hash, parent_chain_hash, scale_tier, mode, schema_version: 2 };
  if (dimensional_tags) entry.dimensional_tags = dimensional_tags;
  const dir = path.dirname(chain_path);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(chain_path, JSON.stringify(entry) + "\n");
  return entry;
}

function verifyChain(chain_path) {
  const lines = fs.existsSync(chain_path) ? fs.readFileSync(chain_path, "utf8").split("\n").filter(Boolean) : [];
  let parent = null;
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    let e; try { e = JSON.parse(lines[i]); } catch { errors.push({ line: i, error: "parse" }); continue; }
    const recomputed = computeChainHash({ ts: e.ts, envelope_id: e.envelope_id, sha256: e.sha256, agents: e.agents, parent_chain_hash: parent });
    if (recomputed !== e.chain_hash) errors.push({ line: i, entry: e.envelope_id, error: "chain-hash-mismatch" });
    if (e.parent_chain_hash !== parent) errors.push({ line: i, entry: e.envelope_id, error: "parent-link-broken" });
    parent = e.chain_hash;
  }
  return { ok: errors.length === 0, entries: lines.length, errors };
}

module.exports = { appendV2, verifyChain, computeChainHash };
