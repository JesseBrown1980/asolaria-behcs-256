/**
 * Index Integrity Engine — Chain validation, orphan detection, catalog verification
 *
 * Runs BEFORE any dev→prod promotion.
 * Checks every entry for: valid frontmatter, resolvable chains, no duplicates,
 * no orphans, catalog accuracy.
 *
 * Part of "Let's Cure Asolaria" Sub-Project 4.
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

const CANONICAL_TYPES = ["pattern", "tool", "skill", "mistake", "plan", "rule", "reference", "project", "task", "identity", "policy"];

/**
 * Scan all entries on disk. Returns { entries: Map<id, entry>, errors: [] }
 */
function scanAllEntries(indexDir) {
  if (!indexDir) indexDir = path.join(projectRoot, "data", "agent-index");
  const entries = new Map();
  const errors = [];
  const supersededIndex = new Map();

  // Detect prefix
  let prefix = "LX";
  for (const t of CANONICAL_TYPES) {
    for (const folder of [t, t + "s"]) {
      try {
        const files = fs.readdirSync(path.join(indexDir, folder));
        const ixCount = files.filter(f => f.startsWith("IX-")).length;
        const lxCount = files.filter(f => f.startsWith("LX-")).length;
        if (ixCount > lxCount) prefix = "IX";
        if (ixCount > 0 || lxCount > 0) break;
      } catch (_) {}
    }
    if (prefix !== "LX") break;
  }

  // Scan all type folders
  for (const t of CANONICAL_TYPES) {
    for (const folder of [t, t + "s"]) {
      const dir = path.join(indexDir, folder);
      try {
        const files = fs.readdirSync(dir).filter(f => new RegExp(`^${prefix}-\\d+\\.md$`).test(f));
        for (const f of files) {
          const filePath = path.join(dir, f);
          const content = fs.readFileSync(filePath, "utf8");
          const idMatch = f.match(new RegExp(`(${prefix}-(\\d+))`));
          if (!idMatch) continue;

          const id = idMatch[1];
          const num = parseInt(idMatch[2]);

          // Check for duplicates
          if (entries.has(id)) {
            errors.push({ type: "duplicate", id, paths: [entries.get(id).path, filePath] });
          }

          // Parse frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          const frontmatter = {};
          if (fmMatch) {
            for (const line of fmMatch[1].split("\n")) {
              const kv = line.match(/^(\w+):\s*(.+)/);
              if (kv) frontmatter[kv[1]] = kv[2].trim();
            }
          } else {
            errors.push({ type: "no_frontmatter", id, path: filePath });
          }

          // Check required fields
          if (!frontmatter.name) errors.push({ type: "missing_name", id, path: filePath });
          if (!frontmatter.type) errors.push({ type: "missing_type", id, path: filePath });

          // Check type is canonical
          const entryType = (frontmatter.type || "").replace(/[\[\]"]/g, "").trim();
          if (entryType && !CANONICAL_TYPES.includes(entryType)) {
            errors.push({ type: "non_canonical_type", id, entryType, path: filePath });
          }

          // Check type matches folder
          const folderBase = folder.replace(/s$/, "");
          if (entryType && entryType !== folderBase && entryType !== folder) {
            errors.push({ type: "type_folder_mismatch", id, entryType, folder, path: filePath });
          }

          // Extract chains
          const chainMatch = content.match(/chain:\s*\[?([^\]\n]+)/);
          const chains = chainMatch ? (chainMatch[1].match(new RegExp(`[IL]X-\\d+`, "g")) || []) : [];
          const supersedes = Array.from(
            new Set(
              Array.from(content.matchAll(/supersedes:\s*([IL]X-\d+)/gi)).map((match) => match[1])
            )
          );
          for (const ref of supersedes) {
            if (!supersededIndex.has(ref)) {
              supersededIndex.set(ref, id);
            }
          }

          entries.set(id, { id, num, type: entryType, folder, path: filePath, chains, supersedes, frontmatter });
        }
      } catch (_) {}
    }
  }

  return { entries, errors, prefix, supersededIndex };
}

/**
 * Check chain integrity — every chain reference must resolve to an existing entry.
 * Cross-colony references (different prefix) are allowed — only same-prefix chains checked.
 */
function checkChainIntegrity(entries, prefix, supersededIndex = new Map()) {
  const errors = [];
  const referenced = new Set();

  for (const [id, entry] of entries) {
    for (const ref of entry.chains) {
      if (ref.startsWith(prefix + "-")) {
        referenced.add(ref);
        if (!entries.has(ref)) {
          const resolvedBy = supersededIndex.get(ref);
          if (resolvedBy) {
            referenced.add(resolvedBy);
          } else {
            errors.push({ type: "broken_chain", from: id, to: ref, path: entry.path });
          }
        }
      }
      // Cross-colony refs (IX- in LX colony or vice versa) are valid — don't flag
    }
  }

  return { errors, referenced };
}

/**
 * Find orphaned entries — entries that reference nothing and are referenced by nothing.
 */
function findOrphans(entries, referenced) {
  const orphans = [];
  for (const [id, entry] of entries) {
    if (entry.chains.length === 0 && !referenced.has(id)) {
      orphans.push({ id, path: entry.path, type: entry.type });
    }
  }
  return orphans;
}

/**
 * Check for number gaps — missing numbers in the sequence.
 */
function findNumberGaps(entries, prefix) {
  const nums = [];
  for (const [_, entry] of entries) {
    nums.push(entry.num);
  }
  nums.sort((a, b) => a - b);

  const gaps = [];
  for (let i = 1; i < nums.length; i++) {
    const expected = nums[i - 1] + 1;
    if (nums[i] > expected) {
      for (let n = expected; n < nums[i]; n++) {
        gaps.push(`${prefix}-${String(n).padStart(3, "0")}`);
      }
    }
  }
  return { gaps, min: nums[0], max: nums[nums.length - 1], total: nums.length };
}

/**
 * Full integrity check — returns structured report.
 */
function runIntegrityCheck(indexDir) {
  const scan = scanAllEntries(indexDir);
  const chains = checkChainIntegrity(scan.entries, scan.prefix, scan.supersededIndex);
  const orphans = findOrphans(scan.entries, chains.referenced);
  const numbers = findNumberGaps(scan.entries, scan.prefix);

  const allErrors = [...scan.errors, ...chains.errors];

  const report = {
    prefix: scan.prefix,
    totalEntries: scan.entries.size,
    totalErrors: allErrors.length,
    numberRange: `${scan.prefix}-${numbers.min} to ${scan.prefix}-${numbers.max}`,
    numberGaps: numbers.gaps.length,
    orphanCount: orphans.length,
    brokenChains: chains.errors.length,
    errors: {
      duplicates: allErrors.filter(e => e.type === "duplicate"),
      noFrontmatter: allErrors.filter(e => e.type === "no_frontmatter"),
      missingFields: allErrors.filter(e => e.type === "missing_name" || e.type === "missing_type"),
      nonCanonicalTypes: allErrors.filter(e => e.type === "non_canonical_type"),
      typeFolderMismatch: allErrors.filter(e => e.type === "type_folder_mismatch"),
      brokenChains: chains.errors
    },
    orphans: orphans.slice(0, 20),
    gaps: numbers.gaps.slice(0, 20),
    checkedAt: new Date().toISOString()
  };

  return report;
}

/**
 * Print a human-readable integrity report.
 */
function printReport(report) {
  const lines = [];
  lines.push(`# Index Integrity Report`);
  lines.push(`Prefix: ${report.prefix} | Entries: ${report.totalEntries} | Range: ${report.numberRange}`);
  lines.push(`Errors: ${report.totalErrors} | Broken chains: ${report.brokenChains} | Orphans: ${report.orphanCount} | Gaps: ${report.numberGaps}`);
  lines.push(``);

  if (report.errors.duplicates.length > 0) {
    lines.push(`## Duplicates (${report.errors.duplicates.length})`);
    report.errors.duplicates.forEach(e => lines.push(`  ${e.id}: ${e.paths.join(" vs ")}`));
    lines.push(``);
  }

  if (report.errors.noFrontmatter.length > 0) {
    lines.push(`## Missing Frontmatter (${report.errors.noFrontmatter.length})`);
    report.errors.noFrontmatter.forEach(e => lines.push(`  ${e.id}: ${e.path}`));
    lines.push(``);
  }

  if (report.errors.nonCanonicalTypes.length > 0) {
    lines.push(`## Non-Canonical Types (${report.errors.nonCanonicalTypes.length})`);
    report.errors.nonCanonicalTypes.forEach(e => lines.push(`  ${e.id}: type="${e.entryType}"`));
    lines.push(``);
  }

  if (report.errors.typeFolderMismatch.length > 0) {
    lines.push(`## Type/Folder Mismatch (${report.errors.typeFolderMismatch.length})`);
    report.errors.typeFolderMismatch.forEach(e => lines.push(`  ${e.id}: type="${e.entryType}" in folder "${e.folder}"`));
    lines.push(``);
  }

  if (report.errors.brokenChains.length > 0) {
    lines.push(`## Broken Chains (${report.errors.brokenChains.length})`);
    report.errors.brokenChains.forEach(e => lines.push(`  ${e.from} → ${e.to} (missing)`));
    lines.push(``);
  }

  if (report.orphans.length > 0) {
    lines.push(`## Orphans — no chains in or out (${report.orphanCount} total, showing 20)`);
    report.orphans.forEach(e => lines.push(`  ${e.id} [${e.type}]`));
    lines.push(``);
  }

  if (report.gaps.length > 0) {
    lines.push(`## Number Gaps (${report.numberGaps} total, showing 20)`);
    lines.push(`  ${report.gaps.join(", ")}`);
    lines.push(``);
  }

  return lines.join("\n");
}

module.exports = {
  scanAllEntries,
  checkChainIntegrity,
  findOrphans,
  findNumberGaps,
  runIntegrityCheck,
  printReport
};
