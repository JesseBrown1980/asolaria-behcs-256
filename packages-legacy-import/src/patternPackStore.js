const fs = require("fs");
const path = require("path");
const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { projectRoot } = require("./runtimePaths");

const DEFAULT_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "pattern", "PACKS.md");
const DEFAULT_POINTER_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "pattern", "POINTERS.md");

const PATTERN_PACK_DEFS = Object.freeze([
  Object.freeze({
    id: "orchestration-control",
    title: "Orchestration / Control",
    summary: "Plan, PID, dispatch, identity, authority, and controller-loop patterns.",
    keywords: ["orchestrator", "helm", "dispatch", "control", "startup", "authority", "pid", "identity", "guardian", "sentinel", "workflow", "loop"],
    preferredRoles: ["helm", "watchdog", "sentinel"]
  }),
  Object.freeze({
    id: "security-guardian",
    title: "Security / Guardian",
    summary: "Encryption, vault, guardian, approval, stealth, and host-surface protection patterns.",
    keywords: ["security", "encryption", "vault", "guardian", "approval", "auth", "firewall", "ssh", "stealth", "host", "surface"],
    preferredRoles: ["sentinel", "watchdog", "omnispindle-control"]
  }),
  Object.freeze({
    id: "runtime-brain",
    title: "Runtime / Brain",
    summary: "Gateway, graph, runtime, health, brain, risk, and service-layer patterns.",
    keywords: ["gateway", "runtime", "graph", "brain", "risk", "intent", "health", "service", "server", "semantic", "control-plane", "data layer"],
    preferredRoles: ["vector", "watchdog", "forge", "helm"]
  }),
  Object.freeze({
    id: "federation-bridge",
    title: "Federation / Bridge",
    summary: "Gaia, bridge, MQTT, node-share, remote link, and colony-sync patterns.",
    keywords: ["gaia", "bridge", "mqtt", "federation", "remote", "sync", "colony", "node", "omnispindle", "4799", "8788", "18883"],
    preferredRoles: ["falcon", "omnispindle-bridge", "omnispindle-scout"]
  }),
  Object.freeze({
    id: "device-surface",
    title: "Device / Surface",
    summary: "Phone, desktop, browser, capture, UI, and operator-surface patterns.",
    keywords: ["phone", "desktop", "chrome", "capture", "ui", "voice", "whatsapp", "mobile", "screen", "adb", "karumi"],
    preferredRoles: ["falcon", "forge"]
  }),
  Object.freeze({
    id: "product-build",
    title: "Product / Build",
    summary: "Build, release, pipeline, workflow, API-hub, and productization patterns.",
    keywords: ["build", "release", "pipeline", "public", "workflow", "api", "hub", "qdd", "product", "demo", "symphony"],
    preferredRoles: ["forge", "rook"]
  }),
  Object.freeze({
    id: "history-archaeology",
    title: "History / Archaeology",
    summary: "Founding, archaeology, milestones, origin stories, and session-history patterns.",
    keywords: ["history", "archaeology", "founding", "creation", "origin", "milestone", "paper", "article", "jesse", "rayssa", "liris", "codex"],
    preferredRoles: ["vector"]
  }),
  Object.freeze({
    id: "civilization-theory",
    title: "Civilization / Theory",
    summary: "Civilization model, simulation theory, meta-tagged language, and world-level patterns.",
    keywords: ["civilization", "simulation", "meta-tagged", "theory", "world", "district", "fractal", "asi", "foundational", "permanent"],
    preferredRoles: ["vector", "watchdog"]
  })
]);

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildRoleTerms(role, config = {}) {
  return unique([
    role,
    ...(Array.isArray(config?.taskKeywords) ? config.taskKeywords : []),
    ...(Array.isArray(config?.permissions)
      ? config.permissions.map((permission) => String(permission || "").split(".")[0])
      : [])
  ]).map((term) => String(term || "").toLowerCase()).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildPatternCorpus(document) {
  return [
    document.id,
    document.title,
    document.summary,
    document.body,
    ...(Array.isArray(document.tags) ? document.tags : []),
    ...(Array.isArray(document.chain) ? document.chain : [])
  ].filter(Boolean).join("\n").toLowerCase();
}

function patternDocsFromPayload(options = {}) {
  const payload = options.documents
    ? {
        documents: Array.isArray(options.documents) ? options.documents : [],
        profile: String(options.profile || "running")
      }
    : readUnifiedIndex({
        profile: options.profile || "running",
        scanMode: options.scanMode || "blink",
        autoBuild: false
      });

  return {
    profile: String(payload.profile || options.profile || "running"),
    documents: (Array.isArray(payload.documents) ? payload.documents : []).filter((document) => document.type === "pattern")
  };
}

function scorePack(doc, pack) {
  const corpus = buildPatternCorpus(doc);
  const tags = Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  let score = 0;
  for (const keyword of pack.keywords) {
    const probe = String(keyword || "").toLowerCase();
    if (!probe) {
      continue;
    }
    if (tags.includes(probe)) {
      score += 5;
    } else if (tags.some((tag) => tag.includes(probe) || probe.includes(tag))) {
      score += 3;
    }
    if (String(doc.title || "").toLowerCase().includes(probe)) {
      score += 3;
    }
    if (corpus.includes(probe)) {
      score += 1;
    }
  }
  return score;
}

function deriveTopTags(documents = [], limit = 6) {
  const counts = new Map();
  for (const document of documents) {
    for (const tag of Array.isArray(document.tags) ? document.tags : []) {
      const normalized = String(tag || "").trim().toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, Math.max(1, Math.min(12, Number(limit) || 6)))
    .map(([tag]) => tag);
}

function assignPatternPacks(documents = []) {
  const packMap = new Map(PATTERN_PACK_DEFS.map((pack) => [pack.id, {
    id: pack.id,
    title: pack.title,
    summary: pack.summary,
    preferredRoles: pack.preferredRoles.slice(),
    keywords: pack.keywords.slice(),
    count: 0,
    documents: []
  }]));
  packMap.set("general", {
    id: "general",
    title: "General / Misc",
    summary: "Patterns that did not strongly match a narrower pack.",
    preferredRoles: [],
    keywords: [],
    count: 0,
    documents: []
  });

  for (const document of documents) {
    let bestId = "general";
    let bestScore = 0;
    for (const pack of PATTERN_PACK_DEFS) {
      const score = scorePack(document, pack);
      if (score > bestScore) {
        bestScore = score;
        bestId = pack.id;
      }
    }
    const bucket = packMap.get(bestId);
    bucket.documents.push(document);
    bucket.count += 1;
  }

  return Array.from(packMap.values())
    .filter((pack) => pack.count > 0)
    .map((pack) => ({
      id: pack.id,
      title: pack.title,
      summary: pack.summary,
      preferredRoles: pack.preferredRoles.slice(),
      keywords: pack.keywords.slice(),
      count: pack.count,
      topTags: deriveTopTags(pack.documents, 6),
      sampleIds: pack.documents.slice(0, 8).map((document) => document.id),
      documents: pack.documents.slice().sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")))
    }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

function buildPatternPackReport(options = {}) {
  const payload = patternDocsFromPayload(options);
  const packs = assignPatternPacks(payload.documents);
  return {
    ok: true,
    profile: payload.profile,
    totalPatterns: payload.documents.length,
    packCount: packs.length,
    packs
  };
}

function scoreRoleForPack(pack, role, config) {
  const terms = buildRoleTerms(role, config);
  let score = 0;
  if ((pack.preferredRoles || []).includes(role)) {
    score += 20;
  }
  for (const term of terms) {
    if (!term) continue;
    if ((pack.keywords || []).includes(term)) {
      score += 6;
    }
    if ((pack.topTags || []).includes(term)) {
      score += 4;
    }
    if (String(pack.title || "").toLowerCase().includes(term)) {
      score += 2;
    }
    if (String(pack.summary || "").toLowerCase().includes(term)) {
      score += 1;
    }
  }
  return score;
}

function scoreRoleForDocument(document, role, config) {
  const terms = buildRoleTerms(role, config);
  const tags = Array.isArray(document?.tags)
    ? document.tags.map((tag) => String(tag || "").toLowerCase())
    : [];
  const title = String(document?.title || "").toLowerCase();
  const summary = String(document?.summary || "").toLowerCase();
  const body = String(document?.body || "").toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (!term) continue;
    if (tags.includes(term)) {
      score += 6;
    } else if (tags.some((tag) => tag.includes(term) || term.includes(tag))) {
      score += 4;
    }
    if (title.includes(term)) {
      score += 3;
    }
    if (summary.includes(term)) {
      score += 2;
    }
    if (body.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function getPatternPacksForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildPatternPackReport(options);
  const scored = report.packs
    .map((pack) => ({
      pack,
      score: scoreRoleForPack(pack, role, config)
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || right.pack.count - left.pack.count || left.pack.id.localeCompare(right.pack.id));

  const limit = Math.max(1, Math.min(6, Number(options.limit) || 3));
  const selected = (scored.length > 0 ? scored : report.packs.map((pack) => ({ pack, score: 0 })))
    .slice(0, limit)
    .map((row) => ({
      id: row.pack.id,
      title: row.pack.title,
      summary: row.pack.summary,
      count: row.pack.count,
      topTags: row.pack.topTags.slice(0, 6),
      sampleIds: row.pack.sampleIds.slice(0, 6),
      score: row.score
    }));

  return {
    ok: true,
    role,
    totalPatternPacks: report.packCount,
    packs: selected
  };
}

function buildPatternDigestForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildPatternPackReport(options);
  const selected = Array.isArray(options.visiblePacks) && options.visiblePacks.length > 0
    ? options.visiblePacks
    : getPatternPacksForRole(role, config, {
        limit: options.limit || 2,
        report
      }).packs;
  const focusPacks = selected.map((pack) => ({
    id: String(pack.id || "").trim(),
    title: String(pack.title || "").trim(),
    count: Number(pack.count || 0),
    topTags: Array.isArray(pack.topTags) ? pack.topTags.slice(0, 6) : [],
    sampleIds: Array.isArray(pack.sampleIds) ? pack.sampleIds.slice(0, 6) : []
  })).filter((pack) => pack.id);
  const selectedIds = new Set(focusPacks.map((pack) => pack.id));
  const hiddenIds = unique(
    Array.isArray(options.hiddenIds) && options.hiddenIds.length > 0
      ? options.hiddenIds
      : report.packs.map((pack) => pack.id).filter((id) => !selectedIds.has(id))
  );
  const noisyIds = unique(Array.isArray(options.noisyIds) ? options.noisyIds : []);
  const focusTags = unique(focusPacks.flatMap((pack) => pack.topTags)).slice(0, 6);
  const sampleIds = unique(focusPacks.flatMap((pack) => pack.sampleIds)).slice(0, 6);
  const focusTitles = focusPacks.map((pack) => pack.title);

  let summary = "No focused pattern packs selected.";
  if (focusTitles.length === 1) {
    summary = `Focus on ${focusTitles[0]}.`;
  } else if (focusTitles.length > 1) {
    summary = `Focus on ${focusTitles.slice(0, -1).join(", ")} and ${focusTitles[focusTitles.length - 1]}.`;
  }
  if (hiddenIds.length > 0) {
    summary += ` ${hiddenIds.length} packs suppressed unless mission context needs them.`;
  }

  return {
    ok: true,
    role,
    totalPatterns: Number(report.totalPatterns || 0),
    totalPacks: Number(report.packCount || 0),
    visiblePackCount: focusPacks.length,
    hiddenPackCount: hiddenIds.length,
    focusPacks,
    focusPackIds: focusPacks.map((pack) => pack.id),
    focusTags,
    sampleIds,
    hiddenIds,
    noisyIds,
    summary
  };
}

function buildPatternPointersForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildPatternPackReport(options);
  const selected = Array.isArray(options.visiblePacks) && options.visiblePacks.length > 0
    ? options.visiblePacks
    : getPatternPacksForRole(role, config, {
        limit: options.limit || 2,
        report
      }).packs;
  const packMap = new Map(report.packs.map((pack) => [pack.id, pack]));
  const focusPacks = selected
    .map((pack) => packMap.get(String(pack?.id || "").trim()) || pack)
    .filter((pack) => pack && pack.id);
  const primaryPack = focusPacks[0]
    ? {
        id: String(focusPacks[0].id || "").trim(),
        title: String(focusPacks[0].title || "").trim(),
        count: Number(focusPacks[0].count || 0)
      }
    : null;
  const secondaryPacks = focusPacks.slice(1).map((pack) => ({
    id: String(pack.id || "").trim(),
    title: String(pack.title || "").trim(),
    count: Number(pack.count || 0)
  }));
  const maxAnchors = Math.max(1, Math.min(6, Number(options.maxAnchors) || 4));
  const perPackAnchorLimit = Math.max(1, Math.min(3, Number(options.perPackAnchorLimit) || 2));
  const anchorRows = [];

  for (const pack of focusPacks) {
    const documents = Array.isArray(pack.documents) ? pack.documents : [];
    const scored = documents
      .map((document) => ({
        document,
        score: scoreRoleForDocument(document, role, config)
      }))
      .sort((left, right) =>
        right.score - left.score
        || String(left.document?.id || "").localeCompare(String(right.document?.id || ""))
      )
      .slice(0, perPackAnchorLimit);

    for (const row of scored) {
      anchorRows.push({
        id: String(row.document?.id || "").trim(),
        title: String(row.document?.title || "").trim(),
        packId: String(pack.id || "").trim(),
        packTitle: String(pack.title || "").trim(),
        score: Number(row.score || 0),
        tags: Array.isArray(row.document?.tags) ? row.document.tags.slice(0, 6) : []
      });
    }
  }

  const seenAnchors = new Set();
  const anchors = anchorRows.filter((row) => {
    if (!row.id || seenAnchors.has(row.id)) {
      return false;
    }
    seenAnchors.add(row.id);
    return true;
  }).slice(0, maxAnchors);

  const focusPackIds = new Set(focusPacks.map((pack) => pack.id));
  const hiddenIds = unique(
    Array.isArray(options.hiddenIds) && options.hiddenIds.length > 0
      ? options.hiddenIds
      : report.packs.map((pack) => pack.id).filter((id) => !focusPackIds.has(id))
  );
  const matchingTags = unique(anchors.flatMap((anchor) => anchor.tags)).slice(0, 6);
  let guidance = "Use focused pattern anchors before widening to raw pattern search.";
  if (primaryPack) {
    guidance = `Start with ${primaryPack.title} [${primaryPack.id}] and only widen if the mission forces it.`;
  }

  return {
    ok: true,
    role,
    totalPatterns: Number(report.totalPatterns || 0),
    totalPacks: Number(report.packCount || 0),
    primaryPack,
    secondaryPacks,
    anchorIds: anchors.map((anchor) => anchor.id),
    anchorTitles: anchors.map((anchor) => anchor.title),
    anchors,
    matchingTags,
    hiddenPackCount: hiddenIds.length,
    hiddenIds,
    guidance
  };
}

function buildPatternPointerReport(options = {}) {
  const report = options.report && options.report.packs ? options.report : buildPatternPackReport(options);
  const roles = options.roles && typeof options.roles === "object" ? options.roles : {};
  const pointers = Object.entries(roles)
    .map(([role, config]) => buildPatternPointersForRole(role, config, {
      report,
      limit: options.limit || 2,
      maxAnchors: options.maxAnchors || 4
    }))
    .filter((pointer) => pointer.primaryPack || pointer.anchorIds.length > 0);

  return {
    ok: true,
    profile: report.profile,
    totalPatterns: Number(report.totalPatterns || 0),
    packCount: Number(report.packCount || 0),
    roleCount: pointers.length,
    roles: pointers
  };
}

function renderPatternPackCatalog(report = buildPatternPackReport()) {
  const lines = [
    "# Pattern Packs",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${report.profile} | Patterns: ${report.totalPatterns} | Packs: ${report.packCount}`,
    "",
    "## Packs",
    ""
  ];

  for (const pack of report.packs) {
    lines.push(`### ${pack.title} \`${pack.id}\``);
    lines.push(`- Count: ${pack.count}`);
    lines.push(`- Top tags: ${(pack.topTags || []).join(", ") || "none"}`);
    lines.push(`- Sample: ${(pack.sampleIds || []).join(", ") || "none"}`);
    lines.push(`- Summary: ${pack.summary}`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderPatternPointerCatalog(report) {
  const pointerReport = report && Array.isArray(report.roles)
    ? report
    : buildPatternPointerReport(report || {});
  const lines = [
    "# Pattern Pointers",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${pointerReport.profile} | Patterns: ${pointerReport.totalPatterns} | Packs: ${pointerReport.packCount} | Roles: ${pointerReport.roleCount}`,
    "",
    "## Roles",
    ""
  ];

  for (const role of pointerReport.roles) {
    lines.push(`### ${role.role}`);
    lines.push(`- Guidance: ${role.guidance}`);
    lines.push(`- Primary pack: ${role.primaryPack ? `${role.primaryPack.title} [${role.primaryPack.id}] (${role.primaryPack.count})` : "none"}`);
    if (Array.isArray(role.secondaryPacks) && role.secondaryPacks.length > 0) {
      lines.push(`- Secondary packs: ${role.secondaryPacks.map((pack) => `${pack.title} [${pack.id}] (${pack.count})`).join("; ")}`);
    }
    lines.push(`- Anchor LX: ${(role.anchorIds || []).join(", ") || "none"}`);
    lines.push(`- Matching tags: ${(role.matchingTags || []).join(", ") || "none"}`);
    lines.push(`- Suppressed packs: ${role.hiddenPackCount || 0}${role.hiddenPackCount ? ` (${(role.hiddenIds || []).join(", ")})` : ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

function writePatternPackCatalog(report = buildPatternPackReport(), outputPath = DEFAULT_OUTPUT_PATH) {
  const content = renderPatternPackCatalog(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  return {
    ok: true,
    outputPath,
    bytes: Buffer.byteLength(content, "utf8"),
    report
  };
}

function writePatternPointerCatalog(report, outputPath = DEFAULT_POINTER_OUTPUT_PATH) {
  const content = renderPatternPointerCatalog(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  return {
    ok: true,
    outputPath,
    bytes: Buffer.byteLength(content, "utf8"),
    report
  };
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  DEFAULT_POINTER_OUTPUT_PATH,
  PATTERN_PACK_DEFS,
  buildPatternPackReport,
  buildPatternDigestForRole,
  buildPatternPointerReport,
  buildPatternPointersForRole,
  getPatternPacksForRole,
  renderPatternPackCatalog,
  renderPatternPointerCatalog,
  writePatternPackCatalog,
  writePatternPointerCatalog
};
