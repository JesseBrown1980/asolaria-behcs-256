/**
 * Construction Profile Index — Asolaria Simulation Layer
 *
 * Each "construction" represents a project workstream or domain module
 * inside the civilization simulation. Constructions hold indexed profiles:
 * skills, tools, mistakes, patterns, and conversation history specific
 * to that domain. Instant agents spawned at a construction load its
 * profile to become domain experts immediately.
 *
 * Constructions are the buildings inside the city. Omnispindle spawns
 * agents at them. The GNN watchers guide which construction gets the
 * next agent. Energy transfers when agents despawn.
 */

const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const CONSTRUCTION_DATA_DIR = path.join(__dirname, "..", "data", "constructions");

const constructionEmitter = new EventEmitter();
constructionEmitter.setMaxListeners(32);

// ── Construction Registry ──

const _constructions = new Map();

/**
 * A Construction is a simulation structure that holds domain-specific
 * knowledge and can host instant agents.
 */
class Construction {
  constructor(spec = {}) {
    this.id = String(spec.id || "").trim();
    if (!this.id) throw new Error("Construction id is required");

    this.label = String(spec.label || this.id).trim();
    this.district = String(spec.district || "construction_yard").trim();
    this.projectScope = String(spec.projectScope || "").trim();
    this.description = String(spec.description || "").trim().slice(0, 400);
    this.kind = String(spec.kind || "workstream").trim(); // workstream | module | service | pipeline

    // Domain profile — indexed knowledge for instant agents
    this.profile = {
      skills: Array.isArray(spec.skills) ? spec.skills.slice(0, 50) : [],
      tools: Array.isArray(spec.tools) ? spec.tools.slice(0, 50) : [],
      mistakes: Array.isArray(spec.mistakes) ? spec.mistakes.slice(0, 100) : [],
      patterns: Array.isArray(spec.patterns) ? spec.patterns.slice(0, 100) : [],
      systemPromptSuffix: String(spec.systemPromptSuffix || "").trim().slice(0, 2000),
      contextFiles: Array.isArray(spec.contextFiles) ? spec.contextFiles.slice(0, 20) : [],
      domainModel: spec.domainModel || null
    };

    // Live state
    this.status = "idle"; // idle | active | processing | cooldown
    this.activeAgentId = null;
    this.agentSpawnCount = 0;
    this.lastAgentAt = "";
    this.lastMessageAt = "";
    this.messageCount = 0;
    this.energyLevel = 100; // 0-100, decreases as agents process, restored on transfer

    // Conversation trace — last N messages routed through this construction
    this.conversationTrace = [];
    this.maxTraceLength = 50;

    // GNN watcher hints — set by the GNN routing layer
    this.gnnHints = {
      predictedNextConstruction: null,
      routingConfidence: 0,
      lastWatcherUpdate: ""
    };

    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
  }

  /**
   * Record a message routed through this construction.
   */
  recordMessage(message) {
    const entry = {
      at: new Date().toISOString(),
      agentId: this.activeAgentId,
      text: String(message.text || "").slice(0, 500),
      direction: message.direction || "inbound", // inbound | outbound
      source: message.source || "omnispindle"
    };
    this.conversationTrace.push(entry);
    if (this.conversationTrace.length > this.maxTraceLength) {
      this.conversationTrace = this.conversationTrace.slice(-this.maxTraceLength);
    }
    this.messageCount += 1;
    this.lastMessageAt = entry.at;
    this.updatedAt = entry.at;
    constructionEmitter.emit("message", { constructionId: this.id, entry });
    return entry;
  }

  /**
   * Spawn an instant agent at this construction.
   * Returns the system prompt and profile the agent should load.
   */
  spawnAgent(agentId) {
    this.activeAgentId = agentId;
    this.agentSpawnCount += 1;
    this.lastAgentAt = new Date().toISOString();
    this.status = "active";
    this.updatedAt = this.lastAgentAt;

    constructionEmitter.emit("agent_spawned", {
      constructionId: this.id,
      agentId,
      spawnCount: this.agentSpawnCount
    });

    return {
      constructionId: this.id,
      agentId,
      profile: { ...this.profile },
      recentTrace: this.conversationTrace.slice(-10),
      gnnHints: { ...this.gnnHints }
    };
  }

  /**
   * Despawn the current agent, capturing its energy (context state)
   * for transfer to the next construction.
   */
  despawnAgent(capturedState = {}) {
    const transferPacket = {
      fromConstruction: this.id,
      fromAgent: this.activeAgentId,
      despawnedAt: new Date().toISOString(),
      energyLevel: this.energyLevel,
      capturedContext: {
        lastOutput: String(capturedState.lastOutput || "").slice(0, 1000),
        learnedPatterns: Array.isArray(capturedState.learnedPatterns) ? capturedState.learnedPatterns.slice(0, 20) : [],
        mistakesEncountered: Array.isArray(capturedState.mistakesEncountered) ? capturedState.mistakesEncountered.slice(0, 20) : [],
        completionStatus: capturedState.completionStatus || "transferred"
      },
      recentTrace: this.conversationTrace.slice(-5)
    };

    this.activeAgentId = null;
    this.status = "cooldown";
    this.energyLevel = Math.max(0, this.energyLevel - 10);
    this.updatedAt = transferPacket.despawnedAt;

    // After cooldown, return to idle
    setTimeout(() => {
      if (this.status === "cooldown") {
        this.status = "idle";
        this.energyLevel = Math.min(100, this.energyLevel + 5);
      }
    }, 3000);

    constructionEmitter.emit("agent_despawned", {
      constructionId: this.id,
      transferPacket
    });

    return transferPacket;
  }

  /**
   * Receive energy from another construction's despawned agent.
   */
  receiveEnergy(transferPacket = {}) {
    this.energyLevel = Math.min(100, this.energyLevel + (transferPacket.energyLevel || 10));
    // Absorb learned patterns into this construction's profile
    const learned = transferPacket.capturedContext?.learnedPatterns || [];
    for (const pattern of learned) {
      if (!this.profile.patterns.includes(pattern) && this.profile.patterns.length < 100) {
        this.profile.patterns.push(pattern);
      }
    }
    this.updatedAt = new Date().toISOString();

    constructionEmitter.emit("energy_received", {
      constructionId: this.id,
      fromConstruction: transferPacket.fromConstruction,
      energyLevel: this.energyLevel
    });
  }

  toJSON() {
    return {
      id: this.id,
      label: this.label,
      district: this.district,
      projectScope: this.projectScope,
      description: this.description,
      kind: this.kind,
      status: this.status,
      activeAgentId: this.activeAgentId,
      agentSpawnCount: this.agentSpawnCount,
      lastAgentAt: this.lastAgentAt,
      lastMessageAt: this.lastMessageAt,
      messageCount: this.messageCount,
      energyLevel: this.energyLevel,
      profile: {
        skills: this.profile.skills,
        tools: this.profile.tools,
        mistakeCount: this.profile.mistakes.length,
        patternCount: this.profile.patterns.length,
        contextFileCount: this.profile.contextFiles.length,
        hasDomainModel: Boolean(this.profile.domainModel),
        hasSystemPrompt: Boolean(this.profile.systemPromptSuffix)
      },
      gnnHints: this.gnnHints,
      traceLength: this.conversationTrace.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ── QDD Construction Definitions ──

const QDD_CONSTRUCTIONS = Object.freeze({
  "qdd-ez-protect": {
    id: "qdd-ez-protect",
    label: "EZ Protect Module",
    district: "construction_yard",
    projectScope: "qdd",
    kind: "module",
    description: "Charm EZ Protect device monitoring — dashboard, alerts, SFTP import, lot/roll tracking, error categorization. 89% complete (34/38 requirements).",
    skills: ["codebase-review-composite-tools-baseline", "integrations-snapshot"],
    tools: ["typescript", "jest", "next-api", "mongodb"],
    contextFiles: [
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/modules/ez-protect/domain/EzProtectEvent.ts",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/modules/ez-protect/repos/EzProtectRepo.ts",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/modules/ez-protect/use-cases/GetEzProtectDashboard/UseCase.ts",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/pages/api/ez-protect/dashboard.ts",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/pages/ez-protect/index.tsx"
    ],
    systemPromptSuffix: [
      "You are an instant agent specialized in the QDD EZ Protect module.",
      "Domain: Charm environmental monitoring devices (EzProtectEvent with 29 canonical fields).",
      "Architecture: domain → repos → use-cases → API routes → pages (clean architecture).",
      "Key states: NEGATIVE, INITIAL_POSITIVE, PRESUMPTIVE_POSITIVE, PRODUCT_POSITIVE, INVALID.",
      "Permission gate: EzProtect:view. Facility-scoped. Fixture-backed repos.",
      "Branch: feature/ez-protect-admin-monorepo. Monorepo target: D:\\projects\\QDD\\ebacmap-master.",
      "Remaining: SMS alerts (Twilio), full i18n (2 pages), LIMS integration (blocked on client API specs)."
    ].join("\n"),
    domainModel: {
      entity: "EzProtectEvent",
      fields: 29,
      resultStates: ["NEGATIVE", "INITIAL_POSITIVE", "PRESUMPTIVE_POSITIVE", "PRODUCT_POSITIVE", "INVALID", "CALIBRATION_FAIL", "PM_FAIL", "UNKNOWN"],
      transportModes: ["api", "ethernet", "wifi", "cellular", "usb", "mock"]
    },
    mistakes: [
      "wrong-repo-target: Initially targeted D:\\projects\\QDD\\ebacmap instead of ebacmap-master",
      "bridge-ack-as-evidence: Treated bridge ACKs as verification evidence",
      "unrelated-red-suites: Let unrelated queue-server failures muddy bounded defect closeout"
    ],
    patterns: [
      "permission-enforcement: All access gated by EzProtect:view, not feature flags",
      "fixture-backed-repos: No real data yet; repos return fixture summaries",
      "monorepo-jest-isolation: App-local jest configs, not shared repo-wide contract"
    ]
  },

  "qdd-queue-server": {
    id: "qdd-queue-server",
    label: "Queue Server Pipeline",
    district: "construction_yard",
    projectScope: "qdd",
    kind: "service",
    description: "Background job processing — 19 use cases including EZ Protect file processing, FTP import/export, notifications, scheduling, and SFTP troubleshooting.",
    skills: ["codebase-review-composite-tools-baseline"],
    tools: ["typescript", "jest", "express", "mongodb", "sftp"],
    contextFiles: [
      "D:/projects/QDD/ebacmap-master/apps/queue-server/src/index.ts",
      "D:/projects/QDD/ebacmap-master/apps/queue-server/src/Queue.ts"
    ],
    systemPromptSuffix: [
      "You are an instant agent specialized in the QDD Queue Server.",
      "MongoQueue polling every 5s, 19 use case types, retry with 10s delays.",
      "Key use cases: ProcessEzProtectFile, EvaluateEzProtectAlerts, SyncEzProtectToLims,",
      "ImportFtpResults, ExportToFtp, ImportTestResult, SendNotifications, CreateScheduleFromRules.",
      "SFTP troubleshooting slice: processed-file move reliability, missing-sampleDate fallback,",
      "duplicate pending-result suppression, timezone normalization. Done but uncommitted.",
      "Monorepo target: D:\\projects\\QDD\\ebacmap-master\\apps\\queue-server."
    ].join("\n"),
    domainModel: {
      useCaseCount: 19,
      concurrency: 1,
      retryDelay: 10000,
      environments: ["staging", "charm", "sgs", "gwfg", "production"]
    },
    mistakes: [
      "sftp-uncommitted: Queue server SFTP slice is done but still uncommitted on current branch"
    ],
    patterns: [
      "mongo-queue-polling: MongoQueue polls collection every 5 seconds",
      "multi-env-config: Different configs per deployment environment"
    ]
  },

  "qdd-pq-bid": {
    id: "qdd-pq-bid",
    label: "PQ Bid System",
    district: "construction_yard",
    projectScope: "qdd",
    kind: "module",
    description: "Proposal/bid system for Specialized Testing Inc — full V4 scope (520-600 hrs). Scaffolded, not yet approved. Clients, bids, projects, invoices, line items.",
    skills: [],
    tools: ["typescript", "mongodb", "next-api"],
    contextFiles: [
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/modules/pq-bid/domain/PqBid.ts",
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/modules/pq-bid/repos/PqBidRepo.ts"
    ],
    systemPromptSuffix: [
      "You are an instant agent specialized in the QDD PQ Bid System.",
      "Status: SCAFFOLDED — code exists but proposal is under client review.",
      "Domain: Clients, Bids (prospect→submitted→won→lost→in_progress→complete),",
      "Projects (converted from won bids), Invoices, LineItems.",
      "Financial model: material cost, labor hours, labor burden, gross profit with override.",
      "Full V4 scope includes templates, auto-population, forecasting, analytics, invoice UI.",
      "Client: Vince Benitez, Specialized Testing Inc."
    ].join("\n"),
    domainModel: {
      entities: ["Client", "Bid", "Project", "Invoice", "LineItem"],
      bidStates: ["prospect", "submitted", "won", "lost", "in_progress", "complete"]
    },
    mistakes: [],
    patterns: [
      "scaffold-only: No API routes yet, domain and repo only",
      "full-v4-not-mvp: Scope is 520-600hrs, not the reduced 380-420hr MVP"
    ]
  },

  "qdd-scheduler-fixes": {
    id: "qdd-scheduler-fixes",
    label: "Scheduler Bug Fixes",
    district: "construction_yard",
    projectScope: "qdd",
    kind: "workstream",
    description: "Ongoing eBacMap scheduler fixes — wizard month bug, bulk reschedule, pastdue report dates, sample scheduler visibility, CAPA PDF, limit line save issues. 35 open fix branches.",
    skills: ["codebase-review-composite-tools-baseline"],
    tools: ["typescript", "react", "next-js", "mongodb"],
    contextFiles: [
      "D:/projects/QDD/ebacmap-master/apps/web-ebacmap/src/components/SwabSchedules"
    ],
    systemPromptSuffix: [
      "You are an instant agent specialized in QDD eBacMap scheduler bug fixes.",
      "Active bugs: wizard month selection, bulk-select reschedule, pastdue report date,",
      "sample scheduler visibility toggles, CAPA PDF rendering, edit test results blank fields,",
      "limit line save issues. 35 open fix branches remaining.",
      "UI framework: React + ReactMD + Tailwind CSS. Next.js pages router.",
      "Monorepo target: D:\\projects\\QDD\\ebacmap-master\\apps\\web-ebacmap."
    ].join("\n"),
    domainModel: null,
    mistakes: [],
    patterns: [
      "high-branch-count: 35 open fix branches, each targets a specific bug",
      "client-reported: Most bugs reported by Natalie at QDD"
    ]
  }
});

// ── Registry Operations ──

function initializeConstructions() {
  for (const [id, spec] of Object.entries(QDD_CONSTRUCTIONS)) {
    if (!_constructions.has(id)) {
      _constructions.set(id, new Construction(spec));
    }
  }
}

function getConstruction(id) {
  return _constructions.get(id) || null;
}

function getAllConstructions() {
  return Array.from(_constructions.values());
}

function registerConstruction(spec = {}) {
  const construction = new Construction(spec);
  _constructions.set(construction.id, construction);
  constructionEmitter.emit("construction_registered", { constructionId: construction.id });
  return construction;
}

function removeConstruction(id) {
  const construction = _constructions.get(id);
  if (!construction) return false;
  if (construction.activeAgentId) {
    construction.despawnAgent({ completionStatus: "forced_removal" });
  }
  _constructions.delete(id);
  constructionEmitter.emit("construction_removed", { constructionId: id });
  return true;
}

/**
 * Get the best construction for a given message based on GNN hints
 * and keyword matching. Returns null if no match.
 */
function routeToConstruction(message, gnnPrediction = null) {
  const text = String(message.text || message || "").toLowerCase();

  // If GNN has a prediction with high confidence, use it
  if (gnnPrediction && gnnPrediction.constructionId && gnnPrediction.confidence > 0.7) {
    const predicted = _constructions.get(gnnPrediction.constructionId);
    if (predicted) return predicted;
  }

  // Keyword-based fallback routing
  const scores = [];
  for (const construction of _constructions.values()) {
    let score = 0;
    const keywords = [
      construction.id, construction.label, construction.projectScope,
      ...construction.profile.skills, ...construction.profile.tools,
      construction.kind
    ].map(k => String(k || "").toLowerCase()).filter(Boolean);

    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 2;
    }

    // Check domain model keywords
    if (construction.profile.domainModel) {
      const modelStr = JSON.stringify(construction.profile.domainModel).toLowerCase();
      const modelTerms = modelStr.match(/[a-z_]{4,}/g) || [];
      for (const term of modelTerms) {
        if (text.includes(term)) score += 1;
      }
    }

    if (score > 0) {
      scores.push({ construction, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.length > 0 ? scores[0].construction : null;
}

/**
 * Build civilization entities for all registered constructions.
 * Returns arrays of entities and routes to merge into the world state.
 */
function buildConstructionEntities() {
  const entities = [];
  const routes = [];
  const now = new Date().toISOString();

  for (const construction of _constructions.values()) {
    const isActive = construction.status === "active" || construction.status === "processing";
    const isOnline = construction.status !== "idle" || construction.agentSpawnCount > 0;

    entities.push({
      id: `construction:${construction.id}`,
      label: construction.label,
      kind: "construction",
      subtype: construction.kind,
      district: construction.district,
      status: construction.status,
      online: isOnline,
      hot: isActive,
      trusted: true,
      owned: true,
      icon: construction.kind === "module" ? "MD" : construction.kind === "service" ? "SV" : construction.kind === "pipeline" ? "PL" : "WS",
      summary: construction.description,
      provider: "simulation",
      sourceRef: construction.projectScope,
      motion: isActive ? "moving" : isOnline ? "awake" : "resting",
      securityState: "normal",
      risk: { score: 0, level: "low" },
      meta: {
        energyLevel: construction.energyLevel,
        agentSpawnCount: construction.agentSpawnCount,
        messageCount: construction.messageCount,
        activeAgentId: construction.activeAgentId,
        skillCount: construction.profile.skills.length,
        toolCount: construction.profile.tools.length,
        patternCount: construction.profile.patterns.length,
        mistakeCount: construction.profile.mistakes.length
      }
    });

    // Route: construction yard → this construction
    routes.push({
      source: "gate:construction-yard",
      target: `construction:${construction.id}`,
      kind: "construction_route",
      status: construction.status,
      traffic: construction.messageCount > 0 ? Math.min(5, Math.ceil(construction.messageCount / 10)) : 0,
      lastSeenAt: construction.lastMessageAt || construction.createdAt,
      notes: `Simulation route to ${construction.label}.`
    });

    // If active agent, route from construction to active lane
    if (construction.activeAgentId) {
      routes.push({
        source: `construction:${construction.id}`,
        target: `agent:${construction.activeAgentId}`,
        kind: "instant_agent_link",
        status: "active",
        traffic: 3,
        lastSeenAt: now,
        notes: `Instant agent ${construction.activeAgentId} processing at ${construction.label}.`
      });
    }
  }

  // Add the Construction Yard gate itself
  entities.push({
    id: "gate:construction-yard",
    label: "Construction Yard",
    kind: "gate",
    subtype: "simulation_gate",
    district: "construction_yard",
    status: _constructions.size > 0 ? "online" : "idle",
    online: _constructions.size > 0,
    hot: Array.from(_constructions.values()).some(c => c.status === "active"),
    trusted: true,
    owned: true,
    icon: "CY",
    summary: `Simulation construction yard — ${_constructions.size} constructions registered.`,
    provider: "simulation",
    motion: "steady",
    securityState: "normal",
    risk: { score: 0, level: "low" }
  });

  return { entities, routes };
}

/**
 * Persist construction state to disk.
 */
function saveConstructionState() {
  try {
    fs.mkdirSync(CONSTRUCTION_DATA_DIR, { recursive: true });
    const state = {};
    for (const [id, construction] of _constructions) {
      state[id] = {
        ...construction.toJSON(),
        profile: construction.profile,
        conversationTrace: construction.conversationTrace.slice(-20)
      };
    }
    fs.writeFileSync(
      path.join(CONSTRUCTION_DATA_DIR, "constructions-state.json"),
      JSON.stringify(state, null, 2),
      "utf8"
    );
    return true;
  } catch (err) {
    console.warn("[construction-index] failed to save state:", err?.message || err);
    return false;
  }
}

/**
 * Load construction state from disk.
 */
function loadConstructionState() {
  try {
    const filePath = path.join(CONSTRUCTION_DATA_DIR, "constructions-state.json");
    if (!fs.existsSync(filePath)) return false;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const [id, state] of Object.entries(raw)) {
      if (_constructions.has(id)) {
        const construction = _constructions.get(id);
        construction.messageCount = state.messageCount || 0;
        construction.agentSpawnCount = state.agentSpawnCount || 0;
        construction.energyLevel = state.energyLevel || 100;
        construction.conversationTrace = state.conversationTrace || [];
        if (state.profile?.patterns) {
          construction.profile.patterns = state.profile.patterns;
        }
        if (state.profile?.mistakes) {
          construction.profile.mistakes = state.profile.mistakes;
        }
      }
    }
    return true;
  } catch (err) {
    console.warn("[construction-index] failed to load state:", err?.message || err);
    return false;
  }
}

module.exports = {
  Construction,
  constructionEmitter,
  initializeConstructions,
  getConstruction,
  getAllConstructions,
  registerConstruction,
  removeConstruction,
  routeToConstruction,
  buildConstructionEntities,
  saveConstructionState,
  loadConstructionState,
  QDD_CONSTRUCTIONS
};
