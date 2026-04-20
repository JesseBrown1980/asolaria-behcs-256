function buildPointerSection(title, pointers = {}) {
  if (!pointers || (!pointers.primaryPack && (!Array.isArray(pointers.anchorIds) || pointers.anchorIds.length === 0))) {
    return [];
  }

  const anchorIds = Array.isArray(pointers.anchorIds) ? pointers.anchorIds.filter(Boolean) : [];
  const matchingTags = Array.isArray(pointers.matchingTags) ? pointers.matchingTags.filter(Boolean) : [];
  const hiddenIds = Array.isArray(pointers.hiddenIds) ? pointers.hiddenIds.filter(Boolean) : [];
  const lines = [
    `## ${title}`,
    `- ${pointers.guidance}`
  ];
  lines.push(`- Primary pack: ${pointers.primaryPack ? `${pointers.primaryPack.title} [${pointers.primaryPack.id}] (${pointers.primaryPack.count})` : "none"}`);
  if (Array.isArray(pointers.secondaryPacks) && pointers.secondaryPacks.length > 0) {
    lines.push(`- Secondary packs: ${pointers.secondaryPacks.map((pack) => `${pack.title} [${pack.id}] (${pack.count})`).join("; ")}`);
  }
  lines.push(`- Anchor LX: ${anchorIds.join(", ") || "none"}`);
  lines.push(`- Matching tags: ${matchingTags.join(", ") || "none"}`);
  if (Number(pointers.hiddenPackCount || 0) > 0) {
    lines.push(`- Suppressed packs: ${pointers.hiddenPackCount} (${hiddenIds.join(", ")})`);
  }
  lines.push("");
  return lines;
}

function buildPackSection(title, packs = []) {
  if (!Array.isArray(packs) || packs.length === 0) {
    return [];
  }

  const lines = [`## ${title}`];
  for (const pack of packs) {
    const samples = Array.isArray(pack.sampleIds) && pack.sampleIds.length > 0
      ? `Sample: ${pack.sampleIds.join(", ")}`
      : "Sample: none";
    lines.push(`- ${pack.title} [${pack.id}] (${pack.count})`);
    lines.push(`  Tags: ${(pack.topTags || []).join(", ") || "none"}`);
    lines.push(`  ${samples}`);
  }
  lines.push("");
  return lines;
}

function buildKnowledgeBriefingSections(options = {}) {
  const {
    compactRuntime,
    ixBriefing,
    rulePointers,
    mission,
    blockers = [],
    signals = [],
    mistakePointers,
    mistakes = [],
    patternPointers,
    planPointers,
    skillPacks = [],
    toolPacks = []
  } = options;

  const lines = [];

  if (compactRuntime) {
    lines.push("## COMPACT RUNTIME");
    lines.push(`- profile=${compactRuntime.profile}; signature=${compactRuntime.signature}; roleCode=${compactRuntime.roleCode}; tierCode=${compactRuntime.tierCode}`);
    lines.push(`- typeCodes=${compactRuntime.typeCodes.join(", ") || "none"}; anchorCount=${compactRuntime.anchors.length}; chainCount=${compactRuntime.totalChains}`);
    lines.push(`- anchorRows=${compactRuntime.anchors.map((row) => `${row.code || row.id}=${row.id}[${row.typeCode}]`).join(", ") || "none"}`);
    if (compactRuntime.chains.length > 0) {
      lines.push(`- chainRows=${compactRuntime.chains.map((row) => `${row.fromCode || row.from}->${row.toCode || row.to}`).join("; ")}`);
    }
    lines.push("");
  }

  if (ixBriefing?.compactPreferred) {
    lines.push("## MARKDOWN WIDENING");
    lines.push(`- compactPreferred=yes; widened=${ixBriefing.widened ? "yes" : "no"}; reason=${ixBriefing.reason}`);
    lines.push(`- visible=${ixBriefing.visibleCount}/${ixBriefing.reducedVisibleCount}; deferred=${ixBriefing.deferredIds.length}`);
    if (ixBriefing.compactAnchorIds.length > 0) {
      lines.push(`- compactAnchors=${ixBriefing.compactAnchorIds.join(", ")}`);
    }
    if (ixBriefing.deferredIds.length > 0) {
      lines.push(`- deferredLX=${ixBriefing.deferredIds.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(...buildPointerSection("RULE POINTERS", rulePointers));

  if (mission) {
    lines.push("## MISSION");
    lines.push(String(mission).slice(0, 2000));
    lines.push("");
  }

  if (Array.isArray(blockers) && blockers.length > 0) {
    lines.push("## ACTIVE BLOCKERS");
    for (const blocker of blockers) {
      lines.push(`- ${typeof blocker === "string" ? blocker : JSON.stringify(blocker)}`);
    }
    lines.push("");
  }

  if (Array.isArray(signals) && signals.length > 0) {
    lines.push("## RECENT SIGNALS");
    for (const signal of signals) {
      if (typeof signal === "object" && signal?.source) {
        lines.push(`- [${signal.source}] ${signal.type || "signal"} (${signal.age || ""})`);
      } else {
        lines.push(`- ${typeof signal === "string" ? signal : JSON.stringify(signal)}`);
      }
    }
    lines.push("");
  }

  lines.push(...buildPointerSection("MISTAKE POINTERS", mistakePointers));

  if (Array.isArray(mistakes) && mistakes.length > 0) {
    lines.push("## MISTAKES TO AVOID");
    for (const mistake of mistakes) {
      lines.push(`- ${mistake.id || mistake.name}: ${String(mistake.description || mistake.summary || mistake.name || "").slice(0, 200)}`);
    }
    lines.push("");
  }

  lines.push(...buildPointerSection("PATTERN POINTERS", patternPointers));
  lines.push(...buildPointerSection("PLAN POINTERS", planPointers));
  lines.push(...buildPackSection("SKILL PACKS", skillPacks));
  lines.push(...buildPackSection("TOOL PACKS", toolPacks));

  return lines;
}

module.exports = {
  buildKnowledgeBriefingSections
};
