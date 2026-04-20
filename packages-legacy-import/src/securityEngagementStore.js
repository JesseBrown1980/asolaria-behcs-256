const fs = require("fs");
const path = require("path");

const { resolveDataPath, instanceRoot } = require("./runtimePaths");
const { appendGraphEvent } = require("./graphRuntimeStore");
const { createTaskLedgerTask } = require("./taskLedgerStore");

const securityEngagementPath = resolveDataPath("security-engagements.json");
const reportsRoot = path.join(instanceRoot, "reports", "security-engagements");

const TARGET_KINDS = Object.freeze(["repo", "workspace", "filesystem", "service", "host", "url"]);
const AUTHORIZATION_MODES = Object.freeze(["white_box", "operator_authorized"]);
const RISK_LEVELS = Object.freeze(["low", "normal", "high", "critical"]);
const EVIDENCE_KINDS = Object.freeze(["logs", "screenshots", "artifacts", "findings", "report", "negative_evidence"]);

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(securityEngagementPath), { recursive: true });
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

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function hasField(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function makeId(prefix = "eng") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeList(input, maxItems = 20, maxChars = 240) {
  const raw = Array.isArray(input)
    ? input
    : String(input || "").split(/[\n,]/g);
  return unique(
    raw
      .map((item) => clipText(item, maxChars))
      .filter(Boolean)
      .slice(0, maxItems)
  );
}

function normalizeTarget(input = {}) {
  const rawKind = cleanText(input.kind || input.targetKind || "").toLowerCase();
  const kind = TARGET_KINDS.includes(rawKind) ? rawKind : "";
  return {
    kind,
    ref: clipText(input.ref || input.targetRef || input.path || input.url || input.host, 480),
    label: clipText(input.label || input.name || "", 160)
  };
}

function normalizeScope(input = {}) {
  return {
    summary: clipText(input.summary || input.scope || input.description, 800),
    allowedPaths: normalizeList(input.allowedPaths, 40, 320),
    allowedHosts: normalizeList(input.allowedHosts, 20, 200),
    allowedActions: normalizeList(input.allowedActions, 20, 120).map((value) => value.toLowerCase()),
    deniedActions: normalizeList(input.deniedActions || input.blockedActions, 20, 120).map((value) => value.toLowerCase())
  };
}

function normalizeAuthorization(input = {}) {
  const rawMode = cleanText(input.mode || input.authorizationMode || "").toLowerCase();
  const mode = AUTHORIZATION_MODES.includes(rawMode) ? rawMode : "";
  const leaderApproved = Boolean(input.leaderApproved || input.riskyActionApproved || input.explicitRiskApproval);
  return {
    mode,
    approvedBy: clipText(input.approvedBy || input.operator || input.authorizedBy, 120),
    approvalRef: clipText(input.approvalRef || input.ticket || input.writtenApprovalRef, 200),
    approvedAt: toIsoDate(input.approvedAt, leaderApproved ? new Date().toISOString() : ""),
    leaderApproved
  };
}

function normalizeRisk(input = {}, authorization = {}) {
  const rawLevel = cleanText(input.level || input.riskLevel || "").toLowerCase();
  const level = RISK_LEVELS.includes(rawLevel) ? rawLevel : "normal";
  const riskyActionsRequested = Boolean(
    input.riskyActionsRequested
      || input.activeExploitation
      || input.destructiveProbe
      || input.requiresRiskyAction
  );
  return {
    level,
    riskyActionsRequested,
    leaderApprovalRequired: riskyActionsRequested,
    escalationAllowed: Boolean(authorization.leaderApproved)
  };
}

function buildArtifactPaths(engagementId) {
  const safeId = clipText(engagementId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || makeId("eng");
  const root = path.join(reportsRoot, safeId);
  return {
    root,
    contractJsonPath: path.join(root, "contract.json"),
    contractMarkdownPath: path.join(root, "contract.md"),
    findingsJsonPath: path.join(root, "findings.json"),
    findingsMarkdownPath: path.join(root, "findings.md"),
    evidenceBundlePath: path.join(root, "evidence"),
    negativeEvidencePath: path.join(root, "negative-evidence.json")
  };
}

function normalizeEvidence(input = {}, engagementId) {
  const artifactPaths = buildArtifactPaths(engagementId);
  const requiredKinds = normalizeList(input.requiredKinds || input.evidenceKinds || EVIDENCE_KINDS, 12, 64)
    .map((value) => value.toLowerCase())
    .filter((value) => EVIDENCE_KINDS.includes(value));
  return {
    requiredKinds: requiredKinds.length ? requiredKinds : EVIDENCE_KINDS.slice(),
    preserveNegativeEvidence: input.preserveNegativeEvidence !== false,
    contractJsonPath: artifactPaths.contractJsonPath,
    contractMarkdownPath: artifactPaths.contractMarkdownPath,
    findingsJsonPath: artifactPaths.findingsJsonPath,
    findingsMarkdownPath: artifactPaths.findingsMarkdownPath,
    evidenceBundlePath: artifactPaths.evidenceBundlePath,
    negativeEvidencePath: artifactPaths.negativeEvidencePath
  };
}

function evaluateGate(engagement = {}) {
  const missing = [];
  const blocked = [];
  const target = engagement.target || {};
  const scope = engagement.scope || {};
  const authorization = engagement.authorization || {};
  const risk = engagement.risk || {};

  if (!target.kind) missing.push("target.kind");
  if (!target.ref) missing.push("target.ref");
  if (!scope.summary && (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length < 1) && (!Array.isArray(scope.allowedHosts) || scope.allowedHosts.length < 1)) {
    missing.push("scope");
  }
  if (!authorization.mode) {
    missing.push("authorization.mode");
  }
  if (authorization.mode === "white_box" && ["service", "host", "url"].includes(target.kind)) {
    blocked.push("network_or_service_targets_require_operator_authorized_mode");
  }
  if (risk.riskyActionsRequested && !authorization.leaderApproved) {
    blocked.push("risky_actions_require_leader_approval");
  }
  return {
    ok: missing.length < 1 && blocked.length < 1,
    status: missing.length < 1 && blocked.length < 1 ? "ready" : "blocked",
    missing,
    blocked,
    riskLevel: clipText(risk.level || "normal", 24)
  };
}

function createInitialDoc() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    engagements: [],
    events: []
  };
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(securityEngagementPath)) {
    cache = createInitialDoc();
    fs.writeFileSync(securityEngagementPath, JSON.stringify(cache, null, 2), "utf8");
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(securityEngagementPath, "utf8"));
  } catch (_) {
    cache = createInitialDoc();
  }
  if (!Array.isArray(cache.engagements)) cache.engagements = [];
  if (!Array.isArray(cache.events)) cache.events = [];
  return cache;
}

function writeDoc(doc) {
  ensureDir();
  doc.updatedAt = new Date().toISOString();
  const tempPath = `${securityEngagementPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tempPath, securityEngagementPath);
  cache = doc;
  return cache;
}

function buildMarkdownContract(engagement = {}) {
  const lines = [
    `# ${engagement.title || "Security Engagement"}`,
    "",
    `- Engagement ID: ${engagement.id || ""}`,
    `- Lane: ${engagement.laneId || ""}`,
    `- Role: ${engagement.roleId || ""}`,
    `- Status: ${engagement.gate?.status || ""}`,
    `- Created At: ${engagement.createdAt || ""}`,
    `- Target: ${engagement.target?.kind || ""} :: ${engagement.target?.ref || ""}`,
    `- Authorization: ${engagement.authorization?.mode || ""}`,
    `- Risk: ${engagement.risk?.level || ""}`,
    ""
  ];
  if (engagement.scope?.summary) {
    lines.push("## Scope");
    lines.push("");
    lines.push(engagement.scope.summary);
    lines.push("");
  }
  if (Array.isArray(engagement.scope?.allowedPaths) && engagement.scope.allowedPaths.length) {
    lines.push("## Allowed Paths");
    lines.push("");
    for (const item of engagement.scope.allowedPaths) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  if (Array.isArray(engagement.scope?.allowedHosts) && engagement.scope.allowedHosts.length) {
    lines.push("## Allowed Hosts");
    lines.push("");
    for (const item of engagement.scope.allowedHosts) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push("## Gates");
  lines.push("");
  lines.push(`- OK: ${Boolean(engagement.gate?.ok)}`);
  lines.push(`- Missing: ${(engagement.gate?.missing || []).join(", ") || "none"}`);
  lines.push(`- Blocked: ${(engagement.gate?.blocked || []).join(", ") || "none"}`);
  lines.push("");
  lines.push("## Output Contract");
  lines.push("");
  lines.push(`- Findings JSON: ${engagement.evidence?.findingsJsonPath || ""}`);
  lines.push(`- Findings Markdown: ${engagement.evidence?.findingsMarkdownPath || ""}`);
  lines.push(`- Evidence Bundle: ${engagement.evidence?.evidenceBundlePath || ""}`);
  lines.push(`- Negative Evidence: ${engagement.evidence?.negativeEvidencePath || ""}`);
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

function persistContractArtifacts(engagement = {}) {
  const paths = engagement.evidence || {};
  if (!paths.contractJsonPath || !paths.contractMarkdownPath) {
    return;
  }
  fs.mkdirSync(path.dirname(paths.contractJsonPath), { recursive: true });
  fs.mkdirSync(paths.evidenceBundlePath, { recursive: true });
  fs.writeFileSync(paths.contractJsonPath, JSON.stringify(engagement, null, 2), "utf8");
  fs.writeFileSync(paths.contractMarkdownPath, buildMarkdownContract(engagement), "utf8");
}

function buildEngagement(input = {}) {
  const nowIso = new Date().toISOString();
  const id = makeId("eng");
  const target = normalizeTarget(input.target || input);
  const scope = normalizeScope(input.scope || input);
  const authorization = normalizeAuthorization(input.authorization || input);
  const risk = normalizeRisk(input.risk || input, authorization);
  const evidence = normalizeEvidence(input.evidence || input, id);
  const title = clipText(input.title || input.objective || input.name || `Security engagement for ${target.ref || target.kind || "target"}`, 220);
  const engagement = {
    id,
    title,
    laneId: "sec-pentest",
    roleId: "pentester",
    target,
    scope,
    authorization,
    risk,
    evidence,
    taskId: "",
    createdAt: nowIso,
    updatedAt: nowIso
  };
  engagement.gate = evaluateGate(engagement);
  return engagement;
}

function createSecurityEngagement(input = {}) {
  const doc = loadDoc();
  const engagement = buildEngagement(input);
  let task = null;

  if (input.createTask) {
    task = createTaskLedgerTask({
      title: engagement.title,
      description: `Security engagement ${engagement.id}: ${engagement.scope.summary || engagement.target.ref || engagement.target.kind}.`,
      status: engagement.gate.ok ? "ready" : "blocked",
      priority: engagement.risk.level === "critical" ? "critical" : engagement.risk.level === "high" ? "high" : "normal",
      projectScope: "asolaria",
      assigneeId: "pentester",
      actor: cleanText(input.actor || "security-engagement-store"),
      source: "security-engagement-store",
      originKind: "security_engagement",
      originId: engagement.id,
      tags: ["security", "pentest", "engagement", ...(engagement.gate.ok ? ["ready"] : ["blocked"])]
    }).task;
    engagement.taskId = task.id;
  }

  const event = {
    id: makeId("evg"),
    engagementId: engagement.id,
    type: "security_engagement_created",
    at: new Date().toISOString(),
    actor: cleanText(input.actor || "security-engagement-store").slice(0, 120) || "security-engagement-store",
    note: `Created security engagement "${engagement.title}".`
  };

  doc.engagements.push(engagement);
  doc.events.push(event);
  writeDoc(doc);
  persistContractArtifacts(engagement);
  appendGraphEvent({
    component: "security-engagements",
    category: "security_engagement",
    action: "engagement_created",
    actor: {
      type: "task_actor",
      id: event.actor
    },
    target: {
      type: "security_engagement",
      id: engagement.id,
      label: engagement.title,
      criticality: engagement.risk.level
    },
    context: {
      laneId: engagement.laneId,
      roleId: engagement.roleId,
      targetKind: engagement.target.kind,
      authorizationMode: engagement.authorization.mode,
      status: engagement.gate.status
    },
    policy: {
      approvalState: engagement.authorization.mode || "",
      rollbackRequired: false,
      autonomous: false
    },
    detail: {
      missing: engagement.gate.missing,
      blocked: engagement.gate.blocked,
      taskId: engagement.taskId
    }
  });
  return {
    engagement: JSON.parse(JSON.stringify(engagement)),
    event: JSON.parse(JSON.stringify(event)),
    task: task ? JSON.parse(JSON.stringify(task)) : null
  };
}

function listSecurityEngagements(options = {}) {
  const doc = loadDoc();
  const laneId = cleanText(options.laneId);
  const status = cleanText(options.status).toLowerCase();
  return doc.engagements
    .filter((engagement) => {
      if (laneId && engagement.laneId !== laneId) return false;
      if (status && cleanText(engagement.gate?.status).toLowerCase() !== status) return false;
      return true;
    })
    .map((engagement) => JSON.parse(JSON.stringify(engagement)));
}

function getSecurityEngagement(engagementId) {
  const id = cleanText(engagementId);
  if (!id) return null;
  const doc = loadDoc();
  const row = doc.engagements.find((engagement) => engagement.id === id);
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

module.exports = {
  securityEngagementPath,
  TARGET_KINDS,
  AUTHORIZATION_MODES,
  RISK_LEVELS,
  EVIDENCE_KINDS,
  buildEngagement,
  evaluateGate,
  createSecurityEngagement,
  listSecurityEngagements,
  getSecurityEngagement
};
