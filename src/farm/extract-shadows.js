// Item 115 · Extract recovered shadow envelopes into envelope-v1 format

const fs = require("node:fs");
const path = require("node:path");
const { translateBehcs } = require("../envelope/translate-behcs.js");
const { translateDroidswarm } = require("../envelope/translate-droidswarm.js");
const { translateOpdispatch } = require("../envelope/translate-opdispatch.js");
const { validate } = require("../envelope/validate.js");

function extractShadows({ input_path, output_path }) {
  if (!fs.existsSync(input_path)) return { ok: false, reason: "no-input" };
  const raw = fs.readFileSync(input_path, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const out = [];
  const stats = { total: lines.length, translated: 0, skipped: 0, invalid: 0 };
  for (const l of lines) {
    let obj;
    try { obj = JSON.parse(l); } catch { stats.skipped++; continue; }
    let v1;
    try {
      if (obj.verb || obj.from || obj.actor)    v1 = translateBehcs(obj);
      else if (obj.swarm_id || obj.kind === "SWARM_HEARTBEAT") v1 = translateDroidswarm(obj);
      else if (obj.op || obj.issued_by)          v1 = translateOpdispatch(obj);
      else { stats.skipped++; continue; }
    } catch (e) { stats.skipped++; continue; }
    const val = validate(v1);
    if (!val.ok) { stats.invalid++; continue; }
    v1.body.shadow_origin = { from_path: input_path, legacy_shape: obj.verb ? "BEHCS" : (obj.swarm_id ? "DroidSwarm" : "OP_DISPATCH") };
    v1.mode = "shadow";
    out.push(v1);
    stats.translated++;
  }
  if (output_path) {
    const dir = path.dirname(output_path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output_path, out.map(e => JSON.stringify(e)).join("\n") + "\n");
  }
  return { ok: true, stats, envelopes: out };
}

module.exports = { extractShadows };
