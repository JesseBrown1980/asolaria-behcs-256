// Item 157 · Gulp 2000 dashboard · current step

const fs = require("node:fs");

const STATE_PATH = "tmp/gulp-2000-state.json";

function dashboard() {
  if (!fs.existsSync(STATE_PATH)) return { ok: false, reason: "no-state" };
  const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const last = s.last_step || 0;
  const total = 2000;
  const pct = ((last / total) * 100).toFixed(2);
  const stage_next = ["build","validate","sign","deploy"][((last+1) % 4)];
  return {
    ok: true,
    last_step: last,
    total,
    percent: pct,
    envelopes_emitted: s.envelopes?.length || 0,
    stage_next,
    rendered_at: new Date().toISOString(),
  };
}

module.exports = { dashboard };
