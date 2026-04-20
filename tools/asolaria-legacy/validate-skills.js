/* eslint-disable no-console */

const { getSkillRegistry, listSkillSummaries } = require("../src/skillRegistry");

const registry = getSkillRegistry({ force: true, maxAgeMs: 0 });
const out = {
  ok: registry.errors.length === 0,
  root: registry.root,
  loadedAt: registry.loadedAt,
  total: registry.total,
  errors: registry.errors,
  skills: listSkillSummaries()
};

console.log(JSON.stringify(out, null, 2));
if (!out.ok) {
  process.exitCode = 1;
}

