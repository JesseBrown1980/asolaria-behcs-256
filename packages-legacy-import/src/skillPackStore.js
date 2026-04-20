const fs = require("fs");
const path = require("path");
const { readUnifiedIndex } = require("./unifiedAgentIndexStore");
const { projectRoot } = require("./runtimePaths");

const DEFAULT_OUTPUT_PATH = path.join(projectRoot, "data", "agent-index", "skill", "PACKS.md");

const SKILL_PACK_DEFS = Object.freeze([
  Object.freeze({
    id: "runtime-kernel",
    title: "Runtime / Kernel",
    summary: "Registry, runner, index-store, broker, connector, and core runtime skills.",
    keywords: ["runtime", "engine", "registry", "runner", "skills", "index", "store", "broker", "connector", "services", "remote-node", "execution", "mqtt"],
    preferredRoles: ["forge", "helm"]
  }),
  Object.freeze({
    id: "qdd-build",
    title: "QDD / Build",
    summary: "QDD, testing, workspace, Node, Mongo, and eBacMap integration skills.",
    keywords: ["qdd", "testing", "test", "jest", "workspace", "build", "pnpm", "ebacmap", "mongodb", "ez-protect", "node24", "integration"],
    preferredRoles: ["forge"]
  }),
  Object.freeze({
    id: "comms-sovereign",
    title: "Comms / Sovereign",
    summary: "MQTT, broker, sovereign-node, colony registration, and bridge transport skills.",
    keywords: ["mqtt", "broker", "brokers", "networking", "sovereign", "colony", "remote-node", "bridge", "transport", "18883", "local-api"],
    preferredRoles: ["falcon", "forge", "rook"]
  }),
  Object.freeze({
    id: "browser-helper",
    title: "Browser / Helper",
    summary: "Claude extension, browser control, cloud helper, and web-analysis skills.",
    keywords: ["claude", "extension", "browser", "cloud", "helper", "web", "analysis", "delegation", "search", "navigate", "javascript"],
    preferredRoles: ["forge", "falcon"]
  }),
  Object.freeze({
    id: "phone-device",
    title: "Phone / Device",
    summary: "Phone, mobile, ADB, WhatsApp, mirror, and desktop-surface skills.",
    keywords: ["phone", "mobile", "adb", "whatsapp", "mirror", "scrcpy", "desktop", "messaging", "falcon", "capture"],
    preferredRoles: ["falcon"]
  }),
  Object.freeze({
    id: "voice-caption",
    title: "Voice / Caption",
    summary: "Voice, transcription, audio, OCR, caption, and live meeting skills.",
    keywords: ["voice", "transcription", "audio", "whisper", "stt", "caption", "ocr", "meeting", "screen", "live", "streaming", "realtime"],
    preferredRoles: ["falcon", "forge"]
  }),
  Object.freeze({
    id: "security-cleanup",
    title: "Security / Cleanup",
    summary: "Security fixes, cleanup actions, approvals, and sealed-system recovery skills.",
    keywords: ["security", "cleanup", "approval", "token", "sealed", "fix", "bridge-sealed", "milestone"],
    preferredRoles: ["forge", "sentinel"]
  }),
  Object.freeze({
    id: "colony-audit",
    title: "Colony / Audit",
    summary: "Self-verification, health, PID, memory, and system-status audit skills.",
    keywords: ["audit", "self-verify", "health", "system-status", "colony", "pid", "memory", "foundational", "parallel", "index"],
    preferredRoles: ["helm", "watchdog", "forge"]
  })
]);

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildSkillCorpus(document) {
  return [
    document.id,
    document.title,
    document.summary,
    document.body,
    ...(Array.isArray(document.tags) ? document.tags : []),
    ...(Array.isArray(document.chain) ? document.chain : [])
  ].filter(Boolean).join("\n").toLowerCase();
}

function skillDocsFromPayload(options = {}) {
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
    documents: (Array.isArray(payload.documents) ? payload.documents : []).filter((document) => document.type === "skill")
  };
}

function scorePack(doc, pack) {
  const corpus = buildSkillCorpus(doc);
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

function assignSkillPacks(documents = []) {
  const packMap = new Map(SKILL_PACK_DEFS.map((pack) => [pack.id, {
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
    summary: "Skills that did not strongly match a narrower pack.",
    preferredRoles: [],
    keywords: [],
    count: 0,
    documents: []
  });

  for (const document of documents) {
    let bestId = "general";
    let bestScore = 0;
    for (const pack of SKILL_PACK_DEFS) {
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

function buildSkillPackReport(options = {}) {
  const payload = skillDocsFromPayload(options);
  const packs = assignSkillPacks(payload.documents);
  return {
    ok: true,
    profile: payload.profile,
    totalSkills: payload.documents.length,
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

function getSkillPacksForRole(role, config, options = {}) {
  const report = options.report && options.report.packs ? options.report : buildSkillPackReport(options);
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
    totalSkillPacks: report.packCount,
    packs: selected
  };
}

function renderSkillPackCatalog(report = buildSkillPackReport()) {
  const lines = [
    "# Skill Packs",
    "",
    "> Auto-generated. Do NOT hand-edit.",
    `> Profile: ${report.profile} | Skills: ${report.totalSkills} | Packs: ${report.packCount}`,
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

function writeSkillPackCatalog(report = buildSkillPackReport(), outputPath = DEFAULT_OUTPUT_PATH) {
  const content = renderSkillPackCatalog(report);
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
  SKILL_PACK_DEFS,
  buildSkillPackReport,
  getSkillPacksForRole,
  renderSkillPackCatalog,
  writeSkillPackCatalog
};
