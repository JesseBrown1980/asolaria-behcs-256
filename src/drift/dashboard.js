// Item 085 · Drift dashboard · renders last N events from drift-history.ndjson

const fs = require("node:fs");
const path = require("node:path");

const HISTORY_PATH = path.join(__dirname, "../../data/drift-history.ndjson");

function renderLastN(n = 20) {
  if (!fs.existsSync(HISTORY_PATH)) return { ok: false, reason: "no-history" };
  const lines = fs.readFileSync(HISTORY_PATH, "utf8").split("\n").filter(Boolean);
  const events = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const by_class = events.reduce((acc, e) => { const c = e?.body?.class || "?"; acc[c] = (acc[c]||0)+1; return acc; }, {});
  return { ok: true, count: events.length, by_class, events };
}

module.exports = { renderLastN };
