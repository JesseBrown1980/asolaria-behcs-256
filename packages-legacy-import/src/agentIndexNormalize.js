function compatIxAliasFromId(value, deps = {}) {
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const normalizeIxId = typeof deps.normalizeIxId === "function"
    ? deps.normalizeIxId
    : (text) => String(text || "").trim();
  const text = cleanLine(value);
  if (!text) return "";
  const match = text.match(/(?:^|[^A-Z0-9])(IX[-_\s]?\d{1,4})(?:$|[^A-Z0-9])/i);
  if (match) {
    return normalizeIxId(match[1]);
  }
  const direct = text.match(/^IX[-_\s]?(\d{1,4})$/i);
  if (direct) {
    return normalizeIxId(direct[1]);
  }
  return "";
}

function extractExactCompatIxQuery(value, deps = {}) {
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const normalizeIxId = typeof deps.normalizeIxId === "function"
    ? deps.normalizeIxId
    : (text) => String(text || "").trim();
  const text = cleanLine(value);
  if (!text) return "";
  const match = text.match(/^IX[-_\s]?(\d{1,4})$/i);
  if (!match) return "";
  return normalizeIxId(match[1]);
}

function applyLegacyIxQueryAlias(response, query, deps = {}) {
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const requestedIx = extractExactCompatIxQuery(query, deps);
  if (!requestedIx || !response || !Array.isArray(response.matches)) {
    return response;
  }
  response.matches = response.matches.map((match) => {
    if (!match || typeof match !== "object") {
      return match;
    }
    const currentId = cleanLine(match.id || match.indexId || match.ix || "");
    const currentIx = cleanLine(match.ix || "");
    if (currentIx === requestedIx || /^IX[-_\s]?\d{1,4}$/i.test(currentId)) {
      return match;
    }
    const chain = Array.isArray(match.chain) ? match.chain.map((item) => cleanLine(item)) : [];
    const snippet = cleanLine(match.snippet || "");
    const title = cleanLine(match.title || "");
    if (chain.includes(requestedIx) || snippet.includes(requestedIx) || title.includes(requestedIx)) {
      return {
        ...match,
        ix: requestedIx,
        legacyIxAlias: requestedIx
      };
    }
    return match;
  });
  return response;
}

function normalizeSearchHit(hit, deps = {}) {
  if (!hit || typeof hit !== "object") {
    return hit;
  }
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const normalizeWrappedIndexId = typeof deps.normalizeWrappedIndexId === "function"
    ? deps.normalizeWrappedIndexId
    : (text) => cleanLine(text);
  const normalizeWrappedLxId = typeof deps.normalizeWrappedLxId === "function"
    ? deps.normalizeWrappedLxId
    : (text) => cleanLine(text);
  const copy = { ...hit };
  const genericId = cleanLine(
    copy.id ||
    copy.indexId ||
    copy.entryId ||
    copy.sourceId ||
    copy.genericId ||
    copy.lx ||
    copy.ix
  );
  if (genericId) {
    copy.id = normalizeWrappedIndexId(genericId);
  } else if (!copy.id && copy.ix) {
    copy.id = cleanLine(copy.ix);
  }
  if (!copy.ix || !cleanLine(copy.ix)) {
    const ixAlias = compatIxAliasFromId(copy.id || genericId, deps);
    copy.ix = ixAlias || cleanLine(copy.id || genericId);
  } else {
    copy.ix = cleanLine(copy.ix);
  }
  if (!copy.lx && typeof genericId === "string" && /^LX[-_\s]?\d{1,4}$/i.test(genericId)) {
    copy.lx = normalizeWrappedLxId(genericId);
  }
  if (!Array.isArray(copy.tags) && Array.isArray(hit.tags)) {
    copy.tags = hit.tags.slice();
  }
  if (!Array.isArray(copy.chain) && Array.isArray(hit.chain)) {
    copy.chain = hit.chain.slice();
  }
  if (!copy.source) {
    copy.source = hit.source || hit.sourcePath || hit.path || hit.absolutePath || "";
  }
  return copy;
}

function normalizeSearchResponse(raw, query, options = {}, extra = {}, deps = {}) {
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const normalizeSearchHitFn = typeof deps.normalizeSearchHit === "function"
    ? deps.normalizeSearchHit
    : (value) => normalizeSearchHit(value, deps);
  const tokenizeQuery = typeof deps.tokenizeQuery === "function"
    ? deps.tokenizeQuery
    : () => [];
  const extractIxRefs = typeof deps.extractIxRefs === "function"
    ? deps.extractIxRefs
    : () => [];
  const stopwords = deps.stopwords;
  const normalizeIxId = deps.normalizeIxId;

  const isArrayResponse = Array.isArray(raw);
  const base = raw && typeof raw === "object" && !isArrayResponse ? { ...raw } : {};
  const matchesRaw = isArrayResponse
    ? raw
    : Array.isArray(base.matches)
      ? base.matches
      : Array.isArray(base.results)
        ? base.results
        : Array.isArray(base.hits)
          ? base.hits
          : [];
  const matches = matchesRaw.map((match) => normalizeSearchHitFn(match));
  const resolvedQuery = cleanLine(base.query || query);
  const count = Number.isFinite(Number(base.count)) ? Number(base.count) : matches.length;
  const response = {
    ...base,
    ok: "ok" in base ? Boolean(base.ok) : true,
    enabled: "enabled" in base ? Boolean(base.enabled) : true,
    query: resolvedQuery,
    count,
    matches
  };
  if (!Array.isArray(response.tokens) || response.tokens.length === 0) {
    response.tokens = Array.isArray(base.tokens) && base.tokens.length > 0
      ? base.tokens
      : tokenizeQuery(resolvedQuery, { stopwords });
  }
  if (!Array.isArray(response.ixRefs) || response.ixRefs.length === 0) {
    response.ixRefs = Array.isArray(base.ixRefs) && base.ixRefs.length > 0
      ? base.ixRefs
      : extractIxRefs(resolvedQuery, { normalizeIxId });
  }
  if (extra.searchMode && !response.searchMode) {
    response.searchMode = extra.searchMode;
  }
  if (extra.sourceContract && !response.sourceContract) {
    response.sourceContract = extra.sourceContract;
  }
  return response;
}

function normalizeCollectedDocument(doc, deps = {}) {
  if (!doc || typeof doc !== "object") {
    return doc;
  }
  const cleanLine = typeof deps.cleanLine === "function"
    ? deps.cleanLine
    : (text) => String(text || "").trim();
  const normalizeWrappedLxId = typeof deps.normalizeWrappedLxId === "function"
    ? deps.normalizeWrappedLxId
    : (text) => cleanLine(text);
  const copy = { ...doc };
  const genericId = cleanLine(copy.id || copy.indexId || copy.entryId || copy.sourceId || copy.lx || copy.ix);
  if (!copy.id && genericId) {
    copy.id = genericId;
  }
  if (!copy.ix || !cleanLine(copy.ix)) {
    const ixAlias = compatIxAliasFromId(copy.id || genericId, deps);
    copy.ix = ixAlias || cleanLine(copy.id || genericId);
  }
  if (!copy.lx && typeof (copy.id || "") === "string" && /^LX[-_\s]?\d{1,4}$/i.test(copy.id)) {
    copy.lx = normalizeWrappedLxId(copy.id);
  }
  if (!copy.text && typeof copy.body === "string") {
    copy.text = copy.body;
  }
  if (!copy.snippet && typeof copy.summary === "string") {
    copy.snippet = copy.summary;
  }
  return copy;
}

module.exports = {
  compatIxAliasFromId,
  extractExactCompatIxQuery,
  applyLegacyIxQueryAlias,
  normalizeSearchHit,
  normalizeSearchResponse,
  normalizeCollectedDocument
};
