const fs = require("fs");
const path = require("path");
const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { projectRoot } = require("./runtimePaths");

const DEFAULT_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "mistake", "PACKS.md");
const DEFAULT_POINTER_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "mistake", "POINTERS.md");

const MISTAKE_PACK_DEFS = Object.freeze([
  Object.freeze({
    id: "planning-discipline",
    title: "Planning / Discipline",
    summary: "Reactive behavior, missing plans, weak PID discipline, and indexing lapses.",
    keywords: ["plan", "reactive", "spawn", "pid", "tracking", "index", "unindexed", "follow", "proactive", "discipline"],
    preferredRoles: ["helm", "watchdog", "vector"]
  }),
  Object.freeze({
    id: "network-federation",
    title: "Network / Federation",
    summary: "Ports, brokers, bridges, MQTT, firewalls, and federation routing mistakes.",
    keywords: ["port", "broker", "mqtt", "bridge", "firewall", "ip", "network", "federation", "ssh", "4798", "4799", "18883", "18886"],
    preferredRoles: ["rook", "omnispindle-bridge", "omnispindle-control", "omnispindle-scout", "falcon"]
  }),
  Object.freeze({
    id: "security-authority",
    title: "Security / Authority",
    summary: "Encryption misunderstandings, secrets, stealth, approval, and authority-boundary mistakes.",
    keywords: ["security", "encryption", "secret", "stealth", "approval", "credential", "backdoor", "tunnel", "plaintext", "authority"],
    preferredRoles: ["sentinel", "omnispindle-control", "watchdog"]
  }),
  Object.freeze({
    id: "host-portability",
    title: "Host / Portability",
    summary: "Hardcoded paths, host assumptions, interpreter drift, and local-environment portability failures.",
    keywords: ["hardcode", "path", "acer", "python", "node", "build tools", "host", "windows", "liris", "bare"],
    preferredRoles: ["forge", "rook", "falcon"]
  }),
  Object.freeze({
    id: "project-scope",
    title: "Project / Scope",
    summary: "Wrong branch, wrong repo, wrong environment, and cross-project confusion mistakes.",
    keywords: ["branch", "pnpm", "qdd", "ebacmap", "healthcare", "ez protect", "mongo", "project", "scope", "test"],
    preferredRoles: ["forge", "rook", "vector"]
  }),
  Object.freeze({
    id: "evidence-verification",
    title: "Evidence / Verification",
    summary: "Guessing, weak source checks, and transcript/doc handling mistakes.",
    keywords: ["verify", "guess", "founding", "docs", "content", "transcript", "artifact", "sensitive", "read", "evidence"],
    preferredRoles: ["vector", "watchdog", "sentinel"]
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

function buildMistakeCorpus(document) {
  return [
    document.id,
    document.title,
    document.summary,
    document.body,
    ...(Array.isArray(document.tags) ? document.tags : []),
    ...(Array.isArray(document.chain) ? document.chain : [])
  ].filter(Boolean).join("\n").toLowerCase();
}

function mistakeDocsFromPayload(options = {}) {
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
    documents: (Array.isArray(payload.documents) ? payload.documents : []).filter((document) => document.type === "mistake")
  };
}

function scorePack(doc, pack) {
  const corpus = buildMistakeCorpus(doc);
  const tags = Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  let score = 0;
  for (const keyword of pack.keywords) {
    const probe = String(keyword || "").toLowerCase();
    if (!probe) continue;
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

function assignMistakePacks(documents = []) {
  const packMap = new Map(MISTAKE_PACK_DEFS.map((pack) => [pack.id, {
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
    summary: "Mistakes that do not strongly match a narrower pack.",
    preferredRoles: [],
    keywords: [],
    count: 0,
    documents: []
  });

  for (const document of documents) {
    let bestId = "general";
    let bestScore = 0;
    for (const pack of MISTAKE_PACK_DEFS) {
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

function buildMistakePackReport(options = {}) {
  const payload = mistakeDocsFromPayload(options);
  const packs = assignMistakePacks(payload.documents);
  return {
    ok: true,
    profile: payload.profile,
    totalMistakes: payload.documents.length,
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

function getMistakePacksForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildMistakePackReport(options);
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
    totalMistakePacks: report.packCount,
    packs: selected
  };
}

function buildMistakePointersForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildMistakePackReport(options);
  const selected = Array.isArray(options.visiblePacks) && options.visiblePacks.length > 0
    ? options.visiblePacks
    : getMistakePacksForRole(role, config, {
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
  const maxAnchors = Math.max(1, Math.min(6, Number(options.maxAnchors) || 3));
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
  const matchingTags = unique(
    anchors.flatMap((anchor) => (Array.isArray(anchor.tags) ? anchor.tags : []).map((tag) => String(tag || "").toLowerCase()))
  ).slice(0, 6);
  let guidance = "Use focused mistake anchors before widening to raw mistake search.";
  if (primaryPack) {
    guidance = `Start with ${primaryPack.title} [${primaryPack.id}] and only widen if the mission forces it.`;
  }

  return {
    ok: true,
    role,
    totalMistakes: Number(report.totalMistakes || 0),
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

function buildMistakePointerReport(options = {}) {
  const report = options.report && options.report.packs ? options.report : buildMistakePackReport(options);
  const roles = options.roles && typeof options.roles === "object" ? options.roles : {};
  const pointers = Object.entries(roles)
    .map(([role, config]) => buildMistakePointersForRole(role, config, {
      report,
      limit: options.limit || 2,
      maxAnchors: options.maxAnchors || 3
    }))
    .filter((pointer) => pointer.primaryPack || pointer.anchorIds.length > 0);

  return {
    ok: true,
    profile: report.profile,
    totalMistakes: Number(report.totalMistakes || 0),
    packCount: Number(report.packCount || 0),
    roleCount: pointers.length,
    roles: pointers
  };
}

function renderMistakePackCatalog(report = buildMistakePackReport()) {
  const lines = [
    "# Mistake Packs",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${report.profile} | Mistakes: ${report.totalMistakes} | Packs: ${report.packCount}`,
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

function renderMistakePointerCatalog(report) {
  const pointerReport = report && Array.isArray(report.roles)
    ? report
    : buildMistakePointerReport(report || {});
  const lines = [
    "# Mistake Pointers",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${pointerReport.profile} | Mistakes: ${pointerReport.totalMistakes} | Packs: ${pointerReport.packCount} | Roles: ${pointerReport.roleCount}`,
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

function writeMistakePackCatalog(report = buildMistakePackReport(), outputPath = DEFAULT_OUTPUT_PATH) {
  const content = renderMistakePackCatalog(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  return {
    ok: true,
    outputPath,
    bytes: Buffer.byteLength(content, "utf8"),
    report
  };
}

function writeMistakePointerCatalog(report, outputPath = DEFAULT_POINTER_OUTPUT_PATH) {
  const content = renderMistakePointerCatalog(report);
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
  MISTAKE_PACK_DEFS,
  buildMistakePackReport,
  buildMistakePointerReport,
  buildMistakePointersForRole,
  getMistakePacksForRole,
  renderMistakePackCatalog,
  renderMistakePointerCatalog,
  writeMistakePackCatalog,
  writeMistakePointerCatalog
};
