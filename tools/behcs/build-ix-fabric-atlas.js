#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const AGENT_INDEX_ROOT = path.join(ROOT, "data", "agent-index");
const BEHCS_INDEX_ROOT = path.join(ROOT, "data", "behcs", "index");
const REPORTS_ROOT = path.join(ROOT, "reports");

const PATHS = {
  catalog: path.join(AGENT_INDEX_ROOT, "CATALOG.md"),
  crosswalk: path.join(AGENT_INDEX_ROOT, "aso-crosswalk-ix.seed.json"),
  subColonies: path.join(AGENT_INDEX_ROOT, "SUB-COLONIES.md"),
  xref: path.join(AGENT_INDEX_ROOT, "XREF.md"),
  runtimeSurfaceInventory: path.join(ROOT, "docs", "RUNTIME_SURFACE_INVENTORY.md"),
  ixConnectors: path.join(ROOT, "data", "behcs", "sovereignty", "ix", "codex", "connectors.json"),
  deepWavePlan: path.join(ROOT, "docs", "DEEP_WAVE_SYSTEM_WIRING_PLAN.md"),
  projectionMap: path.join(ROOT, "docs", "PUBLIC_PROJECTION_MAP.md")
};

const ARCHIVE_ROOTS = [
  {
    id: "agent-index-rehydrated",
    root: path.join(ROOT, "data", "agent-index-rehydrated")
  },
  {
    id: "falcon-dump-rehydrated",
    root: path.join(ROOT, "data", "falcon-dump-rehydrated", "agent-index")
  },
  {
    id: "liris-canon-snapshot-2026-04-08",
    root: path.join(ROOT, "data", "omni-processor", "paper-draft", "incoming", "liris-canon-snapshot-2026-04-08")
  }
];

const OUTPUTS = {
  atlas: path.join(BEHCS_INDEX_ROOT, "ix-fabric-atlas.v1.json"),
  surfaceRegistry: path.join(BEHCS_INDEX_ROOT, "ix-surface-registry.v1.json"),
  promotionQueue: path.join(BEHCS_INDEX_ROOT, "ix-promotion-queue.v1.json"),
  latestReport: path.join(REPORTS_ROOT, "ix-fabric-atlas-phase1-latest.md")
};

const STATUS = Object.freeze({
  state: "LOCAL_ONLY_OVERLAY_FIRST",
  release: "DENY_UNTIL_PROOFS",
  promotion: "DENY_UNTIL_PROOFS",
  remote: "NO_REMOTE",
  claims: "NO_FAKE_GREEN"
});

const PROMOTION_STAGES = Object.freeze([
  "observe",
  "index",
  "map_map_mapped",
  "cube_cube_cubed",
  "white_room_review",
  "shadow_execution",
  "bounded_live_promotion"
]);

const TYPE_MAP = Object.freeze({
  skill: "skill",
  skills: "skill",
  pattern: "pattern",
  patterns: "pattern",
  mistake: "mistake",
  mistakes: "mistake",
  tool: "tool",
  tools: "tool",
  plan: "plan",
  plans: "plan",
  reference: "reference",
  references: "reference",
  rule: "rule",
  rules: "rule",
  policy: "policy",
  policies: "policy",
  task: "task",
  tasks: "task",
  project: "project",
  projects: "project",
  identity: "identity",
  identities: "identity"
});

let AGENT_ROLES = {};
try {
  ({ AGENT_ROLES = {} } = require(path.join(ROOT, "src", "spawnContextBuilder")));
} catch (_error) {
  AGENT_ROLES = {};
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextAtomic(filePath, text) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${String(text || "").replace(/\r/g, "").trimEnd()}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return String(fs.readFileSync(filePath, "utf8") || "");
}

function readJson(filePath, fallback = null) {
  const raw = readText(filePath);
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function cleanLine(text) {
  return String(text || "").replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function stripInlineMarkup(text) {
  return cleanLine(String(text || "").replace(/`/g, "").replace(/\*\*/g, ""));
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanLine(item)).filter(Boolean);
  }
  const text = cleanLine(value);
  if (!text) return [];
  const source = text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1)
    : text;
  return source
    .split(",")
    .map((item) => cleanLine(item.replace(/^["']|["']$/g, "")))
    .filter(Boolean);
}

function normalizeEntryId(value, fallbackPrefix = "IX") {
  const match = String(value || "").match(/([A-Z]{2,4})[-_\s]?(\d{1,4})/i);
  if (match) {
    return `${String(match[1] || "").toUpperCase()}-${String(match[2] || "").padStart(3, "0")}`;
  }
  const numeric = String(value || "").match(/(\d{1,4})/);
  if (numeric) {
    return `${String(fallbackPrefix || "IX").toUpperCase()}-${String(numeric[1] || "").padStart(3, "0")}`;
  }
  return cleanLine(value);
}

function relativeToProject(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function absolutePathFromDocRef(input) {
  const raw = stripInlineMarkup(input);
  if (!raw) return "";
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    return path.resolve(raw);
  }
  if (/^(src|data|docs|routes|tools|projections|packets|runtime|public|config|services|schemas|captures|reports)\//.test(raw.replace(/\\/g, "/"))) {
    return path.resolve(ROOT, raw);
  }
  return "";
}

function looksLikePath(text) {
  const raw = stripInlineMarkup(text);
  if (!raw) return false;
  return /^[A-Za-z]:[\\/]/.test(raw)
    || /^(src|data|docs|routes|tools|projections|packets|runtime|public|config|services|schemas|captures|reports)\//.test(raw.replace(/\\/g, "/"))
    || /\.(js|json|md|ndjson|txt|ps1|packet\.glyph256|schema\.json|sha256)$/i.test(raw);
}

function parseFrontMatter(rawText) {
  const source = String(rawText || "");
  if (!source.startsWith("---")) {
    return { attrs: {}, body: source };
  }
  const marker = source.indexOf("\n---", 3);
  if (marker < 0) {
    return { attrs: {}, body: source };
  }
  const attrs = {};
  const frontMatter = source.slice(3, marker).trim();
  const body = source.slice(marker + 4).trim();
  for (const line of frontMatter.split(/\r?\n/g)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    const key = String(match[1] || "").trim().toLowerCase();
    const value = String(match[2] || "").trim();
    if (["tags", "chain", "agents"].includes(key)) {
      attrs[key] = normalizeArray(value);
    } else {
      attrs[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { attrs, body };
}

function buildSummary(body) {
  const lines = String(body || "")
    .split(/\r?\n/g)
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .filter((line) => !/^#/.test(line))
    .filter((line) => !/^```/.test(line));
  if (lines.length < 1) return "";
  return cleanLine(lines.slice(0, 3).join(" ")).slice(0, 420);
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const output = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const children = fs.readdirSync(current, { withFileTypes: true });
    for (const child of children) {
      const fullPath = path.join(current, child.name);
      if (child.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      output.push(fullPath);
    }
  }
  return output.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function isIndexEntryFile(filePath) {
  return /^[A-Z]{2,4}-\d{1,4}.*\.md$/i.test(path.basename(filePath));
}

function normalizeType(filePath, frontMatterType) {
  const explicit = TYPE_MAP[String(frontMatterType || "").trim().toLowerCase()];
  if (explicit) return explicit;
  const parent = TYPE_MAP[String(path.basename(path.dirname(filePath)) || "").trim().toLowerCase()];
  if (parent) return parent;
  return "reference";
}

function extractEntryId(filePath, attrs) {
  const fileName = path.basename(filePath);
  const fileMatch = fileName.match(/([A-Z]{2,4})-(\d{1,4})/i);
  const filePrefix = fileMatch ? String(fileMatch[1] || "").toUpperCase() : "IX";
  for (const key of ["id", "ix", "lx", "fx"]) {
    if (!attrs[key]) continue;
    return normalizeEntryId(attrs[key], filePrefix);
  }
  return normalizeEntryId(fileName, filePrefix);
}

function splitPipeRow(line) {
  const raw = String(line || "").trim();
  return raw
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInlineMarkup(cell));
}

function parseTableAt(lines, startIndex) {
  if (startIndex < 0 || startIndex + 1 >= lines.length) return null;
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!/^\|/.test(cleanLine(headerLine)) || !/^\|[-\s:|]+\|$/.test(cleanLine(separatorLine))) {
    return null;
  }
  const headers = splitPipeRow(headerLine);
  const rows = [];
  let cursor = startIndex + 2;
  while (cursor < lines.length && /^\|/.test(cleanLine(lines[cursor] || ""))) {
    const cells = splitPipeRow(lines[cursor]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    rows.push(row);
    cursor += 1;
  }
  return { headers, rows, endIndex: cursor - 1 };
}

function parseTableAfterHeading(text, headingText) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const headingIndex = lines.findIndex((line) => stripInlineMarkup(line).includes(headingText));
  if (headingIndex < 0) return [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(cleanLine(lines[index] || ""))) break;
    const table = parseTableAt(lines, index);
    if (table) {
      return table.rows;
    }
  }
  return [];
}

function parseBulletSections(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sections = {};
  let currentSection = "";
  let currentItem = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      currentSection = stripInlineMarkup(heading[1]);
      sections[currentSection] = [];
      currentItem = null;
      continue;
    }
    if (!currentSection) continue;
    const topLevel = line.match(/^- (.+)$/);
    if (topLevel) {
      currentItem = {
        label: stripInlineMarkup(topLevel[1]),
        notes: []
      };
      sections[currentSection].push(currentItem);
      continue;
    }
    const nested = line.match(/^\s{2,}- (.+)$/);
    if (nested && currentItem) {
      currentItem.notes.push(stripInlineMarkup(nested[1]));
    }
  }
  return sections;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = cleanLine(selector(item));
    if (!key) continue;
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
  );
}

function topEntriesFromCounts(counts, limit = 12) {
  return Object.entries(counts)
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function scanIndexEntries() {
  const files = walkFiles(AGENT_INDEX_ROOT).filter(isIndexEntryFile);
  const entries = files.map((filePath) => {
    const rawText = readText(filePath);
    const { attrs, body } = parseFrontMatter(rawText);
    const id = extractEntryId(filePath, attrs);
    const prefix = String(id.split("-")[0] || "").toUpperCase();
    const numericPart = Number(String(id).replace(/^[A-Z]+-/, "")) || 0;
    const relativePath = relativeToProject(filePath);
    const namespaceMatch = relativePath.match(/^data\/agent-index\/sub-colonies\/([^/]+)/);
    const namespace = namespaceMatch ? "sub_colony" : "master";
    const colony = namespaceMatch ? namespaceMatch[1] : "master";
    const type = normalizeType(filePath, attrs.type);
    const tags = normalizeArray(attrs.tags);
    const chain = normalizeArray(attrs.chain).map((ref) => normalizeEntryId(ref, prefix));
    const agents = normalizeArray(attrs.agents);
    return {
      id,
      prefix,
      numericId: numericPart,
      title: cleanLine(attrs.name || id),
      type,
      tags,
      chain,
      agents,
      namespace,
      colony,
      sourcePath: relativePath,
      absolutePath: filePath,
      updatedAt: new Date(fs.statSync(filePath).mtimeMs).toISOString(),
      summary: buildSummary(body),
      bodyLines: String(body || "").replace(/\r/g, "").split("\n").filter(Boolean).length
    };
  });

  return entries.sort((left, right) => {
    if (left.prefix !== right.prefix) return left.prefix.localeCompare(right.prefix);
    if (left.numericId !== right.numericId) return left.numericId - right.numericId;
    return left.id.localeCompare(right.id);
  });
}

function collectArchiveCensus() {
  return ARCHIVE_ROOTS
    .filter((archive) => fs.existsSync(archive.root))
    .map((archive) => ({
      id: archive.id,
      root: relativeToProject(archive.root),
      entryCount: walkFiles(archive.root).filter(isIndexEntryFile).length
    }));
}

function buildEntryGraph(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const chainEdges = [];
  const incoming = {};
  for (const entry of entries) {
    for (const targetId of entry.chain) {
      const target = byId.get(targetId);
      chainEdges.push({
        from: entry.id,
        to: targetId,
        toExists: Boolean(target),
        relation: "chains_to"
      });
      incoming[targetId] = Number(incoming[targetId] || 0) + 1;
    }
  }
  return {
    chainEdges,
    incomingCounts: incoming
  };
}

function parseMasterTopology(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ix009 = readText(byId.get("IX-009")?.absolutePath || "");
  const ix011 = readText(byId.get("IX-011")?.absolutePath || "");
  const masterDevices = parseTableAfterHeading(ix009, "Jesse's Sovereign Devices").map((row) => ({
    device: row.Device || "",
    owner: row.Owner || "",
    agents: normalizeArray(row.Agents),
    indexLevel: row["Index Level"] || ""
  }));
  const scopedDevices = parseTableAfterHeading(ix009, "Sub-Colony Devices").map((row) => ({
    device: row.Device || "",
    owner: row.Owner || "",
    agents: normalizeArray(row.Agents),
    indexLevel: row["Index Level"] || ""
  }));
  const bridgeNotes = String(ix011 || "")
    .split(/\r?\n/g)
    .map((line) => cleanLine(line))
    .filter((line) => /^- /.test(line))
    .map((line) => line.replace(/^- /, ""));
  const subColonies = parseTableAfterHeading(readText(PATHS.subColonies), "Registered Sub-Colonies").map((row) => ({
    colony: row.Colony || "",
    prefix: cleanLine(row.Prefix || ""),
    owner: row.Owner || "",
    device: row.Device || "",
    connection: row.Connection || "",
    exportedIx: row["Exported IX"] || "",
    lastSync: row["Last Sync"] || ""
  }));
  return {
    masterDevices,
    scopedDevices,
    subColonies,
    phoneBridge: {
      id: "falcon-bridge",
      sovereignMirror: true,
      bidirectional: true,
      notes: bridgeNotes
    }
  };
}

function parseCrosswalk(entries) {
  const seed = readJson(PATHS.crosswalk, { entries: [] }) || { entries: [] };
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const concepts = (Array.isArray(seed.entries) ? seed.entries : []).map((entry) => {
    const legacyIds = normalizeArray(entry.legacyIds || []).map((id) => normalizeEntryId(id));
    return {
      canonicalKey: cleanLine(entry.canonicalKey || ""),
      legacyIds,
      type: cleanLine(entry.type || ""),
      summary: cleanLine(entry.summary || ""),
      proposedAsoId: cleanLine(entry.proposedAsoId || ""),
      overlapsLX: normalizeArray(entry.overlapsLX || []),
      existingLegacyIds: legacyIds.filter((id) => byId.has(id))
    };
  }).filter((entry) => entry.canonicalKey);

  const conceptByLegacyId = {};
  for (const concept of concepts) {
    for (const legacyId of concept.legacyIds) {
      if (!conceptByLegacyId[legacyId]) conceptByLegacyId[legacyId] = [];
      conceptByLegacyId[legacyId].push(concept.canonicalKey);
    }
  }
  return { seed, concepts, conceptByLegacyId };
}

function parseXref() {
  const xrefText = readText(PATHS.xref);
  const exactMatches = parseTableAfterHeading(xrefText, "Exact Matches").map((row) => ({
    ix: normalizeEntryId(row.IX || ""),
    skillFolder: row["Skill Folder"] || ""
  }));
  const partialMatches = parseTableAfterHeading(xrefText, "Partial/Conceptual Matches").map((row) => ({
    ix: normalizeEntryId(row.IX || ""),
    skillFolder: row["Skill Folder"] || "",
    reason: row.Reason || ""
  }));
  const summaryRows = parseTableAfterHeading(xrefText, "Summary");
  const summary = {};
  for (const row of summaryRows) {
    const category = cleanLine(row.Category || "");
    const count = Number(String(row.Count || "").replace(/[^\d]/g, "")) || 0;
    if (category) summary[category] = count;
  }
  return { exactMatches, partialMatches, summary };
}

function classifySurface(groupId, absolutePath, label) {
  if (groupId === "sovereign-device-surfaces" || groupId === "scoped-device-surfaces") return "device_surface";
  if (groupId === "agent-role-surfaces") return "role_surface";
  if (groupId === "connector-external-surfaces") return absolutePath ? "file_surface" : "runtime_surface";
  if (absolutePath) return "file_surface";
  if (/route|gateway|hook/i.test(label)) return "runtime_surface";
  return "logical_surface";
}

function connectorExternalAbsolutePath(ref) {
  switch (ref) {
    case "catalogs.json":
      return PATHS.ixConnectors.replace(/connectors\.json$/i, "catalogs.json");
    case "verb-table":
      return path.join(ROOT, "ix", "grammar", "verb-table.json");
    case "ix-registry":
      return path.join(ROOT, "ix", "index.js");
    case "asolaria-index-mistake":
      return path.join(AGENT_INDEX_ROOT, "mistakes");
    case "asolaria-index-skill":
      return path.join(AGENT_INDEX_ROOT, "skills");
    case "asolaria-index-rule":
      return path.join(AGENT_INDEX_ROOT, "rules");
    case "asolaria-index-tool":
      return path.join(AGENT_INDEX_ROOT, "tools");
    case "asolaria-index-pattern":
      return path.join(AGENT_INDEX_ROOT, "patterns");
    default:
      return "";
  }
}

function buildSurfaceRegistry(topology) {
  const sections = parseBulletSections(readText(PATHS.runtimeSurfaceInventory));
  const groupSpecs = [
    { title: "Entry Surfaces", id: "entry-surfaces", sourcePath: relativeToProject(PATHS.runtimeSurfaceInventory) },
    { title: "Hook / Audit Surfaces", id: "hook-audit-surfaces", sourcePath: relativeToProject(PATHS.runtimeSurfaceInventory) },
    { title: "Runtime Query Surfaces", id: "runtime-query-surfaces", sourcePath: relativeToProject(PATHS.runtimeSurfaceInventory) },
    { title: "White-Room / GC Surfaces", id: "white-room-gc-surfaces", sourcePath: relativeToProject(PATHS.runtimeSurfaceInventory) },
    { title: "First-Wire Mapping", id: "first-wire-mapping", sourcePath: relativeToProject(PATHS.runtimeSurfaceInventory) }
  ];

  const groups = [];
  const surfaces = [];

  for (const spec of groupSpecs) {
    const items = Array.isArray(sections[spec.title]) ? sections[spec.title] : [];
    const surfaceIds = [];
    items.forEach((item, index) => {
      const primaryPath = looksLikePath(item.label)
        ? absolutePathFromDocRef(item.label)
        : absolutePathFromDocRef(item.notes.find((note) => looksLikePath(note)) || "");
      const relativePath = primaryPath ? relativeToProject(primaryPath) : "";
      const id = primaryPath
        ? slugify(relativePath || item.label)
        : `${spec.id}-${index + 1}`;
      const record = {
        id,
        groupId: spec.id,
        groupTitle: spec.title,
        label: item.label,
        relativePath,
        absolutePath: primaryPath || "",
        exists: primaryPath ? fs.existsSync(primaryPath) : null,
        surfaceClass: classifySurface(spec.id, primaryPath, item.label),
        notes: item.notes.slice()
      };
      surfaces.push(record);
      surfaceIds.push(record.id);
    });
    groups.push({
      id: spec.id,
      title: spec.title,
      sourcePath: spec.sourcePath,
      surfaceCount: surfaceIds.length,
      surfaceIds
    });
  }

  const connectorAudit = readJson(PATHS.ixConnectors, {}).declared_connector_audit || {};
  const externalRefs = Array.isArray(connectorAudit.externalRefs) ? connectorAudit.externalRefs : [];
  const uniqueExternalRefs = new Map();
  for (const entry of externalRefs) {
    if (entry && entry.refers_to && !uniqueExternalRefs.has(entry.refers_to)) {
      uniqueExternalRefs.set(entry.refers_to, entry);
    }
  }
  const connectorExternalIds = [];
  uniqueExternalRefs.forEach((entry, ref) => {
    const absolutePath = connectorExternalAbsolutePath(ref);
    const relativePath = absolutePath ? relativeToProject(absolutePath) : "";
    const id = relativePath ? slugify(relativePath) : `connector-external-${slugify(ref)}`;
    surfaces.push({
      id,
      groupId: "connector-external-surfaces",
      groupTitle: "Connector External Surfaces",
      label: ref,
      relativePath,
      absolutePath: absolutePath || "",
      exists: absolutePath ? fs.existsSync(absolutePath) : null,
      surfaceClass: classifySurface("connector-external-surfaces", absolutePath, ref),
      notes: [
        `referenceClass=${entry.referenceClass || "runtime_surface"}`,
        `note=${entry.note || ""}`,
        `declaredBy=${entry.cube || ""}`,
        `connectorLabel=${entry.label || ""}`
      ].filter(Boolean)
    });
    connectorExternalIds.push(id);
  });
  groups.push({
    id: "connector-external-surfaces",
    title: "Connector External Surfaces",
    sourcePath: relativeToProject(PATHS.ixConnectors),
    surfaceCount: connectorExternalIds.length,
    surfaceIds: connectorExternalIds
  });

  const sovereignDeviceIds = [];
  topology.masterDevices.forEach((device, index) => {
    const id = `sovereign-device-${index + 1}`;
    surfaces.push({
      id,
      groupId: "sovereign-device-surfaces",
      groupTitle: "Sovereign Device Surfaces",
      label: device.device,
      relativePath: "",
      absolutePath: "",
      exists: null,
      surfaceClass: "device_surface",
      notes: [
        `owner=${device.owner}`,
        `indexLevel=${device.indexLevel}`,
        `agents=${device.agents.join(", ")}`
      ]
    });
    sovereignDeviceIds.push(id);
  });
  groups.push({
    id: "sovereign-device-surfaces",
    title: "Sovereign Device Surfaces",
    sourcePath: `${relativeToProject(PATHS.catalog)} + IX-009`,
    surfaceCount: sovereignDeviceIds.length,
    surfaceIds: sovereignDeviceIds
  });

  const scopedDeviceIds = [];
  topology.scopedDevices.forEach((device, index) => {
    const id = `scoped-device-${index + 1}`;
    surfaces.push({
      id,
      groupId: "scoped-device-surfaces",
      groupTitle: "Scoped Device Surfaces",
      label: device.device,
      relativePath: "",
      absolutePath: "",
      exists: null,
      surfaceClass: "device_surface",
      notes: [
        `owner=${device.owner}`,
        `indexLevel=${device.indexLevel}`,
        `agents=${device.agents.join(", ")}`
      ]
    });
    scopedDeviceIds.push(id);
  });
  groups.push({
    id: "scoped-device-surfaces",
    title: "Scoped Device Surfaces",
    sourcePath: "IX-009 + SUB-COLONIES.md",
    surfaceCount: scopedDeviceIds.length,
    surfaceIds: scopedDeviceIds
  });

  const roleSurfaceIds = [];
  Object.entries(AGENT_ROLES).forEach(([roleId, config]) => {
    const id = `role-${slugify(roleId)}`;
    surfaces.push({
      id,
      groupId: "agent-role-surfaces",
      groupTitle: "Agent Role Surfaces",
      label: roleId,
      relativePath: "src/spawnContextBuilder.js",
      absolutePath: path.join(ROOT, "src", "spawnContextBuilder.js"),
      exists: true,
      surfaceClass: "role_surface",
      notes: [
        `title=${config.title || ""}`,
        `ixTypes=${normalizeArray(config.ixTypes).join(", ")}`,
        `priorityChains=${normalizeArray(config.priorityChains).join(", ")}`,
        `permissions=${normalizeArray(config.permissions).join(", ")}`
      ]
    });
    roleSurfaceIds.push(id);
  });
  groups.push({
    id: "agent-role-surfaces",
    title: "Agent Role Surfaces",
    sourcePath: "src/spawnContextBuilder.js",
    surfaceCount: roleSurfaceIds.length,
    surfaceIds: roleSurfaceIds
  });

  return {
    registryId: "ix-surface-registry.v1",
    generatedAt: new Date().toISOString(),
    status: STATUS,
    summary: {
      groupCount: groups.length,
      surfaceCount: surfaces.length,
      existingFileSurfaceCount: surfaces.filter((surface) => surface.surfaceClass === "file_surface" && surface.exists === true).length,
      deviceSurfaceCount: surfaces.filter((surface) => surface.surfaceClass === "device_surface").length,
      roleSurfaceCount: surfaces.filter((surface) => surface.surfaceClass === "role_surface").length
    },
    groups,
    surfaces
  };
}

function parseDeepWavePlan() {
  const planText = readText(PATHS.deepWavePlan);
  const sections = parseBulletSections(planText);
  const hardLaws = (sections["Hard Laws"] || []).map((item) => item.label);
  const chiefWorkstreams = (sections["Chief Workstreams"] || []).map((item) => {
    const match = item.label.match(/^(W\d+)\s+(.+)$/);
    return {
      id: match ? match[1] : item.label,
      title: match ? match[2] : item.label,
      tasks: item.notes.slice()
    };
  });
  const directorQueue = (sections["Director Queue"] || []).map((item) => {
    const record = {
      id: item.label,
      owner: "",
      task: "",
      notes: []
    };
    for (const note of item.notes) {
      if (/^owner:/i.test(note)) {
        record.owner = cleanLine(note.replace(/^owner:/i, ""));
        continue;
      }
      if (/^task:/i.test(note)) {
        record.task = cleanLine(note.replace(/^task:/i, ""));
        continue;
      }
      record.notes.push(note);
    }
    return record;
  });
  const posture = (sections["Runtime / Governance Posture"] || []).map((item) => item.label);
  return {
    hardLaws,
    chiefWorkstreams,
    directorQueue,
    posture
  };
}

function parseProjectionPlan() {
  const projectionText = readText(PATHS.projectionMap);
  const sections = parseBulletSections(projectionText);
  const projectionTargets = (sections["Projection Targets"] || []).map((item) => item.label);
  const mappings = parseTableAfterHeading(projectionText, "Current Known Mappings").map((row) => ({
    current: row["Current private/runtime reference"] || "",
    problem: row.Problem || "",
    planned: row["Planned tracked public projection"] || ""
  }));
  return {
    projectionTargets,
    mappings
  };
}

function buildTransitionLanes(surfaceRegistry) {
  const surfaceIdsByGroup = Object.fromEntries(
    surfaceRegistry.groups.map((group) => [group.id, group.surfaceIds.slice()])
  );
  return [
    {
      id: "memory-index-docs",
      order: 1,
      owner: ["Gaia", "Liris", "Vector"],
      status: "in_progress",
      currentStage: "cube_cube_cubed",
      nextStage: "white_room_review",
      focus: "Compile the recursive index and doc spine into machine-readable atlas outputs on C:.",
      artifacts: [
        relativeToProject(OUTPUTS.atlas),
        relativeToProject(OUTPUTS.surfaceRegistry),
        relativeToProject(OUTPUTS.promotionQueue)
      ],
      surfaceRefs: []
        .concat(surfaceIdsByGroup["entry-surfaces"] || [])
        .concat(surfaceIdsByGroup["runtime-query-surfaces"] || [])
    },
    {
      id: "local-ops-tooling",
      order: 2,
      owner: ["Rook", "Forge", "Helm"],
      status: "pending",
      currentStage: "observe",
      nextStage: "index",
      focus: "Bind local ops, build/test tools, and execution selectors to the compiled atlas.",
      artifacts: [],
      surfaceRefs: []
    },
    {
      id: "desktop-phone-mirror",
      order: 3,
      owner: ["Falcon", "Helm"],
      status: "pending",
      currentStage: "observe",
      nextStage: "index",
      focus: "Promote the Falcon bridge, mirror lanes, and phone-side channels as first-class surfaces.",
      artifacts: [],
      surfaceRefs: []
        .concat(surfaceIdsByGroup["sovereign-device-surfaces"] || [])
        .concat(surfaceIdsByGroup["entry-surfaces"] || [])
        .filter((id) => /falcon|device/i.test(id))
    },
    {
      id: "browser-integrations",
      order: 4,
      owner: ["Brain", "Selector", "Vector"],
      status: "pending",
      currentStage: "observe",
      nextStage: "index",
      focus: "Route browser and integration surfaces through the same fabric selectors and proof labels.",
      artifacts: [],
      surfaceRefs: []
    },
    {
      id: "gateway-runtime-routing",
      order: 5,
      owner: ["Helm", "Sentinel", "Dasein", "Watchdog"],
      status: "pending",
      currentStage: "observe",
      nextStage: "index",
      focus: "Bind route hooks, gateway cron/cycles, and instant-agent spawn paths to atlas-backed governance.",
      artifacts: [],
      surfaceRefs: []
        .concat(surfaceIdsByGroup["hook-audit-surfaces"] || [])
        .concat(surfaceIdsByGroup["runtime-query-surfaces"] || [])
        .concat(surfaceIdsByGroup["first-wire-mapping"] || [])
    },
    {
      id: "storage-boot",
      order: 6,
      owner: ["Chief", "KR", "Sentinel"],
      status: "pending",
      currentStage: "observe",
      nextStage: "index",
      focus: "Leave boot and storage last; no promotion until atlas-backed proof and white-room review are complete.",
      artifacts: [],
      surfaceRefs: []
    }
  ];
}

function buildPromotionQueue(surfaceRegistry) {
  const deepWave = parseDeepWavePlan();
  const projections = parseProjectionPlan();
  return {
    queueId: "ix-promotion-queue.v1",
    generatedAt: new Date().toISOString(),
    status: STATUS,
    stages: PROMOTION_STAGES.slice(),
    hardLaws: deepWave.hardLaws,
    posture: deepWave.posture,
    chiefWorkstreams: deepWave.chiefWorkstreams,
    directorQueue: deepWave.directorQueue,
    transitionLanes: buildTransitionLanes(surfaceRegistry),
    projectionTargets: projections.projectionTargets,
    projectionMappings: projections.mappings
  };
}

function buildFabricAtlas(entries, topology, crosswalk, graph, surfaceRegistry, promotionQueue, xref, archiveCensus) {
  const tagCounts = countBy(entries.flatMap((entry) => entry.tags.map((tag) => ({ tag }))), (row) => row.tag);
  const prefixedEntries = entries.map((entry) => ({
    ...entry,
    conceptKeys: (crosswalk.conceptByLegacyId[entry.id] || []).slice(),
    incomingChainCount: Number(graph.incomingCounts[entry.id] || 0)
  }));
  const archiveEntryCount = archiveCensus.reduce((sum, archive) => sum + Number(archive.entryCount || 0), 0);

  return {
    atlasId: "ix-fabric-atlas.v1",
    generatedAt: new Date().toISOString(),
    status: STATUS,
    sourceRoots: {
      projectRoot: ROOT,
      agentIndexRoot: AGENT_INDEX_ROOT,
      behcsIndexRoot: BEHCS_INDEX_ROOT
    },
    fabricModel: {
      persistentNamedAgents: {
        count: Object.keys(AGENT_ROLES).length,
        roles: Object.keys(AGENT_ROLES).sort(),
        rule: "Keep the persistent named layer small and role-scoped."
      },
      microAgents: {
        rule: "Use code-bound micro workers for most surface work and adapters.",
        source: "Compiled chains, surface registry, and role permissions."
      },
      instantAgents: {
        rule: "Spawn TTL-bounded instant agents per event, route, or surface trigger.",
        sourceRefs: [
          relativeToProject(PATHS.runtimeSurfaceInventory),
          relativeToProject(PATHS.deepWavePlan)
        ]
      }
    },
    summary: {
      totalEntries: prefixedEntries.length,
      masterEntries: prefixedEntries.filter((entry) => entry.namespace === "master").length,
      subColonyEntries: prefixedEntries.filter((entry) => entry.namespace === "sub_colony").length,
      archiveEntryCount,
      combinedReachableEntryCount: prefixedEntries.length + archiveEntryCount,
      prefixCounts: countBy(prefixedEntries, (entry) => entry.prefix),
      typeCounts: countBy(prefixedEntries, (entry) => entry.type),
      colonyCounts: countBy(prefixedEntries, (entry) => entry.colony),
      chainEdgeCount: graph.chainEdges.length,
      conceptCount: crosswalk.concepts.length,
      surfaceCount: surfaceRegistry.summary.surfaceCount,
      roleCount: Object.keys(AGENT_ROLES).length,
      xrefSummary: xref.summary
    },
    docs: {
      catalog: relativeToProject(PATHS.catalog),
      crosswalkSeed: relativeToProject(PATHS.crosswalk),
      subColonies: relativeToProject(PATHS.subColonies),
      xref: relativeToProject(PATHS.xref),
      runtimeSurfaceInventory: relativeToProject(PATHS.runtimeSurfaceInventory),
      deepWavePlan: relativeToProject(PATHS.deepWavePlan),
      projectionMap: relativeToProject(PATHS.projectionMap)
    },
    archiveCensus,
    topology,
    roles: Object.entries(AGENT_ROLES).map(([roleId, config]) => ({
      role: roleId,
      label: config.label || roleId,
      title: config.title || "",
      ixTypes: normalizeArray(config.ixTypes),
      priorityChains: normalizeArray(config.priorityChains).map((ref) => normalizeEntryId(ref)),
      permissions: normalizeArray(config.permissions),
      maxEntries: Number(config.maxEntries || 0),
      includeBootCritical: Boolean(config.includeBootCritical),
      includeActiveBlockers: Boolean(config.includeActiveBlockers)
    })),
    implementationCoverage: {
      exactSkillMatches: xref.exactMatches,
      partialSkillMatches: xref.partialMatches,
      summary: xref.summary
    },
    concepts: crosswalk.concepts,
    graph: {
      chainEdges: graph.chainEdges,
      topTags: topEntriesFromCounts(tagCounts),
      topIncomingRefs: prefixedEntries
        .map((entry) => ({ id: entry.id, count: entry.incomingChainCount }))
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
        .slice(0, 20)
    },
    entries: prefixedEntries,
    outputRefs: {
      surfaceRegistry: relativeToProject(OUTPUTS.surfaceRegistry),
      promotionQueue: relativeToProject(OUTPUTS.promotionQueue),
      latestReport: relativeToProject(OUTPUTS.latestReport)
    }
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function buildReport(atlas, surfaceRegistry, promotionQueue, reportPath) {
  const lines = [
    "# IX Fabric Atlas Phase 1",
    "",
    `- Generated: ${atlas.generatedAt}`,
    `- Status: ${STATUS.state} / RELEASE=${STATUS.release} / PROMOTION=${STATUS.promotion}`,
    `- Active canon: ${atlas.summary.totalEntries} recursive entries (${atlas.summary.masterEntries} master, ${atlas.summary.subColonyEntries} sub-colony)`,
    `- Archive census: ${atlas.summary.archiveEntryCount} additional mirrored/shadow entries`,
    `- Combined reachable entry count: ${atlas.summary.combinedReachableEntryCount}`,
    `- Prefixes: ${Object.entries(atlas.summary.prefixCounts).map(([key, count]) => `${key}=${count}`).join(", ")}`,
    `- Types: ${Object.entries(atlas.summary.typeCounts).slice(0, 8).map(([key, count]) => `${key}=${count}`).join(", ")}`,
    `- Surfaces: ${surfaceRegistry.summary.surfaceCount} across ${surfaceRegistry.summary.groupCount} groups`,
    `- Roles: ${atlas.summary.roleCount}`,
    `- Concepts: ${atlas.summary.conceptCount}`,
    `- Queue lanes: ${promotionQueue.transitionLanes.length}`,
    "",
    "## Outputs",
    `- ${relativeToProject(OUTPUTS.atlas)} (sha256 ${sha256File(OUTPUTS.atlas)})`,
    `- ${relativeToProject(OUTPUTS.surfaceRegistry)} (sha256 ${sha256File(OUTPUTS.surfaceRegistry)})`,
    `- ${relativeToProject(OUTPUTS.promotionQueue)} (sha256 ${sha256File(OUTPUTS.promotionQueue)})`,
    "",
    "## Current Transition Lanes",
    ...promotionQueue.transitionLanes.map((lane) => `- ${lane.order}. ${lane.id}: ${lane.status} (${lane.currentStage} -> ${lane.nextStage})`),
    "",
    "## Inputs",
    `- ${relativeToProject(PATHS.catalog)}`,
    `- ${relativeToProject(PATHS.crosswalk)}`,
    `- ${relativeToProject(PATHS.subColonies)}`,
    `- ${relativeToProject(PATHS.xref)}`,
    `- ${relativeToProject(PATHS.runtimeSurfaceInventory)}`,
    `- ${relativeToProject(PATHS.deepWavePlan)}`,
    `- ${relativeToProject(PATHS.projectionMap)}`,
    "",
    "## Archive Census",
    ...atlas.archiveCensus.map((archive) => `- ${archive.id}: ${archive.entryCount} (${archive.root})`),
    "",
    `Report path: ${relativeToProject(reportPath)}`
  ];
  return lines.join("\n");
}

function main() {
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-").replace("Z", "");
  const reportPath = path.join(REPORTS_ROOT, `ix-fabric-atlas-phase1-${stamp}.md`);

  const entries = scanIndexEntries();
  const topology = parseMasterTopology(entries);
  const crosswalk = parseCrosswalk(entries);
  const graph = buildEntryGraph(entries);
  const surfaceRegistry = buildSurfaceRegistry(topology);
  const promotionQueue = buildPromotionQueue(surfaceRegistry);
  const xref = parseXref();
  const archiveCensus = collectArchiveCensus();
  const atlas = buildFabricAtlas(entries, topology, crosswalk, graph, surfaceRegistry, promotionQueue, xref, archiveCensus);

  atlas.generatedAt = generatedAt;
  surfaceRegistry.generatedAt = generatedAt;
  promotionQueue.generatedAt = generatedAt;

  writeJsonAtomic(OUTPUTS.atlas, atlas);
  writeJsonAtomic(OUTPUTS.surfaceRegistry, surfaceRegistry);
  writeJsonAtomic(OUTPUTS.promotionQueue, promotionQueue);

  const report = buildReport(atlas, surfaceRegistry, promotionQueue, reportPath);
  writeTextAtomic(reportPath, report);
  writeTextAtomic(OUTPUTS.latestReport, report);

  console.log(JSON.stringify({
    ok: true,
    generatedAt,
    atlasPath: relativeToProject(OUTPUTS.atlas),
    surfaceRegistryPath: relativeToProject(OUTPUTS.surfaceRegistry),
    promotionQueuePath: relativeToProject(OUTPUTS.promotionQueue),
    latestReportPath: relativeToProject(OUTPUTS.latestReport),
    summary: atlas.summary
  }, null, 2));
}

main();
