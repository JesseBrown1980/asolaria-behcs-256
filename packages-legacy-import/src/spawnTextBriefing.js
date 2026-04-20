const { buildKnowledgeBriefingSections } = require("./spawnKnowledgeBriefing");
const { buildTaskBriefingSections } = require("./spawnTaskBriefing");

function buildSpawnTextBriefing(input = {}) {
  const config = input.config || {};
  const agentIdentity = input.agentIdentity || {};
  const normalizedRole = String(input.normalizedRole || "").trim();
  const virtualPid = String(input.virtualPid || "").trim();
  const visibleIxEntries = Array.isArray(input.visibleIxEntries) ? input.visibleIxEntries : [];
  const briefingIxEntries = Array.isArray(input.briefingIxEntries) ? input.briefingIxEntries : [];
  const options = input.options || {};
  const lines = [
    config.identity,
    `Agent ID: ${agentIdentity.agentId}`,
    `Your spawn-PID: ${virtualPid}`,
    `Responsibility tier: ${agentIdentity.responsibilityTier} (${agentIdentity.responsibilityLabel})`,
    `Lifecycle: ${agentIdentity.lifecycle}`,
    "",
    "## IDENTITY CHALLENGE",
    `When challenged, respond: "I am ${normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)} / ${agentIdentity.agentId}, spawn-PID ${virtualPid}"`,
    "If you cannot produce your spawn-PID, you will be black-holed.",
    "",
    `Spawned: ${input.spawnedAt || new Date().toISOString()}`,
    `Context budget: ${briefingIxEntries.length}/${visibleIxEntries.length} LX entries loaded (role max ${config.maxEntries}).`,
    `Tier guidance: ${agentIdentity.tierGuidance}`,
    "",
    "## DESPAWN PROTOCOL (LX-249 — MANDATORY)",
    "Before you finish/despawn, you MUST:",
    "1. Record raw facts in the owning store first — ASO for live facts, task-ledger for planned work, lease-ledger for active ownership",
    "2. If the discovery is durable guidance future agents must inherit, append an LX entry in the appropriate type folder",
    "3. Update the type CATALOG.md only when you actually added a new LX entry",
    `4. Call despawnPid('${normalizedRole}') to deregister your PID`,
    "5. The next agent inherits your durable discoveries via the index",
    "If you skip indexing, your work is LOST. The index is permanent. You are temporary.",
    ""
  ];

  if (Array.isArray(config.permissions) && config.permissions.length > 0) {
    lines.push("## PERMISSIONS");
    lines.push(config.permissions.join(", "));
    lines.push("");
  }

  lines.push(...buildKnowledgeBriefingSections({
    compactRuntime: input.compactRuntime,
    ixBriefing: input.ixBriefing,
    rulePointers: input.rulePointers,
    mission: options.mission,
    blockers: input.allBlockers,
    signals: input.driftSignals,
    mistakePointers: input.mistakePointers,
    mistakes: input.mistakes,
    patternPointers: input.patternPointers,
    planPointers: input.planPointers,
    skillPacks: input.skillPacks,
    toolPacks: input.toolPacks
  }));

  lines.push(...buildTaskBriefingSections(input.activeTasks, input.taskActivation));

  lines.push("## LOADED LX KNOWLEDGE");
  for (const entry of briefingIxEntries) {
    lines.push(`- ${entry.id || entry.lx || entry.ix || "?"} [${entry.type}] ${entry.title}`);
    if (options.includeBody && entry.snippet) {
      lines.push(`  ${entry.snippet}`);
    }
  }

  if (options.extraContext) {
    lines.push("");
    lines.push("## ADDITIONAL CONTEXT");
    lines.push(String(options.extraContext).slice(0, 2000));
  }

  return lines.join("\n");
}

module.exports = {
  buildSpawnTextBriefing
};
