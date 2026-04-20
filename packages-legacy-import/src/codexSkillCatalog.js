const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

function normalizePathKey(value) {
  const resolved = path.resolve(String(value || "").trim());
  if (process.platform === "win32") {
    return resolved.toLowerCase();
  }
  return resolved;
}

function toPosixRelative(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function resolveCodexSkillRoots(options = {}) {
  const requested = Array.isArray(options.roots) ? options.roots : [];
  const discovered = [];

  if (requested.length > 0) {
    discovered.push(...requested);
  }

  const codexHome = String(process.env.CODEX_HOME || "").trim();
  if (codexHome) {
    discovered.push(path.join(codexHome, "skills"));
  }

  discovered.push(path.join(os.homedir(), ".codex", "skills"));

  const out = [];
  const seen = new Set();
  for (const candidate of discovered) {
    const trimmed = String(candidate || "").trim();
    if (!trimmed) continue;
    const resolved = path.resolve(trimmed);
    const key = normalizePathKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        out.push(resolved);
      }
    } catch {
      // ignore invalid roots
    }
  }
  return out;
}

function listSkillMarkdownDirs(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    let hasSkillMd = false;
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "SKILL.md") {
        hasSkillMd = true;
        break;
      }
    }
    if (hasSkillMd) {
      out.push(current);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return out;
}

function normalizeAsolariaSkillIdSet(value) {
  const rows = Array.isArray(value) ? value : [];
  const out = new Set();
  for (const row of rows) {
    const id = String(row || "").trim().toLowerCase();
    if (!id) continue;
    out.add(id);
  }
  return out;
}

function classifyCodexScope(relativeDir) {
  const rel = toPosixRelative(relativeDir);
  if (rel === ".system" || rel.startsWith(".system/")) {
    return "system";
  }
  return "custom";
}

function shortStableHash(value, length = 10) {
  return crypto
    .createHash("sha1")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, Math.max(4, Math.min(24, Number(length) || 10)));
}

function normalizeWrapperSuffix(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\\/g, "/");
  if (!raw) return "skill";
  let normalized = raw
    .replace(/\//g, ".")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[.:-]+/g, "")
    .replace(/[.:-]+$/g, "")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  if (!normalized) {
    normalized = `skill-${shortStableHash(raw, 8)}`;
  }
  return normalized;
}

function buildCodexWrapperSkillId(relativeDir) {
  const prefix = "codex.ref.";
  const maxTotalLen = 80;
  const maxSuffixLen = Math.max(1, maxTotalLen - prefix.length);
  const suffix = normalizeWrapperSuffix(relativeDir);
  if (suffix.length <= maxSuffixLen) {
    return `${prefix}${suffix}`;
  }
  const digest = shortStableHash(suffix, 8);
  const trimmed = suffix.slice(0, Math.max(8, maxSuffixLen - (digest.length + 1))).replace(/[.:-]+$/g, "");
  return `${prefix}${trimmed}-${digest}`;
}

function buildCodexWrapperFolderName(relativeDir) {
  const id = buildCodexWrapperSkillId(relativeDir);
  const folder = id
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return folder || `codex-ref-${shortStableHash(relativeDir, 8)}`;
}

function buildCodexCatalogLabels(scope, integration) {
  return [
    "source:codex",
    `scope:${scope}`,
    `integration:${String(integration || "reference_only").trim().toLowerCase() || "reference_only"}`
  ];
}

function discoverCodexSkills(options = {}) {
  const roots = resolveCodexSkillRoots(options);
  const asolariaIds = normalizeAsolariaSkillIdSet(options.asolariaSkillIds);
  const byKey = new Map();

  for (const root of roots) {
    const skillDirs = listSkillMarkdownDirs(root);
    for (const fullDir of skillDirs) {
      const relative = toPosixRelative(path.relative(root, fullDir));
      if (!relative) continue;
      const id = relative.toLowerCase();
      const scope = classifyCodexScope(relative);
      const baseName = path.basename(fullDir);
      const inferredAsolariaId = relative.replace(/\//g, ".").toLowerCase();
      const wrapperSkillId = buildCodexWrapperSkillId(relative);
      const wrapperFolder = buildCodexWrapperFolderName(relative);
      const asolariaMatch = asolariaIds.has(inferredAsolariaId)
        ? inferredAsolariaId
        : (
          asolariaIds.has(baseName.toLowerCase())
            ? baseName.toLowerCase()
            : (asolariaIds.has(wrapperSkillId) ? wrapperSkillId : "")
        );
      const integration = asolariaMatch
        ? (asolariaMatch === wrapperSkillId ? "wrapper" : "native_match")
        : "reference_only";

      const item = {
        id,
        name: baseName,
        relativePath: relative,
        fullPath: fullDir,
        scope,
        wrapperSkillId,
        wrapperFolder,
        labels: buildCodexCatalogLabels(scope, integration),
        executableInAsolaria: Boolean(asolariaMatch),
        integration,
        asolariaMatch
      };
      const key = normalizePathKey(fullDir);
      if (!byKey.has(key)) {
        byKey.set(key, item);
      }
    }
  }

  const items = Array.from(byKey.values())
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));

  let systemTotal = 0;
  let customTotal = 0;
  let referenceOnlyTotal = 0;
  let executableTotal = 0;
  let wrapperTotal = 0;
  let nativeMatchTotal = 0;
  const overlapWithAsolaria = [];
  for (const item of items) {
    if (item.scope === "system") {
      systemTotal += 1;
    } else {
      customTotal += 1;
    }
    if (item.executableInAsolaria) {
      executableTotal += 1;
    } else {
      referenceOnlyTotal += 1;
    }
    if (item.integration === "wrapper") {
      wrapperTotal += 1;
    } else if (item.integration === "native_match") {
      nativeMatchTotal += 1;
    }
    if (item.asolariaMatch) {
      overlapWithAsolaria.push({
        codexId: item.id,
        asolariaSkillId: item.asolariaMatch,
        matchType: item.integration
      });
    }
  }

  return {
    discoveredAt: new Date().toISOString(),
    roots,
    total: items.length,
    systemTotal,
    customTotal,
    referenceOnlyTotal,
    executableTotal,
    wrapperTotal,
    nativeMatchTotal,
    overlapWithAsolariaTotal: overlapWithAsolaria.length,
    overlapWithAsolaria,
    items
  };
}

module.exports = {
  resolveCodexSkillRoots,
  discoverCodexSkills,
  buildCodexWrapperSkillId,
  buildCodexWrapperFolderName
};
