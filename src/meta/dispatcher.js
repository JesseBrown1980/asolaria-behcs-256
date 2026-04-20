// Item 198 · Meta-plan executor · reads SUPER-MASTER-PLAN + dispatches

const fs = require("node:fs");
const path = require("node:path");
const { omniEnvelopeAnnounce } = require("../omni/envelope-announce.js");

function parsePlan(plan_path) {
  const raw = fs.readFileSync(plan_path, "utf8");
  const items = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^Item\s+(\d+)\s*\|\s*([A-Z])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(PLN|EXP|BLD|REV|CHAIR|SUPERVISOR)\s*\|\s*([-\d,]+)\s*\|\s*(\d+)\s*\|\s*(P\d)/);
    if (!m) continue;
    items.push({
      id: parseInt(m[1], 10),
      section: m[2],
      task: m[3].trim(),
      target: m[4].trim(),
      agent: m[5],
      deps: m[6] === "-" ? [] : m[6].split(",").map(x => parseInt(x, 10)).filter(Boolean),
      hours: parseInt(m[7], 10),
      priority: m[8],
    });
  }
  return items;
}

function topologicalSort(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  const visited = new Set(), order = [], inStack = new Set();
  function visit(n) {
    if (visited.has(n)) return;
    if (inStack.has(n)) return; // skip cycles (shouldn't happen in well-formed plan)
    inStack.add(n);
    const item = byId.get(n);
    if (item) { for (const d of item.deps) visit(d); order.push(item); }
    visited.add(n);
    inStack.delete(n);
  }
  for (const it of items) visit(it.id);
  return order;
}

async function dispatchItem(item, { dryRun = true } = {}) {
  const env = {
    id: `smp-dispatch-${item.id}-${Date.now()}`,
    ts: new Date().toISOString(),
    src: "meta-dispatcher",
    dst: "federation",
    kind: "SMP.item.dispatch",
    body: item,
  };
  if (dryRun) return { ok: true, dry: true, envelope: env };
  return omniEnvelopeAnnounce(env);
}

async function executeMetaPlan(plan_path, { dryRun = true, onlyReady = true } = {}) {
  const items = parsePlan(plan_path);
  const order = topologicalSort(items);
  const results = [];
  for (const item of order) {
    if (onlyReady && item.deps.some(d => !results.find(r => r.item_id === d && r.ok))) continue;
    const r = await dispatchItem(item, { dryRun });
    results.push({ item_id: item.id, ok: r.ok, envelope: r.envelope });
  }
  return { ok: true, total_items: items.length, dispatched: results.length, results };
}

module.exports = { parsePlan, topologicalSort, dispatchItem, executeMetaPlan };
