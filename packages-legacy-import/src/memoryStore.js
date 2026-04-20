const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");

const memoryPath = resolveDataPath("memory.json");
const memoryDir = path.dirname(memoryPath);
const maxTurns = Math.max(20, Number(process.env.ASOLARIA_MEMORY_MAX_TURNS || 300));
const memorySnapshotIntervalMs = Math.max(
  30 * 1000,
  Number(process.env.ASOLARIA_MEMORY_SNAPSHOT_INTERVAL_MS || 5 * 60 * 1000)
);
const memorySnapshotKeep = Math.max(
  4,
  Number(process.env.ASOLARIA_MEMORY_SNAPSHOT_KEEP || 24)
);
const BOILERPLATE_ASSISTANT_PATTERNS = [
  /(?:operate|operating)\s+as\s+\*{0,2}asolaria brain\*{0,2}/i,
  /\basolaria brain mode(?:\s+is)?\s+(?:active|enabled)\b/i,
  /\bgive me the first thing you want me to remember or work on\b/i,
  /\bpersistent working memory\b/i,
  /\bexecution is paused due an unexpected external change\b/i
];
const COMPACTION_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can", "do", "does", "done", "for",
  "from", "had", "has", "have", "if", "in", "into", "is", "it", "its", "just", "more", "new", "not", "of", "on",
  "or", "our", "out", "so", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "up",
  "use", "using", "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "you",
  "your", "asolaria", "brain", "user", "assistant", "chat", "task", "tasks", "note", "notes", "memory"
]);
const DEFAULT_CONVERSATION_ID = "main";

let cache = null;
let lastSnapshotAtMs = 0;

function createInitialMemory() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    turns: []
  };
}

function ensureDir() {
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
}

function toIsoDate(value, fallback = "") {
  const time = new Date(value || "");
  if (!Number.isFinite(time.getTime())) {
    return fallback;
  }
  return time.toISOString();
}

function normalizeTurnMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  return { ...meta };
}

function normalizeTurn(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  const roleRaw = cleanText(source.role || "system").toLowerCase();
  const role = roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system"
    ? roleRaw
    : "system";
  const idRaw = cleanText(source.id || "");
  const at = toIsoDate(source.at, nowIso);
  return {
    id: idRaw || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text: cleanText(source.text || ""),
    images: normalizeImagePaths(source.images),
    files: normalizeFilePaths(source.files),
    meta: normalizeTurnMeta(source.meta),
    at
  };
}

function normalizeMemory(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const createdAt = toIsoDate(source.createdAt, now);
  const rows = Array.isArray(source.turns) ? source.turns : [];
  const mapped = rows
    .map((row) => normalizeTurn(row, now))
    .filter((row) => row && row.id);
  const dedupById = new Map();
  for (const turn of mapped) {
    const existing = dedupById.get(turn.id);
    if (!existing) {
      dedupById.set(turn.id, turn);
      continue;
    }
    const left = new Date(existing.at || 0).getTime();
    const right = new Date(turn.at || 0).getTime();
    if (right >= left) {
      dedupById.set(turn.id, turn);
    }
  }
  const turns = Array.from(dedupById.values())
    .sort((a, b) => {
      const left = new Date(a.at || 0).getTime();
      const right = new Date(b.at || 0).getTime();
      if (left !== right) return left - right;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .slice(-maxTurns);
  const latestTurnAt = turns.length
    ? turns[turns.length - 1].at || createdAt
    : createdAt;
  return {
    version: 1,
    createdAt,
    updatedAt: toIsoDate(source.updatedAt, latestTurnAt),
    turns
  };
}

function readMemoryFromDisk() {
  ensureDir();
  if (!fs.existsSync(memoryPath)) {
    return null;
  }
  const raw = fs.readFileSync(memoryPath, "utf8");
  if (!String(raw || "").trim()) {
    return createInitialMemory();
  }
  const parsed = JSON.parse(raw);
  return normalizeMemory(parsed);
}

function backupUnreadableMemory(error) {
  try {
    ensureDir();
    if (!fs.existsSync(memoryPath)) {
      return "";
    }
    const raw = fs.readFileSync(memoryPath, "utf8");
    if (!String(raw || "").trim()) {
      return "";
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(path.dirname(memoryPath), `memory.corrupt.${stamp}.json`);
    fs.writeFileSync(backupPath, raw, "utf8");
    return backupPath;
  } catch (_backupError) {
    return "";
  } finally {
    if (error) {
      console.error(error);
    }
  }
}

function backupCurrentMemory(reason = "manual") {
  try {
    ensureDir();
    if (!fs.existsSync(memoryPath)) {
      return "";
    }
    const raw = fs.readFileSync(memoryPath, "utf8");
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
    const backupPath = path.join(path.dirname(memoryPath), `memory.backup.${safeReason}.${stamp}.json`);
    fs.writeFileSync(backupPath, raw, "utf8");
    return backupPath;
  } catch (_error) {
    return "";
  }
}

function mergeMemoryStates(diskMemory, memoryState, options = {}) {
  const now = new Date().toISOString();
  const disk = diskMemory ? normalizeMemory(diskMemory) : null;
  const memory = memoryState ? normalizeMemory(memoryState) : null;
  const createdAt = toIsoDate(disk?.createdAt || memory?.createdAt, now);
  const merged = new Map();
  for (const sourceTurn of [...(disk?.turns || []), ...(memory?.turns || [])]) {
    const turn = normalizeTurn(sourceTurn, now);
    const existing = merged.get(turn.id);
    if (!existing) {
      merged.set(turn.id, turn);
      continue;
    }
    const left = new Date(existing.at || 0).getTime();
    const right = new Date(turn.at || 0).getTime();
    if (right >= left) {
      merged.set(turn.id, turn);
    }
  }
  const turns = Array.from(merged.values())
    .sort((a, b) => {
      const left = new Date(a.at || 0).getTime();
      const right = new Date(b.at || 0).getTime();
      if (left !== right) return left - right;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .slice(-maxTurns);
  const latestTurnAt = turns.length
    ? turns[turns.length - 1].at || now
    : now;
  return {
    version: 1,
    createdAt,
    updatedAt: Boolean(options.preserveUpdatedAt)
      ? toIsoDate(memory?.updatedAt || disk?.updatedAt, latestTurnAt)
      : latestTurnAt,
    turns
  };
}

function writeJsonAtomic(filePath, value) {
  ensureDir();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function listMemorySnapshots() {
  ensureDir();
  try {
    return fs.readdirSync(memoryDir)
      .filter((name) => /^memory\.snapshot\..+\.json$/i.test(String(name || "")))
      .map((name) => path.join(memoryDir, name))
      .sort((a, b) => {
        try {
          return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        } catch (_error) {
          return String(b).localeCompare(String(a));
        }
      });
  } catch (_error) {
    return [];
  }
}

function pruneMemorySnapshots() {
  const rows = listMemorySnapshots();
  const stale = rows.slice(memorySnapshotKeep);
  for (const filePath of stale) {
    try {
      fs.unlinkSync(filePath);
    } catch (_error) {
      // Best effort only.
    }
  }
}

function snapshotMemoryState(memory, reason = "autosave") {
  const state = normalizeMemory(memory);
  const turns = Array.isArray(state.turns) ? state.turns.length : 0;
  if (turns < 1) {
    return "";
  }
  const safeReason = String(reason || "autosave")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "autosave";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(memoryDir, `memory.snapshot.${safeReason}.${stamp}.json`);
  writeJsonAtomic(filePath, state);
  pruneMemorySnapshots();
  return filePath;
}

function maybeSnapshotMemory(memory, reason = "autosave") {
  const nowMs = Date.now();
  if (nowMs - lastSnapshotAtMs < memorySnapshotIntervalMs) {
    return "";
  }
  const pathSaved = snapshotMemoryState(memory, reason);
  if (pathSaved) {
    lastSnapshotAtMs = nowMs;
  }
  return pathSaved;
}

function loadMemory() {
  if (cache) {
    return cache;
  }

  try {
    const diskMemory = readMemoryFromDisk();
    if (!diskMemory) {
      cache = createInitialMemory();
      saveMemory(cache);
      return cache;
    }
    cache = diskMemory;
    return cache;
  } catch (error) {
    backupUnreadableMemory(error);
    cache = createInitialMemory();
    writeJsonAtomic(memoryPath, cache);
    return cache;
  }
}

function saveMemory(memory, options = {}) {
  ensureDir();
  if (Boolean(options.overwrite)) {
    const normalized = normalizeMemory(memory);
    writeJsonAtomic(memoryPath, normalized);
    cache = normalized;
    if (!Boolean(options.skipSnapshot)) {
      maybeSnapshotMemory(normalized, String(options.snapshotReason || "overwrite"));
    }
    return normalized;
  }
  let diskMemory = null;
  try {
    diskMemory = readMemoryFromDisk();
  } catch (error) {
    backupUnreadableMemory(error);
  }
  const merged = mergeMemoryStates(diskMemory, memory, options);
  writeJsonAtomic(memoryPath, merged);
  cache = merged;
  if (!Boolean(options.skipSnapshot)) {
    maybeSnapshotMemory(merged, String(options.snapshotReason || "save"));
  }
  return merged;
}

function redactSecrets(text) {
  let value = String(text || "");
  if (!value) return value;

  // Private keys (PEM blocks).
  value = value.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]"
  );

  // Common API key formats (Google API keys start with AIza...).
  value = value.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_GOOGLE_API_KEY]");

  // JSON-style secret fields.
  value = value.replace(
    /(\"?(?:apiKey|api_key|token|access_token|refresh_token|id_token|client_secret|private_key)\"?\s*[:=]\s*\")([^\"\r\n]{6,})(\")/gi,
    "$1[REDACTED]$3"
  );

  // Headers.
  value = value.replace(/(\bX-goog-api-key\b\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]");
  value = value.replace(/(\bAuthorization\b\s*:\s*Bearer\s+)([A-Za-z0-9._-]{10,})/gi, "$1[REDACTED]");

  // Natural-language password patterns.
  value = value.replace(
    /(\bpassword\b(?:\s+for\s+[^\r\n]{0,80})?\s*(?:is|=|:)\s*)([^\s]{4,})/gi,
    "$1[REDACTED_PASSWORD]"
  );

  // Long token-like hex strings.
  value = value.replace(/\b[a-f0-9]{32,}\b/gi, "[REDACTED_HEX]");

  return value;
}

function cleanText(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  return redactSecrets(normalized).trim();
}

function normalizeImagePaths(images) {
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeFilePaths(files) {
  if (!Array.isArray(files)) {
    return [];
  }
  return files
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeStringList(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeConversationId(value, fallback = DEFAULT_CONVERSATION_ID) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  if (normalized) {
    return normalized;
  }
  return String(fallback || "").trim().toLowerCase() || DEFAULT_CONVERSATION_ID;
}

function resolveTurnConversationId(turn) {
  if (!turn || typeof turn !== "object") {
    return DEFAULT_CONVERSATION_ID;
  }
  return normalizeConversationId(
    turn.meta?.chatId
      || turn.meta?.conversationId
      || turn.meta?.thread
      || "",
    DEFAULT_CONVERSATION_ID
  );
}

function isBoilerplateAssistantTurn(turn) {
  if (!turn || String(turn.role || "") !== "assistant") {
    return false;
  }
  const text = cleanText(turn.text).toLowerCase();
  if (!text) {
    return false;
  }
  if (BOILERPLATE_ASSISTANT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  const mentionsBrain = /\basolaria brain\b/i.test(text);
  const mentionsMemoryPledge = /\b(persistent (?:state|memory)|tasks\.md|workspace files?)\b/i.test(text);
  const kickoffPrompt = /\b(send (?:me )?the first (?:task|thing)|share your first priority|give me the first thing)\b/i.test(text);
  return mentionsBrain && (mentionsMemoryPledge || kickoffPrompt);
}

function filterTurns(turns, options = {}) {
  const sourceExclusions = new Set(normalizeStringList(options.excludeSources || []));
  const requestedConversation = options.chatId;
  const conversationId = requestedConversation === undefined || requestedConversation === null || String(requestedConversation).trim() === ""
    ? ""
    : normalizeConversationId(requestedConversation, DEFAULT_CONVERSATION_ID);
  if (options.clean) {
    sourceExclusions.add("startup-automation");
  }
  const hideBoilerplate = Boolean(options.excludeBoilerplate || options.clean);
  return turns.filter((turn) => {
    if (!turn || typeof turn !== "object") {
      return false;
    }
    const source = String(turn.meta?.source || "").trim().toLowerCase();
    if (options.clean && /^(ops-|snapshot-)/.test(source)) {
      return false;
    }
    if (source && sourceExclusions.has(source)) {
      return false;
    }
    if (hideBoilerplate && isBoilerplateAssistantTurn(turn)) {
      return false;
    }
    if (conversationId) {
      const turnConversationId = resolveTurnConversationId(turn);
      if (turnConversationId !== conversationId) {
        return false;
      }
    }
    return true;
  });
}

function pushTurn(role, text, options = {}) {
  const memory = loadMemory();
  const now = new Date().toISOString();
  const turn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: String(role || "system"),
    text: cleanText(text),
    images: normalizeImagePaths(options.images),
    files: normalizeFilePaths(options.files),
    meta: options.meta || {},
    at: now
  };

  memory.turns.push(turn);
  if (memory.turns.length > maxTurns) {
    memory.turns.splice(0, memory.turns.length - maxTurns);
  }

  memory.updatedAt = now;
  saveMemory(memory);
  return turn;
}

function addUserTurn(text, options = {}) {
  return pushTurn("user", text, options);
}

function addAssistantTurn(text, options = {}) {
  return pushTurn("assistant", text, options);
}

function getRecentTurns(limit = 12, options = {}) {
  const memory = loadMemory();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 12));
  const filtered = filterTurns(memory.turns, options);
  return filtered.slice(-safeLimit);
}

function searchTurns(query, limit = 20, options = {}) {
  const needle = cleanText(query).toLowerCase();
  if (!needle) {
    return [];
  }
  const memory = loadMemory();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const filtered = filterTurns(memory.turns, options);
  const matches = filtered.filter((turn) => {
    const text = cleanText(turn?.text).toLowerCase();
    return text.includes(needle);
  });
  return matches.slice(-safeLimit);
}

function summarizeTurn(turn) {
  const text = cleanText(turn.text);
  const clipped = text.length > 420 ? `${text.slice(0, 417)}...` : text;
  const imageLabel = turn.images && turn.images.length > 0
    ? ` | images: ${turn.images.map((p) => path.basename(String(p || ""))).filter(Boolean).join(", ")}`
    : "";
  const fileLabel = turn.files && turn.files.length > 0
    ? ` | files: ${turn.files.map((p) => path.basename(String(p || ""))).filter(Boolean).join(", ")}`
    : "";
  return `[${turn.role}] ${clipped}${imageLabel}${fileLabel}`;
}

function compactTurnExcerpt(turn, maxChars = 180) {
  const role = String(turn?.role || "system");
  const text = cleanText(turn?.text || "").replace(/\s+/g, " ");
  const clipped = text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...` : text;
  return `[${role}] ${clipped}`;
}

function tokenizeCompactionTerms(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 32 && !COMPACTION_STOPWORDS.has(token));
}

function collectCompactionTopTerms(turns, limit = 8) {
  const counts = new Map();
  for (const turn of turns) {
    const role = String(turn?.role || "").toLowerCase();
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const text = cleanText(turn?.text || "");
    if (!text) continue;
    const weight = role === "user" ? 2 : 1;
    const tokens = tokenizeCompactionTerms(text);
    for (const token of tokens) {
      counts.set(token, Number(counts.get(token) || 0) + weight);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(1, limit))
    .map((row) => row[0]);
}

function pickCompactionSampleIndexes(total, maxItems = 7) {
  const count = Math.max(0, Number(total) || 0);
  const limit = Math.max(1, Number(maxItems) || 7);
  if (count < 1) {
    return [];
  }
  if (count <= limit) {
    return Array.from({ length: count }, (_unused, index) => index);
  }

  const indexes = new Set([0, count - 1]);
  if (count >= 3) {
    indexes.add(Math.floor((count - 1) * 0.25));
    indexes.add(Math.floor((count - 1) * 0.5));
    indexes.add(Math.floor((count - 1) * 0.75));
  }

  let cursor = 1;
  while (indexes.size < limit && cursor < count - 1) {
    indexes.add(cursor);
    cursor += Math.max(1, Math.floor((count - 1) / Math.max(2, limit - 2)));
  }

  return Array.from(indexes).sort((a, b) => a - b).slice(0, limit);
}

function buildCompactionSummaryText(compactedTurns, summaryMeta = {}, options = {}) {
  const createdAt = new Date().toISOString();
  const topTerms = Array.isArray(summaryMeta.topTerms) ? summaryMeta.topTerms : [];
  const sampleExcerpts = Array.isArray(summaryMeta.sampleExcerpts) ? summaryMeta.sampleExcerpts : [];
  const maxSummaryChars = Math.max(900, Math.min(12000, Number(options.maxSummaryChars) || 2600));
  const compactCount = compactedTurns.length;
  const oldestAt = compactedTurns[0]?.at || "";
  const newestAt = compactedTurns[compactCount - 1]?.at || "";

  const lines = [
    `Memory compaction summary generated at ${createdAt}.`,
    `Compacted turns: ${compactCount}. Coverage: ${oldestAt || "n/a"} -> ${newestAt || "n/a"}.`,
    topTerms.length > 0 ? `Top topics: ${topTerms.join(", ")}.` : "Top topics: n/a.",
    "Representative excerpts:"
  ];
  for (const excerpt of sampleExcerpts) {
    lines.push(`- ${excerpt}`);
  }
  if (sampleExcerpts.length < 1) {
    lines.push("- (no excerpt samples)");
  }

  let text = lines.join("\n");
  if (text.length > maxSummaryChars) {
    text = `${text.slice(0, Math.max(0, maxSummaryChars - 3)).trim()}...`;
  }
  return text;
}

function buildMemoryCompactionProposal(options = {}) {
  const memory = loadMemory();
  const turns = Array.isArray(memory?.turns) ? memory.turns.slice() : [];
  const totalTurns = turns.length;
  const maxClamp = Math.max(10, maxTurns - 1);
  const defaultRetainRecentTurns = Math.max(20, Math.min(maxClamp, Math.floor(totalTurns * 0.6)));
  const defaultMinCompactTurns = Math.max(20, Math.min(maxClamp, Math.floor(totalTurns * 0.25) || 20));
  const retainRecentTurns = Math.max(
    10,
    Math.min(maxClamp, Number(options.retainRecentTurns) || defaultRetainRecentTurns)
  );
  const minCompactTurns = Math.max(
    10,
    Math.min(maxClamp, Number(options.minCompactTurns) || defaultMinCompactTurns)
  );
  const compactCount = Math.max(0, totalTurns - retainRecentTurns);
  const compactedTurns = compactCount > 0 ? turns.slice(0, compactCount) : [];
  const keepTurns = compactCount > 0 ? turns.slice(compactCount) : turns.slice();
  const canApply = compactCount >= minCompactTurns;
  const sampleIndexes = pickCompactionSampleIndexes(compactedTurns.length, 7);
  const sampleExcerpts = sampleIndexes
    .map((index) => compactTurnExcerpt(compactedTurns[index], 180))
    .filter(Boolean);
  const topTerms = collectCompactionTopTerms(compactedTurns, 8);
  const summaryText = canApply
    ? buildCompactionSummaryText(compactedTurns, { topTerms, sampleExcerpts }, options)
    : "";
  const hashSource = JSON.stringify({
    retainRecentTurns,
    minCompactTurns,
    compactIds: compactedTurns.map((turn) => String(turn?.id || "")),
    compactTimes: compactedTurns.map((turn) => String(turn?.at || "")),
    totalTurns
  });
  const hash = compactedTurns.length > 0
    ? crypto.createHash("sha1").update(hashSource, "utf8").digest("hex").slice(0, 20)
    : "";

  return {
    ok: canApply,
    createdAt: new Date().toISOString(),
    hash,
    reason: canApply
      ? ""
      : `Not enough turns to compact yet (${compactCount}/${minCompactTurns} compactable turns).`,
    strategy: {
      retainRecentTurns,
      minCompactTurns
    },
    memory: {
      totalTurns,
      compactTurns: compactCount,
      keepTurns: keepTurns.length,
      estimatedTurnsAfter: canApply ? keepTurns.length + 1 : totalTurns,
      oldestCompactedAt: compactedTurns[0]?.at || "",
      newestCompactedAt: compactedTurns[compactedTurns.length - 1]?.at || ""
    },
    topTerms,
    sampleExcerpts,
    summaryText
  };
}

function applyMemoryCompaction(options = {}) {
  const proposal = buildMemoryCompactionProposal(options);
  if (!proposal.ok) {
    throw new Error(proposal.reason || "Memory compaction proposal is not ready to apply.");
  }
  const expectedHash = String(options.expectedHash || "").trim().toLowerCase();
  if (expectedHash && expectedHash !== String(proposal.hash || "").toLowerCase()) {
    throw new Error("Compaction proposal hash mismatch. Re-run proposal and approve the latest hash.");
  }

  const memory = loadMemory();
  const turns = Array.isArray(memory?.turns) ? memory.turns.slice() : [];
  const compactCount = Math.max(0, turns.length - Number(proposal.strategy?.retainRecentTurns || 0));
  if (compactCount < Number(proposal.strategy?.minCompactTurns || 0)) {
    throw new Error("Memory changed since proposal. Re-run proposal before applying.");
  }

  const retainedTurns = turns.slice(compactCount);
  const now = new Date().toISOString();
  const summaryTurn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: "system",
    text: cleanText(proposal.summaryText),
    images: [],
    files: [],
    meta: {
      source: String(options.source || "memory-compaction"),
      kind: "summary",
      compactedTurns: compactCount,
      proposalHash: proposal.hash,
      approvedBy: String(options.approvedBy || "owner")
    },
    at: now
  };

  const nextMemory = {
    ...memory,
    turns: [summaryTurn, ...retainedTurns].slice(-maxTurns),
    updatedAt: now
  };
  const backupPath = options.backup === false
    ? ""
    : backupCurrentMemory(String(options.reason || "compaction"));
  const saved = saveMemory(nextMemory, {
    overwrite: true,
    skipSnapshot: false,
    snapshotReason: "compaction"
  });

  return {
    ok: true,
    proposal,
    beforeTurns: turns.length,
    afterTurns: Array.isArray(saved?.turns) ? saved.turns.length : nextMemory.turns.length,
    compactedTurns: compactCount,
    summaryTurn,
    backupPath
  };
}

function formatRecentTurnsForPrompt(limit = 12, options = {}) {
  const turns = getRecentTurns(limit, options);
  if (turns.length === 0) {
    return "";
  }

  const lines = turns.map((turn) => summarizeTurn(turn));
  return lines.join("\n");
}

function clearMemory(options = {}) {
  const backupPath = options.backup === false
    ? ""
    : backupCurrentMemory(options.reason || "manual_clear");
  cache = createInitialMemory();
  saveMemory(cache, {
    overwrite: true,
    skipSnapshot: true
  });
  const state = getMemoryState(20);
  if (backupPath) {
    state.backupPath = backupPath;
  }
  return state;
}

function getMemoryState(limit = 20, options = {}) {
  const memory = loadMemory();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const filtered = filterTurns(memory.turns, options);
  return {
    version: memory.version,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    totalTurns: memory.turns.length,
    filteredTurns: filtered.length,
    turns: filtered.slice(-safeLimit)
  };
}

function buildConversationTitle(candidate = "", fallback = "New Chat") {
  const text = cleanText(candidate).replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > 72 ? `${text.slice(0, 69).trim()}...` : text;
}

function listConversationSummaries(limit = 40, options = {}) {
  const memory = loadMemory();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 40));
  const filtered = filterTurns(memory.turns, {
    ...options,
    chatId: undefined
  });
  const byConversation = new Map();
  for (const turn of filtered) {
    const conversationId = resolveTurnConversationId(turn);
    let summary = byConversation.get(conversationId);
    if (!summary) {
      summary = {
        id: conversationId,
        chatId: conversationId,
        title: "",
        createdAt: String(turn.at || ""),
        updatedAt: String(turn.at || ""),
        totalTurns: 0,
        userTurns: 0,
        assistantTurns: 0,
        lastRole: "",
        lastText: ""
      };
      byConversation.set(conversationId, summary);
    }
    summary.totalTurns += 1;
    if (String(turn.role || "") === "user") {
      summary.userTurns += 1;
      if (!summary.title) {
        summary.title = buildConversationTitle(turn.text, "New Chat");
      }
    }
    if (String(turn.role || "") === "assistant") {
      summary.assistantTurns += 1;
    }
    if (!summary.createdAt || new Date(String(turn.at || 0)).getTime() < new Date(summary.createdAt).getTime()) {
      summary.createdAt = String(turn.at || summary.createdAt || "");
    }
    if (!summary.updatedAt || new Date(String(turn.at || 0)).getTime() >= new Date(summary.updatedAt).getTime()) {
      summary.updatedAt = String(turn.at || summary.updatedAt || "");
      summary.lastRole = String(turn.role || "");
      summary.lastText = cleanText(turn.text || "");
    }
  }

  const rows = Array.from(byConversation.values())
    .map((summary) => {
      const fallbackTitle = summary.chatId === DEFAULT_CONVERSATION_ID ? "Main Chat" : "New Chat";
      return {
        ...summary,
        title: buildConversationTitle(summary.title, fallbackTitle),
        preview: buildConversationTitle(summary.lastText, ""),
        isDefault: summary.chatId === DEFAULT_CONVERSATION_ID
      };
    })
    .sort((a, b) => {
      const left = new Date(a.updatedAt || 0).getTime();
      const right = new Date(b.updatedAt || 0).getTime();
      if (left !== right) return right - left;
      return String(a.chatId || "").localeCompare(String(b.chatId || ""));
    });

  if (!rows.some((item) => item.chatId === DEFAULT_CONVERSATION_ID)) {
    rows.unshift({
      id: DEFAULT_CONVERSATION_ID,
      chatId: DEFAULT_CONVERSATION_ID,
      title: "Main Chat",
      createdAt: memory.createdAt || "",
      updatedAt: memory.updatedAt || "",
      totalTurns: 0,
      userTurns: 0,
      assistantTurns: 0,
      lastRole: "",
      lastText: "",
      preview: "",
      isDefault: true
    });
  }

  return rows.slice(0, safeLimit);
}

function getConversationTurns(chatId, limit = 120, options = {}) {
  const conversationId = normalizeConversationId(chatId, DEFAULT_CONVERSATION_ID);
  const safeLimit = Math.max(1, Math.min(400, Number(limit) || 120));
  const turns = getRecentTurns(safeLimit, {
    ...options,
    chatId: conversationId
  });
  return {
    chatId: conversationId,
    turns
  };
}

module.exports = {
  addUserTurn,
  addAssistantTurn,
  getRecentTurns,
  searchTurns,
  formatRecentTurnsForPrompt,
  clearMemory,
  getMemoryState,
  buildMemoryCompactionProposal,
  applyMemoryCompaction,
  normalizeConversationId,
  listConversationSummaries,
  getConversationTurns
};
