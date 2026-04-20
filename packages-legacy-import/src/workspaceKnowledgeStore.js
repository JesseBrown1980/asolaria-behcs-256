const fs = require("fs");
const path = require("path");
const { projectRoot } = require("./runtimePaths");
const {
  getSemanticKnowledgeStatus,
  searchSemanticKnowledge,
  buildSemanticKnowledgeContextForPrompt
} = require("./semanticKnowledgeStore");

const DEFAULT_FILES = Object.freeze(["TASKS.md", "REFERENCES.md"]);
const DEFAULT_CACHE_TTL_MS = Math.max(
  5 * 1000,
  Math.min(10 * 60 * 1000, Number(process.env.ASOLARIA_WORKSPACE_KB_CACHE_TTL_MS || 45 * 1000))
);
const DEFAULT_MAX_FILE_CHARS = Math.max(
  8 * 1024,
  Math.min(900 * 1024, Number(process.env.ASOLARIA_WORKSPACE_KB_MAX_FILE_CHARS || 240 * 1024))
);
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from", "if", "in", "into",
  "is", "it", "its", "of", "on", "or", "that", "the", "their", "them", "there", "these", "they", "this", "to",
  "was", "we", "were", "with", "you", "your", "task", "tasks", "note", "notes", "memory", "workspace", "asolaria"
]);

let cache = {
  loadedAt: 0,
  filesKey: "",
  files: [],
  entries: []
};

function readEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }
  return String(value).trim().toLowerCase() !== "false";
}

function normalizePathList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,;\n]+/g);
  const list = raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => item.replace(/\\/g, "/"));
  return Array.from(new Set(list));
}

function listConfiguredFiles(inputFiles = []) {
  const envFiles = normalizePathList(process.env.ASOLARIA_WORKSPACE_KB_FILES || "");
  const explicit = normalizePathList(inputFiles);
  const merged = explicit.length > 0
    ? explicit
    : (envFiles.length > 0 ? envFiles : DEFAULT_FILES);
  return Array.from(new Set(merged)).slice(0, 40);
}

function toProjectRelative(absolutePath) {
  const relative = path.relative(projectRoot, absolutePath);
  return relative.replace(/\\/g, "/");
}

function isWithinProject(absolutePath) {
  const relative = toProjectRelative(absolutePath);
  return !relative.startsWith("../") && relative !== "..";
}

function resolveExistingFiles(inputFiles = []) {
  const configured = listConfiguredFiles(inputFiles);
  const out = [];
  for (const entry of configured) {
    const absolutePath = path.resolve(projectRoot, entry);
    if (!isWithinProject(absolutePath)) {
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    let stat = null;
    try {
      stat = fs.statSync(absolutePath);
    } catch (_error) {
      stat = null;
    }
    if (!stat || !stat.isFile()) {
      continue;
    }
    out.push({
      absolutePath,
      source: toProjectRelative(absolutePath),
      mtimeMs: Number(stat.mtimeMs || 0),
      bytes: Number(stat.size || 0)
    });
  }
  return out;
}

function cleanLine(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9_]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 32 && !STOPWORDS.has(token))
    )
  ).slice(0, 16);
}

function tokenMatchCount(textLower, token) {
  if (!token) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor >= 0) {
    cursor = textLower.indexOf(token, cursor);
    if (cursor < 0) break;
    count += 1;
    cursor += token.length;
  }
  return count;
}

function buildEntriesFromFile(row, options = {}) {
  const maxFileChars = Math.max(
    4000,
    Math.min(1200000, Number(options.maxFileChars) || DEFAULT_MAX_FILE_CHARS)
  );
  let rawText = "";
  try {
    rawText = String(fs.readFileSync(row.absolutePath, "utf8") || "");
  } catch (_error) {
    return [];
  }
  if (!rawText.trim()) {
    return [];
  }

  const bounded = rawText.slice(0, maxFileChars);
  const lines = bounded.split(/\r?\n/g);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lineText = cleanLine(lines[index]);
    if (!lineText) continue;
    if (lineText.length < 6) continue;
    const prev = cleanLine(lines[index - 1] || "");
    const next = cleanLine(lines[index + 1] || "");
    const contextText = [prev, lineText, next].filter(Boolean).join(" ");
    entries.push({
      source: row.source,
      line: index + 1,
      text: lineText,
      context: contextText,
      lower: contextText.toLowerCase(),
      mtimeMs: row.mtimeMs
    });
  }
  return entries;
}

function refreshWorkspaceKnowledgeCache(options = {}) {
  const force = Boolean(options.force);
  const ttlMs = Math.max(1000, Number(options.cacheTtlMs) || DEFAULT_CACHE_TTL_MS);
  const files = resolveExistingFiles(options.files || []);
  const filesKey = JSON.stringify(files.map((row) => [row.source, row.mtimeMs, row.bytes]));
  const now = Date.now();
  const cacheAgeMs = now - Number(cache.loadedAt || 0);
  const canReuse = !force
    && cache.loadedAt > 0
    && cache.filesKey === filesKey
    && cacheAgeMs <= ttlMs;

  if (canReuse) {
    return {
      loadedAt: cache.loadedAt,
      files: cache.files.slice(),
      entries: cache.entries.slice()
    };
  }

  const entries = [];
  for (const file of files) {
    entries.push(...buildEntriesFromFile(file, options));
  }
  cache = {
    loadedAt: now,
    filesKey,
    files,
    entries
  };
  return {
    loadedAt: cache.loadedAt,
    files: cache.files.slice(),
    entries: cache.entries.slice()
  };
}

function searchWorkspaceKnowledge(query, options = {}) {
  const enabled = readEnvBool(process.env.ASOLARIA_WORKSPACE_KB_ENABLED, true);
  if (!enabled) {
    return {
      ok: true,
      enabled: false,
      query: String(query || ""),
      count: 0,
      matches: []
    };
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length < 1) {
    return {
      ok: true,
      enabled: true,
      query: String(query || ""),
      count: 0,
      matches: [],
      tokens
    };
  }

  const loaded = refreshWorkspaceKnowledgeCache(options);
  const safeLimit = Math.max(1, Math.min(30, Number(options.limit) || 6));
  const maxSnippetChars = Math.max(80, Math.min(420, Number(options.maxSnippetChars) || 220));
  const scored = loaded.entries
    .map((entry) => {
      let score = 0;
      for (const token of tokens) {
        score += tokenMatchCount(entry.lower, token) * 3;
        if (String(entry.text || "").toLowerCase().includes(token)) {
          score += 2;
        }
      }
      if (/^\s*-\s*\[\s\]\s+/.test(entry.text)) {
        score += 1;
      }
      return {
        ...entry,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return a.source.localeCompare(b.source) || a.line - b.line;
    })
    .slice(0, safeLimit)
    .map((entry) => {
      const snippetRaw = cleanLine(entry.context || entry.text || "");
      const snippet = snippetRaw.length > maxSnippetChars
        ? `${snippetRaw.slice(0, Math.max(0, maxSnippetChars - 3)).trim()}...`
        : snippetRaw;
      return {
        source: entry.source,
        line: entry.line,
        score: entry.score,
        snippet
      };
    });

  return {
    ok: true,
    enabled: true,
    query: String(query || ""),
    count: scored.length,
    tokens,
    matches: scored
  };
}

function buildWorkspaceKnowledgeContextForPrompt(query, options = {}) {
  const costMode = String(options.costMode || "low").toLowerCase();
  const maxResults = costMode === "quality" ? 5 : costMode === "balanced" ? 4 : 3;
  const maxSnippetChars = costMode === "quality" ? 260 : costMode === "balanced" ? 220 : 180;
  const result = searchWorkspaceKnowledge(query, {
    files: options.files || [],
    limit: maxResults,
    maxSnippetChars
  });
  if (!result.enabled || result.count < 1) {
    return "";
  }

  const lines = result.matches.map((row) => `- ${row.source}:${row.line} (score ${row.score}) ${row.snippet}`);
  return ["Workspace knowledge base:", ...lines].join("\n");
}

function getWorkspaceKnowledgeStatus(options = {}) {
  const enabled = readEnvBool(process.env.ASOLARIA_WORKSPACE_KB_ENABLED, true);
  const loaded = refreshWorkspaceKnowledgeCache(options);
  return {
    ok: true,
    enabled,
    loadedAt: loaded.loadedAt ? new Date(loaded.loadedAt).toISOString() : "",
    files: loaded.files.map((row) => ({
      source: row.source,
      bytes: row.bytes,
      mtimeMs: row.mtimeMs
    })),
    entries: loaded.entries.length
  };
}

function getWorkspaceKnowledgeStatusHybrid(options = {}) {
  return {
    ...getWorkspaceKnowledgeStatus(options),
    semantic: getSemanticKnowledgeStatus()
  };
}

async function searchWorkspaceKnowledgeHybrid(query, options = {}) {
  const lexical = searchWorkspaceKnowledge(query, options);
  let semantic = {
    ok: true,
    enabled: false,
    configured: false,
    ready: false,
    query: String(query || ""),
    count: 0,
    matches: []
  };
  try {
    semantic = await searchSemanticKnowledge(query, {
      limit: Math.max(1, Math.min(12, Number(options.limit) || 6))
    });
  } catch (error) {
    semantic = {
      ok: false,
      enabled: true,
      configured: true,
      ready: false,
      query: String(query || ""),
      count: 0,
      matches: [],
      error: String(error?.message || error || "semantic_search_failed").slice(0, 220)
    };
  }

  const combined = [];
  const seen = new Set();
  for (const row of semantic.matches || []) {
    const key = `semantic:${row.id || row.source || row.sourceLabel || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({
      kind: "semantic",
      source: row.sourceLabel || row.source || "",
      line: 0,
      score: row.score,
      snippet: row.snippet
    });
  }
  for (const row of lexical.matches || []) {
    const key = `lexical:${row.source || ""}:${row.line || 0}:${row.snippet || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({
      kind: "lexical",
      source: row.source,
      line: row.line,
      score: row.score,
      snippet: row.snippet
    });
  }

  return {
    ok: lexical.ok !== false && semantic.ok !== false,
    enabled: Boolean(lexical.enabled) || Boolean(semantic.enabled),
    mode: semantic.ready ? "hybrid" : "lexical",
    query: String(query || ""),
    count: combined.length,
    tokens: Array.isArray(lexical.tokens) ? lexical.tokens : [],
    matches: combined,
    lexical,
    semantic
  };
}

async function buildWorkspaceKnowledgeContextForPromptHybrid(query, options = {}) {
  const lexical = buildWorkspaceKnowledgeContextForPrompt(query, options);
  let semantic = "";
  try {
    semantic = await buildSemanticKnowledgeContextForPrompt(query, options);
  } catch (_error) {
    semantic = "";
  }
  return [lexical, semantic].filter(Boolean).join("\n\n");
}

module.exports = {
  buildWorkspaceKnowledgeContextForPrompt,
  searchWorkspaceKnowledge,
  getWorkspaceKnowledgeStatus,
  getWorkspaceKnowledgeStatusHybrid,
  searchWorkspaceKnowledgeHybrid,
  buildWorkspaceKnowledgeContextForPromptHybrid
};
