function getEntryId(entry) {
  return String(entry?.id || entry?.lx || entry?.ix || "").trim();
}

function getEntryType(entry) {
  return String(entry?.type || "").trim().toLowerCase();
}

function dedupeEntries(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const key = getEntryId(entry);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPreservedIxIds(config = {}, options = {}) {
  const preserved = new Set(Array.isArray(config.priorityChains) ? config.priorityChains : []);
  if (config.includeBootCritical) {
    for (const lxId of Array.isArray(options.bootCriticalIds) ? options.bootCriticalIds : []) {
      preserved.add(lxId);
    }
  }
  return preserved;
}

function getFinalIxTypeCap(type, config = {}, options = {}) {
  const normalizedType = String(type || "").trim().toLowerCase();
  const fallback = Math.max(1, Math.min(4, Number(config.maxEntries || 12)));
  const typeCaps = options.finalTypeCaps && typeof options.finalTypeCaps === "object"
    ? options.finalTypeCaps
    : {};
  return Math.max(1, Number(typeCaps[normalizedType] || fallback));
}

function reduceIxEntriesForRole(entries = [], _role = "", config = {}, options = {}) {
  const deduped = dedupeEntries(entries);
  const preservedIds = getPreservedIxIds(config, options);
  const selected = [];
  const selectedIds = new Set();
  const perTypeCounts = {};
  const maxEntries = Math.max(1, Number(config.maxEntries || deduped.length || 1));

  const pushEntry = (entry, force = false) => {
    const id = getEntryId(entry);
    if (!id || selectedIds.has(id)) {
      return false;
    }
    const type = getEntryType(entry);
    const typeCap = getFinalIxTypeCap(type, config, options);
    const currentTypeCount = Number(perTypeCounts[type] || 0);
    if (!force) {
      if (selected.length >= maxEntries) {
        return false;
      }
      if (type && currentTypeCount >= typeCap) {
        return false;
      }
    }
    selected.push(entry);
    selectedIds.add(id);
    if (type) {
      perTypeCounts[type] = currentTypeCount + 1;
    }
    return true;
  };

  for (const entry of deduped) {
    if (preservedIds.has(getEntryId(entry))) {
      pushEntry(entry, true);
    }
  }
  for (const entry of deduped) {
    pushEntry(entry, false);
  }

  const hidden = deduped.filter((entry) => !selectedIds.has(getEntryId(entry)));
  return {
    visible: selected,
    hidden,
    preservedIds: Array.from(preservedIds).filter((id) => selectedIds.has(id)),
    totalCandidates: deduped.length,
    visibleCount: selected.length,
    hiddenIds: hidden.map((entry) => getEntryId(entry)),
    perTypeCounts
  };
}

module.exports = {
  getEntryId,
  getEntryType,
  dedupeEntries,
  getPreservedIxIds,
  getFinalIxTypeCap,
  reduceIxEntriesForRole
};
