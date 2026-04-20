const fs = require("fs");
const path = require("path");
const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { projectRoot } = require("./runtimePaths");

const DEFAULT_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "tool", "PACKS.md");

const TOOL_PACK_DEFS = Object.freeze([
  Object.freeze({
    id: "runtime-services",
    title: "Runtime / Services",
    summary: "Gateway, services, broker, startup, health, and worker-runtime tools.",
    keywords: ["gateway", "service", "services", "broker", "startup", "operational", "worker", "router", "dispatch", "server", "runtime", "bootstrap"],
    preferredRoles: ["rook", "helm", "watchdog"]
  }),
  Object.freeze({
    id: "bridge-federation",
    title: "Bridge / Federation",
    summary: "Bridge, MQTT, MCP, Omnispindle, and cross-node transport/control tools.",
    keywords: ["bridge", "mqtt", "mcp", "omnispindle", "federation", "cross-machine", "relay", "4798", "4799", "18883", "control", "dispatch"],
    preferredRoles: ["omnispindle-bridge", "omnispindle-control", "falcon", "rook"]
  }),
  Object.freeze({
    id: "build-qdd",
    title: "Build / QDD",
    summary: "Build, test, runtime, QDD, recovered baselines, and developer execution tools.",
    keywords: ["build", "test", "testing", "qdd", "jest", "pnpm", "runtime", "node", "mise", "override", "baseline", "recovered", "automation"],
    preferredRoles: ["forge", "rook"]
  }),
  Object.freeze({
    id: "voice-meeting",
    title: "Voice / Meeting",
    summary: "Voice, transcription, recording, meeting intelligence, and interview copilot tools.",
    keywords: ["voice", "audio", "stt", "tts", "meeting", "interview", "transcription", "recording", "speech", "whisper", "caption", "copilot"],
    preferredRoles: ["falcon", "forge"]
  }),
  Object.freeze({
    id: "browser-surface",
    title: "Browser / Surface",
    summary: "Browser, desktop sidecar, UI, route, and operator-surface tools.",
    keywords: ["browser", "desktop", "ui", "chrome", "surface", "app", "routes", "api", "mobile", "phone", "keyboard", "mouse"],
    preferredRoles: ["falcon", "forge", "rook"]
  }),
  Object.freeze({
    id: "security-approval",
    title: "Security / Approval",
    summary: "Guardian, vault, auth, secrets, approval, and policy-protection tools.",
    keywords: ["guardian", "approval", "vault", "auth", "secret", "security", "rbac", "owner", "credential", "oauth", "policy"],
    preferredRoles: ["sentinel", "watchdog", "rook"]
  }),
  Object.freeze({
    id: "data-knowledge",
    title: "Data / Knowledge",
    summary: "Knowledge, memory, inventory, archaeology, and local data-layer tools.",
    keywords: ["knowledge", "memory", "index", "inventory", "archaeology", "history", "data", "search", "embeddings", "evidence", "corpus"],
    preferredRoles: ["vector", "forge", "watchdog"]
  }),
  Object.freeze({
    id: "foundational-brain",
    title: "Foundational / Brain",
    summary: "OpenClaw, Antigravity, Symphony, GNN, and foundational multi-agent platforms.",
    keywords: ["foundational", "antigravity", "openclaw", "symphony", "gnn", "brain-provider", "multi-agent", "elixir", "openai", "gemini", "coding-agent"],
    preferredRoles: ["forge", "vector", "helm", "omnispindle-bridge"]
  }),
  Object.freeze({
    id: "phone-device",
    title: "Phone / Device",
    summary: "Phone, ADB, mobile, and host-device control tools.",
    keywords: ["phone", "adb", "mobile", "device", "whatsapp", "desktop", "input", "sidecar", "host-scope"],
    preferredRoles: ["falcon", "rook"]
  })
]);

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildToolCorpus(document) {
  return [
    document.id,
    document.title,
    document.summary,
    document.body,
    ...(Array.isArray(document.tags) ? document.tags : []),
    ...(Array.isArray(document.chain) ? document.chain : [])
  ].filter(Boolean).join("\n").toLowerCase();
}

function toolDocsFromPayload(options = {}) {
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
    documents: (Array.isArray(payload.documents) ? payload.documents : []).filter((document) => document.type === "tool")
  };
}

function scorePack(doc, pack) {
  const corpus = buildToolCorpus(doc);
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

function assignToolPacks(documents = []) {
  const packMap = new Map(TOOL_PACK_DEFS.map((pack) => [pack.id, {
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
    summary: "Tools that did not strongly match a narrower pack.",
    preferredRoles: [],
    keywords: [],
    count: 0,
    documents: []
  });

  for (const document of documents) {
    let bestId = "general";
    let bestScore = 0;
    for (const pack of TOOL_PACK_DEFS) {
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

function buildToolPackReport(options = {}) {
  const payload = toolDocsFromPayload(options);
  const packs = assignToolPacks(payload.documents);
  return {
    ok: true,
    profile: payload.profile,
    totalTools: payload.documents.length,
    packCount: packs.length,
    packs
  };
}

function scoreRoleForPack(pack, role, config) {
  const terms = unique([
    role,
    ...(Array.isArray(config?.taskKeywords) ? config.taskKeywords : []),
    ...(Array.isArray(config?.permissions) ? config.permissions.map((permission) => String(permission || "").split(".")[0]) : [])
  ]).map((term) => String(term || "").toLowerCase());
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

function getToolPacksForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildToolPackReport(options);
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
    totalToolPacks: report.packCount,
    packs: selected
  };
}

function renderToolPackCatalog(report = buildToolPackReport()) {
  const lines = [
    "# Tool Packs",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${report.profile} | Tools: ${report.totalTools} | Packs: ${report.packCount}`,
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

function writeToolPackCatalog(report = buildToolPackReport(), outputPath = DEFAULT_OUTPUT_PATH) {
  const content = renderToolPackCatalog(report);
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
  TOOL_PACK_DEFS,
  buildToolPackReport,
  getToolPacksForRole,
  renderToolPackCatalog,
  writeToolPackCatalog
};
