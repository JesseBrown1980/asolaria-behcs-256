const fs = require("fs");
const os = require("os");
const path = require("path");

function cleanText(value) {
  return String(value || "").trim();
}

function getClaudeProjectsRoot(options = {}) {
  const explicit = cleanText(options.projectsRoot || "");
  if (explicit) {
    return path.resolve(explicit);
  }
  const homeDir = cleanText(options.homeDir || process.env.USERPROFILE || process.env.HOME || os.homedir());
  if (!homeDir) {
    return "";
  }
  return path.join(homeDir, ".claude", "projects");
}

function splitPathSegments(targetPath = "") {
  const raw = cleanText(targetPath);
  if (!raw) {
    return { prefix: "", segments: [] };
  }

  const windowsLike = /^[a-zA-Z]:[\\/]/.test(raw);
  if (windowsLike) {
    const resolved = path.win32.resolve(raw);
    const root = path.win32.parse(resolved).root;
    const prefix = cleanText(root).replace(/[\\/:]+/g, "").toUpperCase();
    const body = resolved.slice(root.length);
    const segments = body.split(/[\\/]+/).filter(Boolean);
    return { prefix, segments };
  }

  const resolved = path.resolve(raw);
  const segments = resolved.split(path.sep).filter(Boolean);
  return { prefix: "", segments };
}

function encodeClaudeProjectName(targetPath = "") {
  const { prefix, segments } = splitPathSegments(targetPath);
  if (prefix) {
    return segments.length > 0 ? `${prefix}--${segments.join("-")}` : `${prefix}--`;
  }
  if (segments.length === 0) {
    return "";
  }
  return segments.join("-");
}

function getClaudeProjectNameCandidates(targetPath = "") {
  const { prefix, segments } = splitPathSegments(targetPath);
  const candidates = [];

  if (prefix) {
    for (let index = segments.length; index >= 0; index -= 1) {
      const slice = segments.slice(0, index);
      candidates.push(slice.length > 0 ? `${prefix}--${slice.join("-")}` : `${prefix}--`);
    }
    return candidates;
  }

  for (let index = segments.length; index >= 1; index -= 1) {
    candidates.push(segments.slice(0, index).join("-"));
  }
  return candidates;
}

function listClaudeMemoryMarkdownPaths(options = {}) {
  const projectsRoot = getClaudeProjectsRoot(options);
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return [];
  }

  const candidates = [];
  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const memoryPath = path.join(projectsRoot, entry.name, "memory", "MEMORY.md");
    if (fs.existsSync(memoryPath)) {
      candidates.push(memoryPath);
    }
  }
  return candidates.sort((left, right) => left.localeCompare(right));
}

function findPreferredClaudeMemoryPath(options = {}) {
  const projectsRoot = getClaudeProjectsRoot(options);
  if (!projectsRoot || !fs.existsSync(projectsRoot)) {
    return "";
  }

  const targetProjectRoot = cleanText(options.projectRoot || "");
  if (targetProjectRoot) {
    for (const projectName of getClaudeProjectNameCandidates(targetProjectRoot)) {
      const candidate = path.join(projectsRoot, projectName, "memory", "MEMORY.md");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return listClaudeMemoryMarkdownPaths({ projectsRoot })[0] || "";
}

module.exports = {
  encodeClaudeProjectName,
  getClaudeProjectNameCandidates,
  getClaudeProjectsRoot,
  listClaudeMemoryMarkdownPaths,
  findPreferredClaudeMemoryPath
};
