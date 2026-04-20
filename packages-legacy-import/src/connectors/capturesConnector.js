const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { capturesDir } = require("../runtimePaths");
const { addNotebookNote } = require("../notebookStore");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DESKTOP_AUTO_RE = /^desktop-\d{4}-\d{2}-\d{2}t/i;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampBytes(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function asEnum(value, allowed, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

function isImagePath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function safeNowMs() {
  const now = Date.now();
  return Number.isFinite(now) ? now : new Date().getTime();
}

function safeResolveWithinCaptures(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) {
    throw new Error("capturePath is required.");
  }

  const base = path.resolve(capturesDir);
  const resolved = path.resolve(raw.startsWith(base) ? raw : path.join(base, raw));
  const rel = path.relative(base, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("capturePath must resolve within captures directory.");
  }
  return { base, resolved, rel };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function moveFileSafe(srcPath, destPath) {
  ensureDir(path.dirname(destPath));

  if (!fs.existsSync(srcPath)) {
    throw new Error("Capture file not found.");
  }

  // Avoid accidental overwrite; if destination exists, add a short suffix.
  if (fs.existsSync(destPath)) {
    const ext = path.extname(destPath);
    const base = destPath.slice(0, Math.max(0, destPath.length - ext.length));
    const suffix = crypto.randomBytes(3).toString("hex");
    destPath = `${base}-${suffix}${ext}`;
  }

  fs.renameSync(srcPath, destPath);
  return destPath;
}

function listFilesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
}

function listImageFilesRecursive(rootDir, options = {}) {
  const maxFiles = clampInt(options.maxFiles, 60000, 0, 600000);
  const maxDepth = clampInt(options.maxDepth, 10, 1, 64);

  const results = [];
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.depth > maxDepth) continue;
    const entries = listFilesInDir(current.dir);
    for (const entry of entries) {
      const abs = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dir: abs, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isImagePath(entry.name)) continue;
      let stat = null;
      try {
        stat = fs.statSync(abs);
      } catch (_error) {
        stat = null;
      }
      results.push({
        absPath: abs,
        mtimeMs: Number(stat?.mtimeMs || 0),
        sizeBytes: Number(stat?.size || 0)
      });
      if (maxFiles > 0 && results.length >= maxFiles) {
        return results;
      }
    }
  }
  return results;
}

function getCapturesPolicy() {
  const desktopAutoKeep = clampInt(process.env.ASOLARIA_CAPTURES_DESKTOP_AUTO_KEEP, 500, 0, 50000);
  const desktopAutoMinAgeMinutes = clampInt(process.env.ASOLARIA_CAPTURES_DESKTOP_AUTO_MIN_AGE_MINUTES, 10, 0, 24 * 60);
  const desktopAutoPruneMode = asEnum(process.env.ASOLARIA_CAPTURES_DESKTOP_AUTO_PRUNE_MODE, ["delete", "trash"], "delete");

  const importantDirName = String(process.env.ASOLARIA_CAPTURES_IMPORTANT_DIR || "_important").trim() || "_important";
  const trashDirName = String(process.env.ASOLARIA_CAPTURES_TRASH_DIR || "_trash").trim() || "_trash";

  const importantMaxFiles = clampInt(process.env.ASOLARIA_CAPTURES_IMPORTANT_MAX_FILES, 400, 0, 20000);
  const importantMaxBytes = clampBytes(process.env.ASOLARIA_CAPTURES_IMPORTANT_MAX_BYTES, 5 * 1024 ** 3, 0, 1024 ** 4);

  const trashMaxAgeDays = clampInt(process.env.ASOLARIA_CAPTURES_TRASH_MAX_AGE_DAYS, 7, 0, 365);
  const trashMaxBytes = clampBytes(process.env.ASOLARIA_CAPTURES_TRASH_MAX_BYTES, 2 * 1024 ** 3, 0, 1024 ** 4);

  return {
    capturesDir,
    desktopAuto: {
      pattern: "desktop-<iso8601>.png",
      keep: desktopAutoKeep,
      minAgeMinutes: desktopAutoMinAgeMinutes,
      pruneMode: desktopAutoPruneMode
    },
    important: {
      dirName: importantDirName,
      maxFiles: importantMaxFiles,
      maxBytes: importantMaxBytes
    },
    trash: {
      dirName: trashDirName,
      maxAgeDays: trashMaxAgeDays,
      maxBytes: trashMaxBytes
    }
  };
}

function getDesktopCapturesDir() {
  return path.join(capturesDir, "desktop");
}

function getImportantDir(policy) {
  return path.join(capturesDir, String(policy?.important?.dirName || "_important"));
}

function getTrashDir(policy) {
  return path.join(capturesDir, String(policy?.trash?.dirName || "_trash"));
}

function collectCapturesStats(policy) {
  const desktopDir = getDesktopCapturesDir();
  const importantDir = getImportantDir(policy);
  const trashDir = getTrashDir(policy);

  const desktopEntries = listFilesInDir(desktopDir);
  let desktopAutoCount = 0;
  let desktopAutoBytes = 0;
  let desktopManualCount = 0;
  let desktopManualBytes = 0;

  for (const entry of desktopEntries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!isImagePath(name)) continue;
    let stat = null;
    try {
      stat = fs.statSync(path.join(desktopDir, name));
    } catch (_error) {
      stat = null;
    }
    const size = Number(stat?.size || 0);
    if (DESKTOP_AUTO_RE.test(name)) {
      desktopAutoCount += 1;
      desktopAutoBytes += size;
    } else {
      desktopManualCount += 1;
      desktopManualBytes += size;
    }
  }

  let importantCount = 0;
  let importantBytes = 0;
  const importantFiles = listImageFilesRecursive(importantDir, { maxFiles: 200000, maxDepth: 20 });
  for (const file of importantFiles) {
    importantCount += 1;
    importantBytes += Number(file.sizeBytes || 0);
  }

  // Trash stats can be large (especially if using "trash" prune mode).
  // Cap how many files we scan to keep this endpoint fast.
  let trashCount = 0;
  let trashBytes = 0;
  const trashFiles = listImageFilesRecursive(trashDir, { maxFiles: 12000, maxDepth: 20 });
  for (const file of trashFiles) {
    trashCount += 1;
    trashBytes += Number(file.sizeBytes || 0);
  }

  return {
    ok: true,
    capturesDir,
    desktop: {
      dir: desktopDir,
      autoCount: desktopAutoCount,
      autoBytes: desktopAutoBytes,
      manualCount: desktopManualCount,
      manualBytes: desktopManualBytes
    },
    important: {
      dir: importantDir,
      count: importantCount,
      bytes: importantBytes
    },
    trash: {
      dir: trashDir,
      count: trashCount,
      bytes: trashBytes,
      scannedMaxFiles: 12000
    }
  };
}

function pruneDesktopAutoCaptures(input = {}) {
  const policy = getCapturesPolicy();
  const desktopDir = getDesktopCapturesDir();
  const trashDir = getTrashDir(policy);
  const keep = clampInt(input.keep, policy.desktopAuto.keep, 0, 50000);
  const minAgeMinutes = clampInt(input.minAgeMinutes, policy.desktopAuto.minAgeMinutes, 0, 24 * 60);
  const pruneMode = asEnum(input.pruneMode || policy.desktopAuto.pruneMode, ["delete", "trash"], policy.desktopAuto.pruneMode);
  const dryRun = Boolean(input.dryRun);

  const protectedAbsPaths = Array.isArray(input.protectedAbsPaths)
    ? input.protectedAbsPaths.map((p) => String(p || "")).filter(Boolean)
    : [];
  const protectedSet = new Set(protectedAbsPaths.map((p) => path.resolve(p)));

  const entries = listFilesInDir(desktopDir);
  const now = safeNowMs();
  const minAgeMs = Math.max(0, minAgeMinutes) * 60 * 1000;

  const autoFiles = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!isImagePath(name)) continue;
    if (!DESKTOP_AUTO_RE.test(name)) continue;
    const abs = path.join(desktopDir, name);
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch (_error) {
      stat = null;
    }
    const mtimeMs = Number(stat?.mtimeMs || 0);
    autoFiles.push({
      name,
      absPath: abs,
      mtimeMs,
      sizeBytes: Number(stat?.size || 0)
    });
  }

  autoFiles.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
    return String(b.name || "").localeCompare(String(a.name || ""));
  });

  const keepSet = new Set();
  for (let i = 0; i < Math.min(keep, autoFiles.length); i++) {
    keepSet.add(autoFiles[i].absPath);
  }
  for (const abs of protectedSet) {
    keepSet.add(abs);
  }

  let deletedCount = 0;
  let deletedBytes = 0;
  let movedCount = 0;
  let movedBytes = 0;
  const errors = [];

  for (const file of autoFiles) {
    if (keepSet.has(file.absPath)) continue;
    if (minAgeMs > 0 && now - file.mtimeMs < minAgeMs) continue;

    try {
      if (!dryRun) {
        if (pruneMode === "trash") {
          const rel = path.relative(capturesDir, file.absPath);
          const dest = path.join(trashDir, "desktop-auto", rel);
          moveFileSafe(file.absPath, dest);
          movedCount += 1;
          movedBytes += file.sizeBytes;
        } else {
          fs.unlinkSync(file.absPath);
          deletedCount += 1;
          deletedBytes += file.sizeBytes;
        }
      } else {
        if (pruneMode === "trash") {
          movedCount += 1;
          movedBytes += file.sizeBytes;
        } else {
          deletedCount += 1;
          deletedBytes += file.sizeBytes;
        }
      }
    } catch (error) {
      errors.push(String(error?.message || error || "delete_failed").slice(0, 260));
    }
  }

  return {
    ok: errors.length === 0,
    policy,
    dryRun,
    desktopAuto: {
      dir: desktopDir,
      detected: autoFiles.length,
      keep,
      minAgeMinutes,
      pruneMode,
      deletedCount,
      deletedBytes,
      movedCount,
      movedBytes
    },
    errors: errors.slice(0, 30)
  };
}

function pruneImportantCaptures(input = {}) {
  const policy = getCapturesPolicy();
  const importantDir = getImportantDir(policy);
  const trashDir = getTrashDir(policy);

  const maxFiles = clampInt(input.maxFiles, policy.important.maxFiles, 0, 20000);
  const maxBytes = clampBytes(input.maxBytes, policy.important.maxBytes, 0, 1024 ** 4);
  const pruneMode = asEnum(input.pruneMode || "trash", ["delete", "trash"], "trash");
  const dryRun = Boolean(input.dryRun);

  const files = listImageFilesRecursive(importantDir, { maxFiles: 400000, maxDepth: 20 });
  files.sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;
    return String(a.absPath || "").localeCompare(String(b.absPath || ""));
  });

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += Number(file.sizeBytes || 0);
  }

  let prunedCount = 0;
  let prunedBytes = 0;
  const errors = [];

  const shouldPrune = () => {
    if (maxFiles > 0 && (files.length - prunedCount) > maxFiles) return true;
    if (maxBytes > 0 && (totalBytes - prunedBytes) > maxBytes) return true;
    return false;
  };

  for (const file of files) {
    if (!shouldPrune()) break;
    try {
      if (!dryRun) {
        if (pruneMode === "trash") {
          const rel = path.relative(capturesDir, file.absPath);
          const dest = path.join(trashDir, "important-retention", rel);
          moveFileSafe(file.absPath, dest);
        } else {
          fs.unlinkSync(file.absPath);
        }
      }
      prunedCount += 1;
      prunedBytes += Number(file.sizeBytes || 0);
    } catch (error) {
      errors.push(String(error?.message || error || "important_prune_failed").slice(0, 260));
    }
  }

  return {
    ok: errors.length === 0,
    policy,
    dryRun,
    important: {
      dir: importantDir,
      detected: files.length,
      maxFiles,
      maxBytes,
      pruneMode,
      prunedCount,
      prunedBytes
    },
    errors: errors.slice(0, 30)
  };
}

function pruneTrashCaptures(input = {}) {
  const policy = getCapturesPolicy();
  const trashDir = getTrashDir(policy);
  const dryRun = Boolean(input.dryRun);

  const maxAgeDays = clampInt(input.maxAgeDays, policy.trash.maxAgeDays, 0, 365);
  const maxBytes = clampBytes(input.maxBytes, policy.trash.maxBytes, 0, 1024 ** 4);
  const now = safeNowMs();
  const cutoffMs = maxAgeDays > 0 ? now - maxAgeDays * 24 * 60 * 60 * 1000 : 0;

  const files = listImageFilesRecursive(trashDir, { maxFiles: 600000, maxDepth: 20 });
  // Oldest first.
  files.sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;
    return String(a.absPath || "").localeCompare(String(b.absPath || ""));
  });

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += Number(file.sizeBytes || 0);
  }

  let deletedCount = 0;
  let deletedBytes = 0;
  const deletedSet = new Set();
  const errors = [];

  const tryDelete = (file) => {
    if (deletedSet.has(file.absPath)) {
      return true;
    }
    try {
      if (!dryRun) {
        fs.unlinkSync(file.absPath);
      }
      deletedSet.add(file.absPath);
      deletedCount += 1;
      deletedBytes += Number(file.sizeBytes || 0);
      totalBytes -= Number(file.sizeBytes || 0);
      return true;
    } catch (error) {
      errors.push(String(error?.message || error || "trash_delete_failed").slice(0, 260));
      return false;
    }
  };

  // 1) Age-based deletion.
  if (cutoffMs > 0) {
    for (const file of files) {
      if (file.mtimeMs && file.mtimeMs <= cutoffMs) {
        tryDelete(file);
      }
    }
  }

  // 2) Size-based deletion (oldest first).
  if (maxBytes > 0 && totalBytes > maxBytes) {
    for (const file of files) {
      if (totalBytes <= maxBytes) break;
      if (deletedSet.has(file.absPath)) continue;
      // If already deleted in the age phase, it will be missing on disk.
      if (!dryRun && !fs.existsSync(file.absPath)) continue;
      tryDelete(file);
    }
  }

  return {
    ok: errors.length === 0,
    policy,
    dryRun,
    trash: {
      dir: trashDir,
      detected: files.length,
      maxAgeDays,
      maxBytes,
      deletedCount,
      deletedBytes
    },
    errors: errors.slice(0, 30)
  };
}

function markCaptureImportant(input = {}) {
  const policy = getCapturesPolicy();
  const importantDir = getImportantDir(policy);

  const resolved = safeResolveWithinCaptures(input.capturePath || input.path || input.filePath);
  if (!isImagePath(resolved.resolved)) {
    throw new Error("Only image captures can be marked important.");
  }

  const alreadyImportant = resolved.rel.split(path.sep).includes(policy.important.dirName);
  if (alreadyImportant) {
    return { ok: true, already: true, importantPath: resolved.rel, noteId: "" };
  }

  const destRel = path.join(policy.important.dirName, resolved.rel);
  const destAbs = path.join(resolved.base, destRel);

  const movedTo = moveFileSafe(resolved.resolved, destAbs);
  const finalRel = path.relative(resolved.base, movedTo);

  const noteText = [
    "Important capture archived locally.",
    `Archived path: ${finalRel}`,
    input.note ? `Note: ${String(input.note).slice(0, 600)}` : ""
  ].filter(Boolean).join("\n");

  const note = addNotebookNote({
    title: `Capture archived: ${path.basename(finalRel)}`,
    text: noteText,
    tags: ["captures", "important"],
    pinned: false,
    sensitive: Boolean(input.sensitive)
  });

  return {
    ok: true,
    already: false,
    originalPath: resolved.rel,
    importantPath: finalRel,
    noteId: String(note?.note?.id || "")
  };
}

function manifest() {
  return {
    id: "captures",
    version: "1.0.0",
    description: "Manages desktop screenshot captures with lifecycle policies for pruning, archiving important captures, and trash management",
    capabilities: ["capture-stats", "prune-auto", "prune-important", "prune-trash", "mark-important"],
    readScopes: ["filesystem:captures-dir"],
    writeScopes: ["filesystem:captures-dir"],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: [],
    sideEffects: ["filesystem-delete", "filesystem-move", "notebook-note-create"],
    failureModes: ["captures-dir-inaccessible", "path-traversal-blocked"],
    emittedEvents: []
  };
}

module.exports = {
  getCapturesPolicy,
  collectCapturesStats,
  pruneDesktopAutoCaptures,
  pruneImportantCaptures,
  pruneTrashCaptures,
  markCaptureImportant,
  manifest
};
