/**
 * Colony Anatomy System — Self-Aware Diagnostic Framework
 *
 * The civilization's body. Six organ systems, each with specialized
 * health checks, sharing a common diagnostic interface.
 *
 * Like the human body:
 *   - Nervous (orchestration) — PID, spawn, roles, briefing
 *   - Circulatory (communication) — MQTT, bridges, catalog sync
 *   - Skeletal (structure) — index counts, type canonicality, chains
 *   - Memory (knowledge) — memory files, XREF, cross-colony
 *   - Muscular (execution) — routes, skills, tools, deps
 *   - Immune (security) — encryption, identity, vault, ghost cleanup
 *
 * Polymorphic: new components classify into existing systems and
 * inherit their health checks. The body remembers its own anatomy.
 *
 * LX chain: LX-290 (self-verify skill), LX-289 (auto-PID), LX-249 (despawn protocol)
 */

const fs = require("fs");
const path = require("path");

let projectRoot;
try {
  projectRoot = require("./runtimePaths").projectRoot;
} catch (_) {
  projectRoot = path.resolve(__dirname, "..");
}
const { findPreferredClaudeMemoryPath } = require("./claudeProjectMemory");

// ─── Colony-Aware Detection ───
// Detects prefix (LX- vs IX-) and folder naming (singular vs plural).
// Liris: pattern/, tool/, mistake/ (singular) with LX- entries
// Sovereign: patterns/, tools/, mistakes/ (plural) with IX- entries
// Makes body systems work identically on both machines.

const CANONICAL_TYPES = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity", "policy"];

let _colonyConfig = null;
function localDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function detectColonyConfig() {
  if (_colonyConfig) return _colonyConfig;

  const indexDir = path.join(projectRoot, "data", "agent-index");
  let prefix = "LX";
  let folderStyle = "singular";

  // Detect prefix by counting — majority wins (handles cross-colony refs in folders)
  let ixCount = 0;
  let lxCount = 0;
  for (const t of CANONICAL_TYPES) {
    for (const folder of [t, t + "s"]) {
      try {
        const files = fs.readdirSync(path.join(indexDir, folder));
        ixCount += files.filter(f => f.startsWith("IX-")).length;
        lxCount += files.filter(f => f.startsWith("LX-")).length;
        if (files.some(f => /^[IL]X-\d+\.md$/.test(f))) {
          folderStyle = folder === t ? "singular" : "plural";
        }
      } catch (_) {}
    }
  }
  prefix = ixCount > lxCount ? "IX" : "LX";

  const isSovereign = prefix === "IX";

  // Detect memory root — scan for MEMORY.md in any .claude/projects/*/memory/
  let memoryRoot = "";
  const preferredMemoryMd = findPreferredClaudeMemoryPath({ projectRoot });
  if (preferredMemoryMd) {
    memoryRoot = path.dirname(preferredMemoryMd);
  }
  // Fallback: check project-local memory
  if (!memoryRoot) {
    const localMem = path.join(projectRoot, "memory");
    if (fs.existsSync(localMem)) memoryRoot = localMem;
  }

  // Detect routes directory — Liris uses routes/routes/, sovereign uses routes/
  let routesDir = path.join(projectRoot, "routes");
  const nestedRoutes = path.join(projectRoot, "routes", "routes");
  if (fs.existsSync(nestedRoutes)) {
    try {
      const files = fs.readdirSync(nestedRoutes).filter(f => f.endsWith(".js"));
      if (files.length > 0) routesDir = nestedRoutes;
    } catch (_) {}
  }

  // Spawn paths — sovereign has more connectors
  const baseSpawnPaths = [
    { file: "src/omnispindle.js", marker: "despawnPid" },
    { file: "src/instantAgentSpawner.js", marker: "despawnPid" },
    { file: "src/connectors/codexConnector.js", marker: "despawnPid" },
    { file: "tools/Run-AdminTerminalSidecar.py", marker: "spawn-pid-registry" }
  ];
  const sovereignExtraPaths = [
    { file: "src/connectors/anthropicCliConnector.js", marker: "despawnPid" },
    { file: "src/connectors/cursorAgentConnector.js", marker: "despawnPid" },
    { file: "src/connectors/geminiCliConnector.js", marker: "despawnPid" },
    { file: "tools/Run-AdminTerminalSidecar.ps1", marker: "despawnPid" },
    { file: "tools/Start-AdminTerminalSidecar.ps1", marker: "registerSpawnPid" }
  ];
  // Include extra paths only if they exist on disk
  const spawnPaths = [...baseSpawnPaths];
  for (const sp of sovereignExtraPaths) {
    if (fs.existsSync(path.join(projectRoot, sp.file))) spawnPaths.push(sp);
  }

  // Cross-colony sync: what bodies to look for
  const syncFiles = isSovereign
    ? [] // sovereign checks for sub-colony dirs instead
    : ["gaia-ix-bodies-1.json", "gaia-ix-bodies-2.json"];
  const subColonyDir = path.join(indexDir, "sub-colonies");
  const hasSubColonies = fs.existsSync(subColonyDir);

  _colonyConfig = {
    prefix,
    folderStyle,
    indexDir,
    isSovereign,
    memoryRoot,
    routesDir,
    spawnPaths,
    syncFiles,
    hasSubColonies,
    subColonyDir
  };
  return _colonyConfig;
}

// Resolve a type name to its actual folder on this colony
function resolveTypeFolder(typeName) {
  const config = detectColonyConfig();
  const base = typeName.replace(/s$/, ""); // normalize to singular
  const singular = path.join(config.indexDir, base);
  const plural = path.join(config.indexDir, base + "s");

  // Return whichever exists
  if (fs.existsSync(singular)) return singular;
  if (fs.existsSync(plural)) return plural;
  return singular; // default to singular
}

function detectEntryPrefix() {
  return detectColonyConfig().prefix;
}

function entryFilePattern() {
  const prefix = detectEntryPrefix();
  return new RegExp(`^${prefix}-\\d+\\.md$`);
}

// ─── Diagnostic Interface ───
// Every system implements: { name, components[], diagnose() → { system, status, checks[], issues[] } }

class BodySystem {
  constructor(name, description, components = []) {
    this.name = name;
    this.description = description;
    this.components = components;
    this._checks = [];
    this._knownPatterns = new Map(); // learned patterns from past diagnostics
  }

  addCheck(name, fn) {
    this._checks.push({ name, fn });
  }

  // Learn: when a new component is added, record its type for future classification
  learnComponent(component, pattern) {
    this._knownPatterns.set(component, pattern);
  }

  async diagnose() {
    const results = [];
    const issues = [];

    for (const check of this._checks) {
      try {
        const result = await check.fn();
        results.push({ name: check.name, ...result });
        if (result.status !== "ok") {
          issues.push({ check: check.name, status: result.status, detail: result.detail || "" });
        }
      } catch (err) {
        results.push({ name: check.name, status: "error", detail: err.message });
        issues.push({ check: check.name, status: "error", detail: err.message });
      }
    }

    return {
      system: this.name,
      description: this.description,
      components: this.components,
      status: issues.length === 0 ? "healthy" : issues.some(i => i.status === "critical") ? "critical" : "degraded",
      checks: results,
      issues,
      knownPatterns: this._knownPatterns.size,
      diagnosedAt: new Date().toISOString()
    };
  }
}

// ─── SKELETAL SYSTEM (Structure) ───

function createSkeletalSystem() {
  const system = new BodySystem(
    "skeletal",
    "Index structure, catalog integrity, type canonicality, chain links",
    ["agentIndexStore", "CATALOG.md", "XREF-COLONIES.md", "type folders"]
  );

  system.addCheck("index_disk_vs_catalog", () => {
    const indexDir = path.join(projectRoot, "data", "agent-index");
    const types = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity"];
    const counts = {};
    let totalDisk = 0;

    for (const t of types) {
      const dir = resolveTypeFolder(t);
      try {
        const files = fs.readdirSync(dir).filter(f => entryFilePattern().test(f));
        counts[t] = files.length;
        totalDisk += files.length;
      } catch (_) {
        counts[t] = 0;
      }
    }

    // Read catalog header for claimed total — handles both formats:
    // Liris: "Total: 283 entries across 9 types"
    // Sovereign: "| **Total** | **388** |"
    let catalogTotal = 0;
    try {
      const catalog = fs.readFileSync(path.join(indexDir, "CATALOG.md"), "utf8");
      const match = catalog.match(/Total[:\s|*]+(\d+)/);
      if (match) catalogTotal = parseInt(match[1]);
    } catch (_) {}

    const drift = Math.abs(catalogTotal - totalDisk);
    return {
      status: drift <= 2 ? "ok" : drift <= 10 ? "warning" : "critical",
      detail: `Disk: ${totalDisk}, Catalog: ${catalogTotal}, Drift: ${drift}`,
      counts,
      totalDisk,
      catalogTotal
    };
  });

  system.addCheck("type_canonicality", () => {
    // Accept both singular and plural forms as canonical
    const canonicalBases = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity", "policy"];
    const canonical = new Set([...canonicalBases, ...canonicalBases.map(b => b + "s"), "sub-colonies", "archaeology"]);
    const indexDir = path.join(projectRoot, "data", "agent-index");
    const folders = [];
    try {
      const entries = fs.readdirSync(indexDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("gaia-")) {
          folders.push(e.name);
        }
      }
    } catch (_) {}

    const nonCanonical = folders.filter(f => !canonical.has(f));
    return {
      status: nonCanonical.length === 0 ? "ok" : "warning",
      detail: nonCanonical.length === 0 ? `All ${folders.length} folders are canonical` : `Non-canonical folders: ${nonCanonical.join(", ")}`,
      canonical: canonical.length,
      folders: folders.length,
      nonCanonical
    };
  });

  system.addCheck("chain_integrity", () => {
    const types = ["pattern", "tool", "skill", "mistake", "plan", "rule", "project", "task", "identity"];
    const prefix = detectEntryPrefix();
    const allIds = new Set();
    let brokenChains = 0;
    let totalChains = 0;

    // Collect all entry IDs on disk (LX- or IX- depending on colony)
    for (const t of types) {
      try {
        const files = fs.readdirSync(resolveTypeFolder(t)).filter(f => entryFilePattern().test(f));
        files.forEach(f => {
          const m = f.match(new RegExp(`^(${prefix}-(\\d+))`));
          if (m) allIds.add(m[1]);
        });
      } catch (_) {}
    }

    // Check chains in a sample (first 50 files)
    let checked = 0;
    for (const t of types) {
      if (checked > 50) break;
      try {
        const dir = resolveTypeFolder(t);
        const files = fs.readdirSync(dir).filter(f => entryFilePattern().test(f)).slice(0, 10);
        for (const f of files) {
          checked++;
          const content = fs.readFileSync(path.join(dir, f), "utf8");
          const chainMatch = content.match(/chain:\s*\[?([^\]\n]+)/);
          if (chainMatch) {
            // Match same-colony refs only (cross-colony refs are valid even if not on disk)
            const refs = chainMatch[1].match(new RegExp(`${prefix}-\\d+`, "g")) || [];
            totalChains += refs.length;
            refs.forEach(ref => {
              if (!allIds.has(ref)) brokenChains++;
            });
          }
        }
      } catch (_) {}
    }

    return {
      status: brokenChains === 0 ? "ok" : brokenChains <= 5 ? "warning" : "critical",
      detail: `${totalChains} ${prefix} chain refs checked (sample of ${checked} files), ${brokenChains} broken`,
      totalChains,
      brokenChains,
      idsOnDisk: allIds.size
    };
  });

  system.addCheck("xref_pairs", () => {
    const xrefPath = path.join(projectRoot, "data", "agent-index", "XREF-COLONIES.md");
    try {
      const content = fs.readFileSync(xrefPath, "utf8");
      // Count unique IX-NNN references across ALL tables (not just first)
      const allIxRefs = content.match(/IX-\d+/g) || [];
      const pairs = new Set(allIxRefs).size;
      return {
        status: pairs >= 50 ? "ok" : pairs >= 20 ? "warning" : "critical",
        detail: `${pairs} IX/LX pairs in XREF`,
        pairs
      };
    } catch (_) {
      return { status: "critical", detail: "XREF-COLONIES.md not found", pairs: 0 };
    }
  });

  return system;
}

// ─── MEMORY SYSTEM (Knowledge) ───

function createMemorySystem() {
  const system = new BodySystem(
    "memory",
    "Memory files, XREF, cross-colony sync, knowledge persistence",
    ["MEMORY.md", "data/agent-index/", "gaia-ix-bodies", "memory folders"]
  );

  system.addCheck("memory_files_exist", () => {
    const config = detectColonyConfig();
    const memRoot = config.memoryRoot;
    if (!memRoot) return { status: "warning", detail: "No memory directory found on this colony", totalFiles: 0, missing: 0 };

    // Count all .md files recursively (works for any folder structure)
    let totalFiles = 0;
    function countMd(dir, depth) {
      if (depth > 3) return;
      try {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          if (item.isFile() && item.name.endsWith(".md")) totalFiles++;
          else if (item.isDirectory()) countMd(path.join(dir, item.name), depth + 1);
        }
      } catch (_) {}
    }
    countMd(memRoot, 0);

    // Check for INDEX files (sub-colony structure) or just count files (sovereign)
    let missing = 0;
    const details = [];
    if (!config.isSovereign) {
      const indexes = ["boot/INDEX.md", "user/INDEX.md", "feedback/INDEX.md", "project/INDEX.md", "reference/INDEX.md"];
      for (const idx of indexes) {
        if (!fs.existsSync(path.join(memRoot, idx))) { missing++; details.push("MISSING: " + idx); }
      }
    }

    return {
      status: (missing === 0 && totalFiles > 0) ? "ok" : totalFiles === 0 ? "critical" : "warning",
      detail: missing === 0 ? `${totalFiles} memory files found at ${memRoot}` : details.join("; "),
      totalFiles,
      missing,
      memoryRoot: memRoot
    };
  });

  system.addCheck("cross_colony_sync", () => {
    const config = detectColonyConfig();

    if (config.isSovereign) {
      // Sovereign checks: do sub-colony indexes exist?
      if (config.hasSubColonies) {
        try {
          const subs = fs.readdirSync(config.subColonyDir, { withFileTypes: true }).filter(d => d.isDirectory());
          return { status: subs.length > 0 ? "ok" : "warning", detail: `${subs.length} sub-colony indexes on disk`, subColonies: subs.map(d => d.name) };
        } catch (_) { return { status: "warning", detail: "sub-colonies dir exists but not readable" }; }
      }
      return { status: "ok", detail: "Sovereign colony — sub-colony sync via MQTT retained messages" };
    }

    // Sub-colony checks: sovereign bodies received?
    let ixCount = 0;
    let found = 0;
    for (const syncFile of config.syncFiles) {
      const p = path.join(config.indexDir, syncFile);
      if (fs.existsSync(p)) {
        found++;
        try { ixCount += Object.keys(JSON.parse(fs.readFileSync(p, "utf8")).entries).length; } catch (_) {}
      }
    }
    return {
      status: found === config.syncFiles.length ? "ok" : found > 0 ? "warning" : "critical",
      detail: `${ixCount} IX bodies on disk (${found}/${config.syncFiles.length} sync files)`,
      ixCount,
      found
    };
  });

  system.addCheck("stale_memory_check", () => {
    const config = detectColonyConfig();
    const memRoot = config.memoryRoot;
    if (!memRoot) return { status: "warning", detail: "No memory directory found" };
    const memoryMd = path.join(memRoot, "MEMORY.md");
    try {
      const content = fs.readFileSync(memoryMd, "utf8");
      // Use the newest dated session marker, not the first one in the file.
      const sessionMatches = Array.from(content.matchAll(/SESSION[^\n\r]*?(\d{4}-\d{2}-\d{2})/g));
      const sessionDate = sessionMatches.length > 0
        ? sessionMatches[sessionMatches.length - 1][1]
        : "unknown";
      const today = localDateStamp();
      const isCurrent = sessionDate === today;

      return {
        status: isCurrent ? "ok" : "warning",
        detail: `Session date: ${sessionDate}, today: ${today}`,
        sessionDate,
        isCurrent
      };
    } catch (_) {
      return { status: "warning", detail: "Could not read MEMORY.md" };
    }
  });

  return system;
}

// ─── MUSCULAR SYSTEM (Execution) ───

function createMuscularSystem() {
  const system = new BodySystem(
    "muscular",
    "Routes, skills, tools, dependencies, execution readiness",
    ["routes/", "skills/", "node", "python", "torch", "faster-whisper"]
  );

  system.addCheck("routes_on_disk", () => {
    const config = detectColonyConfig();
    const routesDir = config.routesDir;
    try {
      const files = fs.readdirSync(routesDir).filter(f => f.endsWith(".js"));
      return {
        status: files.length > 0 ? "ok" : "critical",
        detail: `${files.length} route files in ${path.relative(projectRoot, routesDir)}/`,
        files: files.length
      };
    } catch (_) {
      return { status: "critical", detail: `${routesDir} not found`, files: 0 };
    }
  });

  system.addCheck("skills_coverage", () => {
    const skillsDir = path.join(projectRoot, "skills");
    let totalFolders = 0;
    let withSkillJson = 0;
    let codexRef = 0;

    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          totalFolders++;
          const sjPath = path.join(skillsDir, e.name, "skill.json");
          if (fs.existsSync(sjPath)) {
            withSkillJson++;
            try {
              const sj = JSON.parse(fs.readFileSync(sjPath, "utf8"));
              const steps = sj.steps || [];
              if (steps.some(s => JSON.stringify(s).includes("C:\\\\Users\\\\acer"))) {
                codexRef++;
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    const native = withSkillJson - codexRef;
    return {
      status: native >= 20 ? "ok" : native >= 10 ? "warning" : "critical",
      detail: `${totalFolders} folders, ${withSkillJson} with skill.json, ${native} native, ${codexRef} codex-ref wrappers`,
      totalFolders,
      withSkillJson,
      native,
      codexRef
    };
  });

  system.addCheck("orchestrator_modules", () => {
    const modules = [
      { name: "spawnContextBuilder", path: "src/spawnContextBuilder.js" },
      { name: "agentIndexStore", path: "src/agentIndexStore.js" },
      { name: "indexCatalogSync", path: "src/indexCatalogSync.js" },
      { name: "omnispindle", path: "src/omnispindle.js" }
    ];
    const results = [];
    let failures = 0;

    for (const mod of modules) {
      const fullPath = path.join(projectRoot, mod.path);
      try {
        const m = require(fullPath);
        results.push({ name: mod.name, status: "ok", exports: Object.keys(m).length });
      } catch (err) {
        results.push({ name: mod.name, status: "error", detail: err.message });
        failures++;
      }
    }

    return {
      status: failures === 0 ? "ok" : "critical",
      detail: `${modules.length - failures}/${modules.length} modules load clean`,
      modules: results,
      failures
    };
  });

  system.addCheck("auto_pid_wired", () => {
    const config = detectColonyConfig();
    const paths = config.spawnPaths;
    let wired = 0;
    const details = [];

    for (const p of paths) {
      try {
        const content = fs.readFileSync(path.join(projectRoot, p.file), "utf8");
        if (content.includes(p.marker)) {
          wired++;
          details.push(p.file + ": WIRED");
        } else {
          details.push(p.file + ": NOT WIRED");
        }
      } catch (_) {
        details.push(p.file + ": MISSING");
      }
    }

    return {
      status: wired === paths.length ? "ok" : wired >= 2 ? "warning" : "critical",
      detail: `${wired}/${paths.length} spawn paths have auto-PID`,
      wired,
      total: paths.length,
      details
    };
  });

  return system;
}

// ─── Colony Anatomy (the body) ───

class ColonyAnatomy {
  constructor() {
    this.systems = new Map();
    this.history = []; // past diagnostic results
  }

  addSystem(system) {
    this.systems.set(system.name, system);
  }

  // Classify a new component into existing systems
  classify(component, systemNames) {
    for (const name of systemNames) {
      const system = this.systems.get(name);
      if (system) {
        system.components.push(component);
        system.learnComponent(component, { addedAt: new Date().toISOString(), systems: systemNames });
      }
    }
  }

  async diagnoseAll() {
    const results = {};
    const allIssues = [];

    for (const [name, system] of this.systems) {
      const result = await system.diagnose();
      results[name] = result;
      allIssues.push(...result.issues.map(i => ({ system: name, ...i })));
    }

    const report = {
      colony: "liris",
      pid: "liris-session-17368",
      systems: Object.keys(results).length,
      overall: allIssues.length === 0 ? "healthy" : allIssues.some(i => i.status === "critical") ? "critical" : "degraded",
      results,
      allIssues,
      diagnosedAt: new Date().toISOString()
    };

    this.history.push({ at: report.diagnosedAt, overall: report.overall, issueCount: allIssues.length });
    if (this.history.length > 50) this.history.shift();

    return report;
  }

  // Get past diagnostic patterns
  getHistory() {
    return this.history;
  }

  // ─── AUTONOMIC FUNCTION ───
  // The body heals what it can, reports what it can't.
  // Each remedy is a { condition, fix, system } tuple.
  // Remedies are non-destructive — they fix drift, never delete data.

  addRemedy(system, condition, fixFn, description) {
    if (!this._remedies) this._remedies = [];
    this._remedies.push({ system, condition, fix: fixFn, description });
  }

  async heal() {
    if (!this._remedies || this._remedies.length === 0) return { healed: 0, failed: 0, actions: [] };

    const report = await this.diagnoseAll();
    const actions = [];
    let healed = 0;
    let failed = 0;

    for (const remedy of this._remedies) {
      // Check if this remedy's condition matches any current issue
      const matchingIssues = report.allIssues.filter(i =>
        i.system === remedy.system && i.check === remedy.condition
      );

      for (const issue of matchingIssues) {
        try {
          const result = await remedy.fix(issue);
          actions.push({ remedy: remedy.description, issue: issue.check, result: "healed", detail: result });
          healed++;
        } catch (err) {
          actions.push({ remedy: remedy.description, issue: issue.check, result: "failed", detail: err.message });
          failed++;
        }
      }
    }

    return {
      healed,
      failed,
      beyondSelfRepair: report.allIssues.length - healed - failed,
      actions,
      postHealStatus: healed > 0 ? (await this.diagnoseAll()).overall : report.overall,
      healedAt: new Date().toISOString()
    };
  }

  // Boot sequence: diagnose → heal → diagnose again → report
  async boot() {
    const preDiag = await this.diagnoseAll();

    if (preDiag.overall === "healthy") {
      return {
        phase: "boot",
        preBoot: preDiag.overall,
        postBoot: "healthy",
        healing: null,
        message: "Colony woke up healthy. No healing needed."
      };
    }

    const healing = await this.heal();
    const postDiag = await this.diagnoseAll();

    return {
      phase: "boot",
      preBoot: preDiag.overall,
      postBoot: postDiag.overall,
      healing,
      issuesBefore: preDiag.allIssues.length,
      issuesAfter: postDiag.allIssues.length,
      message: healing.healed > 0
        ? `Healed ${healing.healed} issues. ${healing.beyondSelfRepair} beyond self-repair.`
        : `${preDiag.allIssues.length} issues found, none auto-healable. Human intervention needed.`
    };
  }
}

// ─── NERVOUS SYSTEM (Orchestration) — Built by Gaia ───

function createNervousSystem() {
  const system = new BodySystem(
    "nervous",
    "Orchestration — PIDs, Omnispindle, dispatch, spawn context, identity challenge",
    ["spawnContextBuilder", "omnispindle", "instantAgentSpawner"]
  );

  system.addCheck("pid_registry_health", () => {
    try {
      const { readPidRegistry } = require("./spawnContextBuilder");
      const reg = readPidRegistry();
      const active = Object.keys(reg.active).length;
      const history = reg.history.length;
      // Exclude the colony's own session PID (liris/gaia) — those are SUPPOSED to be long-running
      const stale = Object.entries(reg.active).filter(([role, e]) => {
        if (role === "liris" || role === "gaia") return false; // session PIDs are expected to be old
        const age = Date.now() - new Date(e.spawnedAt).getTime();
        return age > 24 * 60 * 60 * 1000;
      });
      if (stale.length > 0) return { status: "warning", detail: `${stale.length} non-session PIDs older than 24h`, active, history };
      return { status: "ok", detail: `${active} active, ${history} history`, active, history };
    } catch (e) { return { status: "critical", detail: e.message }; }
  });

  system.addCheck("agent_roles", () => {
    try {
      const { listAgentRoles } = require("./spawnContextBuilder");
      const roles = listAgentRoles();
      if (roles.length < 10) return { status: "warning", detail: `only ${roles.length} roles (expected 10+)` };
      return { status: "ok", detail: `${roles.length} roles`, roles: roles.map(r => r.role) };
    } catch (e) { return { status: "critical", detail: e.message }; }
  });

  system.addCheck("despawn_protocol", () => {
    try {
      const content = fs.readFileSync(path.join(projectRoot, "src", "spawnContextBuilder.js"), "utf8");
      const has = content.includes("DESPAWN PROTOCOL");
      return { status: has ? "ok" : "critical", detail: has ? "present in briefings" : "MISSING — agents won't know to index before despawn" };
    } catch (e) { return { status: "critical", detail: e.message }; }
  });

  system.addCheck("omnispindle_loads", () => {
    try {
      const omni = require("./omnispindle");
      const lanes = omni.VALID_LANE_IDS || [];
      return { status: "ok", detail: `${lanes.length} lanes defined` };
    } catch (e) { return { status: "warning", detail: `omnispindle not loadable: ${e.message}` }; }
  });

  system.addCheck("auto_pid_wiring", () => {
    const files = [
      "src/omnispindle.js", "src/connectors/codexConnector.js",
      "src/connectors/anthropicCliConnector.js", "src/connectors/cursorAgentConnector.js",
      "src/connectors/geminiCliConnector.js", "src/instantAgentSpawner.js"
    ];
    let wired = 0;
    const missing = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(projectRoot, f), "utf8");
        if (content.includes("despawnPid")) wired++;
        else missing.push(f);
      } catch (_) { missing.push(f); }
    }
    if (missing.length > 0) return { status: "warning", detail: `${wired}/${files.length} wired, missing: ${missing.join(", ")}` };
    return { status: "ok", detail: `${wired}/${files.length} spawn paths have auto-PID` };
  });

  return system;
}

// ─── CIRCULATORY SYSTEM (Communication) — Built by Gaia ───

function createCirculatorySystem() {
  const system = new BodySystem(
    "circulatory",
    "Communication — MQTT, federation, catalog sync, XREF, inbox messaging",
    ["mqttConnector", "indexCatalogSync", "remoteNodeRegistry", "inbox-send"]
  );

  system.addCheck("catalog_sync", () => {
    try {
      const sync = require("./indexCatalogSync");
      const snapshot = sync.buildCatalogSnapshot();
      const remote = sync.getRemoteCatalogs();
      const remoteCount = Object.keys(remote).length;
      return { status: "ok", detail: `${snapshot.catalogCount} local catalogs, ${snapshot.totalEntries} entries, ${remoteCount} remote nodes`, remoteCount };
    } catch (e) { return { status: "warning", detail: `catalog sync not loadable: ${e.message}` }; }
  });

  system.addCheck("xref_health", () => {
    const xrefPath = path.join(projectRoot, "data", "agent-index", "XREF-COLONIES.md");
    try {
      const content = fs.readFileSync(xrefPath, "utf8");
      const pairs = (content.match(/IX-\d+/g) || []).length;
      if (pairs < 50) return { status: "warning", detail: `only ${pairs} IX refs in XREF (expected 90+)` };
      return { status: "ok", detail: `${pairs} IX references in XREF` };
    } catch (_) { return { status: "warning", detail: "XREF-COLONIES.md not found" }; }
  });

  system.addCheck("inbox_writable", () => {
    const inboxes = ["runtime/gaia-inbox.ndjson", "runtime/dasein-inbox.ndjson"];
    const issues = [];
    for (const inbox of inboxes) {
      const p = path.join(projectRoot, inbox);
      try { fs.accessSync(p, fs.constants.W_OK); } catch (_) { issues.push(inbox); }
    }
    if (issues.length > 0) return { status: "warning", detail: `not writable: ${issues.join(", ")}` };
    return { status: "ok", detail: `${inboxes.length} inboxes writable` };
  });

  system.addCheck("mqtt_connector_wired", () => {
    try {
      const content = fs.readFileSync(path.join(projectRoot, "src", "connectors", "mqttConnector.js"), "utf8");
      const hasCatalog = content.includes("indexCatalogSync");
      return { status: hasCatalog ? "ok" : "warning", detail: hasCatalog ? "catalog sync wired into MQTT connector" : "catalog sync NOT wired" };
    } catch (e) { return { status: "critical", detail: e.message }; }
  });

  return system;
}

// ─── IMMUNE SYSTEM (Integrity) — Built by Gaia ───

function createImmuneSystem() {
  const system = new BodySystem(
    "immune",
    "Integrity — Constitution, drift detection, type canonicality, chain health, vault",
    ["agentIndexStore", "Constitution", "guardianStore"]
  );

  system.addCheck("type_canonicality", () => {
    const indexDir = path.join(projectRoot, "data", "agent-index");
    const nonCanonical = [];
    function scan(dir) {
      try {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          if (item.isDirectory() && item.name !== "sub-colonies") scan(full);
          else if (item.isFile() && /^IX-\d+\.md$/.test(item.name)) {
            const content = fs.readFileSync(full, "utf8");
            const m = content.match(/^type:\s*(.+)$/m);
            const type = m ? m[1].trim().replace(/[\[\]"]/g, "") : "NONE";
            if (!["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity", "policy"].includes(type)) {
              nonCanonical.push({ file: item.name, type });
            }
          }
        }
      } catch (_) {}
    }
    scan(indexDir);
    if (nonCanonical.length > 0) return { status: "warning", detail: `${nonCanonical.length} non-canonical types`, nonCanonical };
    return { status: "ok", detail: "all types canonical" };
  });

  system.addCheck("frontmatter_completeness", () => {
    const indexDir = path.join(projectRoot, "data", "agent-index");
    let total = 0, missing = 0;
    function scan(dir) {
      try {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          if (item.isDirectory() && item.name !== "sub-colonies") scan(full);
          else if (item.isFile() && /^IX-\d+\.md$/.test(item.name)) {
            total++;
            const content = fs.readFileSync(full, "utf8");
            if (!content.startsWith("---") || !content.match(/^type:\s*.+$/m)) missing++;
          }
        }
      } catch (_) {}
    }
    scan(indexDir);
    if (missing > 0) return { status: "warning", detail: `${missing}/${total} missing frontmatter` };
    return { status: "ok", detail: `${total} files, all have frontmatter` };
  });

  system.addCheck("event_file_size", () => {
    const file = path.join(projectRoot, "data", "graph-runtime-events.ndjson");
    try {
      const stat = fs.statSync(file);
      const mb = Math.round(stat.size / 1024 / 1024);
      if (mb > 100) return { status: "critical", detail: `${mb} MB — needs rotation (max 100MB)` };
      if (mb > 50) return { status: "warning", detail: `${mb} MB — approaching rotation threshold` };
      return { status: "ok", detail: `${mb} MB` };
    } catch (_) { return { status: "ok", detail: "no event file" }; }
  });

  system.addCheck("index_orientation_budgets", () => {
    try {
      const { buildIndexBudgetReport } = require("./indexBudgetGuard");
      const report = buildIndexBudgetReport();
      const largest = report.summary?.largestType;
      const detailBase = largest
        ? `largest ${largest.type}:${largest.count}`
        : "no indexed documents";
      const effectiveSummary = report.overallEffective === "ok"
        ? "effective orientation ok"
        : `effective ${report.overallEffective}`;
      if (report.overall === "critical") {
        const names = (report.summary?.criticalTypes || []).join(", ");
        return { status: "critical", detail: `${report.summary?.criticalTypes?.length || 0} critical index budget types (${names}) — ${detailBase}; ${effectiveSummary}` };
      }
      if (report.overall === "warning") {
        const names = (report.summary?.warningTypes || []).join(", ");
        return { status: "warning", detail: `${report.summary?.warningTypes?.length || 0} warning index budget types (${names}) — ${detailBase}; ${effectiveSummary}` };
      }
      return { status: "ok", detail: `all index categories within orientation budgets — ${detailBase}` };
    } catch (e) {
      return { status: "warning", detail: `index budget report unavailable: ${e.message}` };
    }
  });

  system.addCheck("constitution_readable", () => {
    const config = detectColonyConfig();
    const constPath = path.join(projectRoot, "docs", "claude-project", "CONSTITUTION.md");
    try {
      const content = fs.readFileSync(constPath, "utf8");
      const sections = (content.match(/^##\s/gm) || []).length;
      return { status: "ok", detail: `${sections} sections readable` };
    } catch (_) {
      // Sub-colonies (LX-prefix) keep the constitution on the sovereign (IX-prefix).
      // Its absence on a sub-colony is expected, not a failure.
      if (!config.isSovereign) {
        return { status: "ok", detail: "sub-colony — constitution lives on sovereign" };
      }
      return { status: "warning", detail: "CONSTITUTION.md not found" };
    }
  });

  system.addCheck("vertex_never_autoselect", () => {
    const settingsPath = path.join(projectRoot, "data", "runtime-settings.json");
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      const autoSelect = settings.startupBrainAutoSelectEnabled;
      if (autoSelect === true) return { status: "critical", detail: "startupBrainAutoSelectEnabled is TRUE — vertex billing risk!" };
      return { status: "ok", detail: "auto-select disabled" };
    } catch (_) { return { status: "ok", detail: "settings file not found (safe default)" }; }
  });

  return system;
}

// ─── Factory: Build the FULL colony body (6 systems) ───

function buildColonyBody() {
  const body = new ColonyAnatomy();
  // Liris's 3 systems
  body.addSystem(createSkeletalSystem());
  body.addSystem(createMemorySystem());
  body.addSystem(createMuscularSystem());
  // Gaia's 3 systems
  body.addSystem(createNervousSystem());
  body.addSystem(createCirculatorySystem());
  body.addSystem(createImmuneSystem());

  // ─── AUTONOMIC REMEDIES ───
  // Things the body can heal by itself. Non-destructive only.

  // Remedy: ghost PIDs older than 24h → auto-despawn
  body.addRemedy("nervous", "pid_registry_health", (issue) => {
    try {
      const scb = require("./spawnContextBuilder");
      const reg = scb.readPidRegistry();
      let despawned = 0;
      for (const [role, entry] of Object.entries(reg.active)) {
        if (role === "liris") continue; // never despawn ourselves
        const age = Date.now() - new Date(entry.spawnedAt).getTime();
        if (age > 24 * 60 * 60 * 1000) {
          scb.despawnPid(role);
          despawned++;
        }
      }
      return `Despawned ${despawned} ghost PIDs`;
    } catch (e) { throw new Error("PID cleanup failed: " + e.message); }
  }, "Auto-despawn ghost PIDs older than 24h");

  // Remedy: catalog count drift → regenerate from disk
  body.addRemedy("skeletal", "index_disk_vs_catalog", (issue) => {
    const indexDir = path.join(projectRoot, "data", "agent-index");
    const catalogPath = path.join(indexDir, "CATALOG.md");
    const content = fs.readFileSync(catalogPath, "utf8");

    // Count actual files on disk
    const types = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity"];
    let totalDisk = 0;
    for (const t of types) {
      try {
        const files = fs.readdirSync(resolveTypeFolder(t)).filter(f => entryFilePattern().test(f));
        totalDisk += files.length;
      } catch (_) {}
    }

    // Find the highest LX number on disk
    let maxLx = 0;
    for (const t of types) {
      try {
        const files = fs.readdirSync(resolveTypeFolder(t)).filter(f => entryFilePattern().test(f));
        for (const f of files) {
          const m = f.match(/LX-(\d+)/);
          if (m) maxLx = Math.max(maxLx, parseInt(m[1]));
        }
      } catch (_) {}
    }

    // Update the catalog header
    let updated = content.replace(/Total:\s*\d+/, `Total: ${totalDisk}`);
    updated = updated.replace(/Next available:\s*LX-\d+/, `Next available: LX-${maxLx + 1}`);
    fs.writeFileSync(catalogPath, updated, "utf8");
    return `Updated catalog: Total=${totalDisk}, Next=LX-${maxLx + 1}`;
  }, "Auto-fix catalog count drift from disk reality");

  return body;
}

module.exports = {
  ColonyAnatomy,
  BodySystem,
  buildColonyBody,
  createSkeletalSystem,
  createMemorySystem,
  createMuscularSystem,
  createNervousSystem,
  createCirculatorySystem,
  createImmuneSystem
};
