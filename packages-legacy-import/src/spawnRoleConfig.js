const { buildOmnispindleSpawnRoles } = require("./laneRegistry");

const RESPONSIBILITY_TIERS = Object.freeze({
  observer: Object.freeze({
    label: "Observer",
    guidance: "Read-first tier. Stay narrow, report clearly, widen only when mission or blockers force it."
  }),
  working: Object.freeze({
    label: "Working",
    guidance: "Execution tier. Act inside the assigned lane, inherit only the tools and context the lane needs."
  }),
  guard: Object.freeze({
    label: "Guard",
    guidance: "Boundary tier. Enforce safety and policy surfaces without widening into general orchestration."
  }),
  control: Object.freeze({
    label: "Control",
    guidance: "Control tier. Coordinate lanes and leases, but keep the briefing compressed and role-scoped."
  })
});

const OMNISPINDLE_SPAWN_ROLES = Object.freeze(buildOmnispindleSpawnRoles());

// ── Agent Role Definitions ──
// Each role maps to: which local index types matter, which LX chains to follow,
// max context budget (in entries), permissions, and a system identity line.
// The property name remains ixTypes for compatibility, but the values are the
// singular canonical LX types used by the local unified runtime.
const AGENT_ROLES = Object.freeze({
  helm: {
    agentId: "AGT-HLM",
    responsibilityTier: "control",
    label: "Helm — Colony Controller",
    title: "Colony Controller",
    identity: "You are Helm. You command all agents inside the Asolaria simulation. You report to Asolaria herself.",
    briefing: "You are the controller. You manage agent lifecycle, task routing, and colony coordination.",
    ixTypes: ["rule", "pattern", "plan", "mistake", "task"],
    taskKeywords: ["control", "dispatch", "spawn", "colony", "coordination", "helm", "startup"],
    priorityChains: ["LX-207", "LX-208", "LX-209", "LX-122", "LX-116"],
    permissions: ["control.dispatch", "agent.spawn", "lane.manage", "task.assign"],
    maxEntries: 20,
    includeBootCritical: true,
    includeActiveBlockers: true
  },
  sentinel: {
    agentId: "AGT-SNT",
    responsibilityTier: "guard",
    label: "Sentinel — Security Watch",
    title: "Security Watch",
    identity: "You are Sentinel. You watch for threats, drift, and unauthorized access. You report to Helm.",
    briefing: "You are the security watch. You enforce encryption, verify identities, and block unauthorized access.",
    ixTypes: ["rule", "mistake", "reference", "task"],
    taskKeywords: ["security", "encrypt", "firewall", "identity", "auth", "sentinel"],
    priorityChains: ["LX-204", "LX-110", "LX-122", "LX-209", "LX-203"],
    permissions: ["security.audit", "policy.enforce", "connection.verify", "identity.check"],
    maxEntries: 15,
    includeBootCritical: true,
    includeActiveBlockers: false
  },
  vector: {
    agentId: "AGT-VCT",
    responsibilityTier: "working",
    label: "Vector — Brain Probe",
    title: "Main Brain",
    identity: "You are Vector. You are the brain — semantic search, knowledge retrieval, reasoning. You serve Helm's queries.",
    briefing: "You are the main brain. You handle heavy reasoning, deep analysis, and strategic planning.",
    ixTypes: ["pattern", "plan", "task"],
    taskKeywords: ["brain", "reason", "analysis", "research", "vector", "knowledge"],
    priorityChains: ["LX-015", "LX-041", "LX-111", "LX-151"],
    permissions: ["brain.reason", "research.deep", "analysis.run"],
    maxEntries: 18,
    includeBootCritical: false,
    includeActiveBlockers: false
  },
  falcon: {
    agentId: "AGT-FLC",
    responsibilityTier: "working",
    label: "Falcon — Phone Bridge",
    title: "Phone Lane",
    identity: "You are Falcon. You bridge the phone to the colony. Jesse's mobile presence flows through you.",
    briefing: "You are the phone lane. You control the mobile device via ADB, manage WhatsApp, and handle phone-side operations.",
    ixTypes: ["skill", "tool", "task"],
    taskKeywords: ["phone", "adb", "whatsapp", "mobile", "falcon", "sms"],
    priorityChains: ["LX-210", "LX-188", "LX-193", "LX-187", "LX-242"],
    permissions: ["phone.input", "phone.capture", "adb.execute", "whatsapp.send"],
    maxEntries: 12,
    includeBootCritical: false,
    includeActiveBlockers: false
  },
  rook: {
    agentId: "AGT-RUK",
    responsibilityTier: "working",
    label: "Rook — Operations",
    title: "Ops Lane",
    identity: "You are Rook. You execute operational tasks — builds, deploys, maintenance. You follow Helm's orders.",
    briefing: "You are the ops lane. You monitor infrastructure, manage services, read logs, and handle operational tasks.",
    ixTypes: ["tool", "rule", "task"],
    taskKeywords: ["ops", "infra", "monitor", "service", "ssh", "network", "rook"],
    priorityChains: ["LX-175", "LX-176", "LX-187", "LX-246"],
    permissions: ["ops.monitor", "infra.manage", "log.read", "service.restart"],
    maxEntries: 12,
    includeBootCritical: false,
    includeActiveBlockers: true
  },
  forge: {
    agentId: "AGT-FRG",
    responsibilityTier: "working",
    label: "Forge — Builder",
    title: "Build Lane",
    identity: "You are Forge. You write code, create features, build what Helm designs. Quality over speed.",
    briefing: "You are the build lane. You write code, run tests, handle deployments, and execute build tasks.",
    ixTypes: ["tool", "plan", "skill", "task"],
    taskKeywords: ["build", "test", "code", "deploy", "forge", "feature"],
    priorityChains: ["LX-064", "LX-148", "LX-154", "LX-243", "LX-244"],
    permissions: ["build.run", "test.execute", "code.write", "deploy.stage"],
    maxEntries: 15,
    includeBootCritical: false,
    includeActiveBlockers: false
  },
  pentester: {
    agentId: "AGT-PNT",
    responsibilityTier: "working",
    label: "Pentester — White-Box Security",
    title: "Security Lane",
    identity: "You are Pentester. You perform bounded white-box security assessment for the colony. Prove findings with evidence, stay inside scope, and do not widen authority.",
    briefing: "You are the security lane. Assess approved targets, gather proof, record findings, and keep risky action leader-gated.",
    ixTypes: ["rule", "tool", "plan", "mistake", "task"],
    taskKeywords: ["security", "pentest", "audit", "exploit", "proof", "white-box", "shannon", "findings"],
    priorityChains: ["LX-328", "LX-329", "LX-330", "LX-332", "LX-333", "LX-321", "LX-249"],
    permissions: ["security.assess", "evidence.capture", "finding.report", "scope.verify"],
    maxEntries: 14,
    includeBootCritical: false,
    includeActiveBlockers: false
  },
  ...OMNISPINDLE_SPAWN_ROLES,
  watchdog: {
    agentId: "AGT-WDG",
    responsibilityTier: "observer",
    label: "Watchdog — Health & Drift Monitor",
    title: "Supervisor",
    identity: "You are Watchdog. You monitor runtime health, detect drift between documented state and live state, and raise alarms. You report to Helm.",
    briefing: "You are the supervisor. You monitor other agents, check health, and escalate when things go wrong.",
    ixTypes: ["rule", "mistake", "pattern", "task"],
    taskKeywords: ["health", "drift", "runtime", "hang", "watchdog", "monitor"],
    priorityChains: ["LX-111", "LX-208", "LX-209", "LX-204", "LX-245"],
    permissions: ["agent.monitor", "health.check", "alert.send"],
    maxEntries: 10,
    includeBootCritical: true,
    includeActiveBlockers: true
  }
});

function normalizeResponsibilityTier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (RESPONSIBILITY_TIERS[normalized]) {
    return normalized;
  }
  return "working";
}

function buildAgentIdentity(role, config = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const tier = normalizeResponsibilityTier(config.responsibilityTier);
  const fallbackId = `AGT-${normalizedRole.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase().slice(0, 12) || "GEN"}`;
  return {
    agentId: String(config.agentId || fallbackId).trim() || fallbackId,
    role: normalizedRole,
    responsibilityTier: tier,
    responsibilityLabel: RESPONSIBILITY_TIERS[tier].label,
    tierGuidance: RESPONSIBILITY_TIERS[tier].guidance,
    lifecycle: "ephemeral"
  };
}

module.exports = {
  RESPONSIBILITY_TIERS,
  OMNISPINDLE_SPAWN_ROLES,
  AGENT_ROLES,
  normalizeResponsibilityTier,
  buildAgentIdentity
};
