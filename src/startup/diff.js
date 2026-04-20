// Item 170 · startup-diff · expected vs actual

const fs = require("node:fs");
const path = require("node:path");
const { enumerateLiveDaemons } = require("../../packages/meta-supervisor-hermes/src/index.mjs"); // path relative when included from repo root; consumer sets CWD

const MANIFEST_PATH = path.join(__dirname, "../../data/acer-startup-manifest.json");

async function diff() {
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const live = await enumerateLiveDaemons(); // { live: { name: {pid,...} | null } }
  const expected_names = new Set(Object.keys(m.expected_daemons));
  const missing = [];
  const extra   = [];
  for (const name of expected_names) {
    if (!live.live[name]) missing.push(name);
  }
  for (const name of Object.keys(live.live || {})) {
    if (!expected_names.has(name) && !(m.optional_daemons && m.optional_daemons[name])) extra.push(name);
  }
  return { ok: missing.length === 0, missing, extra, expected_count: expected_names.size };
}

module.exports = { diff };
