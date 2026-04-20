const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath, instanceRoot } = require("./runtimePaths");
const { inspectShannonExecution } = require("./shannonExecutionGate");
const { buildShannonPacketFromEngagement } = require("./shannonPacketBuilder");
const { getShannonExecutionApprovalLink } = require("./shannonApprovalBridge");
const { appendGraphEvent, appendActionManifest } = require("./graphRuntimeStore");

const shannonExecutionHandoffsPath = resolveDataPath("shannon-execution-handoffs.json");
const reportsRoot = path.join(instanceRoot, "reports", "security-engagements");

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(shannonExecutionHandoffsPath), { recursive: true });
  fs.mkdirSync(reportsRoot, { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function clipText(value, maxChars = 240) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function makeId(prefix = "shh") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function initialDoc() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    handoffs: []
  };
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(shannonExecutionHandoffsPath)) {
    cache = initialDoc();
    fs.writeFileSync(shannonExecutionHandoffsPath, JSON.stringify(cache, null, 2), "utf8");
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(shannonExecutionHandoffsPath, "utf8"));
  } catch {
    cache = initialDoc();
  }
  if (!Array.isArray(cache.handoffs)) cache.handoffs = [];
  return cache;
}

function writeDoc(doc) {
  ensureDir();
  doc.updatedAt = new Date().toISOString();
  fs.writeFileSync(shannonExecutionHandoffsPath, JSON.stringify(doc, null, 2), "utf8");
  cache = doc;
  return cache;
}

function normalizePacket(input = {}) {
  if (input && typeof input === "object" && input.ok === true && input.provider === "shannon") {
    return input;
  }
  return buildShannonPacketFromEngagement(input);
}

function resolvePacketAndApproval(input = {}) {
  const linked = getShannonExecutionApprovalLink(input);
  const packet = linked?.link?.packetSnapshot && linked.link.packetSnapshot.ok === true
    ? clone(linked.link.packetSnapshot)
    : normalizePacket(input);
  return {
    packet,
    linkedApproval: linked
  };
}

function buildArtifactPaths(engagementId, handoffId) {
  const safeEngagementId = clipText(engagementId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || "engagement";
  const safeHandoffId = clipText(handoffId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || "handoff";
  const root = path.join(reportsRoot, safeEngagementId);
  return {
    root,
    handoffJsonPath: path.join(root, `${safeHandoffId}.handoff.json`),
    handoffMarkdownPath: path.join(root, `${safeHandoffId}.handoff.md`)
  };
}

function buildPreparation(packet = {}, authorityMode, linkedApproval, actor) {
  return inspectShannonExecution(packet, {
    mode: "approved_run",
    authorityMode,
    executionApproved: Boolean(linkedApproval?.approvalOptions?.executionApproved),
    approvedBy: cleanText(linkedApproval?.approvalOptions?.approvedBy),
    approvalRef: cleanText(linkedApproval?.approvalOptions?.approvalRef),
    actor,
    recordManifest: false
  });
}

function buildHandoffMarkdown(handoff = {}) {
  const lines = [
    `# Shannon Execution Handoff ${handoff.handoffId || ""}`,
    "",
    `- Engagement ID: ${handoff.engagementId || ""}`,
    `- Status: ${handoff.status || ""}`,
    `- Authority Mode: ${handoff.authorityMode || ""}`,
    `- Approved By: ${handoff.approval?.approvedBy || ""}`,
    `- Approval Ref: ${handoff.approval?.approvalRef || ""}`,
    `- Created At: ${handoff.createdAt || ""}`,
    `- Seal Hash: ${handoff.sealHash || ""}`,
    "",
    "## Target",
    "",
    `- Kind: ${handoff.target?.kind || ""}`,
    `- Ref: ${handoff.target?.ref || ""}`,
    `- Label: ${handoff.target?.label || ""}`,
    "",
    "## Operator Packet",
    "",
    `- Objective: ${handoff.objective || ""}`,
    `- Expected Artifacts: ${(handoff.expectedArtifacts || []).join(", ") || "none"}`,
    `- Rule Anchors: ${(handoff.ruleAnchors || []).join(", ") || "none"}`,
    ""
  ];
  return `${lines.join("\n").trim()}\n`;
}

function persistArtifacts(handoff = {}) {
  const paths = handoff.artifacts || {};
  if (!paths.handoffJsonPath || !paths.handoffMarkdownPath) return;
  fs.mkdirSync(path.dirname(paths.handoffJsonPath), { recursive: true });
  fs.writeFileSync(paths.handoffJsonPath, JSON.stringify(handoff, null, 2), "utf8");
  fs.writeFileSync(paths.handoffMarkdownPath, buildHandoffMarkdown(handoff), "utf8");
}

function summarizeHandoff(handoff = null) {
  if (!handoff) return null;
  return {
    handoffId: cleanText(handoff.handoffId),
    engagementId: cleanText(handoff.engagementId),
    status: cleanText(handoff.status),
    authorityMode: cleanText(handoff.authorityMode),
    approvedBy: cleanText(handoff.approval?.approvedBy),
    approvalRef: cleanText(handoff.approval?.approvalRef),
    createdAt: cleanText(handoff.createdAt),
    sealHash: cleanText(handoff.sealHash),
    artifacts: clone(handoff.artifacts || {})
  };
}

function createShannonExecutionHandoff(input = {}, options = {}) {
  const authorityMode = cleanText(options.authorityMode || "operator_primary").toLowerCase() || "operator_primary";
  const actor = cleanText(options.actor || "security-handoff");
  const { packet, linkedApproval } = resolvePacketAndApproval(input);
  if (!packet || packet.ok !== true) {
    return {
      ok: false,
      error: cleanText(packet?.error || "packet_not_ready"),
      packet
    };
  }

  const preparation = buildPreparation(packet, authorityMode, linkedApproval, actor);
  if (!preparation || preparation.ok !== true || cleanText(preparation.status) !== "approved_ready") {
    return {
      ok: false,
      error: "handoff_not_ready",
      packet,
      preparation,
      approval: linkedApproval?.approval || null
    };
  }

  const packetHash = sha256(stableStringify(packet));
  const approvalRef = cleanText(preparation.approvalRef);
  const dedupeKey = sha256(`${cleanText(packet.engagementId)}|${authorityMode}|${approvalRef}|${packetHash}`);
  const doc = loadDoc();
  const existing = doc.handoffs.find((row) => cleanText(row.dedupeKey) === dedupeKey);
  if (existing) {
    return {
      ok: true,
      reused: true,
      handoff: summarizeHandoff(existing),
      preparation,
      approval: linkedApproval?.approval || null
    };
  }

  const createdAt = new Date().toISOString();
  const handoffId = makeId("shh");
  const artifacts = buildArtifactPaths(packet.engagementId, handoffId);
  const body = {
    schemaVersion: 1,
    provider: "shannon",
    kind: "execution_handoff",
    handoffId,
    engagementId: cleanText(packet.engagementId),
    taskId: cleanText(packet.taskId),
    status: "handoff_ready",
    authorityMode,
    createdAt,
    actor,
    objective: cleanText(packet.objective),
    target: clone(packet.target || {}),
    approval: {
      approvedBy: cleanText(preparation.approvedBy),
      approvalRef,
      approvalState: cleanText(preparation.approvalState)
    },
    expectedArtifacts: Array.isArray(packet.expectedArtifacts) ? packet.expectedArtifacts.slice() : [],
    ruleAnchors: Array.isArray(preparation.ruleAnchors) ? preparation.ruleAnchors.slice() : [],
    packetHash,
    dedupeKey,
    artifacts,
    preparation: {
      status: cleanText(preparation.status),
      approvalState: cleanText(preparation.approvalState),
      mode: cleanText(preparation.mode)
    },
    operatorPacket: clone(packet)
  };
  body.sealHash = sha256(stableStringify({
    schemaVersion: body.schemaVersion,
    provider: body.provider,
    kind: body.kind,
    handoffId: body.handoffId,
    engagementId: body.engagementId,
    authorityMode: body.authorityMode,
    approval: body.approval,
    packetHash: body.packetHash,
    operatorPacket: body.operatorPacket
  }));

  doc.handoffs.push(body);
  writeDoc(doc);
  persistArtifacts(body);

  appendGraphEvent({
    component: "shannon-execution-handoff",
    category: "security_handoff",
    action: "handoff_created",
    actor: {
      type: "security_lane",
      id: actor
    },
    target: {
      type: cleanText(packet.target?.kind || "handoff"),
      id: cleanText(body.handoffId),
      label: cleanText(packet.objective || packet.target?.ref),
      criticality: cleanText(packet.risk?.level || "normal")
    },
    context: {
      engagementId: body.engagementId,
      approvalRef,
      authorityMode,
      targetKind: cleanText(packet.target?.kind),
      targetRef: cleanText(packet.target?.ref)
    },
    policy: {
      approvalState: cleanText(preparation.approvalState),
      mode: cleanText(preparation.mode),
      autonomous: false,
      rollbackRequired: false
    },
    detail: {
      handoffId: body.handoffId,
      sealHash: body.sealHash
    }
  });
  appendActionManifest({
    component: "shannon-execution-handoff",
    action: "seal_shannon_execution_handoff",
    status: "handoff_ready",
    actor: {
      type: "security_lane",
      id: actor,
      label: actor
    },
    target: {
      type: cleanText(packet.target?.kind || "handoff"),
      id: cleanText(body.handoffId),
      label: cleanText(packet.objective || packet.target?.ref),
      criticality: cleanText(packet.risk?.level || "normal")
    },
    reason: "Sealed approved-ready specialist execution handoff.",
    context: {
      engagementId: body.engagementId,
      approvalRef,
      authorityMode,
      handoffId: body.handoffId
    },
    policy: {
      mode: cleanText(preparation.mode),
      approvalState: cleanText(preparation.approvalState),
      autonomous: false,
      rollbackRequired: false
    },
    evidence: {
      handoffJsonPath: artifacts.handoffJsonPath,
      handoffMarkdownPath: artifacts.handoffMarkdownPath,
      sealHash: body.sealHash,
      ruleAnchors: body.ruleAnchors
    }
  });

  return {
    ok: true,
    reused: false,
    handoff: summarizeHandoff(body),
    preparation,
    approval: linkedApproval?.approval || null
  };
}

function listShannonExecutionHandoffs(options = {}) {
  const engagementId = cleanText(options.engagementId);
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
  const doc = loadDoc();
  let rows = doc.handoffs.slice().reverse();
  if (engagementId) {
    rows = rows.filter((row) => cleanText(row.engagementId) === engagementId);
  }
  return rows.slice(0, limit).map((row) => summarizeHandoff(row));
}

function getShannonExecutionHandoff(input = {}) {
  const handoffId = typeof input === "string"
    ? cleanText(input)
    : cleanText(input.handoffId || input.id);
  const engagementId = typeof input === "string" ? "" : cleanText(input.engagementId);
  const doc = loadDoc();
  let row = null;
  if (handoffId) {
    row = doc.handoffs.find((item) => cleanText(item.handoffId) === handoffId) || null;
  } else if (engagementId) {
    row = [...doc.handoffs].reverse().find((item) => cleanText(item.engagementId) === engagementId) || null;
  }
  return row ? clone(row) : null;
}

module.exports = {
  shannonExecutionHandoffsPath,
  createShannonExecutionHandoff,
  listShannonExecutionHandoffs,
  getShannonExecutionHandoff,
  summarizeHandoff
};
