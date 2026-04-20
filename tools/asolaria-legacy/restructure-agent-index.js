#!/usr/bin/env node
/**
 * Agent Index Restructure — Phases 1 & 2
 * Creates type subdirectories, copies IX files, generates type catalogs.
 * Safe: copies only, never moves or deletes originals.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "data", "agent-index");
const TYPE_FOLDERS = ["skills", "patterns", "mistakes", "tools", "plans", "references", "rules", "policies"];

// Map frontmatter type values to folder names
const TYPE_MAP = {
  skill: "skills",
  pattern: "patterns",
  mistake: "mistakes",
  tool: "tools",
  plan: "plans",
  reference: "references",
  rule: "rules",
  policy: "policies",
  // Edge cases
  implementation: "patterns",
  blocker: "mistakes",
  feedback: "rules"
};

function parseFrontMatter(text) {
  if (!text.startsWith("---")) return { attrs: {}, body: text };
  const marker = text.indexOf("\n---", 3);
  if (marker < 0) return { attrs: {}, body: text };
  const fm = text.slice(3, marker).trim();
  const body = text.slice(marker + 4).trim();
  const attrs = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (m) attrs[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { attrs, body };
}

function parseCatalogRow(line) {
  const m = line.match(/^\|\s*(\d{1,4})\s*\|/);
  if (!m) return null;
  const parts = line.split("|").map(s => s.trim());
  if (parts.length < 8) return null;
  return {
    ix: `IX-${String(m[1]).padStart(3, "0")}`,
    ixNum: parseInt(m[1], 10),
    name: parts[2] || "",
    type: parts[3] || "",
    tags: parts[4] || "",
    chain: parts[5] || "",
    agents: parts[6] || "",
    raw: line
  };
}

// --- Phase 1: Create structure ---
console.log("=== Phase 1: Create structure ===");

// Create type subdirectories
for (const folder of TYPE_FOLDERS) {
  const dir = path.join(ROOT, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created: ${folder}/`);
  } else {
    console.log(`  Exists: ${folder}/`);
  }
}

// Read CATALOG.md
const catalogRaw = fs.readFileSync(path.join(ROOT, "CATALOG.md"), "utf8");
const catalogLines = catalogRaw.split(/\r?\n/);

// Parse all catalog rows
const catalogRows = [];
const catalogRowMap = new Map();
for (const line of catalogLines) {
  const row = parseCatalogRow(line);
  if (row) {
    catalogRows.push(row);
    catalogRowMap.set(row.ix, row);
  }
}
console.log(`  Parsed ${catalogRows.length} catalog rows`);

// Extract BOOT-CRITICAL section
const bootLines = [];
let inBoot = false;
for (const line of catalogLines) {
  if (line.includes("BOOT-CRITICAL") && line.startsWith("##")) { inBoot = true; continue; }
  if (inBoot && line.startsWith("##")) break;
  if (inBoot && line.startsWith("Search by IX")) break;
  if (inBoot) bootLines.push(line);
}
// Also grab the boot-critical table rows from the top
const bootCriticalEntries = catalogLines.filter(l =>
  l.startsWith("| IX-30") && l.includes("BOOT-CRITICAL") ||
  l.includes("**THE ACTUAL STARTUP COMMAND") ||
  l.includes("**ENCRYPTION BEFORE CONNECTION") ||
  l.includes("**FALLBACK") ||
  l.includes("**SKILL — WhatsApp ADB Send")
).filter(l => l.startsWith("|"));

const bootCriticalContent = `# BOOT-CRITICAL — READ BEFORE ANY STARTUP ATTEMPT

${catalogLines.slice(2, 8).join("\n")}

## Boot-Critical Entries

| IX | Name | Type | Tags | Chain | Agents |
|----|------|------|------|-------|--------|
${catalogRows.filter(r => ["308", "309", "310", "311"].includes(String(r.ixNum))).map(r => r.raw).join("\n")}

## Quick Reference
- IX-309: THE startup command. Kill stale, MQTT bind, node server.js, health check.
- IX-308: Encryption BEFORE connection. Plaintext = SILENCE.
- IX-310: Stale firewall IPs break federation silently.
- IX-311: WhatsApp ADB Send — zero-server agent comms.
`;

fs.writeFileSync(path.join(ROOT, "BOOT-CRITICAL.md"), bootCriticalContent, "utf8");
console.log("  Created: BOOT-CRITICAL.md");

// Extract all chain definitions
const chainLines = [];
let inChains = false;
for (const line of catalogLines) {
  if (line.startsWith("## Chains") || line.match(/^\*\*.*chain[:\s]/i)) {
    inChains = true;
  }
  if (line.match(/^\*\*.*chain.*:\*\*/i) || (inChains && line.startsWith("> "))) {
    chainLines.push(line);
  }
}

// Also grab all chain definitions scattered through the catalog
const allChainDefs = [];
for (let i = 0; i < catalogLines.length; i++) {
  const line = catalogLines[i];
  if (line.match(/^\*\*.*chain.*:\*\*/i) || line.match(/^\*\*.*chain \(.*\):\*\*/i)) {
    allChainDefs.push(line);
    // Grab the description line (usually next line starting with >)
    if (i + 1 < catalogLines.length && catalogLines[i + 1].startsWith("> ")) {
      allChainDefs.push(catalogLines[i + 1]);
    }
    allChainDefs.push("");
  }
}

const chainsContent = `# Chain Definitions

All chain definitions from the Agent Index. Follow chains to activate related knowledge.

${allChainDefs.join("\n")}
`;

fs.writeFileSync(path.join(ROOT, "CHAINS.md"), chainsContent, "utf8");
console.log(`  Created: CHAINS.md (${allChainDefs.filter(l => l.match(/chain/i)).length} chains)`);

// --- Phase 2: Copy IX files to type folders ---
console.log("\n=== Phase 2: Copy IX files to type folders ===");

// Read all IX files and classify
const ixFiles = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isFile() && /^IX-\d{3,4}\.md$/i.test(e.name))
  .map(e => e.name);

const typeCounts = {};
const typeEntries = {}; // folder -> [{ix, name, type, tags, chain, agents, filename}]
for (const folder of TYPE_FOLDERS) {
  typeCounts[folder] = 0;
  typeEntries[folder] = [];
}

let copied = 0;
let skipped = 0;
let unmapped = 0;

for (const filename of ixFiles) {
  const srcPath = path.join(ROOT, filename);
  const raw = fs.readFileSync(srcPath, "utf8");
  const { attrs } = parseFrontMatter(raw);
  const ixId = attrs.ix || filename.replace(/\.md$/i, "");
  const normalizedIx = `IX-${String(ixId.match(/(\d+)/)?.[1] || "0").padStart(3, "0")}`;

  // Get type from frontmatter, fallback to catalog
  let type = (attrs.type || "").toLowerCase().trim();
  if (!type) {
    const catRow = catalogRowMap.get(normalizedIx);
    if (catRow) type = catRow.type.toLowerCase().trim();
  }

  const folder = TYPE_MAP[type];
  if (!folder) {
    console.log(`  WARN: No mapping for type "${type}" in ${filename} — defaulting to references`);
    unmapped++;
    const destPath = path.join(ROOT, "references", filename);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
    typeCounts["references"]++;
    const catRow = catalogRowMap.get(normalizedIx);
    typeEntries["references"].push({
      ix: normalizedIx,
      name: attrs.name || (catRow && catRow.name) || "",
      type: type || "reference",
      tags: attrs.tags || (catRow && catRow.tags) || "",
      chain: attrs.chain || (catRow && catRow.chain) || "",
      agents: (catRow && catRow.agents) || "all",
      filename
    });
    continue;
  }

  const destPath = path.join(ROOT, folder, filename);
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
    copied++;
  } else {
    skipped++;
  }
  typeCounts[folder]++;

  const catRow = catalogRowMap.get(normalizedIx);
  typeEntries[folder].push({
    ix: normalizedIx,
    name: attrs.name || (catRow && catRow.name) || "",
    type: type,
    tags: attrs.tags || (catRow && catRow.tags) || "",
    chain: attrs.chain || (catRow && catRow.chain) || "",
    agents: (catRow && catRow.agents) || "all",
    filename
  });
}

console.log(`  Copied: ${copied}, Already existed: ${skipped}, Unmapped: ${unmapped}`);
console.log("  Distribution:", typeCounts);

// Generate type catalogs
console.log("\n=== Generating type catalogs ===");

for (const folder of TYPE_FOLDERS) {
  const entries = typeEntries[folder];
  if (entries.length === 0) continue;

  // Sort by IX number
  entries.sort((a, b) => {
    const na = parseInt(a.ix.match(/(\d+)/)?.[1] || "0", 10);
    const nb = parseInt(b.ix.match(/(\d+)/)?.[1] || "0", 10);
    return na - nb;
  });

  const catalogName = `CATALOG-${folder.toUpperCase()}.md`;
  const isSkills = folder === "skills";

  const header = isSkills
    ? "| IX | Name | Type | Tags | Chain | Agents | PID | Device Binding |"
    : "| IX | Name | Type | Tags | Chain | Agents |";
  const sep = isSkills
    ? "|----|------|------|------|-------|--------|-----|----------------|"
    : "|----|------|------|------|-------|--------|";

  const rows = entries.map(e => {
    const base = `| ${e.ix.replace("IX-", "")} | ${e.name} | ${e.type} | ${e.tags} | ${e.chain} | ${e.agents} |`;
    return isSkills ? `${base} — | — |` : base;
  });

  const content = `# ${folder.charAt(0).toUpperCase() + folder.slice(1)} Catalog

${entries.length} entries. Search by IX number, type, tag, or keyword.

${header}
${sep}
${rows.join("\n")}
`;

  fs.writeFileSync(path.join(ROOT, folder, catalogName), content, "utf8");
  console.log(`  ${catalogName}: ${entries.length} entries`);
}

// Verify copies match originals
console.log("\n=== Verification ===");
let verifyOk = 0;
let verifyFail = 0;
for (const folder of TYPE_FOLDERS) {
  const folderPath = path.join(ROOT, folder);
  if (!fs.existsSync(folderPath)) continue;
  const files = fs.readdirSync(folderPath).filter(f => /^IX-\d{3,4}\.md$/i.test(f));
  for (const file of files) {
    const orig = path.join(ROOT, file);
    const copy = path.join(folderPath, file);
    if (fs.existsSync(orig)) {
      const origContent = fs.readFileSync(orig, "utf8");
      const copyContent = fs.readFileSync(copy, "utf8");
      if (origContent === copyContent) {
        verifyOk++;
      } else {
        verifyFail++;
        console.log(`  MISMATCH: ${folder}/${file}`);
      }
    }
  }
}
console.log(`  Verified: ${verifyOk} OK, ${verifyFail} mismatches`);

console.log("\n=== Phase 1-2 Complete ===");
console.log("Original files untouched. Type folders populated. Ready for Phase 3.");
