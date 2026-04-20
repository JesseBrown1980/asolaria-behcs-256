function createAgentIndexSearchRuntime(input = {}) {
  const fs = input.fs || require("fs");
  const catalogPath = String(input.catalogPath || "");
  const agentIndexRoot = String(input.agentIndexRoot || "");
  const loadAgentIndex = typeof input.loadAgentIndex === "function"
    ? input.loadAgentIndex
    : () => ({ loadedAt: 0, catalogRows: [], entries: [] });
  const cleanLine = typeof input.cleanLine === "function"
    ? input.cleanLine
    : (text) => String(text || "").trim();
  const tokenizeQuery = typeof input.tokenizeQuery === "function"
    ? input.tokenizeQuery
    : () => [];
  const extractIxRefs = typeof input.extractIxRefs === "function"
    ? input.extractIxRefs
    : () => [];
  const normalizeIxId = typeof input.normalizeIxId === "function"
    ? input.normalizeIxId
    : (text) => cleanLine(text);
  const stopwords = input.stopwords;
  const buildSnippet = typeof input.buildSnippet === "function"
    ? input.buildSnippet
    : (text) => cleanLine(text).slice(0, 220);

  function scoreEntry(entry, query, tokens, ixRefs) {
    const lower = String(entry.searchableLower || "");
    const titleLower = String(entry.title || "").toLowerCase();
    const tagLower = Array.isArray(entry.tags) ? entry.tags.map((item) => String(item || "").toLowerCase()) : [];
    const chainLower = Array.isArray(entry.chain) ? entry.chain.map((item) => String(item || "").toLowerCase()) : [];
    let score = 0;

    for (const ixRef of ixRefs) {
      if (!ixRef) continue;
      if (entry.ix === ixRef) {
        score += 240;
      }
      if (chainLower.includes(ixRef.toLowerCase())) {
        score += 30;
      }
    }

    for (const token of tokens) {
      if (!token) continue;
      if (titleLower.includes(token)) {
        score += 18;
      }
      if (tagLower.some((value) => value.includes(token))) {
        score += 12;
      }
      if (String(entry.type || "").toLowerCase() === token) {
        score += 10;
      }
      if (chainLower.some((value) => value.includes(token))) {
        score += 8;
      }
      if (lower.includes(token)) {
        score += 4;
      }
    }

    if (query && lower.includes(query.toLowerCase())) {
      score += 24;
    }

    return score;
  }

  function getAgentIndexStatus(options = {}) {
    const loaded = loadAgentIndex(options);
    return {
      ok: true,
      enabled: fs.existsSync(catalogPath),
      loadedAt: loaded.loadedAt ? new Date(loaded.loadedAt).toISOString() : "",
      root: agentIndexRoot,
      catalogPath,
      catalogEntries: loaded.catalogRows.length,
      ixFiles: loaded.entries.length
    };
  }

  function searchAgentIndex(query, options = {}) {
    const text = cleanLine(query);
    const loaded = loadAgentIndex(options);
    if (!text) {
      return {
        ok: true,
        enabled: fs.existsSync(catalogPath),
        query: "",
        count: 0,
        matches: []
      };
    }
    const tokens = tokenizeQuery(text, { stopwords });
    const ixRefs = extractIxRefs(text, { normalizeIxId });
    const safeLimit = Math.max(1, Math.min(30, Number(options.limit) || 6));
    const scored = loaded.entries
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, text, tokens, ixRefs)
      }))
      .filter((row) => row.score > 0)
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return String(right.entry.updatedAt || "").localeCompare(String(left.entry.updatedAt || ""));
      })
      .slice(0, safeLimit)
      .map((row) => ({
        kind: "index",
        ix: row.entry.ix,
        source: row.entry.source,
        title: row.entry.title,
        type: row.entry.type,
        tags: Array.isArray(row.entry.tags) ? row.entry.tags.slice(0, 12) : [],
        chain: Array.isArray(row.entry.chain) ? row.entry.chain.slice(0, 8) : [],
        line: 1,
        score: row.score,
        snippet: buildSnippet(
          [row.entry.summary, row.entry.body].filter(Boolean).join(" "),
          tokens.concat(ixRefs.map((value) => value.toLowerCase())),
          Math.max(80, Math.min(420, Number(options.maxSnippetChars) || 220))
        ),
        updatedAt: row.entry.updatedAt
      }));

    return {
      ok: true,
      enabled: fs.existsSync(catalogPath),
      query: text,
      tokens,
      ixRefs,
      count: scored.length,
      matches: scored
    };
  }

  function buildAgentIndexContextForPrompt(query, options = {}) {
    const costMode = String(options.costMode || "low").toLowerCase();
    const limit = costMode === "quality" ? 4 : costMode === "balanced" ? 3 : 2;
    const result = searchAgentIndex(query, {
      limit,
      maxSnippetChars: costMode === "quality" ? 260 : costMode === "balanced" ? 220 : 180
    });
    if (result.count < 1) {
      return "";
    }
    const lines = result.matches.map((row) => {
      const tagText = row.tags.length > 0 ? ` [${row.tags.join(", ")}]` : "";
      return `- ${row.ix} ${row.type} "${row.title}"${tagText} ${row.snippet}`;
    });
    return ["Agent index:", ...lines].join("\n");
  }

  function collectAgentIndexDocuments(limit = 120, options = {}) {
    const safeLimit = Math.max(1, Math.min(800, Number(limit) || 120));
    const loaded = loadAgentIndex(options);
    return loaded.entries.slice(0, safeLimit).map((entry) => ({
      id: `agent-index:${entry.ix}`,
      sourceKind: "agent_index",
      sourceLabel: entry.source,
      title: `${entry.ix} ${entry.title}`.trim(),
      updatedAt: entry.updatedAt,
      text: [
        entry.ix,
        `Name: ${entry.title}`,
        `Type: ${entry.type}`,
        entry.tags.length > 0 ? `Tags: ${entry.tags.join(", ")}` : "",
        entry.chain.length > 0 ? `Chain: ${entry.chain.join(", ")}` : "",
        entry.summary,
        entry.body
      ].filter(Boolean).join("\n"),
      snippet: entry.summary || buildSnippet(entry.body, [], 240),
      hash: `${entry.ix}:${entry.updatedAt}:${entry.title}`
    }));
  }

  return {
    scoreEntry,
    getAgentIndexStatus,
    searchAgentIndex,
    buildAgentIndexContextForPrompt,
    collectAgentIndexDocuments
  };
}

module.exports = {
  createAgentIndexSearchRuntime
};
