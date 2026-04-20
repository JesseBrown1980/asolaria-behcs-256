#!/usr/bin/env node
/**
 * Colony Self-Verification Skill — run.js
 * Executes all audit checks and produces a report.
 * IX-396 / LX-290 (cross-colony skill)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const INDEX_DIR = path.join(ROOT, "data", "agent-index");
const REPORT_PATH = path.join(ROOT, "reports", "colony-self-verify-latest.md");

const CANONICAL_TYPES = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity", "policy"];

const results = [];
function check(id, name, fn) {
  try {
    const result = fn();
    results.push({ id, name, ...result });
    const icon = result.pass ? "PASS" : "FAIL";
    console.log(`[${icon}] ${name}: ${result.summary}`);
  } catch (e) {
    results.push({ id, name, pass: false, summary: `ERROR: ${e.message}` });
    console.log(`[FAIL] ${name}: ERROR: ${e.message}`);
  }
}

// 1. PID Registry
check("pid_registry", "PID Registry Health", () => {
  const { readPidRegistry } = require(path.join(ROOT, "src/spawnContextBuilder"));
  const reg = readPidRegistry();
  const active = Object.keys(reg.active).length;
  const history = reg.history.length;
  return { pass: true, summary: `${active} active, ${history} history`, active, history };
});

// 2. Agent Roles
check("agent_roles", "Agent Roles", () => {
  const { listAgentRoles } = require(path.join(ROOT, "src/spawnContextBuilder"));
  const roles = listAgentRoles();
  return { pass: roles.length >= 10, summary: `${roles.length} roles`, roles: roles.map(r => r.role) };
});

// 3. IX Type Canonicality
check("ix_types", "IX Type Canonicality", () => {
  const nonCanonical = [];
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== "sub-colonies") scan(full);
      else if (item.isFile() && /^IX-\d+\.md$/.test(item.name)) {
        const content = fs.readFileSync(full, "utf8");
        const m = content.match(/^type:\s*(.+)$/m);
        const type = m ? m[1].trim().replace(/[\[\]"]/g, "") : "NONE";
        if (!CANONICAL_TYPES.includes(type)) nonCanonical.push({ ix: item.name, type });
      }
    }
  }
  scan(INDEX_DIR);
  return { pass: nonCanonical.length === 0, summary: nonCanonical.length === 0 ? "all canonical" : `${nonCanonical.length} non-canonical`, nonCanonical };
});

// 4. IX Frontmatter
check("ix_frontmatter", "IX Frontmatter Completeness", () => {
  let total = 0, missing = 0;
  const incomplete = [];
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== "sub-colonies") scan(full);
      else if (item.isFile() && /^IX-\d+\.md$/.test(item.name)) {
        total++;
        const content = fs.readFileSync(full, "utf8");
        if (!content.startsWith("---") || !content.match(/^type:\s*.+$/m) || !content.match(/^name:\s*.+$/m)) {
          missing++;
          incomplete.push(item.name);
        }
      }
    }
  }
  scan(INDEX_DIR);
  return { pass: missing === 0, summary: `${total} files, ${missing} missing frontmatter`, total, missing, incomplete: incomplete.slice(0, 10) };
});

// 5. Skills Coverage
check("skills_coverage", "Skills Coverage", () => {
  const skillDirs = fs.readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  const ixSkills = [];
  const skillsDir = path.join(INDEX_DIR, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir)) {
      if (/^IX-\d+\.md$/.test(f)) ixSkills.push(f);
    }
  }
  return { pass: true, summary: `${skillDirs.length} skill folders, ${ixSkills.length} IX skill entries`, skillFolders: skillDirs.length, ixEntries: ixSkills.length };
});

// 6. Connector PID Wiring
check("connector_pid", "Connector PID Wiring", () => {
  const files = [
    "src/omnispindle.js", "src/connectors/codexConnector.js",
    "src/connectors/anthropicCliConnector.js", "src/connectors/cursorAgentConnector.js",
    "src/connectors/geminiCliConnector.js", "src/instantAgentSpawner.js",
    "tools/Run-AdminTerminalSidecar.ps1", "tools/Start-AdminTerminalSidecar.ps1",
    "tools/Run-AdminTerminalSidecar.py"
  ];
  let wired = 0;
  const missing = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (content.includes("despawnPid") || content.includes("registerSpawnPid")) {
      wired++;
    } else {
      missing.push(f);
    }
  }
  return { pass: missing.length === 0, summary: `${wired}/${files.length} wired`, wired, total: files.length, missing };
});

// 7. Event File Size
check("event_file", "Event File Size", () => {
  const file = path.join(ROOT, "data", "graph-runtime-events.ndjson");
  if (!fs.existsSync(file)) return { pass: true, summary: "no event file" };
  const stat = fs.statSync(file);
  const mb = Math.round(stat.size / 1024 / 1024);
  return { pass: mb < 100, summary: `${mb} MB` };
});

// 8. Despawn Protocol
check("despawn_protocol", "Despawn Protocol in Briefings", () => {
  const content = fs.readFileSync(path.join(ROOT, "src/spawnContextBuilder.js"), "utf8");
  const has = content.includes("DESPAWN PROTOCOL");
  return { pass: has, summary: has ? "present" : "MISSING" };
});

// 9. Catalog Sync
check("catalog_sync", "Catalog Sync Module", () => {
  try {
    const sync = require(path.join(ROOT, "src/indexCatalogSync"));
    const snapshot = sync.buildCatalogSnapshot();
    return { pass: true, summary: `${snapshot.catalogCount} catalogs, ${snapshot.totalEntries} entries` };
  } catch (e) {
    return { pass: false, summary: `not loadable: ${e.message}` };
  }
});

// 10. Route files
check("routes", "Route Files", () => {
  const routeFiles = fs.readdirSync(path.join(ROOT, "routes")).filter(f => f.endsWith(".js"));
  return { pass: true, summary: `${routeFiles.length} route files` };
});

// Summary
console.log("\n=== SUMMARY ===");
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`${passed} passed, ${failed} failed, ${results.length} total`);

// Write report
const report = [
  "# Colony Self-Verification Report",
  `Date: ${new Date().toISOString()}`,
  `Node: ${process.env.ASOLARIA_NODE_ID || "sovereign"}`,
  "",
  `## Results: ${passed}/${results.length} passed`,
  "",
  ...results.map(r => `- **[${r.pass ? "PASS" : "FAIL"}]** ${r.name}: ${r.summary}`),
  "",
  "## Details",
  "```json",
  JSON.stringify(results, null, 2),
  "```"
].join("\n");

fs.writeFileSync(REPORT_PATH, report);
console.log(`\nReport written to ${REPORT_PATH}`);
