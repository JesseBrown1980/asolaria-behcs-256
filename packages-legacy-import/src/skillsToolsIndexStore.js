const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { getSkillRegistry, listSkillSummaries } = require("./skillRegistry");
const { getSkillActionCatalog } = require("./skillRunner");
const { discoverCodexSkills } = require("./codexSkillCatalog");
const { getMistakePatternSummary, listMistakePatterns } = require("./mistakePatternStore");

const indexPath = resolveDataPath("skills-tools-index.json");
let cache = null;
let cacheAtMs = 0;

function ensureDir() {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureDir();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeExternalProviderRows(rows) {
  const source = Array.isArray(rows) ? rows : [];
  return source.map((row) => {
    const item = row && typeof row === "object" ? row : {};
    return {
      id: String(item.id || "").trim().toLowerCase(),
      enabled: Boolean(item.enabled),
      configured: Boolean(item.configured),
      apiStyle: String(item.apiStyle || "").trim().toLowerCase(),
      mcpEnabled: Boolean(item.mcpEnabled),
      mcpConfigured: Boolean(item.mcpConfigured),
      mcpConfigError: String(item.mcpConfigError || "").trim() || null,
      mcpServerLabel: String(item.mcpServerLabel || "").trim() || null,
      mcpServerUrl: String(item.mcpServerUrl || "").trim() || null,
      mcpConnectorId: String(item.mcpConnectorId || "").trim() || null,
      mcpPreset: String(item.mcpPreset || "").trim() || null,
      mcpApprovalMode: String(item.mcpApprovalMode || "").trim().toLowerCase() || "auto",
      mcpAllowedToolsCount: Number(item.mcpAllowedToolsCount || 0) || 0
    };
  }).filter((row) => row.id);
}

function normalizeMcpCacheStatus(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    providerCatalogCount: Number(source.providerCatalogCount || 0) || 0,
    scopedContextCount: Number(source.scopedContextCount || 0) || 0,
    updatedAt: String(source.updatedAt || "").trim() || ""
  };
}

function buildCodexRiskCounts(codexSkills, asolariaSkills) {
  const counts = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    unknown: 0
  };
  const riskBySkillId = new Map();
  for (const skill of Array.isArray(asolariaSkills) ? asolariaSkills : []) {
    const id = String(skill?.id || "").trim().toLowerCase();
    if (!id) continue;
    const risk = String(skill?.risk || "low").trim().toLowerCase();
    riskBySkillId.set(id, risk);
  }
  for (const item of Array.isArray(codexSkills?.items) ? codexSkills.items : []) {
    const match = String(item?.asolariaMatch || "").trim().toLowerCase();
    if (!match) {
      counts.unknown += 1;
      continue;
    }
    const risk = String(riskBySkillId.get(match) || "low").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, risk)) {
      counts[risk] += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

function incrementCount(map, key) {
  const id = String(key || "").trim().toLowerCase();
  if (!id) return;
  map[id] = (Number(map[id] || 0) + 1);
}

function buildMistakeLinkIndex(patternRows = []) {
  const bySkill = {};
  const byTool = {};
  const byActivity = {};
  for (const row of Array.isArray(patternRows) ? patternRows : []) {
    for (const skillId of Array.isArray(row?.linkedSkills) ? row.linkedSkills : []) {
      incrementCount(bySkill, skillId);
    }
    for (const toolId of Array.isArray(row?.linkedTools) ? row.linkedTools : []) {
      incrementCount(byTool, toolId);
    }
    for (const activityId of Array.isArray(row?.linkedActivities) ? row.linkedActivities : []) {
      incrementCount(byActivity, activityId);
    }
  }
  return {
    bySkill,
    byTool,
    byActivity
  };
}

function buildSkillsToolsIndex(options = {}) {
  const registry = getSkillRegistry({ maxAgeMs: 0 });
  const skills = listSkillSummaries();
  const actions = getSkillActionCatalog();
  const codexSkills = discoverCodexSkills({
    asolariaSkillIds: skills.map((item) => item.id),
    roots: options.codexSkillRoots
  });
  codexSkills.riskCounts = buildCodexRiskCounts(codexSkills, skills);
  const mistakeSummary = getMistakePatternSummary();
  const mistakeList = listMistakePatterns({
    status: "active",
    limit: 400
  });
  const mistakeLinkIndex = buildMistakeLinkIndex(mistakeList.patterns);
  const externalProviders = normalizeExternalProviderRows(options.externalProviders);
  const mcpProviders = externalProviders.filter((row) => row.mcpEnabled || row.mcpConfigured || row.mcpServerUrl);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: registry.root,
    skills: {
      total: registry.total,
      loadedAt: registry.loadedAt,
      errors: registry.errors,
      items: skills
    },
    tools: {
      totalActions: actions.length,
      actions
    },
    mistakes: {
      summary: {
        updatedAt: String(mistakeSummary?.updatedAt || ""),
        counts: mistakeSummary?.counts || {
          total: 0,
          active: 0,
          archived: 0,
          obsolete: 0
        }
      },
      activeSample: Array.isArray(mistakeList.patterns)
        ? mistakeList.patterns.slice(0, 120).map((row) => ({
          id: String(row?.id || ""),
          code: String(row?.code || ""),
          severity: String(row?.severity || "medium"),
          occurrences: Number(row?.occurrences || 0),
          linkedSkills: Array.isArray(row?.linkedSkills) ? row.linkedSkills.slice(0, 10) : [],
          linkedTools: Array.isArray(row?.linkedTools) ? row.linkedTools.slice(0, 10) : [],
          linkedActivities: Array.isArray(row?.linkedActivities) ? row.linkedActivities.slice(0, 10) : []
        }))
        : [],
      links: mistakeLinkIndex
    },
    codexSkills,
    mcp: {
      providers: mcpProviders,
      cache: normalizeMcpCacheStatus(options.mcpCache)
    }
  };
}

function tryReadIndexFromDisk() {
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    if (!String(raw || "").trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function rebuildSkillsToolsIndex(options = {}) {
  const index = buildSkillsToolsIndex(options);
  writeJsonAtomic(indexPath, index);
  cache = index;
  cacheAtMs = Date.now();
  return index;
}

function readSkillsToolsIndex(options = {}) {
  const force = Boolean(options.force);
  const maxAgeMs = Math.max(250, Math.min(300000, Number(options.maxAgeMs || 60000)));
  const now = Date.now();
  if (!force && cache && now - cacheAtMs <= maxAgeMs) {
    return cache;
  }
  if (!force) {
    const disk = tryReadIndexFromDisk();
    if (disk) {
      cache = disk;
      cacheAtMs = now;
      return disk;
    }
  }
  return rebuildSkillsToolsIndex(options);
}

module.exports = {
  getSkillsToolsIndexPath: () => indexPath,
  readSkillsToolsIndex,
  rebuildSkillsToolsIndex,
  buildSkillsToolsIndex
};
