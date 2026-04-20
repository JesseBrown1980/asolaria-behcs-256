const {
  buildPatternPackReport,
  buildPatternDigestForRole,
  buildPatternPointersForRole,
  getPatternPacksForRole
} = require("./patternPackStore");
const {
  buildRulePackReport,
  buildRulePointersForRole,
  getRulePacksForRole
} = require("./rulePackStore");
const {
  buildPlanPackReport,
  buildPlanPointersForRole,
  getPlanPacksForRole
} = require("./planPackStore");
const {
  buildMistakePackReport,
  buildMistakePointersForRole,
  getMistakePacksForRole
} = require("./mistakePackStore");
const { buildSkillPackReport, getSkillPacksForRole } = require("./skillPackStore");
const { buildToolPackReport, getToolPacksForRole } = require("./toolPackStore");
const {
  collectBriefingContext,
  gateBriefingPacks,
  mergePackCandidates
} = require("./spawnPackGate");
const { getMistakesForRole } = require("./spawnMistakeResolver");

function buildSpawnPackAssembly(input = {}, deps = {}) {
  const normalizedRole = String(input.normalizedRole || "").trim().toLowerCase();
  const config = input.config || {};
  const activeTasks = Array.isArray(input.activeTasks) ? input.activeTasks : [];
  const driftSignals = Array.isArray(input.driftSignals) ? input.driftSignals : [];
  const allBlockers = Array.isArray(input.allBlockers) ? input.allBlockers : [];
  const defaultPackBriefingLimit = Math.max(1, Number(input.defaultPackBriefingLimit) || 2);
  const finalTypeCaps = input.finalTypeCaps && typeof input.finalTypeCaps === "object"
    ? input.finalTypeCaps
    : {};

  const api = {
    buildPatternPackReport: deps.buildPatternPackReport || buildPatternPackReport,
    buildPatternDigestForRole: deps.buildPatternDigestForRole || buildPatternDigestForRole,
    buildPatternPointersForRole: deps.buildPatternPointersForRole || buildPatternPointersForRole,
    getPatternPacksForRole: deps.getPatternPacksForRole || getPatternPacksForRole,
    buildRulePackReport: deps.buildRulePackReport || buildRulePackReport,
    buildRulePointersForRole: deps.buildRulePointersForRole || buildRulePointersForRole,
    getRulePacksForRole: deps.getRulePacksForRole || getRulePacksForRole,
    buildPlanPackReport: deps.buildPlanPackReport || buildPlanPackReport,
    buildPlanPointersForRole: deps.buildPlanPointersForRole || buildPlanPointersForRole,
    getPlanPacksForRole: deps.getPlanPacksForRole || getPlanPacksForRole,
    buildMistakePackReport: deps.buildMistakePackReport || buildMistakePackReport,
    buildMistakePointersForRole: deps.buildMistakePointersForRole || buildMistakePointersForRole,
    getMistakePacksForRole: deps.getMistakePacksForRole || getMistakePacksForRole,
    buildSkillPackReport: deps.buildSkillPackReport || buildSkillPackReport,
    getSkillPacksForRole: deps.getSkillPacksForRole || getSkillPacksForRole,
    buildToolPackReport: deps.buildToolPackReport || buildToolPackReport,
    getToolPacksForRole: deps.getToolPacksForRole || getToolPacksForRole,
    collectBriefingContext: deps.collectBriefingContext || collectBriefingContext,
    gateBriefingPacks: deps.gateBriefingPacks || gateBriefingPacks,
    mergePackCandidates: deps.mergePackCandidates || mergePackCandidates,
    getMistakesForRole: deps.getMistakesForRole || getMistakesForRole,
    searchAgentIndex: deps.searchAgentIndex
  };

  const broadBriefingContext = api.collectBriefingContext([
    normalizedRole,
    config.label,
    config.title,
    config.identity,
    config.briefing,
    activeTasks.map((task) => task.title),
    driftSignals.map((signal) => typeof signal === "object" ? `${signal.source || ""} ${signal.type || ""}` : signal)
  ]);
  const explicitBriefingContext = api.collectBriefingContext([
    input.mission,
    allBlockers,
    input.extraContext
  ]);

  const rulePackReport = config.ixTypes.includes("rule") ? api.buildRulePackReport({ profile: "running" }) : null;
  const rulePackCandidates = config.ixTypes.includes("rule")
    ? api.mergePackCandidates(
        rulePackReport?.packs || [],
        api.getRulePacksForRole(normalizedRole, config, { limit: 6, report: rulePackReport }).packs
      )
    : [];
  const patternPackReport = config.ixTypes.includes("pattern") ? api.buildPatternPackReport({ profile: "running" }) : null;
  const patternPackCandidates = config.ixTypes.includes("pattern")
    ? api.mergePackCandidates(
        patternPackReport?.packs || [],
        api.getPatternPacksForRole(normalizedRole, config, { limit: 6, report: patternPackReport }).packs
      )
    : [];
  const planPackReport = config.ixTypes.includes("plan") ? api.buildPlanPackReport({ profile: "running" }) : null;
  const planPackCandidates = config.ixTypes.includes("plan")
    ? api.mergePackCandidates(
        planPackReport?.packs || [],
        api.getPlanPacksForRole(normalizedRole, config, { limit: 6, report: planPackReport }).packs
      )
    : [];
  const skillPackReport = config.ixTypes.includes("skill") ? api.buildSkillPackReport({ profile: "running" }) : null;
  const skillPackCandidates = config.ixTypes.includes("skill")
    ? api.mergePackCandidates(
        skillPackReport?.packs || [],
        api.getSkillPacksForRole(normalizedRole, config, { limit: 6, report: skillPackReport }).packs
      )
    : [];
  const toolPackReport = config.ixTypes.includes("tool") ? api.buildToolPackReport({ profile: "running" }) : null;
  const toolPackCandidates = config.ixTypes.includes("tool")
    ? api.mergePackCandidates(
        toolPackReport?.packs || [],
        api.getToolPacksForRole(normalizedRole, config, { limit: 6, report: toolPackReport }).packs
      )
    : [];
  const mistakePackReport = config.ixTypes.includes("mistake") ? api.buildMistakePackReport({ profile: "running" }) : null;
  const mistakePackCandidates = config.ixTypes.includes("mistake")
    ? api.mergePackCandidates(
        mistakePackReport?.packs || [],
        api.getMistakePacksForRole(normalizedRole, config, { limit: 6, report: mistakePackReport }).packs
      )
    : [];

  const gate = (kind, candidates) => api.gateBriefingPacks(
    candidates,
    broadBriefingContext,
    normalizedRole,
    config,
    kind,
    explicitBriefingContext,
    { maxVisible: defaultPackBriefingLimit }
  );

  const rulePackGate = config.ixTypes.includes("rule") ? gate("rule", rulePackCandidates) : [];
  const patternPackGate = config.ixTypes.includes("pattern") ? gate("pattern", patternPackCandidates) : [];
  const planPackGate = config.ixTypes.includes("plan") ? gate("plan", planPackCandidates) : [];
  const skillPackGate = config.ixTypes.includes("skill") ? gate("skill", skillPackCandidates) : [];
  const toolPackGate = config.ixTypes.includes("tool") ? gate("tool", toolPackCandidates) : [];
  const mistakePackGate = config.ixTypes.includes("mistake") ? gate("mistake", mistakePackCandidates) : [];

  const rulePacks = config.ixTypes.includes("rule") ? rulePackGate.visible : [];
  const patternPacks = config.ixTypes.includes("pattern") ? patternPackGate.visible : [];
  const planPacks = config.ixTypes.includes("plan") ? planPackGate.visible : [];
  const skillPacks = config.ixTypes.includes("skill") ? skillPackGate.visible : [];
  const toolPacks = config.ixTypes.includes("tool") ? toolPackGate.visible : [];
  const mistakePacks = config.ixTypes.includes("mistake") ? mistakePackGate.visible : [];

  const rulePointers = config.ixTypes.includes("rule")
    ? api.buildRulePointersForRole(normalizedRole, config, {
        report: rulePackReport,
        visiblePacks: rulePacks,
        hiddenIds: rulePackGate.hiddenIds,
        maxAnchors: finalTypeCaps.rule
      })
    : null;
  const patternDigest = config.ixTypes.includes("pattern")
    ? api.buildPatternDigestForRole(normalizedRole, config, {
        report: patternPackReport,
        visiblePacks: patternPacks,
        hiddenIds: patternPackGate.hiddenIds,
        noisyIds: patternPackGate.noisyIds
      })
    : null;
  const patternPointers = config.ixTypes.includes("pattern")
    ? api.buildPatternPointersForRole(normalizedRole, config, {
        report: patternPackReport,
        visiblePacks: patternPacks,
        hiddenIds: patternPackGate.hiddenIds,
        maxAnchors: finalTypeCaps.pattern
      })
    : null;
  const planPointers = config.ixTypes.includes("plan")
    ? api.buildPlanPointersForRole(normalizedRole, config, {
        report: planPackReport,
        visiblePacks: planPacks,
        hiddenIds: planPackGate.hiddenIds,
        maxAnchors: finalTypeCaps.plan
      })
    : null;
  const mistakePointers = config.ixTypes.includes("mistake")
    ? api.buildMistakePointersForRole(normalizedRole, config, {
        report: mistakePackReport,
        visiblePacks: mistakePacks,
        hiddenIds: mistakePackGate.hiddenIds,
        maxAnchors: finalTypeCaps.mistake
      })
    : null;
  const mistakes = api.getMistakesForRole(normalizedRole, config, {
    report: mistakePackReport,
    visiblePacks: mistakePacks,
    hiddenIds: mistakePackGate.hiddenIds
  }, {
    buildMistakePackReport: api.buildMistakePackReport,
    getMistakePacksForRole: api.getMistakePacksForRole,
    buildMistakePointersForRole: api.buildMistakePointersForRole,
    searchAgentIndex: api.searchAgentIndex,
    defaultPackBriefingLimit,
    maxAnchors: finalTypeCaps.mistake
  });

  return {
    rulePackReport,
    patternPackReport,
    planPackReport,
    skillPackReport,
    toolPackReport,
    mistakePackReport,
    rulePackGate,
    patternPackGate,
    planPackGate,
    skillPackGate,
    toolPackGate,
    mistakePackGate,
    rulePacks,
    patternPacks,
    planPacks,
    skillPacks,
    toolPacks,
    mistakePacks,
    rulePointers,
    patternDigest,
    patternPointers,
    planPointers,
    mistakePointers,
    mistakes
  };
}

module.exports = {
  buildSpawnPackAssembly
};
