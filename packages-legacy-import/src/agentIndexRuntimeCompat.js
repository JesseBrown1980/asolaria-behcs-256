function createAgentIndexRuntimeCompat(input = {}) {
  const cleanLine = typeof input.cleanLine === "function"
    ? input.cleanLine
    : (text) => String(text || "").trim();
  const normalizeIxId = typeof input.normalizeIxId === "function"
    ? input.normalizeIxId
    : (text) => String(text || "").trim();
  const tokenizeQuery = typeof input.tokenizeQuery === "function"
    ? input.tokenizeQuery
    : () => [];
  const extractIxRefs = typeof input.extractIxRefs === "function"
    ? input.extractIxRefs
    : () => [];
  const stopwords = input.stopwords instanceof Set ? input.stopwords : new Set();
  const getRuntimeLoader = typeof input.getRuntimeLoader === "function"
    ? input.getRuntimeLoader
    : () => null;

  let unifiedAgentIndexStore = undefined;

  function getUnifiedAgentIndexStore() {
    if (unifiedAgentIndexStore === undefined) {
      try {
        unifiedAgentIndexStore = getRuntimeLoader();
      } catch (_) {
        unifiedAgentIndexStore = null;
      }
    }
    return unifiedAgentIndexStore;
  }

  function normalizeIndexIdFallback(value) {
    const text = cleanLine(value);
    if (!text) return "";
    const prefixed = text.match(/^([A-Za-z]{1,16})[-_\s]?(\d{1,4})$/);
    if (prefixed) {
      return `${prefixed[1].toUpperCase()}-${String(prefixed[2]).padStart(3, "0")}`;
    }
    const digits = text.match(/(\d{1,4})/);
    if (digits) {
      return `IX-${String(digits[1]).padStart(3, "0")}`;
    }
    return text.toUpperCase();
  }

  function normalizeLxIdFallback(value) {
    const text = cleanLine(value);
    if (!text) return "";
    const prefixed = text.match(/^LX[-_\s]?(\d{1,4})$/i);
    if (prefixed) {
      return `LX-${String(prefixed[1]).padStart(3, "0")}`;
    }
    const digits = text.match(/(\d{1,4})/);
    if (digits) {
      return `LX-${String(digits[1]).padStart(3, "0")}`;
    }
    return text.toUpperCase();
  }

  function normalizeWrappedIndexId(value) {
    const runtime = getUnifiedAgentIndexStore();
    if (runtime && typeof runtime.normalizeIndexId === "function") {
      return runtime.normalizeIndexId(value);
    }
    return normalizeIndexIdFallback(value);
  }

  function normalizeWrappedIxId(value) {
    const runtime = getUnifiedAgentIndexStore();
    if (runtime && typeof runtime.normalizeIxId === "function") {
      return runtime.normalizeIxId(value);
    }
    return normalizeIxId(value);
  }

  function normalizeWrappedLxId(value) {
    const runtime = getUnifiedAgentIndexStore();
    if (runtime && typeof runtime.normalizeLxId === "function") {
      return runtime.normalizeLxId(value);
    }
    return normalizeLxIdFallback(value);
  }

  function buildNormalizeDeps() {
    return {
      cleanLine,
      normalizeIxId,
      normalizeWrappedIndexId,
      normalizeWrappedLxId,
      tokenizeQuery,
      extractIxRefs,
      stopwords
    };
  }

  function resolveRuntimeProfileOptions(options = {}) {
    const base = options && typeof options === "object" ? { ...options } : {};
    const requested = cleanLine(
      base.profile
        || base.stage
        || process.env.ASOLARIA_UNIFIED_INDEX_PROFILE
        || process.env.ASOLARIA_RUNTIME_STAGE
        || "running"
    ).toLowerCase();
    const profile = requested === "stage" || requested === "staging"
      ? "staging"
      : requested === "development" || requested === "dev"
        ? "dev"
        : requested === "run" || requested === "running" || requested === "runtime" || requested === "live"
          ? "running"
          : requested === "production" || requested === "prod" || requested === "pro"
            ? "prod"
            : "running";
    return {
      ...base,
      profile,
      stage: profile
    };
  }

  return {
    getUnifiedAgentIndexStore,
    normalizeIndexIdFallback,
    normalizeLxIdFallback,
    normalizeWrappedIndexId,
    normalizeWrappedIxId,
    normalizeWrappedLxId,
    buildNormalizeDeps,
    resolveRuntimeProfileOptions
  };
}

module.exports = {
  createAgentIndexRuntimeCompat
};
