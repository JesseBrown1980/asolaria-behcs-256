const fs = require("fs");
const path = require("path");

function getEntryId(entry) {
  return String(entry?.id || entry?.lx || entry?.ix || "").trim();
}

function createSpawnIxCacheRuntime(options = {}) {
  const {
    projectRoot = "",
    cacheTtlMs = 60000,
    defaultPackBriefingLimit = 2,
    bootCriticalIds = [],
    searchAgentIndex,
    resolveRolePointerAnchors,
    logPrefix = "[spawnIxCache]"
  } = options;

  if (typeof searchAgentIndex !== "function") {
    throw new Error("createSpawnIxCacheRuntime requires searchAgentIndex.");
  }
  if (typeof resolveRolePointerAnchors !== "function") {
    throw new Error("createSpawnIxCacheRuntime requires resolveRolePointerAnchors.");
  }

  const ixCache = new Map();
  let ixFileWatcher = null;
  let ixWatcherDebounceTimer = null;
  let lastIxInvalidation = null;

  function invalidateIxCache() {
    ixCache.clear();
    lastIxInvalidation = Date.now();
  }

  function getIxEntriesForRole(role, roleMap = {}) {
    const config = roleMap?.[role];
    if (!config) return [];

    const cached = ixCache.get(role);
    if (cached && Date.now() < cached.validUntil) {
      return cached.entries.slice();
    }

    const entries = [];

    if (Array.isArray(config.priorityChains)) {
      for (const lxRef of config.priorityChains) {
        const result = searchAgentIndex(lxRef, { limit: 1, force: true });
        if (result.matches && result.matches.length > 0) {
          entries.push(result.matches[0]);
        }
      }
    }

    for (const ixType of Array.isArray(config.ixTypes) ? config.ixTypes : []) {
      if (ixType === "task") {
        continue;
      }
      const perTypeLimit = ixType === "pattern"
        ? 4
        : ixType === "tool"
          ? 5
          : ixType === "skill"
            ? 4
            : 8;
      const pointerMatches = resolveRolePointerAnchors(role, config, ixType, {
        profile: "running",
        limit: defaultPackBriefingLimit,
        maxAnchors: perTypeLimit,
        searchAgentIndex
      });
      if (pointerMatches.length > 0) {
        for (const match of pointerMatches) {
          const matchId = getEntryId(match);
          if (!entries.some((entry) => getEntryId(entry) === matchId)) {
            entries.push(match);
          }
        }
        continue;
      }

      const result = searchAgentIndex(ixType, { limit: perTypeLimit });
      if (result.matches) {
        for (const match of result.matches.filter((entry) => entry.type === ixType)) {
          const matchId = getEntryId(match);
          if (!entries.some((entry) => getEntryId(entry) === matchId)) {
            entries.push(match);
          }
        }
      }
    }

    if (config.includeBootCritical) {
      for (const bootLx of bootCriticalIds) {
        if (!entries.some((entry) => getEntryId(entry) === bootLx)) {
          const result = searchAgentIndex(bootLx, { limit: 1, force: true });
          if (result.matches && result.matches.length > 0) {
            entries.push(result.matches[0]);
          }
        }
      }
    }

    const seen = new Set();
    const deduped = entries.filter((entry) => {
      const key = getEntryId(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, Number(config.maxEntries || entries.length) || entries.length);

    const now = Date.now();
    ixCache.set(role, {
      entries: deduped,
      cachedAt: now,
      validUntil: now + cacheTtlMs
    });

    return deduped;
  }

  function startIxFileWatcher() {
    if (ixFileWatcher) return;
    const watchDir = path.join(projectRoot, "data", "agent-index");
    try {
      ixFileWatcher = fs.watch(watchDir, { recursive: true }, () => {
        if (ixWatcherDebounceTimer) clearTimeout(ixWatcherDebounceTimer);
        ixWatcherDebounceTimer = setTimeout(() => {
          invalidateIxCache();
          ixWatcherDebounceTimer = null;
        }, 500);
      });
      ixFileWatcher.on("error", (err) => {
        console.error(`${logPrefix} fs.watch error on agent-index:`, err.message);
        try { ixFileWatcher.close(); } catch (_) {}
        ixFileWatcher = null;
      });
    } catch (err) {
      console.error(`${logPrefix} Failed to start fs.watch on agent-index:`, err.message);
      ixFileWatcher = null;
    }
  }

  function stopIxFileWatcher() {
    if (ixWatcherDebounceTimer) {
      clearTimeout(ixWatcherDebounceTimer);
      ixWatcherDebounceTimer = null;
    }
    if (ixFileWatcher) {
      try { ixFileWatcher.close(); } catch (_) {}
      ixFileWatcher = null;
    }
  }

  function getIxCacheStats() {
    const cachedRoles = [];
    let totalCachedEntries = 0;
    for (const [role, data] of ixCache) {
      cachedRoles.push(role);
      totalCachedEntries += data.entries.length;
    }
    return {
      cachedRoles,
      totalCachedEntries,
      lastInvalidation: lastIxInvalidation,
      watcherActive: ixFileWatcher !== null
    };
  }

  return {
    getIxEntriesForRole,
    invalidateIxCache,
    startIxFileWatcher,
    stopIxFileWatcher,
    getIxCacheStats
  };
}

module.exports = {
  createSpawnIxCacheRuntime
};
