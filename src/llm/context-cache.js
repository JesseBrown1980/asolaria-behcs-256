// Item 039 · 5-min Anthropic-style context cache
// Cache key = sha256 of stable prefix; value = { ttl_expires_at, usage_count, prefix_tokens }
// Consumer hashes a stable prefix and passes it; we skip the prompt prefix on replay.

const crypto = require("node:crypto");

const TTL_MS_DEFAULT = 5 * 60 * 1000; // 5 min cache TTL per Anthropic pattern
const store = new Map();

function hashPrefix(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function put(prefixText, meta = {}) {
  const key = hashPrefix(prefixText);
  const entry = { key, ttl_expires_at: Date.now() + TTL_MS_DEFAULT, usage_count: 0, ...meta };
  store.set(key, entry);
  return entry;
}

function get(prefixText) {
  const key = hashPrefix(prefixText);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.ttl_expires_at) { store.delete(key); return null; }
  entry.usage_count++;
  return entry;
}

function stats() {
  const now = Date.now();
  let live = 0, total = 0, total_uses = 0;
  for (const e of store.values()) {
    total++;
    if (e.ttl_expires_at > now) live++;
    total_uses += e.usage_count;
  }
  return { total, live, total_uses };
}

module.exports = { put, get, stats, TTL_MS_DEFAULT, hashPrefix };
