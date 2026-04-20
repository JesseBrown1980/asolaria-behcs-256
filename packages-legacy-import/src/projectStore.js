const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");

const projectsPath = resolveDataPath("projects.json");
const PROJECT_GROUPS = ["projects", "tasks", "skills", "runtime"];
const maxProjects = Math.max(20, Number(process.env.ASOLARIA_PROJECTS_MAX || 500));

function buildCurrentUserCodexSkillsFolder() {
  return `${os.homedir().replace(/\\/g, "/")}/.codex/skills/`;
}

function rewriteLegacyHostFolder(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";
  if (normalized.toLowerCase() === "c:/users/acer/.codex/skills/") {
    return buildCurrentUserCodexSkillsFolder();
  }
  return normalized;
}

const DEFAULT_PROJECTS = Object.freeze([
  {
    id: "asolaria",
    label: "Asolaria Core",
    marker: "[ASOLARIA]",
    group: "runtime",
    folders: [
      "Asolaria/src/",
      "Asolaria/services/",
      "Asolaria/tools/",
      "Asolaria/public/"
    ]
  },
  {
    id: "healthcare",
    label: "AI Healthcare",
    marker: "[AIHC]",
    group: "tasks",
    folders: [
      "ai_healthcare_project/src/",
      "ai_healthcare_project/tests/",
      "ai_healthcare_project/docs/",
      "ai_healthcare_project/data/"
    ]
  },
  {
    id: "bridge",
    label: "Bridge Ops",
    marker: "[BRIDGE]",
    group: "runtime",
    folders: [
      "codex-bridge/bridge.js",
      "codex-bridge/watchdog.ps1",
      "codex-bridge/airlock-ingress.js",
      "codex-bridge/core-gate-bot.js"
    ]
  },
  {
    id: "qdd",
    label: "QDD",
    marker: "[QDD]",
    group: "projects",
    folders: [
      "D:/projects/QDD/ebacmap-master/",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/",
      "D:/projects/QDD/ebacmap-master/apps/queue-server/",
      "Asolaria/reports/qdd-codex-restart-packet-latest.md"
    ]
  },
  {
    id: "skillslab",
    label: "Skills Lab",
    marker: "[SKILL]",
    group: "skills",
    folders: [
      "Asolaria/skills/",
      "Asolaria/tools/",
      buildCurrentUserCodexSkillsFolder()
    ]
  }
]);

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(projectsPath), { recursive: true });
}

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

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function hasField(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function slugifyId(value, fallback = "project") {
  const base = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (!base || base === "all") {
    return cleanText(fallback || "project")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "project";
  }
  return base;
}

function normalizeGroup(value, fallback = "projects") {
  const normalized = cleanText(value).toLowerCase();
  if (PROJECT_GROUPS.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeFolders(input) {
  const raw = Array.isArray(input)
    ? input.map((item) => String(item || "")).join("\n")
    : String(input || "");
  const entries = raw
    .split(/[\n,]/g)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .map((item) => rewriteLegacyHostFolder(item).replace(/[\\]+/g, "/").replace(/\/\/+/g, "/"))
    .slice(0, 200);
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.slice(0, 260));
    if (out.length >= 120) break;
  }
  return out;
}

function normalizeMarker(value) {
  const text = cleanText(value).slice(0, 48);
  return text;
}

function normalizeProject(raw, nowIso, fallbackId = "") {
  const source = raw && typeof raw === "object" ? raw : {};
  const createdAt = toIsoDate(source.createdAt, nowIso);
  const updatedAt = toIsoDate(source.updatedAt, createdAt || nowIso);
  const label = cleanText(source.label || source.name).slice(0, 100) || "Project";
  const archived = Boolean(source.archived);
  return {
    id: slugifyId(source.id || fallbackId || label, "project"),
    label,
    marker: normalizeMarker(source.marker),
    group: normalizeGroup(source.group, "projects"),
    folders: normalizeFolders(source.folders),
    archived,
    archivedAt: archived ? toIsoDate(source.archivedAt, updatedAt || nowIso) : "",
    createdAt,
    updatedAt
  };
}

function createInitialDoc() {
  const now = new Date().toISOString();
  const projects = DEFAULT_PROJECTS.map((project) => normalizeProject(project, now, project.id));
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    projects
  };
}

function normalizeDoc(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const byId = new Map();
  const rows = Array.isArray(source.projects) ? source.projects : [];
  for (const item of rows) {
    const normalized = normalizeProject(item, now, item?.id);
    if (!normalized.id || normalized.id === "all") continue;
    if (byId.has(normalized.id)) continue;
    byId.set(normalized.id, normalized);
    if (byId.size >= maxProjects) break;
  }
  if (byId.size < 1) {
    for (const fallback of DEFAULT_PROJECTS) {
      const normalized = normalizeProject(fallback, now, fallback.id);
      if (!normalized.id || normalized.id === "all") continue;
      byId.set(normalized.id, normalized);
    }
  }
  const projects = Array.from(byId.values())
    .sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
  const latestAt = projects.reduce((max, project) => {
    const stamp = toIsoDate(project.updatedAt, "");
    if (!stamp) return max;
    if (!max) return stamp;
    return new Date(stamp).getTime() >= new Date(max).getTime() ? stamp : max;
  }, toIsoDate(source.updatedAt, now));
  return {
    version: 1,
    createdAt: toIsoDate(source.createdAt, now),
    updatedAt: latestAt || now,
    projects
  };
}

function writeDoc(doc) {
  ensureDir();
  const normalized = normalizeDoc(doc);
  const tempPath = `${projectsPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, projectsPath);
  cache = normalized;
  return normalized;
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(projectsPath)) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    cache = normalizeDoc(parsed);
    return cache;
  } catch (_error) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
}

function summarizeProjects(doc) {
  const source = doc && typeof doc === "object" ? doc : loadDoc();
  const total = source.projects.length;
  let archived = 0;
  let active = 0;
  let latestUpdatedAt = "";
  for (const project of source.projects) {
    if (project.archived) archived += 1;
    else active += 1;
    const stamp = toIsoDate(project.updatedAt, "");
    if (stamp && (!latestUpdatedAt || new Date(stamp).getTime() >= new Date(latestUpdatedAt).getTime())) {
      latestUpdatedAt = stamp;
    }
  }
  return {
    total,
    active,
    archived,
    latestUpdatedAt
  };
}

function listProjects(options = {}) {
  const doc = loadDoc();
  const includeArchived = hasField(options, "includeArchived") ? Boolean(options.includeArchived) : false;
  const limit = clampInt(options.limit, 200, 1, 1000);
  let rows = doc.projects.slice();
  if (!includeArchived) {
    rows = rows.filter((project) => !project.archived);
  }
  return rows
    .sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")))
    .slice(0, limit)
    .map((project) => JSON.parse(JSON.stringify(project)));
}

function getProjectById(id, options = {}) {
  const projectId = slugifyId(id, "");
  if (!projectId || projectId === "all") return null;
  const includeArchived = hasField(options, "includeArchived") ? Boolean(options.includeArchived) : false;
  const project = loadDoc().projects.find((row) => row.id === projectId);
  if (!project) return null;
  if (!includeArchived && project.archived) return null;
  return JSON.parse(JSON.stringify(project));
}

function createProject(input = {}) {
  const doc = loadDoc();
  const now = new Date().toISOString();
  const label = cleanText(input.label || input.name).slice(0, 100);
  if (!label) {
    throw new Error("Project label is required.");
  }
  const id = slugifyId(input.id || label, "project");
  if (!id || id === "all") {
    throw new Error("Project id is invalid.");
  }
  if (doc.projects.some((project) => project.id === id)) {
    throw new Error(`Project "${id}" already exists.`);
  }
  if (doc.projects.length >= maxProjects) {
    throw new Error(`Project limit reached (${maxProjects}).`);
  }
  const project = normalizeProject({
    id,
    label,
    marker: input.marker,
    group: input.group,
    folders: input.folders,
    archived: false,
    createdAt: now,
    updatedAt: now
  }, now, id);
  doc.projects.push(project);
  doc.updatedAt = now;
  writeDoc(doc);
  return {
    project: JSON.parse(JSON.stringify(project)),
    summary: summarizeProjects(doc)
  };
}

function updateProject(projectId, patch = {}) {
  const id = slugifyId(projectId, "");
  if (!id || id === "all") {
    throw new Error("Project id is required.");
  }
  const doc = loadDoc();
  const index = doc.projects.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new Error("Project not found.");
  }
  const now = new Date().toISOString();
  const current = doc.projects[index];
  const next = { ...current };
  if (hasField(patch, "label") || hasField(patch, "name")) {
    const label = cleanText(patch.label || patch.name).slice(0, 100);
    if (!label) throw new Error("Project label cannot be empty.");
    next.label = label;
  }
  if (hasField(patch, "marker")) {
    next.marker = normalizeMarker(patch.marker);
  }
  if (hasField(patch, "group")) {
    next.group = normalizeGroup(patch.group, next.group);
  }
  if (hasField(patch, "folders")) {
    next.folders = normalizeFolders(patch.folders);
  }
  if (hasField(patch, "archived")) {
    const archived = Boolean(patch.archived);
    next.archived = archived;
    next.archivedAt = archived ? (next.archivedAt || now) : "";
  }
  next.updatedAt = now;
  doc.projects[index] = normalizeProject(next, now, id);
  doc.updatedAt = now;
  writeDoc(doc);
  return {
    project: JSON.parse(JSON.stringify(doc.projects[index])),
    summary: summarizeProjects(doc)
  };
}

function deleteProject(projectId, options = {}) {
  const id = slugifyId(projectId, "");
  if (!id || id === "all") {
    throw new Error("Project id is required.");
  }
  const hard = Boolean(options.hard);
  const doc = loadDoc();
  const index = doc.projects.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new Error("Project not found.");
  }
  const now = new Date().toISOString();
  if (hard) {
    const removed = doc.projects.splice(index, 1)[0];
    doc.updatedAt = now;
    writeDoc(doc);
    return {
      mode: "hard",
      removed: JSON.parse(JSON.stringify(removed)),
      summary: summarizeProjects(doc)
    };
  }
  doc.projects[index] = normalizeProject({
    ...doc.projects[index],
    archived: true,
    archivedAt: now,
    updatedAt: now
  }, now, id);
  doc.updatedAt = now;
  writeDoc(doc);
  return {
    mode: "soft",
    project: JSON.parse(JSON.stringify(doc.projects[index])),
    summary: summarizeProjects(doc)
  };
}

function buildProjectScopes(projects = []) {
  const rows = Array.isArray(projects) ? projects : [];
  const active = rows.filter((project) => !project.archived);
  const folderSeen = new Set();
  const allFolders = [];
  for (const project of active) {
    for (const folder of Array.isArray(project.folders) ? project.folders : []) {
      const normalized = cleanText(folder);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (folderSeen.has(key)) continue;
      folderSeen.add(key);
      allFolders.push(normalized);
    }
  }
  const allScope = {
    id: "all",
    label: "All Projects",
    marker: "",
    group: "all",
    folders: allFolders
  };
  const scopes = active.map((project) => ({
    id: project.id,
    label: project.label,
    marker: String(project.marker || ""),
    group: normalizeGroup(project.group, "projects"),
    folders: Array.isArray(project.folders) ? project.folders.slice(0, 120) : []
  }));
  return [allScope, ...scopes];
}

function getProjectSummary() {
  return summarizeProjects(loadDoc());
}

module.exports = {
  PROJECT_GROUPS,
  projectsPath,
  getProjectSummary,
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  buildProjectScopes
};
