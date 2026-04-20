const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath, instanceRoot } = require("./runtimePaths");
const {
  getShannonExecutionHandoff
} = require("./shannonExecutionHandoffStore");
const { appendGraphEvent, appendActionManifest } = require("./graphRuntimeStore");

const shannonWorkerStagePath = resolveDataPath("shannon-worker-stage.json");
const reportsRoot = path.join(instanceRoot, "reports", "security-engagements");

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(shannonWorkerStagePath), { recursive: true });
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

function makeId(prefix = "swp") {
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
    packets: []
  };
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(shannonWorkerStagePath)) {
    cache = initialDoc();
    fs.writeFileSync(shannonWorkerStagePath, JSON.stringify(cache, null, 2), "utf8");
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(shannonWorkerStagePath, "utf8"));
  } catch {
    cache = initialDoc();
  }
  if (!Array.isArray(cache.packets)) cache.packets = [];
  return cache;
}

function writeDoc(doc) {
  ensureDir();
  doc.updatedAt = new Date().toISOString();
  fs.writeFileSync(shannonWorkerStagePath, JSON.stringify(doc, null, 2), "utf8");
  cache = doc;
  return cache;
}

function buildArtifactPaths(engagementId, packetId) {
  const safeEngagementId = clipText(engagementId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || "engagement";
  const safePacketId = clipText(packetId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || "worker";
  const root = path.join(reportsRoot, safeEngagementId);
  return {
    root,
    packetJsonPath: path.join(root, `${safePacketId}.worker.json`),
    packetMarkdownPath: path.join(root, `${safePacketId}.worker.md`)
  };
}

function buildWorkerMarkdown(packet = {}) {
  const lines = [
    `# Shannon Worker Packet ${packet.packetId || ""}`,
    "",
    `- Engagement ID: ${packet.engagementId || ""}`,
    `- Handoff ID: ${packet.handoffId || ""}`,
    `- Status: ${packet.status || ""}`,
    `- Worker Surface: ${packet.workerSurface || ""}`,
    `- Created At: ${packet.createdAt || ""}`,
    `- Seal Hash: ${packet.sealHash || ""}`,
    `- Handoff Seal Hash: ${packet.handoffSealHash || ""}`,
    "",
    "## Target",
    "",
    `- Kind: ${packet.target?.kind || ""}`,
    `- Ref: ${packet.target?.ref || ""}`,
    "",
    "## Objective",
    "",
    packet.objective || "",
    "",
    "## Expected Artifacts",
    "",
    ...((packet.expectedArtifacts || []).map((item) => `- ${item}`)),
    ""
  ];
  return `${lines.join("\n").trim()}\n`;
}

function persistArtifacts(packet = {}) {
  const paths = packet.artifacts || {};
  if (!paths.packetJsonPath || !paths.packetMarkdownPath) return;
  fs.mkdirSync(path.dirname(paths.packetJsonPath), { recursive: true });
  fs.writeFileSync(paths.packetJsonPath, JSON.stringify(packet, null, 2), "utf8");
  fs.writeFileSync(paths.packetMarkdownPath, buildWorkerMarkdown(packet), "utf8");
}

function summarizeWorkerPacket(packet = null) {
  if (!packet) return null;
  return {
    packetId: cleanText(packet.packetId),
    engagementId: cleanText(packet.engagementId),
    handoffId: cleanText(packet.handoffId),
    status: cleanText(packet.status),
    workerSurface: cleanText(packet.workerSurface),
    createdAt: cleanText(packet.createdAt),
    sealHash: cleanText(packet.sealHash),
    handoffSealHash: cleanText(packet.handoffSealHash),
    artifacts: clone(packet.artifacts || {})
  };
}

function stageShannonWorkerPacket(input = {}, options = {}) {
  const actor = cleanText(options.actor || "security-worker-stage");
  const workerSurface = cleanText(options.workerSurface || "shannon_worker").toLowerCase() || "shannon_worker";
  const handoff = getShannonExecutionHandoff(input);
  if (!handoff) {
    return {
      ok: false,
      error: "handoff_not_found"
    };
  }
  if (cleanText(handoff.status) !== "handoff_ready") {
    return {
      ok: false,
      error: "handoff_not_ready",
      handoff: summarizeWorkerPacket(handoff)
    };
  }

  const stageKey = sha256(`${cleanText(handoff.handoffId)}|${workerSurface}|${cleanText(handoff.sealHash)}`);
  const doc = loadDoc();
  const existing = doc.packets.find((row) => cleanText(row.stageKey) === stageKey);
  if (existing) {
    return {
      ok: true,
      reused: true,
      packet: summarizeWorkerPacket(existing)
    };
  }

  const createdAt = new Date().toISOString();
  const packetId = makeId("swp");
  const artifacts = buildArtifactPaths(handoff.engagementId, packetId);
  const body = {
    schemaVersion: 1,
    kind: "worker_stage_packet",
    provider: "shannon",
    packetId,
    handoffId: cleanText(handoff.handoffId),
    engagementId: cleanText(handoff.engagementId),
    status: "worker_stage_ready",
    workerSurface,
    createdAt,
    actor,
    objective: cleanText(handoff.objective),
    target: clone(handoff.target || {}),
    approval: clone(handoff.approval || {}),
    expectedArtifacts: Array.isArray(handoff.expectedArtifacts) ? handoff.expectedArtifacts.slice() : [],
    ruleAnchors: Array.isArray(handoff.ruleAnchors) ? handoff.ruleAnchors.slice() : [],
    handoffSealHash: cleanText(handoff.sealHash),
    stageKey,
    artifacts,
    handoffPacket: clone(handoff.operatorPacket || handoff)
  };
  body.sealHash = sha256(stableStringify({
    schemaVersion: body.schemaVersion,
    kind: body.kind,
    provider: body.provider,
    packetId: body.packetId,
    handoffId: body.handoffId,
    engagementId: body.engagementId,
    workerSurface: body.workerSurface,
    handoffSealHash: body.handoffSealHash,
    handoffPacket: body.handoffPacket
  }));

  doc.packets.push(body);
  writeDoc(doc);
  persistArtifacts(body);

  appendGraphEvent({
    component: "shannon-worker-stage",
    category: "security_worker_packet",
    action: "worker_packet_created",
    actor: {
      type: "security_lane",
      id: actor
    },
    target: {
      type: cleanText(body.target?.kind || "worker_packet"),
      id: cleanText(body.packetId),
      label: cleanText(body.objective || body.target?.ref),
      criticality: cleanText(body.approval?.approvalState || "approved")
    },
    context: {
      engagementId: body.engagementId,
      handoffId: body.handoffId,
      workerSurface,
      handoffSealHash: body.handoffSealHash
    },
    policy: {
      approvalState: cleanText(body.approval?.approvalState || "leader_approved"),
      mode: "approved_run",
      autonomous: false,
      rollbackRequired: false
    },
    detail: {
      packetId: body.packetId,
      sealHash: body.sealHash
    }
  });
  appendActionManifest({
    component: "shannon-worker-stage",
    action: "stage_shannon_worker_packet",
    status: "worker_stage_ready",
    actor: {
      type: "security_lane",
      id: actor,
      label: actor
    },
    target: {
      type: cleanText(body.target?.kind || "worker_packet"),
      id: cleanText(body.packetId),
      label: cleanText(body.objective || body.target?.ref),
      criticality: cleanText(body.approval?.approvalState || "approved")
    },
    reason: "Staged sealed Shannon worker packet from approved handoff.",
    context: {
      engagementId: body.engagementId,
      handoffId: body.handoffId,
      workerSurface,
      packetId: body.packetId
    },
    policy: {
      mode: "approved_run",
      approvalState: cleanText(body.approval?.approvalState || "leader_approved"),
      autonomous: false,
      rollbackRequired: false
    },
    evidence: {
      packetJsonPath: artifacts.packetJsonPath,
      packetMarkdownPath: artifacts.packetMarkdownPath,
      sealHash: body.sealHash,
      handoffSealHash: body.handoffSealHash
    }
  });

  return {
    ok: true,
    reused: false,
    packet: summarizeWorkerPacket(body)
  };
}

function listShannonWorkerPackets(options = {}) {
  const engagementId = cleanText(options.engagementId);
  const handoffId = cleanText(options.handoffId);
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
  const doc = loadDoc();
  let rows = doc.packets.slice().reverse();
  if (engagementId) {
    rows = rows.filter((row) => cleanText(row.engagementId) === engagementId);
  }
  if (handoffId) {
    rows = rows.filter((row) => cleanText(row.handoffId) === handoffId);
  }
  return rows.slice(0, limit).map((row) => summarizeWorkerPacket(row));
}

module.exports = {
  shannonWorkerStagePath,
  stageShannonWorkerPacket,
  listShannonWorkerPackets,
  summarizeWorkerPacket
};
