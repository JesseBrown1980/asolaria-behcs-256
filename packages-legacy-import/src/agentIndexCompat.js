function createAgentIndexCompatRuntime(input = {}) {
  const getUnifiedAgentIndexStore = typeof input.getUnifiedAgentIndexStore === "function"
    ? input.getUnifiedAgentIndexStore
    : () => null;
  const resolveRuntimeProfileOptions = typeof input.resolveRuntimeProfileOptions === "function"
    ? input.resolveRuntimeProfileOptions
    : (options = {}) => ({ ...options });
  const buildNormalizeDeps = typeof input.buildNormalizeDeps === "function"
    ? input.buildNormalizeDeps
    : () => ({});
  const normalizeSearchResponse = typeof input.normalizeSearchResponse === "function"
    ? input.normalizeSearchResponse
    : (value) => value;
  const applyLegacyIxQueryAlias = typeof input.applyLegacyIxQueryAlias === "function"
    ? input.applyLegacyIxQueryAlias
    : (value) => value;
  const normalizeSearchHit = typeof input.normalizeSearchHit === "function"
    ? input.normalizeSearchHit
    : (value) => value;
  const normalizeCollectedDocument = typeof input.normalizeCollectedDocument === "function"
    ? input.normalizeCollectedDocument
    : (value) => value;
  const cleanLine = typeof input.cleanLine === "function"
    ? input.cleanLine
    : (text) => String(text || "").trim();
  const getSemanticStore = typeof input.getSemanticStore === "function"
    ? input.getSemanticStore
    : () => null;
  const getIndexCatalogSync = typeof input.getIndexCatalogSync === "function"
    ? input.getIndexCatalogSync
    : () => null;
  const agentIndexRoot = String(input.agentIndexRoot || "");
  const catalogPath = String(input.catalogPath || "");
  const legacyApi = input.legacyApi || {};

  function compatGetAgentIndexStatus(options = {}) {
    const runtime = getUnifiedAgentIndexStore();
    const runtimeOptions = resolveRuntimeProfileOptions(options);
    const promotionStage = cleanLine(runtimeOptions.stage || runtimeOptions.profile || "dev") || "dev";
    if (runtime && typeof runtime.getUnifiedIndexStatus === "function") {
      try {
        const status = runtime.getUnifiedIndexStatus(runtimeOptions) || {};
        return {
          ...status,
          ok: "ok" in status ? Boolean(status.ok) : true,
          enabled: "enabled" in status ? Boolean(status.enabled) : true,
          loadedAt: status.loadedAt
            ? (typeof status.loadedAt === "string" ? status.loadedAt : new Date(status.loadedAt).toISOString())
            : "",
          root: status.root || status.indexRoot || agentIndexRoot,
          catalogPath: status.catalogPath || catalogPath,
          catalogEntries: Number(status.catalogEntries || status.entryCount || status.documentCount || 0),
          ixFiles: Number(status.ixFiles || status.lookupCount || status.documentCount || 0),
          promotionModel: "compiled-runtime",
          promotionStage,
          sourceContract: status.sourceContract || "live-lx-canonical"
        };
      } catch (_) {
        // Fall through to the compatibility path.
      }
    }
    const legacyStatus = legacyApi.getAgentIndexStatus(runtimeOptions);
    return {
      ...legacyStatus,
      promotionModel: "legacy-fallback",
      promotionStage,
      sourceContract: "legacy-ix-fallback"
    };
  }

  function compatSearchAgentIndex(query, options = {}) {
    const runtime = getUnifiedAgentIndexStore();
    const runtimeOptions = resolveRuntimeProfileOptions(options);
    const normalizeDeps = buildNormalizeDeps();
    if (runtime && typeof runtime.searchUnifiedIndex === "function") {
      try {
        const result = runtime.searchUnifiedIndex(query, runtimeOptions);
        return applyLegacyIxQueryAlias(
          normalizeSearchResponse(result, query, options, {
            sourceContract: "live-lx-canonical"
          }, normalizeDeps),
          query,
          normalizeDeps
        );
      } catch (_) {
        // Fall back to legacy search.
      }
    }
    return applyLegacyIxQueryAlias(
      normalizeSearchResponse(legacyApi.searchAgentIndex(query, runtimeOptions), query, runtimeOptions, {
        sourceContract: "legacy-ix-fallback"
      }, normalizeDeps),
      query,
      normalizeDeps
    );
  }

  async function compatSearchAgentIndexHybrid(query, options = {}) {
    const text = cleanLine(query);
    const normalizeDeps = buildNormalizeDeps();
    if (!text || options.keywordOnly) {
      return compatSearchAgentIndex(query, options);
    }

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
          const matches = result.matches.map((match) => ({
            ...normalizeSearchHit(match, normalizeDeps),
            semantic: true
          }));
          return {
            ok: true,
            enabled: true,
            query: text,
            count: matches.length,
            matches,
            searchMode: "semantic",
            sourceContract: "semantic-first"
          };
        }
      } catch (_) {
        // Semantic failed or timed out; fall back to keyword search.
      }
    }

    const keywordResult = compatSearchAgentIndex(query, options);
    keywordResult.searchMode = "keyword_fallback";
    return keywordResult;
  }

  function compatSearchWithRemote(query, options = {}) {
    const local = compatSearchAgentIndex(query, options);
    const localMatches = local.matches || [];

    let remoteMatches = [];
    const indexCatalogSync = getIndexCatalogSync();
    if (indexCatalogSync && typeof indexCatalogSync.searchRemoteCatalogs === "function") {
      try {
        const raw = indexCatalogSync.searchRemoteCatalogs(query);
        remoteMatches = (Array.isArray(raw) ? raw : []).map((hit) => ({
          kind: "remote_catalog",
          nodeId: hit.nodeId,
          catalogPath: hit.catalogPath,
          entries: hit.entries,
          entryIds: (hit.entryIds || []).slice(0, 20),
          lastModified: hit.lastModified || "",
          remote: true
        }));
      } catch (_) {
        remoteMatches = [];
      }
    }

    const matches = [...localMatches, ...remoteMatches];
    return {
      ok: true,
      query: local.query || cleanLine(query),
      matches,
      localCount: localMatches.length,
      remoteCount: remoteMatches.length,
      totalCount: matches.length,
      sourceContract: local.sourceContract || "legacy-ix-fallback"
    };
  }

  function compatBuildAgentIndexContextForPrompt(query, options = {}) {
    const costMode = String(options.costMode || "low").toLowerCase();
    const limit = costMode === "quality" ? 4 : costMode === "balanced" ? 3 : 2;
    const runtimeOptions = resolveRuntimeProfileOptions(options);
    const result = compatSearchAgentIndex(query, {
      ...runtimeOptions,
      limit,
      maxSnippetChars: costMode === "quality" ? 260 : costMode === "balanced" ? 220 : 180
    });
    if (result.count < 1) {
      return "";
    }
    const lines = result.matches.map((row) => {
      const tagList = Array.isArray(row.tags) ? row.tags : [];
      const tagText = tagList.length > 0 ? ` [${tagList.join(", ")}]` : "";
      const rowId = cleanLine(row.id || row.ix || "");
      return `- ${rowId} ${row.type} "${row.title}"${tagText} ${row.snippet}`;
    });
    return ["Agent index:", ...lines].join("\n");
  }

  function compatCollectAgentIndexDocuments(limit = 120, options = {}) {
    const safeLimit = Math.max(1, Math.min(800, Number(limit) || 120));
    const runtime = getUnifiedAgentIndexStore();
    const runtimeOptions = resolveRuntimeProfileOptions(options);
    const normalizeDeps = buildNormalizeDeps();
    let docs = [];
    if (runtime && typeof runtime.collectUnifiedIndexDocuments === "function") {
      try {
        const raw = runtime.collectUnifiedIndexDocuments(safeLimit, runtimeOptions);
        docs = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.documents)
            ? raw.documents
            : Array.isArray(raw?.items)
              ? raw.items
              : [];
      } catch (_) {
        docs = [];
      }
    }
    if (docs.length < 1) {
      docs = legacyApi.collectAgentIndexDocuments(safeLimit, runtimeOptions);
    }
    return docs.map((doc) => normalizeCollectedDocument(doc, normalizeDeps));
  }

  function compatNormalizeIxId(value) {
    const runtime = getUnifiedAgentIndexStore();
    if (runtime && typeof runtime.normalizeIxId === "function") {
      return runtime.normalizeIxId(value);
    }
    return legacyApi.normalizeIxId(value);
  }

  function compatEraGateSubCatalog(subCatalogPath, options = {}) {
    return legacyApi.eraGateSubCatalog(subCatalogPath, options);
  }

  return {
    compatGetAgentIndexStatus,
    compatSearchAgentIndex,
    compatSearchAgentIndexHybrid,
    compatSearchWithRemote,
    compatBuildAgentIndexContextForPrompt,
    compatCollectAgentIndexDocuments,
    compatNormalizeIxId,
    compatEraGateSubCatalog
  };
}

module.exports = {
  createAgentIndexCompatRuntime
};
