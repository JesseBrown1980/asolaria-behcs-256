function mergeExtraIxEntriesForSpawn(ixEntries = [], config = {}, options = {}, deps = {}) {
  const entries = Array.isArray(ixEntries) ? ixEntries : [];
  const extraIxTypes = Array.isArray(options.extraIxTypes) ? options.extraIxTypes : [];
  const searchAgentIndex = deps.searchAgentIndex;
  const getEntryId = deps.getEntryId;
  if (typeof searchAgentIndex !== "function" || typeof getEntryId !== "function") {
    return entries;
  }

  for (const extraType of extraIxTypes) {
    if (Array.isArray(config.ixTypes) && config.ixTypes.includes(extraType)) {
      continue;
    }
    const result = searchAgentIndex(extraType, { limit: 8 });
    if (!Array.isArray(result?.matches)) {
      continue;
    }
    for (const match of result.matches.filter((entry) => entry.type === extraType)) {
      const matchId = getEntryId(match);
      if (matchId && !entries.some((entry) => getEntryId(entry) === matchId)) {
        entries.push(match);
      }
    }
  }

  return entries;
}

module.exports = {
  mergeExtraIxEntriesForSpawn
};
