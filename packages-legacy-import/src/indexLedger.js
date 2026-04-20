/**
 * Index Ledger — Append-only entry management + promotion pipeline
 *
 * Sub-Project 2: Ledger format (append-only, never overwrite, generated catalogs)
 * Sub-Project 3: Promotion scripts (staging → dev → prod with integrity gates)
 *
 * Rules:
 *   - Entries are NEVER modified after creation (except adding superseded_by)
 *   - CATALOG.md files are always GENERATED, never hand-edited
 *   - Chain references must resolve at write time
 *   - Promotions require passing integrity checks
 *
 * Part of "Let's Cure Asolaria" Sub-Projects 2 & 3.
 * LX chain: LX-295, LX-291, LX-249
 */

const fs = require("fs");
const path = require("path");

let projectRoot;
try {
  projectRoot = require("./runtimePaths").projectRoot;
} catch (_) {
  projectRoot = path.resolve(__dirname, "..");
}

const { runIntegrityCheck, printReport } = require("./indexIntegrityEngine");

// Lazy-load colonyAnatomy only when needed (promoteToProd)
let _colonyAnatomy = null;
function getColonyAnatomy() {
  if (!_colonyAnatomy) {
    _colonyAnatomy = require("./colonyAnatomy");
  }
  return _colonyAnatomy;
}

// ─── Paths ───

const PROD_DIR = path.join(projectRoot, "data", "agent-index");
const STAGING_DIR = path.join(projectRoot, ".history", "staging");
const DEV_DIR = path.join(projectRoot, ".history", "dev");

const CANONICAL_TYPES = [
  "pattern", "tool", "skill", "mistake", "plan",
  "rule", "reference", "project", "task", "identity", "policy"
];

const ORIENTATION_PACK_LINKS = Object.freeze({
  pattern: ["PACKS.md", "POINTERS.md"],
  mistake: ["PACKS.md", "POINTERS.md"],
  plan: ["PACKS.md", "POINTERS.md"],
  rule: ["PACKS.md", "POINTERS.md"],
  skill: ["PACKS.md"],
  tool: ["PACKS.md"]
});

const PREFIX = "LX";

// ═══════════════════════════════════════════════════════════════
// SUB-PROJECT 2: LEDGER FORMAT
// ═══════════════════════════════════════════════════════════════

/**
 * Scan all type folders in a given index directory for the highest LX number.
 * Returns the next available number.
 */
function getNextId(indexDir) {
  if (!indexDir) indexDir = PROD_DIR;
  let highest = 0;

  for (const type of CANONICAL_TYPES) {
    const dir = path.join(indexDir, type);
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const m = f.match(/^LX-(\d+)\.md$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > highest) highest = num;
        }
      }
    } catch (_) {
      // Folder may not exist yet — that's fine
    }
  }

  // Also scan staging and dev so we never collide with in-flight entries
  for (const extraDir of [STAGING_DIR, DEV_DIR]) {
    for (const type of CANONICAL_TYPES) {
      const dir = path.join(extraDir, type);
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const m = f.match(/^LX-(\d+)\.md$/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > highest) highest = num;
          }
        }
      } catch (_) {}
    }
  }

  return highest + 1;
}

/**
 * Format an LX number as a zero-padded string (e.g., 7 → "007", 42 → "042", 300 → "300").
 */
function formatId(num) {
  return String(num).padStart(3, "0");
}

/**
 * Build frontmatter block from entry data.
 */
function buildFrontmatter(lxNum, name, type, tags, chain, extra) {
  const lines = ["---"];
  lines.push(`lx: ${formatId(lxNum)}`);
  lines.push(`name: ${name}`);
  lines.push(`type: ${type}`);

  if (Array.isArray(tags) && tags.length > 0) {
    lines.push(`tags: [${tags.join(", ")}]`);
  }

  if (Array.isArray(chain) && chain.length > 0) {
    lines.push(`chain: [${chain.join(", ")}]`);
  }

  lines.push(`agents: [liris]`);

  if (extra && typeof extra === "object") {
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`${k}: ${v}`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Validate that all same-prefix chain references resolve to existing entries.
 * Checks prod, staging, and dev directories.
 * Cross-colony references (IX-) are allowed without validation.
 */
function validateChains(chain, indexDir) {
  if (!chain || chain.length === 0) return { valid: true, broken: [] };

  const broken = [];
  const dirsToCheck = [indexDir || PROD_DIR, STAGING_DIR, DEV_DIR];

  for (const ref of chain) {
    // Only validate same-prefix (LX-) references
    if (!ref.startsWith(PREFIX + "-")) continue;

    const numMatch = ref.match(/^LX-(\d+)$/);
    if (!numMatch) {
      broken.push({ ref, reason: "malformed reference" });
      continue;
    }

    const filename = `${ref}.md`;
    let found = false;

    for (const baseDir of dirsToCheck) {
      for (const type of CANONICAL_TYPES) {
        const filePath = path.join(baseDir, type, filename);
        if (fs.existsSync(filePath)) {
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      broken.push({ ref, reason: "entry does not exist in prod, staging, or dev" });
    }
  }

  return { valid: broken.length === 0, broken };
}

/**
 * Append a new entry to the index. NEVER overwrites an existing file.
 *
 * @param {string} type - One of CANONICAL_TYPES
 * @param {string} name - Human-readable entry name
 * @param {string[]} tags - Tag array
 * @param {string[]} chain - Chain references (e.g., ["LX-001", "IX-009"])
 * @param {string} content - Markdown body (everything after frontmatter)
 * @param {object} [options] - { indexDir, extraFrontmatter, skipChainValidation }
 * @returns {{ id: string, num: number, path: string }}
 */
function appendEntry(type, name, tags, chain, content, options = {}) {
  const indexDir = options.indexDir || PROD_DIR;

  // Validate type
  if (!CANONICAL_TYPES.includes(type)) {
    throw new Error(`Non-canonical type: "${type}". Must be one of: ${CANONICAL_TYPES.join(", ")}`);
  }

  // Validate name
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Entry name is required and must be a non-empty string.");
  }

  // Validate chain references resolve (unless explicitly skipped)
  if (!options.skipChainValidation) {
    const chainCheck = validateChains(chain, indexDir);
    if (!chainCheck.valid) {
      const details = chainCheck.broken.map(b => `${b.ref} (${b.reason})`).join(", ");
      throw new Error(`Broken chain references: ${details}. Fix chains or pass skipChainValidation.`);
    }
  }

  // Get next ID
  const num = getNextId(indexDir);
  const id = `${PREFIX}-${formatId(num)}`;
  const filename = `${id}.md`;

  // Ensure type folder exists
  const typeDir = path.join(indexDir, type);
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }

  const filePath = path.join(typeDir, filename);

  // NEVER overwrite
  if (fs.existsSync(filePath)) {
    throw new Error(`LEDGER VIOLATION: ${filePath} already exists. Append-only — cannot overwrite.`);
  }

  // Build file content
  const frontmatter = buildFrontmatter(num, name, type, tags, chain, options.extraFrontmatter);
  const heading = `\n\n# ${name}\n\n`;
  const body = content || "";
  const fileContent = frontmatter + heading + body + "\n";

  fs.writeFileSync(filePath, fileContent, "utf8");

  return { id, num, path: filePath, type };
}

/**
 * Mark an entry as superseded by another entry.
 * This is the ONLY mutation allowed on an existing entry.
 * Adds `superseded_by: <newId>` and `superseded_reason: <reason>` to frontmatter.
 *
 * @param {string} oldId - e.g., "LX-042"
 * @param {string} newId - e.g., "LX-296"
 * @param {string} reason - Why it was superseded
 * @param {string} [indexDir] - Directory to search
 */
function supersede(oldId, newId, reason, indexDir) {
  if (!indexDir) indexDir = PROD_DIR;

  // Find the old entry
  const filename = `${oldId}.md`;
  let filePath = null;

  for (const type of CANONICAL_TYPES) {
    const candidate = path.join(indexDir, type, filename);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    throw new Error(`Cannot supersede: ${oldId} not found in ${indexDir}`);
  }

  // Verify the new entry exists somewhere
  const newFilename = `${newId}.md`;
  let newExists = false;
  for (const dir of [indexDir, STAGING_DIR, DEV_DIR]) {
    for (const type of CANONICAL_TYPES) {
      if (fs.existsSync(path.join(dir, type, newFilename))) {
        newExists = true;
        break;
      }
    }
    if (newExists) break;
  }
  if (!newExists) {
    throw new Error(`Cannot supersede: replacement ${newId} does not exist.`);
  }

  const content = fs.readFileSync(filePath, "utf8");

  // Check if already superseded
  if (content.includes("superseded_by:")) {
    throw new Error(`${oldId} is already superseded. Entries are immutable.`);
  }

  // Insert superseded_by before the closing ---
  const updated = content.replace(
    /^(---\n[\s\S]*?)(---)/m,
    `$1superseded_by: ${newId}\nsuperseded_reason: ${reason}\n$2`
  );

  if (updated === content) {
    throw new Error(`Failed to update frontmatter for ${oldId}. Malformed frontmatter?`);
  }

  fs.writeFileSync(filePath, updated, "utf8");
  return { oldId, newId, reason, path: filePath };
}

/**
 * Generate a CATALOG.md for a single type folder from entries on disk.
 * This is a VIEW — always generated, never hand-edited.
 *
 * @param {string} type - One of CANONICAL_TYPES
 * @param {string} [indexDir] - Directory to scan
 * @returns {string} The generated catalog content
 */
function generateCatalog(type, indexDir) {
  if (!indexDir) indexDir = PROD_DIR;
  const typeDir = path.join(indexDir, type);

  if (!fs.existsSync(typeDir)) {
    return `# ${capitalize(type)} Catalog\n\nNo entries.\n`;
  }

  const files = fs.readdirSync(typeDir).filter(f => /^LX-\d+\.md$/.test(f)).sort((a, b) => {
    const na = parseInt(a.match(/(\d+)/)[1], 10);
    const nb = parseInt(b.match(/(\d+)/)[1], 10);
    return na - nb;
  });

  const rows = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(typeDir, f), "utf8");
    const entry = parseFrontmatter(content);

    const lxNum = entry.lx || f.replace(/^LX-/, "").replace(/\.md$/, "");
    const name = entry.name || "(unnamed)";
    const chainRaw = entry.chain || "";
    const superseded = entry.superseded_by ? ` [SUPERSEDED by ${entry.superseded_by}]` : "";

    // Format chain for display: strip brackets, keep refs
    const chain = chainRaw.replace(/^\[/, "").replace(/\]$/, "").trim();
    const chainDisplay = chain ? chain.split(",").map(c => c.trim()).map(c => `${c}`).join(", ") : "";

    rows.push(`| ${lxNum} | ${name}${superseded} | ${chainDisplay} |`);
  }

  const orientationLinks = Array.isArray(ORIENTATION_PACK_LINKS[type])
    ? ORIENTATION_PACK_LINKS[type]
    : ORIENTATION_PACK_LINKS[type]
      ? [ORIENTATION_PACK_LINKS[type]]
      : [];

  const lines = [
    `# ${capitalize(type)} Catalog`,
    ``,
    `> Auto-generated by indexLedger. Do NOT hand-edit.`,
    `> ${files.length} entries. Generated: ${new Date().toISOString().split("T")[0]}`,
    ...(orientationLinks.length > 0
      ? [`> Orientation packs: ${orientationLinks.map((link) => `[${link}](${link})`).join(" · ")}`, ""]
      : []),
    ``,
    `| LX | Name | Chain |`,
    `|----|------|-------|`,
    ...rows,
    ``
  ];

  const catalogContent = lines.join("\n");
  const catalogPath = path.join(typeDir, "CATALOG.md");
  fs.writeFileSync(catalogPath, catalogContent, "utf8");

  return catalogContent;
}

/**
 * Generate the root CATALOG.md (master router) from all type folders.
 *
 * @param {string} [indexDir] - Directory to scan
 * @returns {string} The generated master catalog content
 */
function generateMasterCatalog(indexDir) {
  if (!indexDir) indexDir = PROD_DIR;

  const typeCounts = [];
  let totalEntries = 0;
  let highestNum = 0;

  for (const type of CANONICAL_TYPES) {
    const typeDir = path.join(indexDir, type);
    try {
      const files = fs.readdirSync(typeDir).filter(f => /^LX-\d+\.md$/.test(f));
      if (files.length > 0) {
        typeCounts.push({ type, count: files.length });
        totalEntries += files.length;

        for (const f of files) {
          const num = parseInt(f.match(/(\d+)/)[1], 10);
          if (num > highestNum) highestNum = num;
        }
      }
    } catch (_) {}
  }

  const nextId = highestNum + 1;

  const lines = [
    `# Liris Sub-Colony Index — Router`,
    ``,
    `> Auto-generated by indexLedger. Do NOT hand-edit.`,
    ``,
    `Scoped to: **Liris** (DESKTOP-PTSQTIE, 192.168.15.170, Rayssa)`,
    `Prefix: **LX-** (Liris indeX)`,
    `Sovereign catalog link: \`192.168.1.3 → data/agent-index/CATALOG.md\` (IX- prefix)`,
    ``,
    `Total: ${totalEntries} entries across ${typeCounts.length} types.`,
    ``,
    `| Type | Count | Catalog |`,
    `|------|-------|---------|`,
  ];

  for (const { type, count } of typeCounts) {
    lines.push(`| ${type} | ${count} | [${type}/CATALOG.md](${type}/CATALOG.md) |`);
  }

  lines.push(``);
  lines.push(`## Next available: LX-${formatId(nextId)}`);
  lines.push(``);
  lines.push(`## Search`);
  lines.push(``);
  lines.push(`For full-text search, use grep across type folders.`);
  lines.push(`For chain navigation, each type CATALOG includes chain references.`);
  lines.push(`Reverse lookup: search Chain column for your LX number to find what leads TO you.`);
  lines.push(``);
  lines.push(`## Chains`);
  lines.push(`All chain definitions: [CHAINS.md](CHAINS.md)`);
  lines.push(``);

  const catalogContent = lines.join("\n");
  const catalogPath = path.join(indexDir, "CATALOG.md");
  fs.writeFileSync(catalogPath, catalogContent, "utf8");

  return catalogContent;
}

// ═══════════════════════════════════════════════════════════════
// SUB-PROJECT 3: PROMOTION SCRIPTS
// ═══════════════════════════════════════════════════════════════

/**
 * Promote a new entry to staging. Writes to .history/staging/<type>/.
 * This is the FIRST step — entry lands in staging for review.
 *
 * @param {string} type - One of CANONICAL_TYPES
 * @param {string} name - Entry name
 * @param {string[]} tags - Tags
 * @param {string[]} chain - Chain refs
 * @param {string} content - Markdown body
 * @param {object} [options] - Extra options passed to appendEntry
 * @returns {{ id, num, path, type }}
 */
function promoteToStaging(type, name, tags, chain, content, options = {}) {
  // Write to staging directory
  return appendEntry(type, name, tags, chain, content, {
    ...options,
    indexDir: STAGING_DIR
  });
}

/**
 * Promote staging entries to dev.
 * Runs integrity check on staging. Only entries that pass move to dev.
 *
 * @returns {{ promoted: string[], rejected: string[], report: object }}
 */
function promoteToDev() {
  // Run integrity check on staging
  const report = runIntegrityCheck(STAGING_DIR);

  // If there are critical errors (broken chains, duplicates, missing frontmatter),
  // reject the promotion
  const criticalErrors = [
    ...report.errors.duplicates,
    ...report.errors.noFrontmatter,
    ...report.errors.missingFields,
    ...report.errors.brokenChains
  ];

  const promoted = [];
  const rejected = [];

  // Scan staging entries
  for (const type of CANONICAL_TYPES) {
    const stagingTypeDir = path.join(STAGING_DIR, type);
    const devTypeDir = path.join(DEV_DIR, type);

    try {
      const files = fs.readdirSync(stagingTypeDir).filter(f => /^LX-\d+\.md$/.test(f));

      for (const f of files) {
        const id = f.replace(/\.md$/, "");
        const srcPath = path.join(stagingTypeDir, f);

        // Check if THIS entry has any critical errors
        const entryErrors = criticalErrors.filter(e =>
          e.id === id || e.from === id
        );

        if (entryErrors.length > 0) {
          rejected.push({
            id,
            path: srcPath,
            errors: entryErrors.map(e => `${e.type}: ${JSON.stringify(e)}`)
          });
          continue;
        }

        // Create dev type folder if needed
        if (!fs.existsSync(devTypeDir)) {
          fs.mkdirSync(devTypeDir, { recursive: true });
        }

        const destPath = path.join(devTypeDir, f);

        // NEVER overwrite in dev
        if (fs.existsSync(destPath)) {
          rejected.push({
            id,
            path: srcPath,
            errors: [`already_exists: ${destPath} — ledger violation`]
          });
          continue;
        }

        // Copy to dev
        fs.copyFileSync(srcPath, destPath);
        promoted.push(id);

        // Remove from staging after successful copy
        fs.unlinkSync(srcPath);
      }
    } catch (_) {
      // Type folder doesn't exist in staging — that's fine
    }
  }

  return { promoted, rejected, report };
}

/**
 * Promote dev entries to prod.
 * Runs FULL integrity check + colony anatomy diagnostic on dev.
 * Only proceeds if both pass.
 *
 * @returns {{ promoted: string[], rejected: string[], integrityReport: object, anatomyReport: object|null }}
 */
async function promoteToProd() {
  // Step 1: Run integrity check on dev
  const integrityReport = runIntegrityCheck(DEV_DIR);

  const criticalErrors = [
    ...integrityReport.errors.duplicates,
    ...integrityReport.errors.noFrontmatter,
    ...integrityReport.errors.missingFields,
    ...integrityReport.errors.brokenChains
  ];

  if (criticalErrors.length > 0) {
    return {
      promoted: [],
      rejected: criticalErrors.map(e => e.id || e.from),
      integrityReport,
      anatomyReport: null,
      blocked: true,
      reason: `${criticalErrors.length} critical integrity errors in dev. Run printReport(integrityReport) for details.`
    };
  }

  // Step 2: Run colony anatomy diagnostic
  let anatomyReport = null;
  try {
    const { buildColonyBody } = getColonyAnatomy();
    const body = buildColonyBody();
    anatomyReport = await body.diagnoseAll();

    if (anatomyReport.overall === "critical") {
      return {
        promoted: [],
        rejected: [],
        integrityReport,
        anatomyReport,
        blocked: true,
        reason: `Colony anatomy reports CRITICAL status. Fix issues before promoting to prod.`
      };
    }
  } catch (err) {
    // Colony anatomy is advisory — log but don't block
    anatomyReport = { error: err.message, skipped: true };
  }

  // Step 3: Copy entries from dev to prod
  const promoted = [];
  const rejected = [];

  for (const type of CANONICAL_TYPES) {
    const devTypeDir = path.join(DEV_DIR, type);
    const prodTypeDir = path.join(PROD_DIR, type);

    try {
      const files = fs.readdirSync(devTypeDir).filter(f => /^LX-\d+\.md$/.test(f));

      for (const f of files) {
        const id = f.replace(/\.md$/, "");
        const srcPath = path.join(devTypeDir, f);

        // Ensure prod type folder exists
        if (!fs.existsSync(prodTypeDir)) {
          fs.mkdirSync(prodTypeDir, { recursive: true });
        }

        const destPath = path.join(prodTypeDir, f);

        // NEVER overwrite in prod
        if (fs.existsSync(destPath)) {
          rejected.push({
            id,
            path: srcPath,
            errors: [`already_exists: ${destPath} — ledger violation, entry already in prod`]
          });
          continue;
        }

        // Copy to prod
        fs.copyFileSync(srcPath, destPath);
        promoted.push(id);
      }
    } catch (_) {}
  }

  // Step 4: Regenerate all catalogs in prod
  if (promoted.length > 0) {
    for (const type of CANONICAL_TYPES) {
      const typeDir = path.join(PROD_DIR, type);
      if (fs.existsSync(typeDir)) {
        const hasEntries = fs.readdirSync(typeDir).some(f => /^LX-\d+\.md$/.test(f));
        if (hasEntries) {
          generateCatalog(type, PROD_DIR);
        }
      }
    }
    generateMasterCatalog(PROD_DIR);
  }

  return { promoted, rejected, integrityReport, anatomyReport };
}

/**
 * Rollback prod to the state in dev.
 * Copies all dev entries back to prod, overwriting if necessary.
 * This is the emergency escape hatch.
 *
 * @returns {{ restored: string[], report: string }}
 */
function rollback() {
  const restored = [];
  const errors = [];

  for (const type of CANONICAL_TYPES) {
    const devTypeDir = path.join(DEV_DIR, type);
    const prodTypeDir = path.join(PROD_DIR, type);

    try {
      const files = fs.readdirSync(devTypeDir).filter(f => /^LX-\d+\.md$/.test(f));

      for (const f of files) {
        const srcPath = path.join(devTypeDir, f);

        if (!fs.existsSync(prodTypeDir)) {
          fs.mkdirSync(prodTypeDir, { recursive: true });
        }

        const destPath = path.join(prodTypeDir, f);

        try {
          fs.copyFileSync(srcPath, destPath);
          restored.push(f.replace(/\.md$/, ""));
        } catch (err) {
          errors.push({ file: f, error: err.message });
        }
      }
    } catch (_) {}
  }

  // Regenerate catalogs after rollback
  if (restored.length > 0) {
    for (const type of CANONICAL_TYPES) {
      const typeDir = path.join(PROD_DIR, type);
      if (fs.existsSync(typeDir)) {
        const hasEntries = fs.readdirSync(typeDir).some(f => /^LX-\d+\.md$/.test(f));
        if (hasEntries) {
          generateCatalog(type, PROD_DIR);
        }
      }
    }
    generateMasterCatalog(PROD_DIR);
  }

  return {
    restored,
    errors,
    report: errors.length === 0
      ? `Rollback complete: ${restored.length} entries restored from dev to prod. Catalogs regenerated.`
      : `Rollback partial: ${restored.length} restored, ${errors.length} failed. Check errors array.`
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Parse YAML-ish frontmatter from a markdown file.
 * Returns a flat key→value object.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_]*?):\s*(.+)/);
    if (kv) {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return fm;
}

/**
 * Capitalize first letter.
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Sub-Project 2: Ledger format
  appendEntry,
  supersede,
  getNextId,
  generateCatalog,
  generateMasterCatalog,
  validateChains,

  // Sub-Project 3: Promotion pipeline
  promoteToStaging,
  promoteToDev,
  promoteToProd,
  rollback,

  // Helpers (exposed for testing)
  buildFrontmatter,
  parseFrontmatter,
  formatId,

  // Constants (exposed for testing)
  PROD_DIR,
  STAGING_DIR,
  DEV_DIR,
  CANONICAL_TYPES,
  PREFIX
};
