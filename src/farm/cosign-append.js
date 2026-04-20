// Item 117 · USB-farm cosign-chain append

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CHAIN_PATH = path.join(__dirname, "../../data/cosign-chain.ndjson");

function appendCosign({ shard_path, shard_sha256, agents = ["acer", "liris"] }) {
  const entry = {
    ts: new Date().toISOString(),
    shard_path,
    shard_sha256,
    agents,
    cosign_id: `cosign-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
  };
  const chainHash = crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  entry.chain_hash = chainHash;
  const dir = path.dirname(CHAIN_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(CHAIN_PATH, JSON.stringify(entry) + "\n");
  return entry;
}

function readChain(tail_n = null) {
  if (!fs.existsSync(CHAIN_PATH)) return [];
  const lines = fs.readFileSync(CHAIN_PATH, "utf8").split("\n").filter(Boolean);
  const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return tail_n ? parsed.slice(-tail_n) : parsed;
}

module.exports = { appendCosign, readChain, CHAIN_PATH };
