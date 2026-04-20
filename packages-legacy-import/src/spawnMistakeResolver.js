function normalizeSpawnText(value) {
  return String(value || "").trim();
}

function getMistakesForRole(role, config, options = {}, deps = {}) {
  try {
    if (!config) return [];

    const buildMistakePackReport = deps.buildMistakePackReport;
    const getMistakePacksForRole = deps.getMistakePacksForRole;
    const buildMistakePointersForRole = deps.buildMistakePointersForRole;
    const searchAgentIndex = deps.searchAgentIndex;
    const defaultPackBriefingLimit = Math.max(1, Number(deps.defaultPackBriefingLimit) || 2);
    const maxAnchors = Math.max(1, Number(deps.maxAnchors) || 3);
    if (
      typeof buildMistakePackReport !== "function"
      || typeof getMistakePacksForRole !== "function"
      || typeof buildMistakePointersForRole !== "function"
      || typeof searchAgentIndex !== "function"
    ) {
      return [];
    }

    const report = options.report && options.report.packs
      ? options.report
      : buildMistakePackReport({ profile: "running" });
    const visiblePacks = Array.isArray(options.visiblePacks) && options.visiblePacks.length > 0
      ? options.visiblePacks
      : getMistakePacksForRole(role, config, {
          report,
          limit: defaultPackBriefingLimit
        }).packs;
    const pointers = buildMistakePointersForRole(role, config, {
      report,
      visiblePacks,
      hiddenIds: options.hiddenIds,
      maxAnchors
    });
    const anchorIds = Array.isArray(pointers.anchorIds) ? pointers.anchorIds : [];

    return anchorIds
      .map((anchorId) => {
        const result = searchAgentIndex(anchorId, { limit: 1, force: true });
        return Array.isArray(result.matches)
          ? result.matches.find((match) => match.type === "mistake")
          : null;
      })
      .filter(Boolean)
      .map((match) => ({
        id: match.id || match.lx || match.ix,
        name: match.title,
        description: match.snippet || match.title
      }));
  } catch (_) {
    return [];
  }
}

module.exports = {
  normalizeSpawnText,
  getMistakesForRole
};
