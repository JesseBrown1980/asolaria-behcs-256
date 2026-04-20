const fs = require("fs");
const path = require("path");

const SKILLS_ROOT = path.join(__dirname, "..", "skills");
const SKILL_FILE = "skill.json";

function normalizeSkillId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeText(value, limit = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, limit);
}

function normalizeRisk(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "low";
}

function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const tag of tags) {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) continue;
    if (!/^[a-z0-9][a-z0-9._:-]{0,39}$/.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizePermissions(value) {
  const items = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const normalized = String(item || "").trim().toLowerCase();
    if (!normalized) continue;
    if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeSteps(value) {
  const steps = Array.isArray(value) ? value : [];
  return steps.map((step) => {
    const safeStep = step && typeof step === "object" ? step : {};
    const action = String(safeStep.action || "").trim().toLowerCase();
    const note = normalizeText(safeStep.note || "", 500);
    const payload = safeStep.payload && typeof safeStep.payload === "object" ? safeStep.payload : {};
    const permissions = normalizePermissions(safeStep.permissions || safeStep.perms || []);
    const requiresApproval = Boolean(safeStep.requiresApproval ?? safeStep.approvalRequired);
    return {
      action,
      note,
      payload,
      permissions,
      requiresApproval
    };
  }).filter((step) => step.action);
}

function validateSkillDefinition(raw, sourcePath) {
  const def = raw && typeof raw === "object" ? raw : {};
  const id = normalizeSkillId(def.id);
  if (!id) {
    throw new Error(`Invalid or missing skill id in ${sourcePath}`);
  }

  const title = normalizeText(def.title || def.name || "", 140) || id;
  const description = normalizeText(def.description || "", 600);
  const version = normalizeText(def.version || "0.0.0", 40) || "0.0.0";
  const risk = normalizeRisk(def.risk);
  const tags = normalizeTags(def.tags);
  const permissions = normalizePermissions(def.permissions || def.perms || []);
  const steps = normalizeSteps(def.steps);
  if (!steps.length) {
    throw new Error(`Skill ${id} has no executable steps.`);
  }

  return {
    schemaVersion: 1,
    id,
    title,
    description,
    version,
    risk,
    tags,
    permissions,
    steps,
    sourcePath
  };
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${error.message}`);
  }
  return parsed;
}

function listSkillFolders() {
  try {
    return fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (_error) {
    return [];
  }
}

function loadRegistry() {
  const folders = listSkillFolders();
  const byId = new Map();
  const errors = [];

  for (const folder of folders) {
    const skillPath = path.join(SKILLS_ROOT, folder, SKILL_FILE);
    if (!fs.existsSync(skillPath)) {
      continue;
    }
    try {
      const parsed = readJsonFile(skillPath);
      const def = validateSkillDefinition(parsed, skillPath);
      if (byId.has(def.id)) {
        errors.push(`Duplicate skill id "${def.id}" at ${skillPath}`);
        continue;
      }
      byId.set(def.id, def);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    root: SKILLS_ROOT,
    loadedAt: new Date().toISOString(),
    total: byId.size,
    errors,
    byId
  };
}

let registryCache = null;
let registryCacheAtMs = 0;

function getSkillRegistry(options = {}) {
  const force = Boolean(options.force);
  const maxAgeMs = Math.max(250, Math.min(60000, Number(options.maxAgeMs || 8000)));
  const now = Date.now();
  if (!force && registryCache && now - registryCacheAtMs < maxAgeMs) {
    return registryCache;
  }
  registryCache = loadRegistry();
  registryCacheAtMs = now;
  return registryCache;
}

function listSkillSummaries() {
  const registry = getSkillRegistry();
  return Array.from(registry.byId.values())
    .map((skill) => {
      return {
        id: skill.id,
        title: skill.title,
        description: skill.description,
        version: skill.version,
        risk: skill.risk,
        tags: skill.tags,
        permissions: skill.permissions || []
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getSkillDefinition(id) {
  const key = normalizeSkillId(id);
  if (!key) return null;
  const registry = getSkillRegistry();
  const skill = registry.byId.get(key);
  return skill ? { ...skill } : null;
}

function reloadSkillRegistry() {
  return getSkillRegistry({ force: true });
}

module.exports = {
  normalizeSkillId,
  getSkillRegistry,
  reloadSkillRegistry,
  listSkillSummaries,
  getSkillDefinition
};
