const { buildPatternPointersForRole } = require("./patternPackStore");
const { buildRulePointersForRole } = require("./rulePackStore");
const { buildPlanPointersForRole } = require("./planPackStore");
const { buildMistakePointersForRole } = require("./mistakePackStore");

const POINTER_BUILDERS = Object.freeze({
  pattern: buildPatternPointersForRole,
  mistake: buildMistakePointersForRole,
  plan: buildPlanPointersForRole,
  rule: buildRulePointersForRole
});

function cleanPointerText(value) {
  return String(value || "").trim();
}

function getPointerEntryId(entry) {
  return cleanPointerText(entry?.id || entry?.lx || entry?.ix);
}

function resolveRolePointerAnchors(role, config, ixType, options = {}) {
  const buildPointersForRole = POINTER_BUILDERS[ixType];
  const searchAgentIndex = options.searchAgentIndex;
  if (!buildPointersForRole || typeof searchAgentIndex !== "function") {
    return [];
  }

  const pointerReport = buildPointersForRole(role, config, {
    profile: options.profile || "running",
    limit: Number(options.limit || 2),
    maxAnchors: Number(options.maxAnchors || 4)
  });
  const anchorIds = Array.isArray(pointerReport?.anchorIds)
    ? pointerReport.anchorIds.slice(0, Math.max(1, Number(options.maxAnchors || 4)))
    : [];
  if (anchorIds.length === 0) {
    return [];
  }

  const matches = [];
  const seen = new Set();
  for (const anchorId of anchorIds) {
    const anchorResult = searchAgentIndex(anchorId, { limit: 1, force: true });
    const match = Array.isArray(anchorResult?.matches)
      ? anchorResult.matches.find((entry) => entry.type === ixType)
      : null;
    const matchId = getPointerEntryId(match);
    if (!match || !matchId || seen.has(matchId)) {
      continue;
    }
    seen.add(matchId);
    matches.push(match);
  }
  return matches;
}

module.exports = {
  resolveRolePointerAnchors
};
