const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { projectRoot, resolveDataPath } = require("./runtimePaths");
const { getGeminiApiConfigSummary, runGeminiApiEmbedContent } = require("./connectors/geminiApiConnector");
const { listNotebookNotes } = require("./notebookStore");
const { getMemoryState } = require("./memoryStore");

const indexPath = resolveDataPath("workspace-semantic-index.json");
const DEFAULT_EMBED_MODEL = String(process.env.ASOLARIA_SEMANTIC_KB_MODEL || "gemini-embedding-2-preview").trim() || "gemini-embedding-2-preview";
const DEFAULT_OUTPUT_DIMENSIONALITY = clampInt(
  process.env.ASOLARIA_SEMANTIC_KB_DIMENSIONS,
  768,
  128,
  3072
);
const DEFAULT_MAX_RESULTS = clampInt(process.env.ASOLARIA_SEMANTIC_KB_MAX_RESULTS, 6, 1, 20);
const DEFAULT_BATCH_SIZE = clampInt(process.env.ASOLARIA_SEMANTIC_KB_BATCH_SIZE, 8, 1, 32);
const DEFAULT_MAX_DOCS = clampInt(process.env.ASOLARIA_SEMANTIC_KB_MAX_DOCS, 480, 50, 2400);
const DEFAULT_MAX_DOC_CHARS = clampInt(process.env.ASOLARIA_SEMANTIC_KB_MAX_DOC_CHARS, 1200, 200, 6000);
const DEFAULT_MIN_SCORE = Number.isFinite(Number(process.env.ASOLARIA_SEMANTIC_KB_MIN_SCORE))
  ? Number(process.env.ASOLARIA_SEMANTIC_KB_MIN_SCORE)
  : 0.18;
const DEFAULT_FILE_PATHS = ["TASKS.md", "REFERENCES.md"];
const MEMORY_SOURCE_BLOCKLIST = new Set([
  "agent_colony_watchdog",
  "startup-automation"
]);
let semanticRebuildPromise = null;
let semanticRebuildState = {
  lastAttemptedAt: "",
  lastSucceededAt: "",
  lastFailedAt: "",
  lastError: ""
};

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function ensureDir() {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
}

function readEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }
  return String(value).trim().toLowerCase() !== "false";
}

function normalizeText(value, maxChars = DEFAULT_MAX_DOC_CHARS) {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function clipOneLine(value, maxChars = 220) {
  const text = normalizeText(value, Math.max(40, maxChars))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value || ""), "utf8").digest("hex");
}

function normalizePathList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,;\n]+/g);
  return Array.from(new Set(
    raw
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => item.replace(/\\/g, "/"))
  )).slice(0, 40);
}

function listConfiguredWorkspaceFiles() {
  const envFiles = normalizePathList(process.env.ASOLARIA_WORKSPACE_KB_FILES || "");
  return envFiles.length > 0 ? envFiles : DEFAULT_FILE_PATHS.slice();
}

function splitLongText(text, maxChars = DEFAULT_MAX_DOC_CHARS) {
  const source = normalizeText(text, Math.max(maxChars * 4, maxChars));
  if (!source) {
    return [];
  }
  const chunks = [];
  const paragraphs = source
    .split(/\n{2,}/g)
    .map((row) => row.trim())
    .filter(Boolean);
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph;
      continue;
    }
    if ((buffer.length + 2 + paragraph.length) <= maxChars) {
      buffer = `${buffer}\n\n${paragraph}`;
      continue;
    }
    chunks.push(buffer);
    if (paragraph.length <= maxChars) {
      buffer = paragraph;
      continue;
    }
    let cursor = 0;
    while (cursor < paragraph.length) {
      const part = paragraph.slice(cursor, cursor + maxChars).trim();
      if (part) {
        chunks.push(part);
      }
      cursor += Math.max(200, maxChars - 120);
    }
    buffer = "";
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.slice(0, 1200);
}

function collectNotebookDocuments(limit = DEFAULT_MAX_DOCS) {
  const notes = listNotebookNotes(limit, { includeSensitive: false });
  const docs = [];
  for (const note of notes) {
    const text = normalizeText(note?.text || "", DEFAULT_MAX_DOC_CHARS);
    if (!text || text === "(sensitive note hidden)") {
      continue;
    }
    const title = clipOneLine(note?.title || "Notebook note", 160) || "Notebook note";
    const tags = Array.isArray(note?.tags) ? note.tags.slice(0, 8).join(", ") : "";
    const fullText = [
      title,
      tags ? `Tags: ${tags}` : "",
      text
    ].filter(Boolean).join("\n");
    docs.push({
      id: `notebook:${note.id}`,
      sourceKind: "notebook",
      sourceLabel: "Notebook memory",
      title,
      updatedAt: String(note?.updatedAt || note?.createdAt || ""),
      text: fullText,
      snippet: clipOneLine(text, 240),
      hash: sha1(`${title}|${text}|${tags}`)
    });
  }
  return docs;
}

function collectMemoryDocuments(limit = DEFAULT_MAX_DOCS) {
  const state = getMemoryState(limit, { clean: true });
  const turns = Array.isArray(state?.turns) ? state.turns : [];
  const docs = [];
  for (const turn of turns) {
    const role = String(turn?.role || "").toLowerCase();
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const source = String(turn?.meta?.source || "").trim().toLowerCase();
    if (source && MEMORY_SOURCE_BLOCKLIST.has(source)) {
      continue;
    }
    const text = normalizeText(turn?.text || "", DEFAULT_MAX_DOC_CHARS);
    if (!text || text.length < 24) {
      continue;
    }
    const title = clipOneLine(`${role}: ${text}`, 160);
    docs.push({
      id: `memory:${turn.id}`,
      sourceKind: "memory",
      sourceLabel: "Recent chat memory",
      title,
      updatedAt: String(turn?.at || ""),
      text: `${role.toUpperCase()}\n${text}`,
      snippet: clipOneLine(text, 240),
      hash: sha1(`${role}|${text}|${turn?.at || ""}`)
    });
  }
  return docs;
}

function collectWorkspaceFileDocuments(limit = DEFAULT_MAX_DOCS) {
  const files = listConfiguredWorkspaceFiles();
  const docs = [];
  for (const rel of files) {
    const absolutePath = path.resolve(projectRoot, rel);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    let rawText = "";
    try {
      rawText = String(fs.readFileSync(absolutePath, "utf8") || "");
    } catch (_error) {
      rawText = "";
    }
    if (!rawText.trim()) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    const chunks = splitLongText(rawText, DEFAULT_MAX_DOC_CHARS);
    for (let index = 0; index < chunks.length; index += 1) {
      if (docs.length >= limit) {
        break;
      }
      const chunk = normalizeText(chunks[index], DEFAULT_MAX_DOC_CHARS);
      if (!chunk) {
        continue;
      }
      const chunkLabel = chunks.length > 1 ? `${rel} chunk ${index + 1}` : rel;
      docs.push({
        id: `workspace:${rel}:${index + 1}`,
        sourceKind: "workspace",
        sourceLabel: rel,
        title: clipOneLine(chunkLabel, 160),
        updatedAt: stat.mtime.toISOString(),
        text: chunk,
        snippet: clipOneLine(chunk, 240),
        hash: sha1(`${rel}|${index}|${chunk}`)
      });
    }
    if (docs.length >= limit) {
      break;
    }
  }
  return docs;
}

function collectSemanticDocuments(options = {}) {
  const maxDocs = clampInt(options.maxDocs, DEFAULT_MAX_DOCS, 50, 2400);
  const notebookDocs = collectNotebookDocuments(maxDocs);
  const memoryDocs = collectMemoryDocuments(maxDocs);
  const workspaceDocs = collectWorkspaceFileDocuments(maxDocs);
  const merged = [
    ...notebookDocs,
    ...memoryDocs,
    ...workspaceDocs
  ];
  const seen = new Set();
  const docs = [];
  for (const doc of merged) {
    if (!doc || !doc.id || !doc.text) {
      continue;
    }
    if (seen.has(doc.id)) {
      continue;
    }
    seen.add(doc.id);
    docs.push(doc);
    if (docs.length >= maxDocs) {
      break;
    }
  }
  return docs;
}

function buildSemanticSourceSignature(options = {}) {
  const docs = collectSemanticDocuments(options);
  return {
    documents: docs,
    sourceSignature: sha1(JSON.stringify(docs.map((doc) => [doc.id, doc.updatedAt, doc.hash])))
  };
}

function normalizeVector(values) {
  const raw = Array.isArray(values) ? values.map((value) => Number(value)) : [];
  const cleaned = raw.filter((value) => Number.isFinite(value));
  if (cleaned.length < 1) {
    return [];
  }
  const magnitude = Math.sqrt(cleaned.reduce((sum, value) => sum + (value * value), 0));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return cleaned;
  }
  return cleaned.map((value) => value / magnitude);
}

function dot(left, right) {
  const size = Math.min(Array.isArray(left) ? left.length : 0, Array.isArray(right) ? right.length : 0);
  if (size < 1) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < size; index += 1) {
    total += Number(left[index] || 0) * Number(right[index] || 0);
  }
  return total;
}

function loadIndex() {
  ensureDir();
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.documents)) {
      return null;
    }
    return {
      ...parsed,
      documents: parsed.documents.map((row) => ({
        ...row,
        vector: normalizeVector(row.vector)
      }))
    };
  } catch (_error) {
    return null;
  }
}

function writeIndex(index) {
  ensureDir();
  const tempPath = `${indexPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, indexPath);
}

function recordSemanticRebuildSuccess(at = new Date().toISOString()) {
  semanticRebuildState = {
    ...semanticRebuildState,
    lastSucceededAt: String(at || ""),
    lastError: ""
  };
}

function recordSemanticRebuildFailure(error, at = new Date().toISOString()) {
  semanticRebuildState = {
    ...semanticRebuildState,
    lastFailedAt: String(at || ""),
    lastError: String(error?.message || error || "semantic_rebuild_failed")
  };
}

function getSemanticKnowledgeStatus() {
  const gemini = getGeminiApiConfigSummary({});
  const index = loadIndex();
  const current = buildSemanticSourceSignature({});
  const ready = Boolean(index && Array.isArray(index.documents) && index.documents.length > 0);
  const stale = Boolean(ready && current.sourceSignature && current.sourceSignature !== String(index?.sourceSignature || ""));
  return {
    ok: true,
    enabled: readEnvBool(process.env.ASOLARIA_SEMANTIC_KB_ENABLED, true),
    configured: Boolean(gemini?.configured),
    provider: "gemini-api",
    defaultModel: DEFAULT_EMBED_MODEL,
    outputDimensionality: DEFAULT_OUTPUT_DIMENSIONALITY,
    ready,
    stale,
    builtAt: String(index?.builtAt || ""),
    model: String(index?.model || ""),
    documents: Array.isArray(index?.documents) ? index.documents.length : 0,
    sourceSignature: String(index?.sourceSignature || ""),
    currentSourceSignature: current.sourceSignature,
    rebuildInFlight: Boolean(semanticRebuildPromise),
    lastAttemptedAt: String(semanticRebuildState.lastAttemptedAt || ""),
    lastSucceededAt: String(semanticRebuildState.lastSucceededAt || index?.builtAt || ""),
    lastFailedAt: String(semanticRebuildState.lastFailedAt || ""),
    lastError: String(semanticRebuildState.lastError || ""),
    degraded: Boolean(semanticRebuildState.lastError),
    indexPath
  };
}

async function rebuildSemanticKnowledgeIndex(options = {}) {
  const attemptedAt = new Date().toISOString();
  semanticRebuildState = {
    ...semanticRebuildState,
    lastAttemptedAt: attemptedAt
  };
  try {
    const enabled = readEnvBool(process.env.ASOLARIA_SEMANTIC_KB_ENABLED, true);
    if (!enabled) {
      throw new Error("Semantic knowledge index is disabled.");
    }
    const gemini = getGeminiApiConfigSummary({});
    if (!gemini?.configured) {
      throw new Error("Gemini API integration is not configured for semantic indexing.");
    }
    const model = String(options.model || DEFAULT_EMBED_MODEL).trim() || DEFAULT_EMBED_MODEL;
    const outputDimensionality = clampInt(
      options.outputDimensionality,
      DEFAULT_OUTPUT_DIMENSIONALITY,
      128,
      3072
    );
    const batchSize = clampInt(options.batchSize, DEFAULT_BATCH_SIZE, 1, 32);
    const collected = buildSemanticSourceSignature({
      maxDocs: options.maxDocs
    });
    const docs = collected.documents;
    if (docs.length < 1) {
      throw new Error("No semantic documents were collected.");
    }

    const vectors = [];
    for (let cursor = 0; cursor < docs.length; cursor += batchSize) {
      const batch = docs.slice(cursor, cursor + batchSize);
      const embedded = await runGeminiApiEmbedContent({
        model,
        outputDimensionality,
        taskType: "RETRIEVAL_DOCUMENT",
        contents: batch.map((doc) => ({
          text: doc.text,
          title: doc.title
        }))
      });
      if (!Array.isArray(embedded?.embeddings) || embedded.embeddings.length !== batch.length) {
        throw new Error(`Gemini embeddings returned ${Array.isArray(embedded?.embeddings) ? embedded.embeddings.length : 0} vectors for ${batch.length} documents.`);
      }
      for (const row of embedded.embeddings) {
        vectors.push(normalizeVector(row));
      }
    }

    const builtAt = new Date().toISOString();
    const documents = docs.map((doc, index) => ({
      ...doc,
      vector: vectors[index] || []
    }));
    const sourceSignature = collected.sourceSignature || sha1(JSON.stringify(documents.map((doc) => [doc.id, doc.updatedAt, doc.hash])));
    const index = {
      version: 1,
      builtAt,
      provider: "gemini-api",
      model,
      outputDimensionality,
      sourceSignature,
      documents
    };
    writeIndex(index);
    recordSemanticRebuildSuccess(builtAt);
    return {
      ok: true,
      builtAt,
      provider: index.provider,
      model: index.model,
      outputDimensionality: index.outputDimensionality,
      documents: index.documents.length,
      sourceSignature: index.sourceSignature,
      indexPath
    };
  } catch (error) {
    recordSemanticRebuildFailure(error, attemptedAt);
    throw error;
  }
}

async function ensureSemanticKnowledgeIndex(options = {}) {
  const enabled = readEnvBool(process.env.ASOLARIA_SEMANTIC_KB_ENABLED, true);
  if (!enabled) {
    return {
      ok: true,
      enabled: false,
      started: false,
      fresh: false,
      reason: "disabled"
    };
  }
  const gemini = getGeminiApiConfigSummary({});
  if (!gemini?.configured) {
    return {
      ok: true,
      enabled: true,
      started: false,
      fresh: false,
      reason: "not_configured"
    };
  }
  const index = loadIndex();
  const current = buildSemanticSourceSignature({
    maxDocs: options.maxDocs
  });
  const ready = Boolean(index && Array.isArray(index.documents) && index.documents.length > 0);
  const fresh = Boolean(ready && current.sourceSignature && current.sourceSignature === String(index?.sourceSignature || ""));
  if (fresh) {
    return {
      ok: true,
      enabled: true,
      started: false,
      fresh: true,
      reason: "up_to_date"
    };
  }
  if (semanticRebuildPromise) {
    return {
      ok: true,
      enabled: true,
      started: false,
      fresh: false,
      reason: "rebuild_in_flight"
    };
  }
  semanticRebuildPromise = rebuildSemanticKnowledgeIndex(options)
    .then((result) => ({ ok: true, result }))
    .catch((error) => ({ ok: false, error }))
    .finally(() => {
      semanticRebuildPromise = null;
    });
  if (options.await === true) {
    const outcome = await semanticRebuildPromise;
    if (!outcome?.ok) {
      throw outcome?.error || new Error("semantic_rebuild_failed");
    }
    const result = outcome.result;
    return {
      ok: true,
      enabled: true,
      started: true,
      fresh: true,
      reason: ready ? "refreshed" : "built",
      result
    };
  }
  return {
    ok: true,
    enabled: true,
    started: true,
    fresh: false,
    reason: ready ? "stale_rebuild_started" : "initial_build_started"
  };
}

async function searchSemanticKnowledge(query, options = {}) {
  const text = normalizeText(query, 800);
  const limit = clampInt(options.limit, DEFAULT_MAX_RESULTS, 1, 20);
  const minScore = Number.isFinite(Number(options.minScore))
    ? Number(options.minScore)
    : DEFAULT_MIN_SCORE;
  const index = loadIndex();
  if (!text) {
    return {
      ok: true,
      ready: Boolean(index),
      query: "",
      count: 0,
      matches: []
    };
  }
  if (!index || !Array.isArray(index.documents) || index.documents.length < 1) {
    return {
      ok: true,
      ready: false,
      query: text,
      count: 0,
      matches: [],
      reason: "semantic_index_not_ready"
    };
  }

  let embedded = null;
  try {
    embedded = await runGeminiApiEmbedContent({
      model: index.model || DEFAULT_EMBED_MODEL,
      outputDimensionality: Number(index.outputDimensionality) || DEFAULT_OUTPUT_DIMENSIONALITY,
      taskType: "RETRIEVAL_QUERY",
      contents: [text]
    });
  } catch (error) {
    return {
      ok: false,
      ready: true,
      query: text,
      count: 0,
      matches: [],
      reason: "query_embedding_failed",
      error: String(error?.message || error || "query_embedding_failed")
    };
  }
  const queryVector = normalizeVector(Array.isArray(embedded?.embeddings) ? embedded.embeddings[0] : []);
  if (queryVector.length < 1) {
    return {
      ok: true,
      ready: true,
      query: text,
      count: 0,
      matches: [],
      reason: "empty_query_embedding"
    };
  }

  const matches = index.documents
    .map((doc) => ({
      kind: "semantic",
      source: String(doc.sourceLabel || doc.sourceKind || "semantic"),
      sourceKind: String(doc.sourceKind || ""),
      title: String(doc.title || ""),
      score: dot(queryVector, doc.vector),
      snippet: clipOneLine(doc.snippet || doc.text || "", 240),
      updatedAt: String(doc.updatedAt || "")
    }))
    .filter((row) => Number.isFinite(row.score) && row.score >= minScore)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    })
    .slice(0, limit);

  return {
    ok: true,
    ready: true,
    query: text,
    count: matches.length,
    matches,
    model: String(index.model || ""),
    outputDimensionality: Number(index.outputDimensionality) || 0
  };
}

async function buildSemanticKnowledgeContextForPrompt(query, options = {}) {
  const text = normalizeText(query, 800);
  if (!text || text.length < 8) {
    return "";
  }
  const costMode = String(options.costMode || "low").toLowerCase();
  const limit = costMode === "quality" ? 4 : costMode === "balanced" ? 3 : 2;
  const result = await searchSemanticKnowledge(text, {
    limit,
    minScore: options.minScore
  });
  if (!result.ready || result.count < 1) {
    return "";
  }
  const lines = result.matches.map((row) => {
    const label = row.title ? `${row.source} / ${row.title}` : row.source;
    return `- ${label} (semantic ${Number(row.score || 0).toFixed(3)}): ${row.snippet}`;
  });
  return ["Semantic knowledge base:", ...lines].join("\n");
}

module.exports = {
  collectSemanticDocuments,
  ensureSemanticKnowledgeIndex,
  getSemanticKnowledgeStatus,
  rebuildSemanticKnowledgeIndex,
  searchSemanticKnowledge,
  buildSemanticKnowledgeContextForPrompt
};
