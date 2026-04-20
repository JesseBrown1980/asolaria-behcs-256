#!/usr/bin/env node
/** aso-digest.js — Generate markdown status report from ASO tables.
 *  Outputs to stdout AND writes to data/aso/DIGEST.md.
 *  Usage: node tools/aso-digest.js */
const path = require("path"), fs = require("fs");
const projectRoot = path.resolve(__dirname, "..");
process.env.ASOLARIA_INSTANCE_ROOT = process.env.ASOLARIA_INSTANCE_ROOT || projectRoot;
const aso = require("../src/index-kernel/aso");

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
const trunc = (s, n = 72) => { s = String(s || "").replace(/\n/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; };
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

function readDirect(name) {
  const fp = path.join(aso.ASO_DATA_DIR, "tables", `${name}.json`);
  if (!fs.existsSync(fp)) return [];
  try { const d = JSON.parse(fs.readFileSync(fp, "utf8")); return Array.isArray(d.rows) ? d.rows : []; }
  catch { return []; }
}

const status = aso.getAsoStatus(), c = status.counts;
const allTopics = aso.listTopics(), bootTopics = aso.listTopics({ tier: "boot" });
const obsTable = readDirect("observations"), relTable = readDirect("relations");
const evdTable = readDirect("evidence"), conTable = readDirect("conflicts");

const lines = [];
const L = (s = "") => lines.push(s);

// 1. Header + counts
L("# ASO Digest"); L(`> Generated ${ts()}`); L();
L("## Counts"); L();
L("| Table          | Rows |"); L("|----------------|------|");
for (const [k, v] of Object.entries(c)) L(`| ${pad(k, 14)} | ${rpad(v, 4)} |`);
L();
L("**Topics by type:** " + Object.entries(status.topicsByType).map(([k, v]) => `${k}(${v})`).join(", "));
L("**Topics by tier:** " + Object.entries(status.topicsByTier).map(([k, v]) => `${k}(${v})`).join(", "));
L();

// 2. Boot-critical topics
L("## Boot-Critical Topics"); L();
if (bootTopics.length === 0) { L("_No boot-tier topics._"); }
else {
  L("| ASO ID | Name | Status | Latest Observation | Outcomes |");
  L("|--------|------|--------|--------------------|----------|");
  for (const t of bootTopics) {
    const obs = aso.getObservations(t.asoId, 1);
    const outs = aso.getOutcomes(t.asoId, 5);
    const latObs = obs.length ? trunc(obs[0].summary, 40) : "\u2014";
    const outSum = outs.length ? `${outs.length} recorded` : "\u2014";
    L(`| ${t.asoId} | ${trunc(t.name, 30)} | ${t.status} | ${latObs} | ${outSum} |`);
  }
}
L();

// 3. Open conflicts
const openConflicts = conTable.filter(r => r.resolutionState === "open");
L("## Open Conflicts"); L();
if (openConflicts.length === 0) { L("_None._"); }
else {
  L("| Conflict ID | Topic | Entry A | Entry B | Description |");
  L("|-------------|-------|---------|---------|-------------|");
  for (const cf of openConflicts)
    L(`| ${cf.conflictId} | ${cf.topicId} | ${cf.entryA} | ${cf.entryB} | ${trunc(cf.description, 40)} |`);
}
L();

// 4. Last 20 observations (newest first)
L("## Recent Observations (last 20)"); L();
const recentObs = obsTable.slice()
  .sort((a, b) => String(b.observedAt || "").localeCompare(String(a.observedAt || "")))
  .slice(0, 20);
if (recentObs.length === 0) { L("_No observations recorded._"); }
else {
  L("| # | Observation ID | Topic | Summary | When |");
  L("|---|----------------|-------|---------|------|");
  recentObs.forEach((o, i) => {
    L(`| ${i + 1} | ${o.observationId} | ${o.topicId} | ${trunc(o.summary, 48)} | ${String(o.observedAt || "").slice(0, 16)} |`);
  });
}
L();

// 5. Top 10 most-connected topics by relation count
L("## Top 10 Most-Connected Topics"); L();
const relCounts = {};
for (const r of relTable) {
  if (!r.active) continue;
  relCounts[r.from] = (relCounts[r.from] || 0) + 1;
  relCounts[r.to] = (relCounts[r.to] || 0) + 1;
}
const ranked = Object.entries(relCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
if (ranked.length === 0) { L("_No relations recorded._"); }
else {
  L("| Rank | ASO ID | Name | Relations |");
  L("|------|--------|------|-----------|");
  ranked.forEach(([id, cnt], i) => {
    const t = aso.getTopic(id);
    L(`| ${i + 1} | ${id} | ${t ? trunc(t.name, 30) : id} | ${cnt} |`);
  });
}
L();

// 6. Evidence summary
L("## Evidence Summary"); L();
if (evdTable.length === 0) { L("_No evidence recorded._"); }
else {
  const byKind = {};
  for (const e of evdTable) byKind[e.sourceKind] = (byKind[e.sourceKind] || 0) + 1;
  L(`Total evidence entries: **${evdTable.length}**`); L();
  L("| Source Kind | Count |"); L("|------------|-------|");
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1]))
    L(`| ${pad(k, 20)} | ${rpad(v, 5)} |`);
}
L(); L("---");
L(`_End of digest. ${allTopics.length} topics, ${obsTable.length} observations, ${relTable.length} relations._`);

// Output to stdout + file
const md = lines.join("\n") + "\n";
process.stdout.write(md);
const outPath = path.join(aso.ASO_DATA_DIR, "DIGEST.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, "utf8");
process.stderr.write(`[aso-digest] written to ${outPath}\n`);
