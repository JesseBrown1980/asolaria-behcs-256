function cleanShapeText(value) {
  return String(value || "").trim();
}

function mapPackRows(packs = []) {
  return (Array.isArray(packs) ? packs : []).map((pack) => ({
    id: pack.id,
    title: pack.title,
    count: pack.count,
    topTags: Array.isArray(pack.topTags) ? pack.topTags.slice(0, 6) : [],
    sampleIds: Array.isArray(pack.sampleIds) ? pack.sampleIds.slice(0, 6) : []
  }));
}

function buildPointerSnapshot(pointer, totalKey) {
  if (!pointer) {
    return {
      guidance: "",
      [totalKey]: 0,
      totalPacks: 0,
      primaryPackId: "",
      primaryPackTitle: "",
      anchorIds: [],
      anchorTitles: [],
      matchingTags: [],
      secondaryPackIds: [],
      hiddenPackCount: 0,
      hiddenIds: []
    };
  }
  return {
    guidance: pointer.guidance,
    [totalKey]: Number(pointer[totalKey] || 0),
    totalPacks: Number(pointer.totalPacks || 0),
    primaryPackId: pointer.primaryPack?.id || "",
    primaryPackTitle: pointer.primaryPack?.title || "",
    anchorIds: Array.isArray(pointer.anchorIds) ? pointer.anchorIds.slice() : [],
    anchorTitles: Array.isArray(pointer.anchorTitles) ? pointer.anchorTitles.slice() : [],
    matchingTags: Array.isArray(pointer.matchingTags) ? pointer.matchingTags.slice() : [],
    secondaryPackIds: Array.isArray(pointer.secondaryPacks)
      ? pointer.secondaryPacks.map((pack) => pack.id)
      : [],
    hiddenPackCount: Number(pointer.hiddenPackCount || 0),
    hiddenIds: Array.isArray(pointer.hiddenIds) ? pointer.hiddenIds.slice() : []
  };
}

function buildPatternDigestSnapshot(digest) {
  if (!digest) {
    return {
      summary: "",
      totalPatterns: 0,
      totalPacks: 0,
      visiblePackCount: 0,
      hiddenPackCount: 0,
      focusPackIds: [],
      focusTags: [],
      sampleIds: [],
      hiddenIds: [],
      noisyIds: []
    };
  }
  return {
    summary: digest.summary,
    totalPatterns: Number(digest.totalPatterns || 0),
    totalPacks: Number(digest.totalPacks || 0),
    visiblePackCount: Number(digest.visiblePackCount || 0),
    hiddenPackCount: Number(digest.hiddenPackCount || 0),
    focusPackIds: Array.isArray(digest.focusPackIds) ? digest.focusPackIds.slice() : [],
    focusTags: Array.isArray(digest.focusTags) ? digest.focusTags.slice() : [],
    sampleIds: Array.isArray(digest.sampleIds) ? digest.sampleIds.slice() : [],
    hiddenIds: Array.isArray(digest.hiddenIds) ? digest.hiddenIds.slice() : [],
    noisyIds: Array.isArray(digest.noisyIds) ? digest.noisyIds.slice() : []
  };
}

function buildPackGateSnapshot(gate) {
  if (!gate || !gate.totalCandidates) {
    return { totalCandidates: 0, visible: 0, hiddenIds: [], noisyIds: [] };
  }
  return {
    totalCandidates: Number(gate.totalCandidates || 0),
    visible: Array.isArray(gate.visible) ? gate.visible.length : 0,
    hiddenIds: Array.isArray(gate.hiddenIds) ? gate.hiddenIds.slice() : [],
    noisyIds: Array.isArray(gate.noisyIds) ? gate.noisyIds.slice() : []
  };
}

function buildCompactRuntimeSnapshot(compactRuntime) {
  if (!compactRuntime) {
    return {
      profile: "",
      signature: "",
      roleCode: "",
      agentId: "",
      tierCode: "",
      typeCodes: [],
      anchorIds: [],
      anchors: [],
      chains: [],
      totalEntries: 0,
      totalChains: 0
    };
  }
  return {
    profile: compactRuntime.profile,
    signature: compactRuntime.signature,
    roleCode: compactRuntime.roleCode,
    agentId: compactRuntime.agentId,
    tierCode: compactRuntime.tierCode,
    typeCodes: Array.isArray(compactRuntime.typeCodes) ? compactRuntime.typeCodes.slice() : [],
    anchorIds: Array.isArray(compactRuntime.anchorIds) ? compactRuntime.anchorIds.slice() : [],
    anchors: Array.isArray(compactRuntime.anchors) ? compactRuntime.anchors.map((row) => ({ ...row })) : [],
    chains: Array.isArray(compactRuntime.chains) ? compactRuntime.chains.map((row) => ({ ...row })) : [],
    totalEntries: Number(compactRuntime.totalEntries || 0),
    totalChains: Number(compactRuntime.totalChains || 0)
  };
}

function buildIntegralPayload(input = {}) {
  const {
    briefingIxEntries = [],
    ixReduction = {},
    ixBriefing = {},
    compactRuntime = null,
    rulePacks = [],
    rulePointers = null,
    patternPacks = [],
    patternDigest = null,
    patternPointers = null,
    planPacks = [],
    planPointers = null,
    mistakePacks = [],
    mistakePointers = null,
    skillPacks = [],
    toolPacks = [],
    rulePackGate = null,
    patternPackGate = null,
    planPackGate = null,
    skillPackGate = null,
    mistakePackGate = null,
    toolPackGate = null,
    config = {}
  } = input;

  return {
    ixEntries: (Array.isArray(briefingIxEntries) ? briefingIxEntries : []).map((entry) => ({
      id: entry.id || entry.lx || entry.ix,
      ix: entry.ix,
      lx: entry.lx || entry.id || entry.ix,
      type: entry.type,
      title: entry.title,
      snippet: entry.snippet || undefined
    })),
    ixReduction: {
      totalCandidates: Number(ixReduction.totalCandidates || 0),
      visibleCount: Number(ixReduction.visibleCount || 0),
      hiddenIds: Array.isArray(ixReduction.hiddenIds) ? ixReduction.hiddenIds.slice() : [],
      preservedIds: Array.isArray(ixReduction.preservedIds) ? ixReduction.preservedIds.slice() : [],
      perTypeCounts: ixReduction.perTypeCounts || {}
    },
    ixBriefing: {
      compactPreferred: Boolean(ixBriefing.compactPreferred),
      widened: Boolean(ixBriefing.widened),
      reason: ixBriefing.reason || "",
      visibleCount: Number(ixBriefing.visibleCount || 0),
      reducedVisibleCount: Number(ixBriefing.reducedVisibleCount || 0),
      deferredIds: Array.isArray(ixBriefing.deferredIds) ? ixBriefing.deferredIds.slice() : [],
      compactAnchorIds: Array.isArray(ixBriefing.compactAnchorIds) ? ixBriefing.compactAnchorIds.slice() : []
    },
    compactRuntime: buildCompactRuntimeSnapshot(compactRuntime),
    rulePacks: mapPackRows(rulePacks),
    rulePointers: buildPointerSnapshot(rulePointers, "totalRules"),
    patternPacks: mapPackRows(patternPacks),
    patternDigest: buildPatternDigestSnapshot(patternDigest),
    patternPointers: buildPointerSnapshot(patternPointers, "totalPatterns"),
    planPacks: mapPackRows(planPacks),
    planPointers: buildPointerSnapshot(planPointers, "totalPlans"),
    mistakePacks: mapPackRows(mistakePacks),
    mistakePointers: buildPointerSnapshot(mistakePointers, "totalMistakes"),
    skillPacks: mapPackRows(skillPacks),
    toolPacks: mapPackRows(toolPacks),
    packGating: {
      rule: buildPackGateSnapshot(rulePackGate),
      pattern: buildPackGateSnapshot(patternPackGate),
      plan: buildPackGateSnapshot(planPackGate),
      skill: buildPackGateSnapshot(skillPackGate),
      mistake: buildPackGateSnapshot(mistakePackGate),
      tool: buildPackGateSnapshot(toolPackGate)
    },
    ixTypesLoaded: Array.isArray(config.ixTypes) ? config.ixTypes.slice() : [],
    totalEntries: Array.isArray(briefingIxEntries) ? briefingIxEntries.length : 0,
    priorityChainsLoaded: Array.isArray(config.priorityChains) ? config.priorityChains.slice() : []
  };
}

function buildActiveTaskRows(activeTasks = []) {
  return (Array.isArray(activeTasks) ? activeTasks : []).map((task) => ({
    id: task.id || task.lx || task.ix,
    ix: task.ix,
    lx: task.lx || task.id || task.ix,
    title: task.title,
    source: cleanShapeText(task.source || "index") || "index",
    status: cleanShapeText(task.status),
    assigneeId: cleanShapeText(task.assigneeId),
    owner: cleanShapeText(task.owner),
    projectScope: cleanShapeText(task.projectScope),
    leaseContext: task.leaseContext && typeof task.leaseContext === "object"
      ? {
          leaseId: cleanShapeText(task.leaseContext.leaseId),
          holderId: cleanShapeText(task.leaseContext.holderId),
          status: cleanShapeText(task.leaseContext.status),
          holderType: cleanShapeText(task.leaseContext.holderType),
          dispatchId: cleanShapeText(task.leaseContext.dispatchId),
          runId: cleanShapeText(task.leaseContext.runId),
          heartbeatAt: cleanShapeText(task.leaseContext.heartbeatAt),
          expiresAt: cleanShapeText(task.leaseContext.expiresAt)
        }
      : null
  }));
}

function buildTaskActivationSnapshot(taskActivation = {}) {
  return {
    requested: Boolean(taskActivation.requested),
    ok: Boolean(taskActivation.ok),
    action: cleanShapeText(taskActivation.action),
    reason: cleanShapeText(taskActivation.reason),
    taskId: cleanShapeText(taskActivation.taskId),
    leaseId: cleanShapeText(taskActivation.leaseId),
    status: cleanShapeText(taskActivation.status)
  };
}

function buildSpawnPacket(input = {}) {
  const {
    agentIdentity = {},
    virtualPid = "",
    normalizedRole = "",
    config = {},
    options = {},
    health = {},
    allBlockers = [],
    terminalBlockers = [],
    integral = {},
    drift = {},
    mistakes = [],
    activeTasks = [],
    taskActivation = {},
    textBriefing = ""
  } = input;

  const identityChallenge = {
    question: "WHO ARE YOU?",
    expectedAnswer: `I am ${config.label ? config.label.split(" —")[0] : normalizedRole || ""} / ${agentIdentity.agentId}, spawn-PID ${virtualPid}`,
    onFailure: "black-hole"
  };

  return {
    ok: true,
    agentId: agentIdentity.agentId,
    spawnPid: virtualPid,
    role: normalizedRole,
    responsibilityTier: agentIdentity.responsibilityTier,
    responsibilityLabel: agentIdentity.responsibilityLabel,
    lifecycle: agentIdentity.lifecycle,
    label: config.label,
    title: config.title,
    identity: config.identity,
    spawnedAt: new Date().toISOString(),
    permissions: Array.isArray(config.permissions) ? config.permissions.slice() : [],
    mission: options.mission || null,
    proportional: {
      healthStatus: health.status,
      blockers: Array.isArray(allBlockers) ? allBlockers.slice() : [],
      serviceState: health.services || {},
      terminalBlockers: Array.isArray(terminalBlockers) ? terminalBlockers.slice() : []
    },
    integral: buildIntegralPayload({ ...integral, config }),
    derivative: {
      signals: Array.isArray(drift.signals) ? drift.signals.slice() : [],
      mqttTraffic: drift.mqttTraffic,
      inboxDelta: drift.inboxDelta,
      lastUpdate: drift.lastUpdate
    },
    mistakes: (Array.isArray(mistakes) ? mistakes : []).map((mistake) => ({
      id: mistake.id || mistake.name,
      summary: String(mistake.description || mistake.summary || mistake.name || "").slice(0, 200)
    })),
    activeTasks: buildActiveTaskRows(activeTasks),
    taskActivation: buildTaskActivationSnapshot(taskActivation),
    identityHandshake: identityChallenge,
    blockerCount: Array.isArray(allBlockers) ? allBlockers.length : 0,
    signalCount: Array.isArray(drift.signals) ? drift.signals.length : 0,
    packetLines: String(textBriefing || "").split("\n").length,
    textBriefing,
    packet: textBriefing
  };
}

module.exports = {
  buildIntegralPayload,
  buildActiveTaskRows,
  buildTaskActivationSnapshot,
  buildSpawnPacket
};
