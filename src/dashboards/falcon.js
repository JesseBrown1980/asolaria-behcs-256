// Item 188 · Falcon dashboard · wired to BEHCS bridge

const { poll } = require("../ru-view/adapter.js");

async function falconView({ busUrl, since } = {}) {
  const { items } = await poll({ busUrl, since, limit: 100 });
  const falcon = items.filter(i => (i.src || "").toLowerCase().includes("falcon") || (i.kind || "").toLowerCase().includes("falcon"));
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    falcon_event_count: falcon.length,
    recent: falcon.slice(-20),
  };
}

module.exports = { falconView };
