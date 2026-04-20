#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "data", "agent-index");
const SUBCOLONIES_ROOT = path.join(ROOT, "sub-colonies");
const MAX_LINES = clampInt(process.argv[2], 48, 35, 60);
const ROOT_TYPE_DIRS = [
  "skills",
  "patterns",
  "mistakes",
  "tools",
  "plans",
  "references",
  "rules",
  "policies",
  "tasks"
];
const TYPE_LABELS = new Map([
  ["skills", "Skills"],
  ["patterns", "Patterns"],
  ["mistakes", "Mistakes"],
  ["tools", "Tools"],
  ["plans", "Plans"],
  ["references", "References"],
  ["rules", "Rules"],
  ["policies", "Policies"],
  ["tasks", "Tasks"]
]);
const ROOT_DOC_LINKS = [
  "BOOT-CRITICAL.md",
  "CHAINS.md",
  "PID-REGISTRY.md",
  "XREF.md",
  "XREF-COLONIES.md",
  "CATALOG-TASKS.md"
];

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return String(fs.readFileSync(filePath, "utf8") || "");
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${String(text || "").replace(/\r/g, "").trimEnd()}\n`, "utf8");
}

function countLines(text) {
  const normalized = String(text || "").replace(/\r/g, "").trimEnd();
  if (!normalized) return 0;
  return normalized.split("\n").length;
}

function cleanLine(text) {
  return String(text || "").replace(/\r/g, "").trim();
}

function isIndexEntryFileName(name) {
  return /^(IX|LX|FX)-\d{1,4}(?:[^\\/]+)?\.md$/i.test(String(name || ""));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function listRootEntryFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isIndexEntryFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function countTypedEntries(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isIndexEntryFileName(entry.name))
    .length;
}

function collectPipeRows(lines) {
  const rows = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || ""))
    .filter((line) => /^\|/.test(cleanLine(line)));
  if (rows.length >= 2 && /\|\s*(Entry|ID|Chunk|Type|Section|Doc)\s*\|/i.test(rows[0]) && /\|[-\s|]+\|/.test(rows[1])) {
    return rows.slice(2);
  }
  return rows;
}

function normalizeListValue(value) {
  const text = cleanLine(value).replace(/^\[|\]$/g, "");
  if (!text) return [];
  return text
    .split(",")
    .map((part) => cleanLine(part.replace(/^["']|["']$/g, "")))
    .filter(Boolean);
}

function parseFrontMatter(text) {
  const source = String(text || "");
  if (!source.startsWith("---")) {
    return {};
  }
  const marker = source.indexOf("\n---", 3);
  if (marker < 0) {
    return {};
  }
  const out = {};
  for (const line of source.slice(3, marker).trim().split(/\r?\n/g)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    out[String(match[1] || "").trim().toLowerCase()] = String(match[2] || "").trim();
  }
  return out;
}

function extractTitle(lines, fallback) {
  const heading = lines.find((line) => /^#\s+/.test(line));
  return heading ? cleanLine(heading.replace(/^#\s+/, "")) : fallback;
}

function extractTable(lines, startIndex = 0) {
  let headerIndex = -1;
  for (let index = Math.max(0, startIndex); index < lines.length; index += 1) {
    if (/^\|/.test(cleanLine(lines[index] || ""))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0 || headerIndex + 1 >= lines.length) {
    return null;
  }
  const header = lines[headerIndex];
  const separator = lines[headerIndex + 1];
  const rows = [];
  let cursor = headerIndex + 2;
  while (cursor < lines.length && /^\|/.test(cleanLine(lines[cursor] || ""))) {
    rows.push(lines[cursor]);
    cursor += 1;
  }
  return {
    header,
    separator,
    rows,
    startIndex: headerIndex,
    endIndex: cursor - 1
  };
}

function findSection(lines, heading) {
  const start = lines.findIndex((line) => cleanLine(line) === heading);
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(cleanLine(lines[index] || ""))) {
      end = index;
      break;
    }
  }
  return {
    start,
    end,
    lines: lines.slice(start, end)
  };
}

function parsePrimaryCell(row) {
  const match = String(row || "").match(/^\|\s*([^|]+?)\s*\|/);
  return match ? cleanLine(match[1]) : "";
}

function extractNumericId(cell) {
  const match = String(cell || "").match(/(\d{1,4})/);
  return match ? Number(match[1]) : null;
}

function describeRange(rows) {
  const first = parsePrimaryCell(rows[0] || "");
  const last = parsePrimaryCell(rows[rows.length - 1] || "");
  if (!first && !last) return "";
  if (first && last && first !== last) return `${first} -> ${last}`;
  return first || last;
}

function splitRowsByEra(rows, maxRowsPerChunk) {
  const eras = new Map();
  const fallback = [];
  for (const row of rows) {
    const numericId = extractNumericId(parsePrimaryCell(row));
    if (!Number.isFinite(numericId)) {
      fallback.push(row);
      continue;
    }
    const era = Math.floor((numericId - 1) / 100) + 1;
    if (!eras.has(era)) eras.set(era, []);
    eras.get(era).push(row);
  }

  const chunks = [];
  for (const era of Array.from(eras.keys()).sort((left, right) => left - right)) {
    const eraRows = eras.get(era) || [];
    if (eraRows.length <= maxRowsPerChunk) {
      chunks.push({
        label: `Era ${era}`,
        rows: eraRows.slice()
      });
      continue;
    }
    let partIndex = 0;
    for (let cursor = 0; cursor < eraRows.length; cursor += maxRowsPerChunk) {
      const partRows = eraRows.slice(cursor, cursor + maxRowsPerChunk);
      const suffix = String.fromCharCode(65 + partIndex);
      chunks.push({
        label: `Era ${era}${suffix}`,
        rows: partRows
      });
      partIndex += 1;
    }
  }

  if (fallback.length > 0) {
    if (fallback.length <= maxRowsPerChunk) {
      chunks.push({ label: "Misc", rows: fallback.slice() });
    } else {
      let partIndex = 0;
      for (let cursor = 0; cursor < fallback.length; cursor += maxRowsPerChunk) {
        const partRows = fallback.slice(cursor, cursor + maxRowsPerChunk);
        chunks.push({
          label: `Misc ${String.fromCharCode(65 + partIndex)}`,
          rows: partRows
        });
        partIndex += 1;
      }
    }
  }

  return chunks;
}

function collectCatalogEntries(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile() || !isIndexEntryFileName(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    const frontMatter = parseFrontMatter(readText(fullPath));
    const id = cleanLine(frontMatter.ix || frontMatter.lx || frontMatter.fx || entry.name.replace(/\.md$/i, ""));
    const numericId = extractNumericId(id);
    const name = cleanLine(frontMatter.name || entry.name.replace(/\.md$/i, ""));
    const tags = normalizeListValue(frontMatter.tags).slice(0, 5);
    const chain = normalizeListValue(frontMatter.chain).slice(0, 4);
    entries.push({
      id,
      numericId: Number.isFinite(numericId) ? numericId : 99999,
      name,
      tags,
      chain
    });
  }
  return entries.sort((left, right) => left.numericId - right.numericId || left.id.localeCompare(right.id));
}

function summarizeList(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (values.length < 1) return "-";
  return values.join(", ");
}

function buildRowsFromEntries(entries) {
  return entries.map((entry) => `| ${extractNumericId(entry.id) || entry.id} | ${entry.name} | ${summarizeList(entry.tags)} | ${summarizeList(entry.chain)} |`);
}

function cleanupGeneratedChunks(baseFilePath) {
  const dirPath = path.dirname(baseFilePath);
  const baseName = path.basename(baseFilePath, ".md");
  for (const name of fs.readdirSync(dirPath)) {
    if (!new RegExp(`^${escapeRegExp(baseName)}-\\d{2}\\.md$`, "i").test(name)) {
      continue;
    }
    fs.unlinkSync(path.join(dirPath, name));
  }
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeCatalogFromRows(filePath, title, rows) {
  const table = {
    header: "| ID | Name | Tags | Chain |",
    separator: "|----|------|------|-------|",
    rows
  };
  const directContent = buildDirectTablePage(
    title,
    `${rows.length} entries from disk truth.`,
    table.header,
    table.separator,
    table.rows
  );
  cleanupGeneratedChunks(filePath);
  if (countLines(directContent) <= MAX_LINES) {
    writeText(filePath, directContent);
    return { chunks: 1 };
  }

  const maxRowsPerChunk = Math.max(10, MAX_LINES - 6);
  const chunks = splitRowsByEra(rows, maxRowsPerChunk);
  const chunkFileNames = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const fileName = `${path.basename(filePath, ".md")}-${pad2(index + 1)}.md`;
    chunkFileNames.push(fileName);
    writeText(
      path.join(path.dirname(filePath), fileName),
      buildChunkContent(title, chunks[index], table, index + 1, chunks.length)
    );
  }
  writeText(filePath, buildRouterContent(title, chunks, chunkFileNames));
  return { chunks: chunks.length };
}

function buildChunkContent(title, chunk, table, index, totalChunks) {
  const lines = [
    `# ${title} — ${chunk.label}`,
    "",
    `${chunk.rows.length} entries. Range: ${describeRange(chunk.rows) || "n/a"}. Chunk ${index}/${totalChunks}.`,
    "",
    table.header,
    table.separator,
    ...chunk.rows
  ];
  return lines.join("\n");
}

function buildRouterContent(title, chunks, chunkFileNames) {
  const lines = [
    `# ${title} — Router`,
    "",
    `${chunks.reduce((sum, chunk) => sum + chunk.rows.length, 0)} entries split into ${chunks.length} compact chunks (max ${MAX_LINES} lines per file).`,
    "",
    "| Chunk | Range | Entries | File |",
    "|-------|-------|---------|------|"
  ];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const fileName = chunkFileNames[index];
    lines.push(`| ${chunk.label} | ${describeRange(chunk.rows) || "n/a"} | ${chunk.rows.length} | [${fileName}](${fileName}) |`);
  }
  return lines.join("\n");
}

function rewriteSimpleCatalogAsRouter(filePath) {
  const lines = readText(filePath).replace(/\r/g, "").split("\n");
  const title = extractTitle(lines, path.basename(filePath, ".md"));
  const table = extractTable(lines, 0);
  if (!table || table.rows.length < 1) {
    return { rewritten: false, reason: "no_table" };
  }
  if (countLines(lines.join("\n")) <= MAX_LINES) {
    return { rewritten: false, reason: "already_compact" };
  }
  const maxRowsPerChunk = Math.max(10, MAX_LINES - 6);
  const chunks = splitRowsByEra(table.rows, maxRowsPerChunk);
  if (chunks.length < 2) {
    return { rewritten: false, reason: "single_chunk" };
  }

  cleanupGeneratedChunks(filePath);

  const chunkFileNames = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const fileName = `${path.basename(filePath, ".md")}-${pad2(index + 1)}.md`;
    const fullPath = path.join(path.dirname(filePath), fileName);
    const content = buildChunkContent(title, chunk, table, index + 1, chunks.length);
    writeText(fullPath, content);
    chunkFileNames.push(fileName);
  }

  writeText(filePath, buildRouterContent(title, chunks, chunkFileNames));
  return { rewritten: true, chunks: chunkFileNames.length };
}

function buildDirectTablePage(title, intro, header, separator, rows) {
  return [
    `# ${title}`,
    "",
    intro,
    "",
    header,
    separator,
    ...rows
  ].join("\n");
}

function buildSectionRouterPage(title, intro, chunks, fileNames) {
  const lines = [
    `# ${title} — Router`,
    "",
    intro,
    "",
    "| Chunk | Range | Entries | File |",
    "|-------|-------|---------|------|"
  ];
  for (let index = 0; index < chunks.length; index += 1) {
    lines.push(`| ${index + 1} | ${describeRange(chunks[index]) || "n/a"} | ${chunks[index].length} | [${fileNames[index]}](${fileNames[index]}) |`);
  }
  return lines.join("\n");
}

function writeSectionTable(filePath, title, intro, table) {
  cleanupGeneratedChunks(filePath);
  const directContent = buildDirectTablePage(title, intro, table.header, table.separator, table.rows);
  if (countLines(directContent) <= MAX_LINES) {
    writeText(filePath, directContent);
    return { chunks: 1 };
  }

  const maxRowsPerChunk = Math.max(10, MAX_LINES - 6);
  const chunks = [];
  for (let cursor = 0; cursor < table.rows.length; cursor += maxRowsPerChunk) {
    chunks.push(table.rows.slice(cursor, cursor + maxRowsPerChunk));
  }
  const fileNames = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const fileName = `${path.basename(filePath, ".md")}-${pad2(index + 1)}.md`;
    fileNames.push(fileName);
    const chunkContent = buildDirectTablePage(
      `${title} — Chunk ${index + 1}`,
      `${chunks[index].length} entries. Range: ${describeRange(chunks[index]) || "n/a"}.`,
      table.header,
      table.separator,
      chunks[index]
    );
    writeText(path.join(path.dirname(filePath), fileName), chunkContent);
  }
  writeText(filePath, buildSectionRouterPage(title, intro, chunks, fileNames));
  return { chunks: chunks.length };
}

function rewriteRootCatalog() {
  const filePath = path.join(ROOT, "CATALOG.md");
  const lines = readText(filePath).replace(/\r/g, "").split("\n");
  const bootSection = findSection(lines, "## BOOT-CRITICAL — READ BEFORE ANY STARTUP ATTEMPT");
  const deviceSection = findSection(lines, "## Sovereign Devices (full index)");
  const preDevSection = findSection(lines, "## Pre-Dev Evidence");
  const activeTaskSection = findSection(lines, "## Active Task");
  const preDevPath = path.join(ROOT, "CATALOG-PRE-DEV.md");
  const activeTasksPath = path.join(ROOT, "CATALOG-ACTIVE-TASKS.md");
  const preDevRows = preDevSection
    ? collectPipeRows(preDevSection.lines)
    : (fs.existsSync(preDevPath) ? collectPipeRows(readText(preDevPath).split("\n")) : []);
  const activeTaskRows = activeTaskSection
    ? collectPipeRows(activeTaskSection.lines)
    : (fs.existsSync(activeTasksPath) ? collectPipeRows(readText(activeTasksPath).split("\n")) : []);
  const preDevTable = preDevRows.length > 0
    ? {
      header: "| Entry | Summary | Link |",
      separator: "|-------|---------|------|",
      rows: preDevRows
    }
    : null;
  const activeTaskTable = activeTaskRows.length > 0
    ? {
      header: "| Entry | Summary | Link |",
      separator: "|-------|---------|------|",
      rows: activeTaskRows
    }
    : null;
  if (preDevTable) {
    writeSectionTable(
      preDevPath,
      "Pre-Dev Evidence Catalog",
      `${preDevTable.rows.length} evidence rows extracted from the sovereign root router.`,
      preDevTable
    );
  }
  if (activeTaskTable) {
    writeSectionTable(
      activeTasksPath,
      "Active Task Catalog",
      `${activeTaskTable.rows.length} active-task rows extracted from the sovereign root router.`,
      activeTaskTable
    );
  }

  const bootLines = [];
  if (bootSection) {
    for (const line of bootSection.lines.slice(1)) {
      const trimmed = cleanLine(line);
      if (!trimmed) continue;
      bootLines.push(line);
    }
  }
  const deviceLines = [];
  if (deviceSection) {
    for (const line of deviceSection.lines.slice(1)) {
      const trimmed = cleanLine(line);
      if (!trimmed) continue;
      deviceLines.push(line);
    }
  }

  const rootLines = [
    "# Agent Index Catalog — Router",
    "",
    "## BOOT-CRITICAL — READ BEFORE ANY STARTUP ATTEMPT",
    ...bootLines.slice(0, 5),
    "",
    "## How to Navigate",
    "Search by IX number, type, tag, or keyword. Follow `chain` to get the full picture.",
    "Reverse lookup: search the Chain column for your IX number to find what leads TO you.",
    "Sub-colonies: see [SUB-COLONIES.md](SUB-COLONIES.md) for federated indexes (LX-, FX-, etc.).",
    "",
    "## Type Catalogs (load only what you need)",
    "| Type | Entries | Catalog |",
    "|------|---------|---------|"
  ];

  let total = 0;
  for (const dirName of ROOT_TYPE_DIRS) {
    const label = TYPE_LABELS.get(dirName) || dirName;
    const count = countTypedEntries(path.join(ROOT, dirName));
    total += count;
    const catalogName = `CATALOG-${dirName.toUpperCase()}.md`;
    rootLines.push(`| ${label} | ${count} | [${dirName}/${catalogName}](${dirName}/${catalogName}) |`);
  }
  rootLines.push(`| **Total** | **${total}** | |`);
  rootLines.push("");
  rootLines.push("## Extra Routers");
  rootLines.push("| Section | Entries | File |");
  rootLines.push("|---------|---------|------|");
  if (preDevTable) {
    rootLines.push(`| Pre-Dev Evidence | ${preDevTable.rows.length} | [CATALOG-PRE-DEV.md](CATALOG-PRE-DEV.md) |`);
  }
  if (activeTaskTable) {
    rootLines.push(`| Active Task | ${activeTaskTable.rows.length} | [CATALOG-ACTIVE-TASKS.md](CATALOG-ACTIVE-TASKS.md) |`);
  }
  rootLines.push("");
  rootLines.push("## Chain Definitions");
  rootLines.push("All chain definitions: [CHAINS.md](CHAINS.md)");
  if (deviceLines.length > 0) {
    rootLines.push("");
    rootLines.push("## Sovereign Devices (full index)");
    rootLines.push(...deviceLines);
  }

  writeText(filePath, rootLines.join("\n"));
}

function ensureSovereignTypeRouters() {
  const referencesDir = path.join(ROOT, "references");
  const referencesCatalogPath = path.join(referencesDir, "CATALOG-REFERENCES.md");
  const referenceRows = buildRowsFromEntries(collectCatalogEntries(referencesDir));
  writeCatalogFromRows(referencesCatalogPath, "References Catalog", referenceRows);
}

function writeRootEntryCatalog(colonyDir, title, entries) {
  const rows = entries.map((name) => `| ${name.replace(/\.md$/i, "")} | [${name}](${name}) |`);
  const content = buildDirectTablePage(
    title,
    `${entries.length} root entry files from disk truth.`,
    "| Entry | File |",
    "|-------|------|",
    rows
  );
  const filePath = path.join(colonyDir, "CATALOG-ENTRIES.md");
  writeText(filePath, content);
}

function rewriteSubColonyRouter(colonyDir) {
  const colonyName = path.basename(colonyDir);
  const rootCatalogPath = path.join(colonyDir, "CATALOG.md");
  const rootEntries = listRootEntryFiles(colonyDir);
  const typeRows = [];
  for (const entry of fs.readdirSync(colonyDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catalogCandidates = ["CATALOG.md", `CATALOG-${entry.name.toUpperCase()}.md`];
    const catalogName = catalogCandidates.find((name) => fs.existsSync(path.join(colonyDir, entry.name, name)));
    if (!catalogName) continue;
    const count = countTypedEntries(path.join(colonyDir, entry.name));
    typeRows.push(`| ${entry.name} | ${count} | [${entry.name}/${catalogName}](${entry.name}/${catalogName}) |`);
  }
  if (rootEntries.length > 0) {
    writeRootEntryCatalog(colonyDir, `${colonyName} Root Entries`, rootEntries);
  }

  const docRows = ROOT_DOC_LINKS
    .filter((name) => fs.existsSync(path.join(colonyDir, name)))
    .map((name) => `| ${name.replace(/\.md$/i, "")} | [${name}](${name}) |`);

  const lines = [
    `# ${colonyName} Catalog — Router`,
    "",
    `Compact router generated from disk truth for \`${colonyName}\`.`,
    "",
    "## Sections",
    "| Section | Entries | File |",
    "|---------|---------|------|"
  ];
  if (rootEntries.length > 0) {
    lines.push(`| Root entries | ${rootEntries.length} | [CATALOG-ENTRIES.md](CATALOG-ENTRIES.md) |`);
  }
  for (const row of typeRows) {
    lines.push(row);
  }
  if (docRows.length > 0) {
    lines.push("");
    lines.push("## Core Docs");
    lines.push("| Doc | File |");
    lines.push("|-----|------|");
    lines.push(...docRows);
  }
  writeText(rootCatalogPath, lines.join("\n"));
}

function rewriteSubColonyCatalogs() {
  if (!fs.existsSync(SUBCOLONIES_ROOT)) return;
  for (const entry of fs.readdirSync(SUBCOLONIES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const colonyDir = path.join(SUBCOLONIES_ROOT, entry.name);
    rewriteSubColonyRouter(colonyDir);
    for (const child of fs.readdirSync(colonyDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const candidateNames = ["CATALOG.md", `CATALOG-${child.name.toUpperCase()}.md`];
      for (const candidate of candidateNames) {
        const fullPath = path.join(colonyDir, child.name, candidate);
        if (!fs.existsSync(fullPath)) continue;
        if (countLines(readText(fullPath)) <= MAX_LINES) continue;
        const childRows = buildRowsFromEntries(collectCatalogEntries(path.join(colonyDir, child.name)));
        if (childRows.length > 0) {
          const title = `${child.name} Catalog`;
          writeCatalogFromRows(fullPath, title, childRows);
        } else {
          rewriteSimpleCatalogAsRouter(fullPath);
        }
      }
    }
  }
}

function collectCatalogLineCounts(rootDir) {
  const rows = [];
  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/^CATALOG.*\.md$/i.test(entry.name)) continue;
      rows.push({
        path: fullPath,
        lines: countLines(readText(fullPath))
      });
    }
  }
  walk(rootDir);
  return rows.sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
}

function main() {
  rewriteRootCatalog();
  ensureSovereignTypeRouters();
  rewriteSubColonyCatalogs();

  const lineCounts = collectCatalogLineCounts(ROOT);
  const worst = lineCounts.slice(0, 12).map((row) => ({
    file: path.relative(ROOT, row.path).replace(/\\/g, "/"),
    lines: row.lines
  }));

  console.log(JSON.stringify({
    ok: true,
    maxLines: MAX_LINES,
    worst
  }, null, 2));
}

main();
