// Item 186 · Admin dashboard · unifies 82 API routes through envelope-v1 RU View

const { poll } = require("../ru-view/adapter.js");

const ROUTE_CATEGORIES = ["AQ", "TR", "DE", "PA", "VA", "PT", "VF", "AU"];

async function refresh({ busUrl, since } = {}) {
  const { items } = await poll({ busUrl, since, limit: 200 });
  const grouped = Object.fromEntries(ROUTE_CATEGORIES.map(c => [c, []]));
  const other = [];
  for (const it of items) {
    const found = ROUTE_CATEGORIES.find(c => it.kind && it.kind.includes(c));
    if (found) grouped[found].push(it); else other.push(it);
  }
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    counts: Object.fromEntries(ROUTE_CATEGORIES.map(c => [c, grouped[c].length])),
    other_count: other.length,
    total: items.length,
    groups: grouped,
  };
}

module.exports = { refresh, ROUTE_CATEGORIES };
