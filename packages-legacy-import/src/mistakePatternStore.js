const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");

const STORE_PATH = resolveDataPath("mistake-patterns.json");
const ARCHIVE_PATH = resolveDataPath("mistake-patterns.archive.ndjson");

const TEXT_MAX = 220;
const LONG_TEXT_MAX = 500;
const LIST_MAX = 24;

function clip(value, max = TEXT_MAX) {
  return String(value || "").trim().slice(0, Math.max(1, Number(max) || TEXT_MAX));
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeStatus(value) {
  const normalized = clip(value, 20).toLowerCase();
  if (normalized === "active" || normalized === "archived" || normalized === "obsolete") {
    return normalized;
  }
  return "active";
}

function normalizeSeverity(value) {
  const normalized = clip(value, 20).toLowerCase();
  if (normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function normalizeDeweyCode(value, fallback = "9.9.9") {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  if (!raw) return fallback;
  const parts = raw.split(".")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (parts.length < 1) return fallback;
  const normalized = parts
    .map((part) => String(clampInt(part, 0, 0, 999)))
    .join(".");
  return normalized || fallback;
}

function normalizeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9][a-z0-9._:-]{1,79}$/.test(raw)) return "";
  return raw;
}

function normalizeLinkList(input = []) {
  const items = Array.isArray(input) ? input : [input];
  const out = [];
  const seen = new Set();
  for (const value of items.slice(0, LIST_MAX)) {
    const normalized = normalizeId(String(value || "").trim().toLowerCase().replace(/\s+/g, "_"));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildPatternId(input = {}) {
  const code = normalizeDeweyCode(input.code, "9.9.9");
  const title = clip(input.title || input.type || input.operation || "mistake", 80).toLowerCase();
  const fingerprint = `${code}|${title}|${(Array.isArray(input.linkedTools) ? input.linkedTools.join(",") : "")}|${(Array.isArray(input.linkedSkills) ? input.linkedSkills.join(",") : "")}|${(Array.isArray(input.linkedActivities) ? input.linkedActivities.join(",") : "")}`;
  const suffix = crypto.createHash("sha1").update(fingerprint).digest("hex").slice(0, 10);
  return `m.${code.replace(/\./g, "_")}.${suffix}`;
}

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, updatedAt: "", patterns: [] };
    }
    const patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    return {
      version: Number(parsed.version || 1),
      updatedAt: String(parsed.updatedAt || ""),
      patterns
    };
  } catch (_error) {
    return {
      version: 1,
      updatedAt: "",
      patterns: []
    };
  }
}

function writeStore(store) {
  const safeStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    patterns: Array.isArray(store?.patterns) ? store.patterns : []
  };
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(safeStore, null, 2), "utf8");
  return safeStore;
}

function normalizePattern(raw = {}, existing = null) {
  const nowIso = new Date().toISOString();
  const code = normalizeDeweyCode(raw.code || raw.classificationCode, existing?.code || "9.9.9");
  const linkedSkills = normalizeLinkList(
    raw.linkedSkills
    || raw.skillIds
    || raw.skills
    || raw.skillId
    || raw.skill
    || existing?.linkedSkills
    || []
  );
  const linkedTools = normalizeLinkList(
    raw.linkedTools
    || raw.toolIds
    || raw.tools
    || raw.toolId
    || raw.tool
    || existing?.linkedTools
    || []
  );
  const linkedActivities = normalizeLinkList(
    raw.linkedActivities
    || raw.activityTypes
    || raw.activities
    || raw.activityType
    || raw.activity
    || existing?.linkedActivities
    || []
  );
  const record = {
    id: normalizeId(raw.id || existing?.id || "") || buildPatternId({
      code,
      title: raw.title || raw.type || raw.operation || existing?.title || "mistake",
      linkedSkills,
      linkedTools,
      linkedActivities
    }),
    code,
    title: clip(raw.title || raw.type || raw.operation || existing?.title || "mistake pattern", 120),
    circumstance: clip(raw.circumstance || raw.message || existing?.circumstance || "", LONG_TEXT_MAX),
    rootCause: clip(raw.rootCause || existing?.rootCause || "", LONG_TEXT_MAX),
    avoidance: clip(raw.avoidance || raw.prevent || existing?.avoidance || "", LONG_TEXT_MAX),
    severity: normalizeSeverity(raw.severity || existing?.severity || "medium"),
    linkedSkills,
    linkedTools,
    linkedActivities,
    status: normalizeStatus(raw.status || existing?.status || "active"),
    obsoleteReason: clip(raw.obsoleteReason || existing?.obsoleteReason || "", LONG_TEXT_MAX),
    obsoleteAfterDays: clampInt(raw.obsoleteAfterDays, clampInt(existing?.obsoleteAfterDays, 0, 0, 3650), 0, 3650),
    occurrences: Math.max(0, Number(raw.occurrences ?? existing?.occurrences ?? 0)),
    createdAt: String(existing?.createdAt || nowIso),
    updatedAt: nowIso,
    lastSeenAt: String(raw.lastSeenAt || existing?.lastSeenAt || nowIso)
  };
  return record;
}

function mergePattern(existing, incoming) {
  const next = {
    ...existing,
    ...incoming
  };
  next.linkedSkills = normalizeLinkList([...(existing?.linkedSkills || []), ...(incoming?.linkedSkills || [])]);
  next.linkedTools = normalizeLinkList([...(existing?.linkedTools || []), ...(incoming?.linkedTools || [])]);
  next.linkedActivities = normalizeLinkList([...(existing?.linkedActivities || []), ...(incoming?.linkedActivities || [])]);
  next.occurrences = Math.max(Number(existing?.occurrences || 0), Number(incoming?.occurrences || 0));
  next.updatedAt = new Date().toISOString();
  if (!next.lastSeenAt) {
    next.lastSeenAt = next.updatedAt;
  }
  return next;
}

function upsertMistakePattern(input = {}) {
  const store = readStore();
  const patterns = Array.isArray(store.patterns) ? store.patterns : [];
  const normalizedInput = normalizePattern(input);
  const index = patterns.findIndex((item) => String(item?.id || "") === normalizedInput.id);
  let record = normalizedInput;
  if (index >= 0) {
    record = mergePattern(patterns[index], normalizedInput);
    patterns[index] = record;
  } else {
    patterns.push(record);
  }
  const saved = writeStore({
    ...store,
    patterns
  });
  return {
    ok: true,
    path: STORE_PATH,
    pattern: record,
    total: saved.patterns.length
  };
}

function recordMistakePatternFromLedger(entry = {}, options = {}) {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      ok: true,
      skipped: true,
      reason: "disabled"
    };
  }

  const nowIso = new Date().toISOString();
  const severity = normalizeSeverity(entry.severity || "medium");
  const linkedSkills = normalizeLinkList(entry.skillId ? [entry.skillId] : []);
  const linkedTools = normalizeLinkList(entry.toolId ? [entry.toolId] : []);
  const linkedActivities = normalizeLinkList(
    entry.activityType
      ? [entry.activityType]
      : [entry.operation || "general"]
  );

  const canonical = normalizePattern({
    id: normalizeId(entry.patternId || ""),
    code: normalizeDeweyCode(entry.classificationCode || entry.code || "9.9.9"),
    title: entry.type || entry.operation || "mistake_pattern",
    circumstance: entry.message || "",
    rootCause: entry.rootCause || "",
    avoidance: entry.avoidance || "",
    severity,
    linkedSkills,
    linkedTools,
    linkedActivities,
    status: "active",
    lastSeenAt: nowIso,
    occurrences: 1
  });

  const store = readStore();
  const patterns = Array.isArray(store.patterns) ? store.patterns : [];
  const existingIndex = patterns.findIndex((item) => String(item?.id || "") === canonical.id);
  if (existingIndex >= 0) {
    const existing = patterns[existingIndex];
    const merged = mergePattern(existing, canonical);
    merged.occurrences = Math.max(1, Number(existing?.occurrences || 0) + 1);
    merged.lastSeenAt = nowIso;
    patterns[existingIndex] = merged;
    const saved = writeStore({ ...store, patterns });
    return {
      ok: true,
      path: STORE_PATH,
      pattern: merged,
      total: saved.patterns.length,
      updated: true
    };
  }
  patterns.push(canonical);
  const saved = writeStore({ ...store, patterns });
  return {
    ok: true,
    path: STORE_PATH,
    pattern: canonical,
    total: saved.patterns.length,
    updated: false
  };
}

function listMistakePatterns(options = {}) {
  const store = readStore();
  const status = String(options.status || "active").trim().toLowerCase();
  const skillId = normalizeId(options.skillId || options.skill || "");
  const toolId = normalizeId(options.toolId || options.tool || "");
  const activityType = normalizeId(options.activityType || options.activity || "");
  const limit = clampInt(options.limit, 120, 1, 1000);

  const patterns = (Array.isArray(store.patterns) ? store.patterns : [])
    .map((item) => normalizePattern(item, item))
    .filter((item) => {
      if (status !== "all" && normalizeStatus(item.status) !== status) {
        return false;
      }
      if (skillId && !item.linkedSkills.includes(skillId)) {
        return false;
      }
      if (toolId && !item.linkedTools.includes(toolId)) {
        return false;
      }
      if (activityType && !item.linkedActivities.includes(activityType)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const byUse = Number(b.occurrences || 0) - Number(a.occurrences || 0);
      if (byUse !== 0) return byUse;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .slice(0, limit);

  return {
    ok: true,
    path: STORE_PATH,
    total: patterns.length,
    status,
    patterns
  };
}

function getMistakePatternSummary() {
  const store = readStore();
  const patterns = Array.isArray(store.patterns) ? store.patterns : [];
  const counts = {
    total: patterns.length,
    active: 0,
    archived: 0,
    obsolete: 0
  };
  for (const item of patterns) {
    const status = normalizeStatus(item?.status || "active");
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return {
    ok: true,
    path: STORE_PATH,
    updatedAt: String(store.updatedAt || ""),
    counts
  };
}

function buildMistakeAvoidanceHints(options = {}) {
  const limit = clampInt(options.limit, 8, 1, 30);
  const listed = listMistakePatterns({
    status: options.status || "active",
    skillId: options.skillId || options.skill,
    toolId: options.toolId || options.tool,
    activityType: options.activityType || options.activity,
    limit: Math.max(limit * 3, limit)
  });
  const hints = listed.patterns
    .filter((item) => item.status !== "archived")
    .slice(0, limit)
    .map((item) => ({
      id: String(item.id || ""),
      code: String(item.code || ""),
      sev: String(item.severity || "medium"),
      skill: item.linkedSkills.slice(0, 4),
      tool: item.linkedTools.slice(0, 4),
      activity: item.linkedActivities.slice(0, 4),
      cause: clip(item.rootCause || item.circumstance || "", 140),
      avoid: clip(item.avoidance || "Apply safer default workflow and verify preconditions.", 160),
      uses: Number(item.occurrences || 0)
    }));
  return {
    ok: true,
    summary: getMistakePatternSummary(),
    totalHints: hints.length,
    hints
  };
}

function appendArchiveLines(rows = []) {
  if (!Array.isArray(rows) || rows.length < 1) {
    return;
  }
  const lines = rows.map((item) => `${JSON.stringify(item)}\n`).join("");
  fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true });
  fs.appendFileSync(ARCHIVE_PATH, lines, "utf8");
}

function createMistakePattern(input = {}) {
  return upsertMistakePattern(input);
}

function archiveMistakePattern(id) {
  const patternId = normalizeId(id);
  if (!patternId) {
    return { ok: false, error: "Invalid pattern id." };
  }
  const store = readStore();
  const patterns = Array.isArray(store.patterns) ? store.patterns : [];
  const index = patterns.findIndex((item) => String(item?.id || "") === patternId);
  if (index < 0) {
    return { ok: false, error: "Pattern not found." };
  }
  const archived = {
    ...normalizePattern(patterns[index], patterns[index]),
    status: "archived",
    archivedAt: new Date().toISOString(),
    archiveReason: "manual"
  };
  appendArchiveLines([archived]);
  patterns.splice(index, 1);
  const saved = writeStore({ ...store, patterns });
  return {
    ok: true,
    path: STORE_PATH,
    archived,
    remainingCount: saved.patterns.length
  };
}

function pruneObsoleteMistakePatterns(options = {}) {
  const maxIdleDays = clampInt(options.maxIdleDays, 180, 1, 3650);
  const nowMs = Date.now();
  const cutoffMs = nowMs - (maxIdleDays * 24 * 60 * 60 * 1000);
  const store = readStore();
  const rows = Array.isArray(store.patterns) ? store.patterns : [];
  const keep = [];
  const archived = [];

  for (const item of rows) {
    const normalized = normalizePattern(item, item);
    const status = normalizeStatus(normalized.status);
    const lastSeenMs = Number(new Date(String(normalized.lastSeenAt || normalized.updatedAt || "")).getTime());
    const obsoleteByFlag = status === "obsolete";
    const obsoleteByIdle = Number.isFinite(lastSeenMs) ? lastSeenMs < cutoffMs : false;
    if (obsoleteByFlag || obsoleteByIdle) {
      archived.push({
        ...normalized,
        status: "archived",
        archivedAt: new Date().toISOString(),
        archiveReason: obsoleteByFlag ? "status_obsolete" : "idle_cutoff"
      });
      continue;
    }
    keep.push(normalized);
  }

  appendArchiveLines(archived);
  const saved = writeStore({
    ...store,
    patterns: keep
  });

  return {
    ok: true,
    path: STORE_PATH,
    archivePath: ARCHIVE_PATH,
    archivedCount: archived.length,
    remainingCount: saved.patterns.length,
    maxIdleDays
  };
}

module.exports = {
  STORE_PATH,
  ARCHIVE_PATH,
  normalizeDeweyCode,
  upsertMistakePattern,
  createMistakePattern,
  archiveMistakePattern,
  recordMistakePatternFromLedger,
  listMistakePatterns,
  getMistakePatternSummary,
  buildMistakeAvoidanceHints,
  pruneObsoleteMistakePatterns
};
