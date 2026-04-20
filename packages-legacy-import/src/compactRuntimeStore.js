const fs = require("fs");
const path = require("path");

const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { listAgentRoles } = require("./spawnContextBuilder");
const { resolveDataPath } = require("./runtimePaths");

const TYPE_CODES = Object.freeze({
  identity: "IDN",
  mistake: "MSK",
  pattern: "PTN",
  plan: "PLN",
  policy: "POL",
  project: "PRJ",
  reference: "REF",
  rule: "RUL",
  skill: "SKL",
  task: "TSK",
  tool: "TOL"
});

const TIER_CODES = Object.freeze({
  observer: "OBS",
  working: "WRK",
  guard: "GRD",
  control: "CTL"
});

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.round(parsed);
}

function normalizeProfileName(input = {}) {
  const raw = typeof input === "string"
    ? input
    : input && typeof input === "object"
      ? input.profile || input.stage || "running"
      : "running";
  return cleanText(raw).toLowerCase() || "running";
}

function getCompactRuntimePath(profileInput = {}) {
  const profile = normalizeProfileName(profileInput);
  return resolveDataPath("compact-runtime", `${profile}.json`);
}

function buildRoleCode(roleEntry = {}) {
  const agentId = cleanText(roleEntry.agentId);
  if (agentId.startsWith("AGT-")) {
    return agentId.slice(4);
  }
  const role = cleanText(roleEntry.role).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return role.slice(0, 4) || "GEN";
}

function buildEntryCode(typeCode = "", number = 0, id = "") {
  const normalizedTypeCode = cleanText(typeCode).toUpperCase();
  const normalizedNumber = toInt(number, 0);
  if (normalizedTypeCode && normalizedNumber > 0) {
    return `${normalizedTypeCode}${normalizedNumber}`;
  }
  const fallbackId = cleanText(id).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return fallbackId || "UNK";
}

function buildTypeTable(sourceCounts = {}) {
  const typeCounts = sourceCounts && typeof sourceCounts === "object"
    ? sourceCounts.typeCounts || {}
    : {};
  return Object.entries(TYPE_CODES)
    .filter(([type]) => Number(typeCounts[type] || 0) > 0)
    .map(([type, code]) => ({
      type,
      code,
      count: toInt(typeCounts[type], 0)
    }));
}

function buildTierTable() {
  return Object.entries(TIER_CODES).map(([tier, code], index) => ({
    tier,
    code,
    order: index + 1
  }));
}

function buildRoleTable() {
  return listAgentRoles().map((entry) => {
    const tier = cleanText(entry.responsibilityTier).toLowerCase() || "working";
    return {
      role: cleanText(entry.role),
      code: buildRoleCode(entry),
      agentId: cleanText(entry.agentId),
      tier,
      tierCode: TIER_CODES[tier] || "WRK",
      maxEntries: toInt(entry.maxEntries, 0),
      ixTypes: Array.isArray(entry.ixTypes)
        ? entry.ixTypes.map((type) => TYPE_CODES[type] || cleanText(type).toUpperCase().slice(0, 3)).filter(Boolean)
        : [],
      permissions: Array.isArray(entry.permissions) ? entry.permissions.slice() : [],
      priorityChains: toInt(entry.priorityChains, 0)
    };
  });
}

function normalizeChain(chain) {
  return Array.isArray(chain)
    ? chain.map((value) => cleanText(value)).filter(Boolean)
    : [];
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map((value) => cleanText(value).toLowerCase()).filter(Boolean).slice(0, 8)
    : [];
}

function buildEntryTable(documents = []) {
  return documents.map((doc) => {
    const id = cleanText(doc.id || doc.lx || doc.ix);
    const type = cleanText(doc.type).toLowerCase();
    const numberMatch = id.match(/-(\d+)$/);
    const number = numberMatch ? toInt(numberMatch[1], 0) : 0;
    const typeCode = TYPE_CODES[type] || cleanText(type).toUpperCase().slice(0, 3) || "UNK";
    return {
      id,
      n: number,
      tc: typeCode,
      c: buildEntryCode(typeCode, number, id),
      ch: normalizeChain(doc.chain),
      tg: normalizeTags(doc.tags),
      a: Array.isArray(doc.agents) ? doc.agents.map((value) => cleanText(value).toLowerCase()).filter(Boolean).slice(0, 8) : []
    };
  });
}

function buildChainTable(entries = []) {
  const entryMap = new Map(entries.map((entry) => [cleanText(entry.id), entry]));
  const rows = [];
  for (const entry of entries) {
    const from = cleanText(entry.id);
    const fromCode = cleanText(entry.c);
    for (const to of normalizeChain(entry.ch || entry.chain)) {
      const target = entryMap.get(to);
      rows.push({
        f: from,
        t: to,
        fc: fromCode,
        tc: cleanText(target?.c)
      });
    }
  }
  return rows;
}

function buildCompactRuntime(profileInput = {}) {
  const profile = normalizeProfileName(profileInput);
  const payload = readUnifiedIndex({
    profile,
    autoBuild: false,
    scanMode: "blink"
  });
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const entryTable = buildEntryTable(documents);
  return {
    schemaVersion: 1,
    profile,
    sourceContract: cleanText(payload.sourceContract),
    generatedAt: toIsoDate(payload.generatedAt, new Date().toISOString()),
    signature: cleanText(payload.signature),
    documentCount: toInt(payload.documentCount || documents.length, documents.length),
    totals: {
      roles: buildRoleTable().length,
      tiers: Object.keys(TIER_CODES).length,
      types: buildTypeTable(payload.sourceCounts || {}).length,
      chains: buildChainTable(entryTable).length
    },
    dictionaries: {
      typeCodes: TYPE_CODES,
      tierCodes: TIER_CODES
    },
    tables: {
      roleTable: buildRoleTable(),
      tierTable: buildTierTable(),
      typeTable: buildTypeTable(payload.sourceCounts || {}),
      entryTable,
      chainTable: buildChainTable(entryTable)
    }
  };
}

function writeCompactRuntime(profileInput = {}) {
  const compact = buildCompactRuntime(profileInput);
  const outputPath = getCompactRuntimePath(profileInput);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(compact, null, 2), "utf8");
  fs.renameSync(tempPath, outputPath);
  return {
    ok: true,
    profile: compact.profile,
    documentCount: compact.documentCount,
    roleCount: compact.tables.roleTable.length,
    chainCount: compact.tables.chainTable.length,
    outputPath
  };
}

function readCompactRuntime(profileInput = {}) {
  const filePath = getCompactRuntimePath(profileInput);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(String(fs.readFileSync(filePath, "utf8") || ""));
}

module.exports = {
  TYPE_CODES,
  TIER_CODES,
  buildEntryCode,
  buildCompactRuntime,
  writeCompactRuntime,
  readCompactRuntime,
  getCompactRuntimePath
};
