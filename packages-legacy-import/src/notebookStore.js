const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");

const notebookPath = resolveDataPath("notebook.json");
const maxNotes = Math.max(50, Number(process.env.ASOLARIA_NOTEBOOK_MAX_NOTES || 1200));
const maxPinnedNotes = Math.max(12, Number(process.env.ASOLARIA_NOTEBOOK_MAX_PINNED || 64));
const maxPinnedAutomationNotes = Math.max(2, Number(process.env.ASOLARIA_NOTEBOOK_MAX_PINNED_AUTOMATION || 12));
const AUTOMATION_SERIES = Object.freeze({
  NOTEBOOKLM_OWNER_ACTION: "notebooklm_enterprise_owner_action_required",
  NOTEBOOKLM_UPGRADE_COMPLETE: "notebooklm_enterprise_upgrade_loop_completed"
});

let cache = null;

function createInitialNotebook() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    notes: []
  };
}

function ensureDir() {
  fs.mkdirSync(path.dirname(notebookPath), { recursive: true });
}

function toIsoDate(value, fallback = "") {
  const time = new Date(value || "");
  if (!Number.isFinite(time.getTime())) {
    return fallback;
  }
  return time.toISOString();
}

function normalizeNote(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  const idRaw = cleanText(source.id || "");
  const title = cleanText(source.title || "").slice(0, 160);
  const text = cleanText(source.text || "").slice(0, 12000);
  const createdAt = toIsoDate(source.createdAt, nowIso);
  const updatedAt = toIsoDate(source.updatedAt, createdAt || nowIso);
  const id = idRaw || `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auto = Boolean(source.auto);
  const note = {
    id,
    title: title || clipOneLine(text, 80) || "Note",
    text,
    tags: normalizeTags(source.tags),
    pinned: Boolean(source.pinned),
    sensitive: Boolean(source.sensitive),
    createdAt,
    updatedAt
  };
  if (auto) {
    note.auto = true;
    note.source = cleanText(source.source || "chat").slice(0, 60) || "chat";
    note.fingerprint = cleanText(source.fingerprint || "").slice(0, 64);
    note.hits = Math.max(1, Number(source.hits || 1));
  }
  const seriesKey = normalizeSeriesKey(source.seriesKey || "");
  if (seriesKey) {
    note.seriesKey = seriesKey;
  }
  return note;
}

function normalizeNotebook(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const createdAt = toIsoDate(source.createdAt, now);
  const rows = Array.isArray(source.notes) ? source.notes : [];
  const mapped = rows
    .map((row) => normalizeNote(row, now))
    .filter((row) => row && row.id);
  const dedupById = new Map();
  for (const note of mapped) {
    const existing = dedupById.get(note.id);
    if (!existing) {
      dedupById.set(note.id, note);
      continue;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(note.updatedAt || note.createdAt || 0).getTime();
    if (nextTime >= existingTime) {
      dedupById.set(note.id, note);
    }
  }
  const notes = Array.from(dedupById.values())
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const right = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (left !== right) return left - right;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .slice(-maxNotes);
  const latestNoteAt = notes.length
    ? notes[notes.length - 1].updatedAt || notes[notes.length - 1].createdAt || createdAt
    : createdAt;
  return {
    version: 1,
    createdAt,
    updatedAt: toIsoDate(source.updatedAt, latestNoteAt),
    notes
  };
}

function readNotebookFromDisk() {
  ensureDir();
  if (!fs.existsSync(notebookPath)) {
    return null;
  }
  const raw = fs.readFileSync(notebookPath, "utf8");
  if (!String(raw || "").trim()) {
    return createInitialNotebook();
  }
  const parsed = JSON.parse(raw);
  return normalizeNotebook(parsed);
}

function backupUnreadableNotebook(error) {
  try {
    ensureDir();
    if (!fs.existsSync(notebookPath)) {
      return;
    }
    const raw = fs.readFileSync(notebookPath, "utf8");
    if (!String(raw || "").trim()) {
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(path.dirname(notebookPath), `notebook.corrupt.${stamp}.json`);
    fs.writeFileSync(backupPath, raw, "utf8");
  } catch (_backupError) {
    // Best effort only.
  }
  if (error) {
    console.error(error);
  }
}

function backupNotebook(reason = "manual") {
  try {
    ensureDir();
    if (!fs.existsSync(notebookPath)) {
      return "";
    }
    const raw = fs.readFileSync(notebookPath, "utf8");
    if (!String(raw || "").trim()) {
      return "";
    }
    const safeReason = String(reason || "manual")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "manual";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(path.dirname(notebookPath), `notebook.backup.${safeReason}.${stamp}.json`);
    fs.writeFileSync(backupPath, raw, "utf8");
    return backupPath;
  } catch (_error) {
    return "";
  }
}

function mergeNotebookStates(diskNotebook, memoryNotebook, options = {}) {
  const now = new Date().toISOString();
  const disk = diskNotebook ? normalizeNotebook(diskNotebook) : null;
  const memory = memoryNotebook ? normalizeNotebook(memoryNotebook) : null;
  const createdAt = toIsoDate(
    disk?.createdAt || memory?.createdAt,
    now
  );
  const merged = new Map();
  for (const sourceNote of [...(disk?.notes || []), ...(memory?.notes || [])]) {
    const note = normalizeNote(sourceNote, now);
    const existing = merged.get(note.id);
    if (!existing) {
      merged.set(note.id, note);
      continue;
    }
    const left = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const right = new Date(note.updatedAt || note.createdAt || 0).getTime();
    if (right >= left) {
      merged.set(note.id, note);
    }
  }
  const notes = Array.from(merged.values())
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const right = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (left !== right) return left - right;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .slice(-maxNotes);
  const latestAt = notes.length
    ? notes[notes.length - 1].updatedAt || notes[notes.length - 1].createdAt || now
    : now;
  return {
    version: 1,
    createdAt,
    updatedAt: Boolean(options.preserveUpdatedAt)
      ? toIsoDate(memory?.updatedAt || disk?.updatedAt, latestAt)
      : latestAt,
    notes
  };
}

function writeJsonAtomic(filePath, value) {
  ensureDir();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function loadNotebook() {
  if (cache) {
    return cache;
  }

  try {
    const diskNotebook = readNotebookFromDisk();
    if (!diskNotebook) {
      cache = createInitialNotebook();
      saveNotebook(cache);
      return cache;
    }
    cache = diskNotebook;
    return cache;
  } catch (error) {
    backupUnreadableNotebook(error);
    cache = createInitialNotebook();
    saveNotebook(cache);
    return cache;
  }
}

function saveNotebook(notebook, options = {}) {
  ensureDir();
  if (Boolean(options.overwrite)) {
    const normalized = normalizeNotebook(notebook);
    writeJsonAtomic(notebookPath, normalized);
    cache = normalized;
    return normalized;
  }
  let diskNotebook = null;
  try {
    diskNotebook = readNotebookFromDisk();
  } catch (error) {
    backupUnreadableNotebook(error);
  }
  const merged = mergeNotebookStates(diskNotebook, notebook, options);
  writeJsonAtomic(notebookPath, merged);
  cache = merged;
  return merged;
}

function redactSecrets(text) {
  let value = String(text || "");
  if (!value) return value;

  value = value.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]"
  );
  value = value.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_GOOGLE_API_KEY]");
  value = value.replace(
    /(\"?(?:apiKey|api_key|token|access_token|refresh_token|id_token|client_secret|private_key)\"?\s*[:=]\s*\")([^\"\r\n]{6,})(\")/gi,
    "$1[REDACTED]$3"
  );
  value = value.replace(/(\bX-goog-api-key\b\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]");
  value = value.replace(/(\bAuthorization\b\s*:\s*Bearer\s+)([A-Za-z0-9._-]{10,})/gi, "$1[REDACTED]");
  value = value.replace(
    /(\bpassword\b(?:\s+for\s+[^\r\n]{0,80})?\s*(?:is|=|:)\s*)([^\s]{4,})/gi,
    "$1[REDACTED_PASSWORD]"
  );
  value = value.replace(/\b[a-f0-9]{32,}\b/gi, "[REDACTED_HEX]");
  return value;
}

function cleanText(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  return redactSecrets(normalized).trim();
}

function toOneLine(text) {
  return cleanText(text).replace(/\s+/g, " ");
}

function clipOneLine(text, maxChars = 220) {
  const value = toOneLine(text);
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input.map((t) => String(t || "")).join(",")
    : String(input || "");
  const tags = raw
    .split(/[,\n]/g)
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, "_"))
    .filter((t) => /^[a-z0-9][a-z0-9_-]{0,35}$/i.test(t))
    .slice(0, 12);
  return Array.from(new Set(tags));
}

function normalizeSeriesKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return raw;
}

function mergeTags(...tagLists) {
  const merged = [];
  for (const entry of tagLists) {
    if (Array.isArray(entry)) {
      merged.push(...entry);
      continue;
    }
    if (entry !== undefined && entry !== null) {
      merged.push(entry);
    }
  }
  return normalizeTags(merged);
}

function getNoteUpdatedAtValue(note) {
  return new Date(note?.updatedAt || note?.createdAt || 0).getTime();
}

function getCanonicalSeriesTitle(seriesKey, fallback = "") {
  if (seriesKey === AUTOMATION_SERIES.NOTEBOOKLM_OWNER_ACTION) {
    return "NotebookLM Enterprise Owner Action Required";
  }
  if (seriesKey === AUTOMATION_SERIES.NOTEBOOKLM_UPGRADE_COMPLETE) {
    return "NotebookLM Enterprise Upgrade Loop Completed";
  }
  return cleanText(fallback || "").slice(0, 160);
}

function inferSeriesKeyFromNoteLike(input = {}) {
  const explicit = normalizeSeriesKey(input.seriesKey || "");
  if (explicit) {
    return explicit;
  }
  const title = cleanText(input.title || "").toLowerCase();
  const tags = new Set(normalizeTags(input.tags));
  if (
    title.startsWith("notebooklm enterprise owner action required")
    || (tags.has("notebooklm") && tags.has("owner-action"))
  ) {
    return AUTOMATION_SERIES.NOTEBOOKLM_OWNER_ACTION;
  }
  if (
    title.startsWith("notebooklm enterprise upgrade loop completed")
    || (tags.has("notebooklm") && tags.has("upgrade") && tags.has("automation"))
  ) {
    return AUTOMATION_SERIES.NOTEBOOKLM_UPGRADE_COMPLETE;
  }
  return "";
}

function isAutomationSeriesKey(seriesKey) {
  return seriesKey === AUTOMATION_SERIES.NOTEBOOKLM_OWNER_ACTION
    || seriesKey === AUTOMATION_SERIES.NOTEBOOKLM_UPGRADE_COMPLETE;
}

function findMostRecentSeriesNoteEntry(notebook, seriesKey) {
  const normalized = normalizeSeriesKey(seriesKey);
  if (!normalized || !notebook || !Array.isArray(notebook.notes)) {
    return null;
  }
  let match = null;
  for (let index = 0; index < notebook.notes.length; index += 1) {
    const note = notebook.notes[index];
    const noteSeriesKey = inferSeriesKeyFromNoteLike(note);
    if (noteSeriesKey !== normalized) {
      continue;
    }
    if (!match || getNoteUpdatedAtValue(note) >= getNoteUpdatedAtValue(match.note)) {
      match = { index, note };
    }
  }
  return match;
}

function tokenize(text) {
  const value = cleanText(text).toLowerCase();
  if (!value) return [];
  const tokens = value
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 32)
    .slice(0, 30);
  return Array.from(new Set(tokens));
}

function looksSensitive(text) {
  const value = String(text || "");
  if (!value) return false;
  const patterns = [
    /\b(password|passphrase|token|api key|secret|private key|session cookie|oauth)\b/i,
    /\b(bearer)\s+[a-z0-9._~+/=-]{16,}\b/i
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function sanitizeNote(note, options = {}) {
  const includeSensitive = Boolean(options.includeSensitive);
  const safe = note && typeof note === "object" ? note : {};
  const sensitive = Boolean(safe.sensitive);
  return {
    id: String(safe.id || ""),
    title: String(safe.title || ""),
    text: sensitive && !includeSensitive ? "(sensitive note hidden)" : String(safe.text || ""),
    tags: Array.isArray(safe.tags) ? safe.tags.slice(0, 12) : [],
    pinned: Boolean(safe.pinned),
    sensitive,
    createdAt: String(safe.createdAt || ""),
    updatedAt: String(safe.updatedAt || "")
  };
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    const leftPinned = a?.pinned ? 1 : 0;
    const rightPinned = b?.pinned ? 1 : 0;
    if (leftPinned !== rightPinned) {
      return rightPinned - leftPinned;
    }
    const leftTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const rightTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  });
}

function listNotebookNotes(limit = 30, options = {}) {
  const notebook = loadNotebook();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  const notes = sortNotes(notebook.notes).slice(0, safeLimit);
  return notes.map((note) => sanitizeNote(note, options));
}

function findNoteIndex(notebook, id) {
  const needle = String(id || "").trim();
  if (!needle) return -1;
  return notebook.notes.findIndex((note) => String(note?.id || "") === needle);
}

function addNotebookNote(input = {}) {
  const notebook = loadNotebook();
  const now = new Date().toISOString();
  const title = cleanText(input.title || "").slice(0, 160);
  const text = cleanText(input.text || input.body || "").slice(0, 12000);
  if (!title && !text) {
    throw new Error("Notebook note requires a title or text.");
  }
  const tags = normalizeTags(input.tags);
  const pinned = Boolean(input.pinned);
  const auto = Boolean(input.auto);
  const source = cleanText(input.source || "api").slice(0, 60) || "api";
  const seriesKey = inferSeriesKeyFromNoteLike({
    title,
    text,
    tags,
    seriesKey: input.seriesKey
  });

  const forcedSensitive = looksSensitive(`${title}\n${text}`);
  const sensitive = Boolean(input.sensitive) || forcedSensitive;
  const canonicalTitle = getCanonicalSeriesTitle(seriesKey, title || clipOneLine(text, 80) || "Note")
    || title
    || clipOneLine(text, 80)
    || "Note";

  if (seriesKey) {
    const existingEntry = findMostRecentSeriesNoteEntry(notebook, seriesKey);
    if (existingEntry) {
      const existing = existingEntry.note;
      existing.title = canonicalTitle;
      existing.text = text;
      existing.tags = mergeTags(existing.tags, tags);
      existing.pinned = pinned || existing.pinned;
      existing.sensitive = sensitive;
      existing.updatedAt = now;
      existing.auto = auto || existing.auto || isAutomationSeriesKey(seriesKey);
      existing.source = source || existing.source || "api";
      existing.seriesKey = seriesKey;
      if (existing.auto) {
        existing.hits = Math.max(1, Number(existing.hits || 1)) + 1;
      }
      notebook.updatedAt = now;
      saveNotebook(notebook);
      return {
        note: sanitizeNote(existing, { includeSensitive: Boolean(input.includeSensitive) }),
        warning: forcedSensitive ? "Note was auto-marked sensitive and will not be injected into LLM prompts." : "",
        updatedExisting: true
      };
    }
  }

  const note = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: canonicalTitle,
    text,
    tags,
    pinned,
    sensitive,
    createdAt: now,
    updatedAt: now
  };
  if (auto || seriesKey) {
    note.auto = true;
    note.source = source;
    note.hits = 1;
    note.fingerprint = cleanText(input.fingerprint || "").slice(0, 64);
  }
  if (seriesKey) {
    note.seriesKey = seriesKey;
  }

  notebook.notes.push(note);
  if (notebook.notes.length > maxNotes) {
    notebook.notes.splice(0, notebook.notes.length - maxNotes);
  }
  notebook.updatedAt = now;
  saveNotebook(notebook);

  return {
    note: sanitizeNote(note, { includeSensitive: Boolean(input.includeSensitive) }),
    warning: forcedSensitive ? "Note was auto-marked sensitive and will not be injected into LLM prompts." : ""
  };
}

function updateNotebookNote(id, input = {}) {
  const notebook = loadNotebook();
  const index = findNoteIndex(notebook, id);
  if (index < 0) {
    throw new Error("Notebook note not found.");
  }

  const existing = notebook.notes[index];
  const nextTitle = Object.prototype.hasOwnProperty.call(input, "title")
    ? cleanText(input.title || "").slice(0, 160)
    : String(existing.title || "");
  const nextText = Object.prototype.hasOwnProperty.call(input, "text") || Object.prototype.hasOwnProperty.call(input, "body")
    ? cleanText(input.text || input.body || "").slice(0, 12000)
    : String(existing.text || "");
  const nextTags = Object.prototype.hasOwnProperty.call(input, "tags")
    ? normalizeTags(input.tags)
    : (Array.isArray(existing.tags) ? existing.tags.slice(0, 12) : []);
  const nextPinned = Object.prototype.hasOwnProperty.call(input, "pinned")
    ? Boolean(input.pinned)
    : Boolean(existing.pinned);
  const nextSeriesKey = inferSeriesKeyFromNoteLike({
    title: nextTitle || existing.title,
    text: nextText,
    tags: nextTags,
    seriesKey: Object.prototype.hasOwnProperty.call(input, "seriesKey") ? input.seriesKey : existing.seriesKey
  });
  const nextAuto = Object.prototype.hasOwnProperty.call(input, "auto")
    ? Boolean(input.auto)
    : Boolean(existing.auto);
  const nextSource = Object.prototype.hasOwnProperty.call(input, "source")
    ? cleanText(input.source || "").slice(0, 60)
    : String(existing.source || "");

  const forcedSensitive = looksSensitive(`${nextTitle}\n${nextText}`);
  const nextSensitive = forcedSensitive
    ? true
    : (Object.prototype.hasOwnProperty.call(input, "sensitive") ? Boolean(input.sensitive) : Boolean(existing.sensitive));

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    title: getCanonicalSeriesTitle(nextSeriesKey, nextTitle || existing.title || clipOneLine(nextText, 80) || "Note")
      || nextTitle
      || clipOneLine(nextText, 80)
      || "Note",
    text: nextText,
    tags: nextTags,
    pinned: nextPinned,
    sensitive: nextSensitive,
    updatedAt: now
  };
  if (nextAuto || nextSeriesKey) {
    updated.auto = true;
    updated.source = nextSource || "api";
    updated.hits = Math.max(1, Number(existing.hits || 1));
  }
  if (nextSeriesKey) {
    updated.seriesKey = nextSeriesKey;
  } else {
    delete updated.seriesKey;
  }

  notebook.notes[index] = updated;
  notebook.updatedAt = now;
  saveNotebook(notebook);

  return {
    note: sanitizeNote(updated, { includeSensitive: Boolean(input.includeSensitive) }),
    warning: forcedSensitive ? "Note contains sensitive-looking material and is forced sensitive." : ""
  };
}

function deleteNotebookNote(id) {
  const notebook = loadNotebook();
  const index = findNoteIndex(notebook, id);
  if (index < 0) {
    throw new Error("Notebook note not found.");
  }
  const removed = notebook.notes.splice(index, 1)[0];
  notebook.updatedAt = new Date().toISOString();
  saveNotebook(notebook, { overwrite: true });
  return sanitizeNote(removed, { includeSensitive: false });
}

function scoreNote(note, tokens) {
  if (!note || tokens.length === 0) return 0;
  const title = String(note.title || "").toLowerCase();
  const text = String(note.text || "").toLowerCase();
  const tags = Array.isArray(note.tags) ? note.tags.map((t) => String(t || "").toLowerCase()) : [];
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (title.includes(token)) score += 6;
    if (tags.some((t) => t.includes(token))) score += 4;
    if (text.includes(token)) score += 2;
  }
  if (note.pinned) score += 1;
  return score;
}

function searchNotebookNotes(query, limit = 20, options = {}) {
  const notebook = loadNotebook();
  const needle = cleanText(query);
  if (!needle) {
    return [];
  }
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const tokens = tokenize(needle);
  const includeSensitive = Boolean(options.includeSensitive);

  const scored = notebook.notes
    .filter((note) => includeSensitive || !note?.sensitive)
    .map((note) => {
      return {
        note,
        score: scoreNote(note, tokens)
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const leftTime = new Date(a.note?.updatedAt || a.note?.createdAt || 0).getTime();
      const rightTime = new Date(b.note?.updatedAt || b.note?.createdAt || 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, safeLimit)
    .map((row) => sanitizeNote(row.note, options));

  return scored;
}

function buildNotebookContextForPrompt(query, options = {}) {
  const notebook = loadNotebook();
  const costMode = String(options.costMode || "low").toLowerCase();
  const pinnedLimit = costMode === "quality" ? 4 : costMode === "balanced" ? 3 : 2;
  const matchLimit = costMode === "quality" ? 4 : costMode === "balanced" ? 3 : 2;
  const maxChars = costMode === "quality" ? 240 : costMode === "balanced" ? 200 : 160;

  const pinned = sortNotes(notebook.notes)
    .filter((note) => note?.pinned && !note?.sensitive)
    .slice(0, pinnedLimit);

  const matches = cleanText(query)
    ? searchNotebookNotes(query, matchLimit, { includeSensitive: false })
        .map((row) => ({
          id: row.id,
          title: row.title,
          text: row.text,
          tags: row.tags,
          pinned: row.pinned,
          sensitive: row.sensitive
        }))
        .filter((note) => !note.sensitive && !note.pinned)
    : [];

  const combined = [
    ...pinned,
    ...matches
  ].slice(0, pinnedLimit + matchLimit);

  if (combined.length < 1) {
    return "";
  }

  const lines = combined.map((note) => {
    const tagText = Array.isArray(note.tags) && note.tags.length > 0 ? ` tags:${note.tags.slice(0, 6).join(",")}` : "";
    const pinText = note.pinned ? " pinned" : "";
    const title = clipOneLine(note.title, 80);
    const excerpt = clipOneLine(note.text, maxChars);
    return `- ${title}${tagText}${pinText}: ${excerpt}`;
  });

  return ["Notebook memory (owner-maintained):", ...lines].join("\n");
}

function inferAutoTags(text) {
  const value = String(text || "").toLowerCase();
  const tags = ["auto"];
  if (/\b(memory|remember|notebook)\b/.test(value)) tags.push("memory");
  if (/\b(security|safe|safely|token|password|secret)\b/.test(value)) tags.push("security");
  if (/\b(openclaw|claw)\b/.test(value)) tags.push("openclaw");
  if (/\b(antigravity|google|gemini|vertex)\b/.test(value)) tags.push("models");
  if (/\b(codex|agent|agents|spawn)\b/.test(value)) tags.push("agents");
  if (/\b(mcp|connector|integration)\b/.test(value)) tags.push("integration");
  if (/\b(plan|roadmap|phase|next)\b/.test(value)) tags.push("planning");
  return Array.from(new Set(tags)).slice(0, 12);
}

function hasAutoSignal(text) {
  const value = String(text || "");
  if (!value) return false;
  return /\b(remember|important|must|need to|todo|to do|plan|next step|integrate|implement|build|fix|avoid|safely|security|agent|memory|mcp)\b/i.test(value);
}

function splitAutoCandidates(text) {
  const value = cleanText(text);
  if (!value) return [];
  const lines = value
    .split(/\n+/g)
    .map((line) => line.replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean);
  const candidates = [];
  for (const line of lines) {
    if (line.length < 20 || line.length > 360) continue;
    if (/^(hi|hello|thanks|thank you|ok|okay|yes|no|sure)\b/i.test(line)) continue;
    if (hasAutoSignal(line) || /^\w+:\s+/.test(line) || /^[A-Z][a-z]+/.test(line)) {
      candidates.push(line);
    }
  }

  if (candidates.length < 1 && hasAutoSignal(value)) {
    const sentences = value
      .split(/(?<=[.!?])\s+/g)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      if (sentence.length < 24 || sentence.length > 280) continue;
      if (!hasAutoSignal(sentence)) continue;
      candidates.push(sentence);
      if (candidates.length >= 2) break;
    }
  }

  return Array.from(new Set(candidates)).slice(0, 2);
}

function fingerprintText(title, text) {
  const normalized = `${toOneLine(title).toLowerCase()}|${toOneLine(text).toLowerCase()}`
    .replace(/[^a-z0-9| ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return crypto.createHash("sha1").update(normalized, "utf8").digest("hex").slice(0, 16);
}

function findDuplicateAutoNote(notebook, fingerprint, text) {
  if (!notebook || !Array.isArray(notebook.notes)) return null;
  if (fingerprint) {
    const direct = notebook.notes.find((note) => note?.auto === true && String(note?.fingerprint || "") === fingerprint);
    if (direct) return direct;
  }
  const textNorm = toOneLine(text).toLowerCase();
  return notebook.notes.find((note) => {
    const noteText = toOneLine(note?.text || "").toLowerCase();
    return noteText && noteText === textNorm;
  }) || null;
}

function upsertAutoNote(notebook, candidate, options = {}) {
  const now = new Date().toISOString();
  const title = clipOneLine(candidate.title || candidate.text, 110) || "Auto note";
  const text = cleanText(candidate.text).slice(0, 12000);
  if (!text) {
    return { saved: false, reason: "empty_text" };
  }
  if (looksSensitive(`${title}\n${text}`)) {
    return { saved: false, reason: "sensitive" };
  }

  const fingerprint = fingerprintText(title, text);
  const duplicate = findDuplicateAutoNote(notebook, fingerprint, text);
  if (duplicate) {
    duplicate.updatedAt = now;
    duplicate.hits = Math.max(1, Number(duplicate.hits || 1)) + 1;
    if (candidate.pinned) {
      duplicate.pinned = true;
    }
    return {
      saved: false,
      duplicate: true,
      reason: "duplicate",
      note: sanitizeNote(duplicate, options)
    };
  }

  const note = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    text,
    tags: normalizeTags(candidate.tags),
    pinned: Boolean(candidate.pinned),
    sensitive: false,
    createdAt: now,
    updatedAt: now,
    auto: true,
    source: String(candidate.source || "chat"),
    fingerprint,
    hits: 1
  };

  notebook.notes.push(note);
  if (notebook.notes.length > maxNotes) {
    notebook.notes.splice(0, notebook.notes.length - maxNotes);
  }
  notebook.updatedAt = now;
  return {
    saved: true,
    duplicate: false,
    note: sanitizeNote(note, options)
  };
}

function autoCaptureNotebookFromUserMessage(message, options = {}) {
  const mode = String(options.mode || "off").toLowerCase();
  if (mode !== "auto") {
    return {
      mode,
      candidates: 0,
      saved: 0,
      duplicates: 0,
      skippedSensitive: 0,
      notes: []
    };
  }

  const text = cleanText(message);
  if (!text) {
    return {
      mode,
      candidates: 0,
      saved: 0,
      duplicates: 0,
      skippedSensitive: 0,
      notes: []
    };
  }

  if (!hasAutoSignal(text) && text.length < 180) {
    return {
      mode,
      candidates: 0,
      saved: 0,
      duplicates: 0,
      skippedSensitive: 0,
      notes: []
    };
  }

  const notebook = loadNotebook();
  const candidates = splitAutoCandidates(text).map((line) => {
    const pinned = /\b(critical|urgent|must|do not|never)\b/i.test(line);
    return {
      title: clipOneLine(line, 110),
      text: line,
      tags: inferAutoTags(line),
      pinned,
      source: String(options.source || "chat")
    };
  });

  const results = [];
  let saved = 0;
  let duplicates = 0;
  let skippedSensitive = 0;
  for (const candidate of candidates) {
    const row = upsertAutoNote(notebook, candidate, { includeSensitive: false });
    if (row.saved) saved += 1;
    if (row.duplicate) duplicates += 1;
    if (row.reason === "sensitive") skippedSensitive += 1;
    if (row.note) {
      results.push(row.note);
    }
  }

  if (saved > 0 || duplicates > 0) {
    saveNotebook(notebook);
  }

  return {
    mode,
    candidates: candidates.length,
    saved,
    duplicates,
    skippedSensitive,
    notes: results
  };
}

function runNotebookMaintenance(options = {}) {
  const notebook = loadNotebook();
  const beforeNotes = Array.isArray(notebook.notes) ? notebook.notes.length : 0;
  let removedDuplicates = 0;
  let unpinnedAutomation = 0;
  let canonicalizedTitles = 0;

  const bySeries = new Map();
  for (const note of notebook.notes) {
    const seriesKey = inferSeriesKeyFromNoteLike(note);
    if (!seriesKey) {
      continue;
    }
    if (!bySeries.has(seriesKey)) {
      bySeries.set(seriesKey, []);
    }
    bySeries.get(seriesKey).push(note);
  }

  const removeIds = new Set();
  for (const [seriesKey, rows] of bySeries.entries()) {
    rows.sort((a, b) => getNoteUpdatedAtValue(b) - getNoteUpdatedAtValue(a));
    const keeper = rows[0];
    const canonicalTitle = getCanonicalSeriesTitle(seriesKey, keeper.title);
    if (canonicalTitle && keeper.title !== canonicalTitle) {
      keeper.title = canonicalTitle;
      canonicalizedTitles += 1;
    }
    keeper.seriesKey = seriesKey;
    keeper.auto = true;
    keeper.source = String(keeper.source || "maintenance").trim() || "maintenance";
    for (const stale of rows.slice(1)) {
      removeIds.add(stale.id);
      removedDuplicates += 1;
    }
  }

  let nextNotes = notebook.notes.filter((note) => !removeIds.has(note.id));
  const pinnedAutomation = nextNotes
    .filter((note) => note?.pinned && isAutomationSeriesKey(inferSeriesKeyFromNoteLike(note)))
    .sort((a, b) => getNoteUpdatedAtValue(b) - getNoteUpdatedAtValue(a));
  for (const stale of pinnedAutomation.slice(maxPinnedAutomationNotes)) {
    stale.pinned = false;
    unpinnedAutomation += 1;
  }

  let totalPinned = nextNotes.filter((note) => note?.pinned).length;
  if (totalPinned > maxPinnedNotes) {
    const overflowCandidates = nextNotes
      .filter((note) => note?.pinned)
      .sort((a, b) => {
        const leftAuto = isAutomationSeriesKey(inferSeriesKeyFromNoteLike(a)) ? 1 : 0;
        const rightAuto = isAutomationSeriesKey(inferSeriesKeyFromNoteLike(b)) ? 1 : 0;
        if (leftAuto !== rightAuto) {
          return rightAuto - leftAuto;
        }
        return getNoteUpdatedAtValue(a) - getNoteUpdatedAtValue(b);
      });
    for (const note of overflowCandidates) {
      if (totalPinned <= maxPinnedNotes) {
        break;
      }
      if (!note?.pinned) {
        continue;
      }
      note.pinned = false;
      unpinnedAutomation += 1;
      totalPinned -= 1;
    }
  }

  nextNotes = normalizeNotebook({
    ...notebook,
    updatedAt: new Date().toISOString(),
    notes: nextNotes
  }).notes;

  const changed = removedDuplicates > 0 || unpinnedAutomation > 0 || canonicalizedTitles > 0;
  let backupPath = "";
  if (changed) {
    backupPath = options.backup === false ? "" : backupNotebook("maintenance");
    notebook.notes = nextNotes;
    notebook.updatedAt = new Date().toISOString();
    saveNotebook(notebook, { overwrite: true });
  }

  const afterNotes = Array.isArray(changed ? notebook.notes : nextNotes) ? (changed ? notebook.notes.length : nextNotes.length) : beforeNotes;
  return {
    ok: true,
    changed,
    beforeNotes,
    afterNotes,
    removedDuplicates,
    unpinnedAutomation,
    canonicalizedTitles,
    maxPinnedNotes,
    maxPinnedAutomationNotes,
    backupPath
  };
}

function getNotebookState(limit = 30, options = {}) {
  const notebook = loadNotebook();
  const notes = listNotebookNotes(limit, options);
  return {
    version: notebook.version,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    totalNotes: notebook.notes.length,
    notes
  };
}

module.exports = {
  addNotebookNote,
  updateNotebookNote,
  deleteNotebookNote,
  listNotebookNotes,
  searchNotebookNotes,
  buildNotebookContextForPrompt,
  autoCaptureNotebookFromUserMessage,
  getNotebookState,
  runNotebookMaintenance
};
