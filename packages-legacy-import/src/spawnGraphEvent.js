function emitSpawnGraphEvent(options = {}) {
  const {
    appendGraphEvent,
    agentIdentity = {},
    virtualPid = "",
    normalizedRole = "",
    briefingIxEntries = [],
    visibleIxEntries = [],
    ixBriefing = {},
    patternPacks = [],
    skillPacks = [],
    toolPacks = [],
    allBlockers = [],
    drift = {},
    config = {}
  } = options;

  if (typeof appendGraphEvent !== "function") {
    return false;
  }

  const ixCount = Array.isArray(briefingIxEntries) ? briefingIxEntries.length : 0;
  const ixReducedCount = Array.isArray(visibleIxEntries) ? visibleIxEntries.length : 0;
  const ixDeferredCount = Array.isArray(ixBriefing.deferredIds) ? ixBriefing.deferredIds.length : 0;
  const patternPackCount = Array.isArray(patternPacks) ? patternPacks.length : 0;
  const skillPackCount = Array.isArray(skillPacks) ? skillPacks.length : 0;
  const toolPackCount = Array.isArray(toolPacks) ? toolPacks.length : 0;
  const blockerCount = Array.isArray(allBlockers) ? allBlockers.length : 0;
  const driftSignals = Array.isArray(drift.signals) ? drift.signals.length : 0;

  try {
    appendGraphEvent({
      component: "spawn-context-builder",
      category: "agent-lifecycle",
      action: "agent_spawned",
      status: "ok",
      actor: { type: "orchestrator", id: "asolaria" },
      target: { type: "agent", id: agentIdentity.agentId, criticality: "high" },
      context: {
        agentId: agentIdentity.agentId,
        spawnPid: virtualPid,
        role: normalizedRole,
        responsibilityTier: agentIdentity.responsibilityTier,
        ixEntries: ixCount,
        ixReducedEntries: ixReducedCount,
        ixDeferredEntries: ixDeferredCount,
        patternPacks: patternPackCount,
        skillPacks: skillPackCount,
        toolPacks: toolPackCount,
        blockers: blockerCount,
        driftSignals
      },
      policy: {
        mode: "spawn",
        approvalState: "identity_pending",
        autonomous: true
      },
      detail: {
        note: `Spawned ${config.label} with ${ixCount}/${ixReducedCount} LX briefing entries, ${patternPackCount} pattern packs, ${skillPackCount} skill packs, ${toolPackCount} tool packs, ${blockerCount} blockers, ${driftSignals} drift signals`
      }
    });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  emitSpawnGraphEvent
};
