const fs = require("fs");
const path = require("path");
const { projectRoot } = require("./runtimePaths");
const {
  normalizeArray,
  cleanLine,
  parseFrontMatter,
  parseCatalogRows,
  buildSummaryFromBody,
  buildSnippet,
  tokenizeQuery,
  extractIxRefs
} = require("./agentIndexParse");
const {
  applyLegacyIxQueryAlias,
  normalizeSearchHit,
  normalizeSearchResponse,
  normalizeCollectedDocument
} = require("./agentIndexNormalize");
const { createAgentIndexRuntimeCompat } = require("./agentIndexRuntimeCompat");
const { createAgentIndexLoadRuntime } = require("./agentIndexLoad");
const { createAgentIndexSearchRuntime } = require("./agentIndexSearch");
const { createAgentIndexCompatRuntime } = require("./agentIndexCompat");

const agentIndexRoot = path.join(projectRoot, "data", "agent-index");
const catalogPath = path.join(agentIndexRoot, "CATALOG.md");
const TYPE_SUBDIRS = ["skills", "patterns", "mistakes", "tools", "plans", "references", "rules", "policies", "tasks", "projects"];
const DEFAULT_CACHE_TTL_MS = Math.max(
  5 * 1000,
  Math.min(10 * 60 * 1000, Number(process.env.ASOLARIA_AGENT_INDEX_CACHE_TTL_MS || 45 * 1000))
);
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from", "if", "in", "into",
  "is", "it", "its", "of", "on", "or", "that", "the", "their", "them", "there", "these", "they", "this", "to",
  "was", "we", "were", "with", "you", "your", "task", "tasks", "note", "notes", "workspace", "asolaria",
  "ix", "agent"
]);

function normalizeIxId(value) {
  const match = String(value || "").match(/(\d{1,4})/);
  if (!match) return "";
  return `IX-${String(match[1]).padStart(3, "0")}`;
}

const runtimeCompat = createAgentIndexRuntimeCompat({
  cleanLine,
  normalizeIxId,
  tokenizeQuery,
  extractIxRefs,
  stopwords: STOPWORDS,
  getRuntimeLoader: () => require("./unifiedAgentIndexStore")
});
const getUnifiedAgentIndexStore = runtimeCompat.getUnifiedAgentIndexStore;
const normalizeWrappedIndexId = runtimeCompat.normalizeWrappedIndexId;
const normalizeWrappedIxId = runtimeCompat.normalizeWrappedIxId;
const normalizeWrappedLxId = runtimeCompat.normalizeWrappedLxId;
const buildNormalizeDeps = runtimeCompat.buildNormalizeDeps;
const resolveRuntimeProfileOptions = runtimeCompat.resolveRuntimeProfileOptions;
const loadRuntime = createAgentIndexLoadRuntime({
  agentIndexRoot,
  catalogPath,
  typeSubdirs: TYPE_SUBDIRS,
  projectRoot,
  defaultCacheTtlMs: DEFAULT_CACHE_TTL_MS,
  parseCatalogRows,
  parseFrontMatter,
  buildSummaryFromBody,
  normalizeIxId,
  normalizeArray,
  cleanLine
});
const loadAgentIndex = loadRuntime.loadAgentIndex;
const searchRuntime = createAgentIndexSearchRuntime({
  fs,
  catalogPath,
  agentIndexRoot,
  loadAgentIndex,
  cleanLine,
  tokenizeQuery,
  extractIxRefs,
  normalizeIxId,
  stopwords: STOPWORDS,
  buildSnippet
});
const getAgentIndexStatus = searchRuntime.getAgentIndexStatus;
const searchAgentIndex = searchRuntime.searchAgentIndex;
const buildAgentIndexContextForPrompt = searchRuntime.buildAgentIndexContextForPrompt;
const collectAgentIndexDocuments = searchRuntime.collectAgentIndexDocuments;

// Semantic search — lazy require to avoid circular dependency
// (semanticKnowledgeStore requires agentIndexStore → circle)
let semanticKnowledgeStore = null;
function getSemanticStore() {
  if (semanticKnowledgeStore === null) {
    try { semanticKnowledgeStore = require("./semanticKnowledgeStore"); } catch (_) { semanticKnowledgeStore = false; }
  }
  return semanticKnowledgeStore || null;
}

/**
 * Hybrid search: semantic-first via Google Embedding 2, keyword fallback.
 * Returns a Promise. Callers wanting sync-only should use searchAgentIndex directly.
 * options.keywordOnly — bypass semantic search entirely
 * options.semanticTimeoutMs — max ms to wait for semantic (default 2000)
 */
async function searchAgentIndexHybrid(query, options = {}) {
  const text = cleanLine(query);
  if (!text || options.keywordOnly) {
    return searchAgentIndex(query, options);
  }

  // Try semantic search with timeout guard
  const semStore = getSemanticStore();
  if (semStore && typeof semStore.searchSemanticKnowledge === "function") {
    try {
      const timeoutMs = Math.max(500, Math.min(5000, Number(options.semanticTimeoutMs) || 2000));
      const semanticPromise = semStore.searchSemanticKnowledge(text, {
        limit: Math.max(1, Math.min(30, Number(options.limit) || 6)),
        minScore: options.minScore
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("semantic_timeout")), timeoutMs)
      );
      const result = await Promise.race([semanticPromise, timeoutPromise]);

      if (result && result.ok && Array.isArray(result.matches) && result.matches.length > 0) {
        const matches = result.matches.map((m) => ({
          ...m,
          semantic: true
        }));
        return {
          ok: true,
          enabled: true,
          query: text,
          count: matches.length,
          matches,
          searchMode: "semantic"
        };
      }
      // Semantic returned empty — fall through to keyword
    } catch (_) { /* semantic failed or timed out — fall through to keyword */ }
  }

  const keywordResult = searchAgentIndex(query, options);
  keywordResult.searchMode = "keyword_fallback";
  return keywordResult;
}

// Remote catalog search — optional dependency (not all nodes have indexCatalogSync)
let indexCatalogSync = null;
try { indexCatalogSync = require("./indexCatalogSync"); } catch (_) { /* not available on this node */ }

function searchWithRemote(query, options = {}) {
  const local = searchAgentIndex(query, options);
  const localMatches = local.matches || [];

  let remoteMatches = [];
  if (indexCatalogSync && typeof indexCatalogSync.searchRemoteCatalogs === "function") {
    try {
      const raw = indexCatalogSync.searchRemoteCatalogs(query);
      remoteMatches = (Array.isArray(raw) ? raw : []).map(hit => ({
        kind: "remote_catalog",
        nodeId: hit.nodeId,
        catalogPath: hit.catalogPath,
        entries: hit.entries,
        entryIds: (hit.entryIds || []).slice(0, 20),
        lastModified: hit.lastModified || "",
        remote: true
      }));
    } catch (_) { /* remote search failed — degrade gracefully */ }
  }

  const matches = [...localMatches, ...remoteMatches];
  return {
    ok: true,
    query: local.query || cleanLine(query),
    matches,
    localCount: localMatches.length,
    remoteCount: remoteMatches.length,
    totalCount: matches.length
  };
}

/**
 * Era-gated sub-catalog reader (IX-375 speed optimization #4).
 * Splits a sub-catalog's rows into eras of 100 IX numbers each
 * (1-99 = era 1, 100-199 = era 2, 200-299 = era 3, etc.).
 * Returns only the LATEST era by default — agents load older eras only when chaining.
 *
 * @param {string} subCatalogPath — absolute path to a CATALOG-*.md file
 * @param {object} [options]
 * @param {boolean} [options.allEras] — return all rows ungated
 * @param {number}  [options.era]    — return a specific era (1-based)
 * @returns {{ era: number, totalEras: number, rows: object[], allRows: number }}
 */
function eraGateSubCatalog(subCatalogPath, options = {}) {
  let raw = "";
  try { raw = fs.readFileSync(subCatalogPath, "utf8"); } catch (_) { /* missing file */ }
  const allRows = parseCatalogRows(raw, { normalizeIxId });
  if (options.allEras) {
    return { era: 0, totalEras: 0, rows: allRows, allRows: allRows.length };
  }

  // Bucket rows by era (every 100 IX numbers)
  const buckets = new Map(); // era number → row[]
  for (const row of allRows) {
    const rowId = String(row.id || row.ix || "");
    const num = parseInt(rowId.replace(/\D/g, ""), 10) || 0;
    const eraN = Math.floor(num / 100) + 1;
    if (!buckets.has(eraN)) buckets.set(eraN, []);
    buckets.get(eraN).push(row);
  }

  const eraKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  const totalEras = eraKeys.length;
  if (totalEras === 0) {
    return { era: 0, totalEras: 0, rows: [], allRows: 0 };
  }

  const requestedEra = options.era != null
    ? Math.max(1, Math.min(Number(options.era) || 1, eraKeys[eraKeys.length - 1]))
    : eraKeys[eraKeys.length - 1]; // latest era

  return {
    era: requestedEra,
    totalEras,
    rows: buckets.get(requestedEra) || [],
    allRows: allRows.length
  };
}

const legacyApi = {
  getAgentIndexStatus,
  searchAgentIndex,
  searchAgentIndexHybrid,
  searchWithRemote,
  buildAgentIndexContextForPrompt,
  collectAgentIndexDocuments,
  normalizeIxId,
  eraGateSubCatalog
};
const compatRuntime = createAgentIndexCompatRuntime({
  getUnifiedAgentIndexStore,
  resolveRuntimeProfileOptions,
  buildNormalizeDeps,
  normalizeSearchResponse,
  applyLegacyIxQueryAlias,
  normalizeSearchHit,
  normalizeCollectedDocument,
  cleanLine,
  getSemanticStore,
  getIndexCatalogSync: () => indexCatalogSync,
  agentIndexRoot,
  catalogPath,
  legacyApi
});
const compatGetAgentIndexStatus = compatRuntime.compatGetAgentIndexStatus;
const compatSearchAgentIndex = compatRuntime.compatSearchAgentIndex;
const compatSearchAgentIndexHybrid = compatRuntime.compatSearchAgentIndexHybrid;
const compatSearchWithRemote = compatRuntime.compatSearchWithRemote;
const compatBuildAgentIndexContextForPrompt = compatRuntime.compatBuildAgentIndexContextForPrompt;
const compatCollectAgentIndexDocuments = compatRuntime.compatCollectAgentIndexDocuments;
const compatNormalizeIxId = compatRuntime.compatNormalizeIxId;
const compatEraGateSubCatalog = compatRuntime.compatEraGateSubCatalog;

module.exports = {
  getAgentIndexStatus: compatGetAgentIndexStatus,
  searchAgentIndex: compatSearchAgentIndex,
  searchAgentIndexHybrid: compatSearchAgentIndexHybrid,
  searchWithRemote: compatSearchWithRemote,
  buildAgentIndexContextForPrompt: compatBuildAgentIndexContextForPrompt,
  collectAgentIndexDocuments: compatCollectAgentIndexDocuments,
  normalizeIxId: compatNormalizeIxId,
  eraGateSubCatalog: compatEraGateSubCatalog
};
