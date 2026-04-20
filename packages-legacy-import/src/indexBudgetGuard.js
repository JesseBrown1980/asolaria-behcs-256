const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { AGENT_ROLES } = require("./spawnContextBuilder");

const CANONICAL_TYPES = Object.freeze([
  "identity",
  "mistake",
  "pattern",
  "plan",
  "policy",
  "project",
  "reference",
  "rule",
  "skill",
  "task",
  "tool"
]);

const DEFAULT_WARN_MULTIPLIER = 5;
const DEFAULT_CRITICAL_MULTIPLIER = 7;
const DEFAULT_FALLBACK_MAX_ENTRIES = 12;
const DEFAULT_FALLBACK_WARN_MAX = 24;
const DEFAULT_FALLBACK_CRITICAL_MAX = 40;
const PACKED_TYPE_MODES = Object.freeze({
  mistake: "mistake-packs",
  plan: "plan-packs",
  pattern: "pattern-packs",
  rule: "rule-packs",
  skill: "skill-packs",
  tool: "tool-packs"
});

function normalizeType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  if (CANONICAL_TYPES.includes(raw)) {
    return raw;
  }
  if (raw.endsWith("ies")) {
    const singular = `${raw.slice(0, -3)}y`;
    if (CANONICAL_TYPES.includes(singular)) {
      return singular;
    }
  }
  if (raw.endsWith("s")) {
    const singular = raw.slice(0, -1);
    if (CANONICAL_TYPES.includes(singular)) {
      return singular;
    }
  }
  return raw;
}

function readRunningTypeCounts(options = {}) {
  const payload = readUnifiedIndex({
    profile: options.profile || "running",
    scanMode: options.scanMode || "blink",
    autoBuild: false
  });
  const typeCounts = payload?.sourceCounts?.typeCounts || {};
  const counts = {};
  for (const type of CANONICAL_TYPES) {
    counts[type] = Number(typeCounts[type] || 0);
  }
  return {
    profile: payload?.profile || String(options.profile || "running"),
    stage: payload?.stage || String(options.profile || "running"),
    documentCount: Number(payload?.documentCount || payload?.documents?.length || 0),
    typeCounts: counts
  };
}

function readEffectiveTypeCounts(options = {}) {
  const runtime = readRunningTypeCounts(options);
  const effectiveTypeCounts = { ...runtime.typeCounts };
  const reductionModes = Object.fromEntries(CANONICAL_TYPES.map((type) => [type, "raw"]));

  try {
    const { buildMistakePackReport } = require("./mistakePackStore");
    const report = buildMistakePackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.mistake = Number(report?.packCount || 0);
    reductionModes.mistake = PACKED_TYPE_MODES.mistake;
  } catch (_) {}

  try {
    const { buildPlanPackReport } = require("./planPackStore");
    const report = buildPlanPackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.plan = Number(report?.packCount || 0);
    reductionModes.plan = PACKED_TYPE_MODES.plan;
  } catch (_) {}

  try {
    const { buildRulePackReport } = require("./rulePackStore");
    const report = buildRulePackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.rule = Number(report?.packCount || 0);
    reductionModes.rule = PACKED_TYPE_MODES.rule;
  } catch (_) {}

  try {
    const { buildPatternPackReport } = require("./patternPackStore");
    const report = buildPatternPackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.pattern = Number(report?.packCount || 0);
    reductionModes.pattern = PACKED_TYPE_MODES.pattern;
  } catch (_) {}

  try {
    const { buildSkillPackReport } = require("./skillPackStore");
    const report = buildSkillPackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.skill = Number(report?.packCount || 0);
    reductionModes.skill = PACKED_TYPE_MODES.skill;
  } catch (_) {}

  try {
    const { buildToolPackReport } = require("./toolPackStore");
    const report = buildToolPackReport({
      profile: runtime.profile,
      scanMode: options.scanMode || "blink"
    });
    effectiveTypeCounts.tool = Number(report?.packCount || 0);
    reductionModes.tool = PACKED_TYPE_MODES.tool;
  } catch (_) {}

  return {
    profile: runtime.profile,
    stage: runtime.stage,
    documentCount: runtime.documentCount,
    typeCounts: effectiveTypeCounts,
    reductionModes
  };
}

function buildRoleTypeBudgets(roles = AGENT_ROLES) {
  const budgets = {};
  for (const type of CANONICAL_TYPES) {
    budgets[type] = {
      type,
      roles: [],
      roleCount: 0,
      minRoleBudget: 0,
      maxRoleBudget: 0
    };
  }

  for (const [roleId, config] of Object.entries(roles || {})) {
    const types = Array.isArray(config?.ixTypes) ? config.ixTypes : [];
    const maxEntries = Math.max(1, Number(config?.maxEntries || DEFAULT_FALLBACK_MAX_ENTRIES));
    for (const rawType of types) {
      const type = normalizeType(rawType);
      if (!CANONICAL_TYPES.includes(type)) {
        continue;
      }
      budgets[type].roles.push({
        role: roleId,
        maxEntries
      });
    }
  }

  for (const type of CANONICAL_TYPES) {
    const roleBudgets = budgets[type].roles.map((entry) => Number(entry.maxEntries || 0)).filter((value) => value > 0);
    budgets[type].roleCount = roleBudgets.length;
    budgets[type].minRoleBudget = roleBudgets.length > 0 ? Math.min(...roleBudgets) : 0;
    budgets[type].maxRoleBudget = roleBudgets.length > 0 ? Math.max(...roleBudgets) : 0;
  }

  return budgets;
}

function assessTypeBudget(type, count, budget, options = {}) {
  const warnMultiplier = Math.max(2, Number(options.warnMultiplier || DEFAULT_WARN_MULTIPLIER));
  const criticalMultiplier = Math.max(warnMultiplier + 1, Number(options.criticalMultiplier || DEFAULT_CRITICAL_MULTIPLIER));
  const fallbackMaxEntries = Math.max(1, Number(options.fallbackMaxEntries || DEFAULT_FALLBACK_MAX_ENTRIES));
  const baseMaxEntries = Math.max(1, Number(budget?.maxRoleBudget || 0) || fallbackMaxEntries);
  const warnMax = Math.max(DEFAULT_FALLBACK_WARN_MAX, baseMaxEntries * warnMultiplier);
  const criticalMax = Math.max(DEFAULT_FALLBACK_CRITICAL_MAX, baseMaxEntries * criticalMultiplier);
  const orientationRatio = Number((Number(count || 0) / baseMaxEntries).toFixed(2));
  const effectiveCount = Math.max(0, Number(options.effectiveCount ?? count ?? 0));
  const effectiveOrientationRatio = Number((effectiveCount / baseMaxEntries).toFixed(2));
  const reductionMode = String(options.reductionMode || "raw");
  const compressionRatio = Number(count || 0) > 0
    ? Number((effectiveCount / Math.max(1, Number(count || 0))).toFixed(2))
    : 1;

  let status = "ok";
  if (count > criticalMax) {
    status = "critical";
  } else if (count > warnMax) {
    status = "warning";
  }

  let effectiveStatus = "ok";
  if (effectiveCount > criticalMax) {
    effectiveStatus = "critical";
  } else if (effectiveCount > warnMax) {
    effectiveStatus = "warning";
  }

  return {
    type,
    count: Number(count || 0),
    status,
    effectiveCount,
    effectiveStatus,
    roleCount: Number(budget?.roleCount || 0),
    roles: Array.isArray(budget?.roles) ? budget.roles.slice() : [],
    minRoleBudget: Number(budget?.minRoleBudget || 0),
    maxRoleBudget: Number(budget?.maxRoleBudget || 0),
    orientationBase: baseMaxEntries,
    orientationRatio,
    effectiveOrientationRatio,
    warnMax,
    criticalMax,
    reductionMode,
    compressionRatio,
    compressed: effectiveCount < Number(count || 0)
  };
}

function buildIndexBudgetReport(options = {}) {
  const runtime = options.typeCounts
    ? {
        profile: String(options.profile || "running"),
        stage: String(options.stage || options.profile || "running"),
        documentCount: Number(options.documentCount || 0),
        typeCounts: Object.fromEntries(
          CANONICAL_TYPES.map((type) => [type, Number(options.typeCounts?.[type] || 0)])
        )
      }
    : readRunningTypeCounts(options);

  const effective = options.effectiveTypeCounts
    ? {
        typeCounts: Object.fromEntries(
          CANONICAL_TYPES.map((type) => [type, Number(options.effectiveTypeCounts?.[type] || runtime.typeCounts[type] || 0)])
        ),
        reductionModes: Object.fromEntries(
          CANONICAL_TYPES.map((type) => [type, String(options.reductionModes?.[type] || "raw")])
        )
      }
    : readEffectiveTypeCounts({
        profile: runtime.profile,
        scanMode: options.scanMode || "blink"
      });

  const budgets = buildRoleTypeBudgets(options.roles || AGENT_ROLES);
  const perType = CANONICAL_TYPES.map((type) =>
    assessTypeBudget(type, runtime.typeCounts[type] || 0, budgets[type], {
      ...options,
      effectiveCount: effective.typeCounts[type],
      reductionMode: effective.reductionModes[type]
    })
  );
  const warnings = perType.filter((entry) => entry.status === "warning");
  const critical = perType.filter((entry) => entry.status === "critical");
  const effectiveWarnings = perType.filter((entry) => entry.effectiveStatus === "warning");
  const effectiveCritical = perType.filter((entry) => entry.effectiveStatus === "critical");
  const largestType = perType.reduce((best, entry) => {
    if (!best || entry.count > best.count) {
      return entry;
    }
    return best;
  }, null);
  const largestEffectiveType = perType.reduce((best, entry) => {
    if (!best || entry.effectiveCount > best.effectiveCount) {
      return entry;
    }
    return best;
  }, null);

  return {
    ok: true,
    profile: runtime.profile,
    stage: runtime.stage,
    documentCount: Number(runtime.documentCount || perType.reduce((sum, entry) => sum + entry.count, 0)),
    overallRaw: critical.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "ok",
    overallEffective: effectiveCritical.length > 0 ? "critical" : effectiveWarnings.length > 0 ? "warning" : "ok",
    overall: critical.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "ok",
    perType,
    summary: {
      warningTypes: warnings.map((entry) => entry.type),
      criticalTypes: critical.map((entry) => entry.type),
      effectiveWarningTypes: effectiveWarnings.map((entry) => entry.type),
      effectiveCriticalTypes: effectiveCritical.map((entry) => entry.type),
      overBudgetCount: warnings.length + critical.length,
      effectiveOverBudgetCount: effectiveWarnings.length + effectiveCritical.length,
      largestType: largestType ? { type: largestType.type, count: largestType.count } : null,
      largestEffectiveType: largestEffectiveType ? { type: largestEffectiveType.type, count: largestEffectiveType.effectiveCount } : null
    }
  };
}

module.exports = {
  CANONICAL_TYPES,
  normalizeType,
  readRunningTypeCounts,
  readEffectiveTypeCounts,
  buildRoleTypeBudgets,
  assessTypeBudget,
  buildIndexBudgetReport
};
