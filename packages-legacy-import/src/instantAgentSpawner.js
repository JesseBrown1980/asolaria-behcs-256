/**
 * Instant Agent Spawner — Dynamic Construction-Aware Agent Pipeline
 *
 * Extends the Omnispindle concept beyond fixed lanes. Instead of 5 permanent
 * agents, this spawner creates ephemeral "instant agents" at simulation
 * constructions. Each instant agent:
 *
 * 1. Loads the construction's indexed profile (skills, tools, mistakes, patterns)
 * 2. Receives a message to process
 * 3. Sends the response back to the omnispindle in real-time
 * 4. Transfers its energy (learned state) to the next construction
 * 5. Despawns, freeing resources
 *
 * The GNN watchers guide which construction receives the next agent.
 * Internal tracer spindles record conversation flow for profile enrichment.
 */

const EventEmitter = require("events");
const { appendGraphEvent } = require("./graphRuntimeStore");

// Persistent PID registry integration (LX-249 universal auto-PID)
let _persistentPid = null;
try {
  _persistentPid = require("./spawnContextBuilder");
} catch (_) { /* spawnContextBuilder not available on this node */ }

const MAX_INSTANT_AGENTS = 8;
const AGENT_TTL_MS = 120000; // 2 minutes max per instant agent
const COOLDOWN_MS = 2000;

const spawnerEmitter = new EventEmitter();
spawnerEmitter.setMaxListeners(32);

// ── PID Registry ──
// Maps agentId → { pid, deviceBinding, lxRef, spawnedAt }
const _pidRegistry = new Map();

/**
 * Register a PID for a spawned agent.
 */
function registerPid(agentId, info = {}) {
  _pidRegistry.set(agentId, {
    pid: info.pid || process.pid,
    deviceBinding: info.deviceBinding || "rayssa-desktop",
    lxRef: info.lxRef || "—",
    spawnedAt: new Date().toISOString()
  });
  spawnerEmitter.emit("pid_registered", { agentId, ..._pidRegistry.get(agentId) });
}

/**
 * Clear a PID when agent despawns.
 */
function clearPid(agentId) {
  const entry = _pidRegistry.get(agentId);
  if (entry) {
    _pidRegistry.delete(agentId);
    spawnerEmitter.emit("pid_cleared", { agentId, ...entry });
  }
}

/**
 * Get all registered PIDs.
 */
function getPidRegistry() {
  return Object.fromEntries(_pidRegistry);
}

// ── Instant Agent ──

let _agentCounter = 0;

class InstantAgent {
  constructor(constructionId, profile, options = {}) {
    _agentCounter += 1;
    this.id = `instant-${constructionId}-${_agentCounter}`;
    this.constructionId = constructionId;
    this.status = "loading"; // loading | ready | processing | completed | despawning
    this.createdAt = new Date().toISOString();
    this.completedAt = "";
    this.profile = profile || {};
    this.systemPrompt = this._buildSystemPrompt();
    this.inputMessage = null;
    this.outputMessage = null;
    this.learnedPatterns = [];
    this.mistakesEncountered = [];
    this.processingTimeMs = 0;
    this._ttlTimer = null;

    // Start TTL countdown
    this._ttlTimer = setTimeout(() => {
      if (this.status !== "completed" && this.status !== "despawning") {
        this.status = "completed";
        this.completedAt = new Date().toISOString();
        spawnerEmitter.emit("agent_timeout", { agentId: this.id, constructionId });
      }
    }, options.ttlMs || AGENT_TTL_MS);

    if (this._ttlTimer && typeof this._ttlTimer.unref === "function") {
      this._ttlTimer.unref();
    }
  }

  _buildSystemPrompt() {
    const parts = [
      `You are an instant agent spawned at construction [${this.constructionId}].`,
      `You are an ephemeral expert — load the following LX entries and respond with precision.`,
      ""
    ];

    if (this.profile.systemPromptSuffix) {
      parts.push(this.profile.systemPromptSuffix);
      parts.push("");
    }

    if (this.profile.skills && this.profile.skills.length > 0) {
      parts.push(`Available skills: ${this.profile.skills.join(", ")}`);
    }

    if (this.profile.tools && this.profile.tools.length > 0) {
      parts.push(`Available tools: ${this.profile.tools.join(", ")}`);
    }

    if (this.profile.mistakes && this.profile.mistakes.length > 0) {
      parts.push("");
      parts.push("MISTAKES TO AVOID:");
      for (const mistake of this.profile.mistakes.slice(0, 10)) {
        parts.push(`- ${mistake}`);
      }
    }

    if (this.profile.patterns && this.profile.patterns.length > 0) {
      parts.push("");
      parts.push("KNOWN PATTERNS:");
      for (const pattern of this.profile.patterns.slice(0, 10)) {
        parts.push(`- ${pattern}`);
      }
    }

    if (this.profile.recentTrace && this.profile.recentTrace.length > 0) {
      parts.push("");
      parts.push("RECENT CONVERSATION CONTEXT:");
      for (const trace of this.profile.recentTrace.slice(-5)) {
        parts.push(`[${trace.direction}] ${trace.text}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Process an inbound message. In a full implementation, this would
   * pipe to a Claude CLI process. For the simulation layer, it records
   * the message flow and emits events for the omnispindle watchers.
   */
  processMessage(message) {
    const startTime = Date.now();
    this.inputMessage = {
      text: String(message.text || "").slice(0, 2000),
      at: new Date().toISOString(),
      source: message.source || "omnispindle"
    };
    this.status = "processing";

    spawnerEmitter.emit("agent_processing", {
      agentId: this.id,
      constructionId: this.constructionId,
      message: this.inputMessage
    });

    // Emit graph event for the GNN
    appendGraphEvent({
      component: "instant-agent-spawner",
      category: "construction_processing",
      action: "instant_agent_process",
      actor: { type: "instant_agent", id: this.id, label: this.id, domain: "simulation" },
      subject: { type: "construction", id: this.constructionId, label: this.constructionId },
      target: { type: "message", id: `msg-${Date.now()}`, domain: "simulation" },
      context: {
        constructionId: this.constructionId,
        skillCount: String(this.profile.skills?.length || 0),
        toolCount: String(this.profile.tools?.length || 0),
        messageLength: String(this.inputMessage.text.length)
      }
    });

    this.processingTimeMs = Date.now() - startTime;
    return this;
  }

  /**
   * Complete processing with a response.
   */
  complete(response) {
    this.outputMessage = {
      text: String(response.text || "").slice(0, 4000),
      at: new Date().toISOString(),
      learnedPatterns: response.learnedPatterns || [],
      mistakesEncountered: response.mistakesEncountered || []
    };
    this.learnedPatterns = this.outputMessage.learnedPatterns;
    this.mistakesEncountered = this.outputMessage.mistakesEncountered;
    this.status = "completed";
    this.completedAt = this.outputMessage.at;

    if (this._ttlTimer) {
      clearTimeout(this._ttlTimer);
      this._ttlTimer = null;
    }

    spawnerEmitter.emit("agent_completed", {
      agentId: this.id,
      constructionId: this.constructionId,
      output: this.outputMessage,
      processingTimeMs: this.processingTimeMs
    });

    // Emit graph event
    appendGraphEvent({
      component: "instant-agent-spawner",
      category: "construction_processing",
      action: "instant_agent_complete",
      actor: { type: "instant_agent", id: this.id, label: this.id, domain: "simulation" },
      subject: { type: "construction", id: this.constructionId },
      context: {
        constructionId: this.constructionId,
        processingTimeMs: String(this.processingTimeMs),
        learnedPatterns: String(this.learnedPatterns.length),
        mistakesEncountered: String(this.mistakesEncountered.length)
      }
    });

    return this.outputMessage;
  }

  /**
   * Get the energy transfer packet for this agent.
   */
  getTransferPacket() {
    return {
      fromAgent: this.id,
      fromConstruction: this.constructionId,
      lastOutput: this.outputMessage?.text || "",
      learnedPatterns: this.learnedPatterns,
      mistakesEncountered: this.mistakesEncountered,
      completionStatus: this.status,
      processingTimeMs: this.processingTimeMs
    };
  }

  toJSON() {
    return {
      id: this.id,
      constructionId: this.constructionId,
      status: this.status,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      processingTimeMs: this.processingTimeMs,
      hasInput: Boolean(this.inputMessage),
      hasOutput: Boolean(this.outputMessage),
      learnedPatterns: this.learnedPatterns.length,
      mistakesEncountered: this.mistakesEncountered.length,
      profileSkills: this.profile.skills?.length || 0,
      profileTools: this.profile.tools?.length || 0
    };
  }
}

// ── Internal Tracer Spindle ──

/**
 * A tracer spindle is a lightweight always-on watcher that observes
 * message flow through constructions and feeds the GNN. Unlike instant
 * agents, tracers don't process — they record.
 */
class TracerSpindle {
  constructor(id, options = {}) {
    this.id = `tracer:${id}`;
    this.label = String(options.label || `Tracer ${id}`).trim();
    this.status = "watching"; // watching | paused | stopped
    this.watchedConstructions = new Set(options.watchedConstructions || []);
    this.observations = [];
    this.maxObservations = options.maxObservations || 200;
    this.createdAt = new Date().toISOString();
    this.observationCount = 0;

    // Routing intelligence — accumulated by watching message patterns
    this.routingHints = new Map(); // constructionId → { hitCount, lastPattern, suggestedNext }
  }

  /**
   * Observe a message flowing through a construction.
   */
  observe(event) {
    if (this.status !== "watching") return null;

    const constructionId = event.constructionId || "unknown";
    if (this.watchedConstructions.size > 0 && !this.watchedConstructions.has(constructionId)) {
      return null; // Not watching this construction
    }

    const observation = {
      at: new Date().toISOString(),
      constructionId,
      agentId: event.agentId || null,
      eventType: event.type || "message", // message | spawn | despawn | error | pattern
      direction: event.direction || "observed",
      summary: String(event.summary || "").slice(0, 300),
      patterns: Array.isArray(event.patterns) ? event.patterns.slice(0, 5) : [],
      riskScore: Number(event.riskScore || 0)
    };

    this.observations.push(observation);
    if (this.observations.length > this.maxObservations) {
      this.observations = this.observations.slice(-this.maxObservations);
    }
    this.observationCount += 1;

    // Update routing hints
    const hint = this.routingHints.get(constructionId) || { hitCount: 0, lastPattern: "", suggestedNext: null };
    hint.hitCount += 1;
    if (observation.patterns.length > 0) {
      hint.lastPattern = observation.patterns[0];
    }
    this.routingHints.set(constructionId, hint);

    // Emit for GNN consumption
    spawnerEmitter.emit("tracer_observation", {
      tracerId: this.id,
      observation
    });

    return observation;
  }

  /**
   * Get routing suggestion based on accumulated observations.
   */
  suggestNextConstruction(currentConstructionId) {
    const hint = this.routingHints.get(currentConstructionId);
    if (!hint || !hint.suggestedNext) return null;
    return {
      constructionId: hint.suggestedNext,
      confidence: Math.min(1, hint.hitCount / 20),
      tracerId: this.id,
      basedOn: `${hint.hitCount} observations, last pattern: ${hint.lastPattern}`
    };
  }

  /**
   * Set a routing suggestion for a construction based on GNN feedback.
   */
  setRoutingSuggestion(fromConstructionId, toConstructionId) {
    const hint = this.routingHints.get(fromConstructionId) || { hitCount: 0, lastPattern: "", suggestedNext: null };
    hint.suggestedNext = toConstructionId;
    this.routingHints.set(fromConstructionId, hint);
  }

  toJSON() {
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      watchedConstructions: Array.from(this.watchedConstructions),
      observationCount: this.observationCount,
      recentObservations: this.observations.slice(-10),
      routingHints: Object.fromEntries(this.routingHints),
      createdAt: this.createdAt
    };
  }
}

// ── Spawner Manager ──

const _activeAgents = new Map();
const _tracers = new Map();

/**
 * Spawn an instant agent at a construction.
 */
function spawnInstantAgent(construction, message, options = {}) {
  if (_activeAgents.size >= MAX_INSTANT_AGENTS) {
    // Despawn oldest completed agent
    let oldest = null;
    for (const [id, agent] of _activeAgents) {
      if (agent.status === "completed" || agent.status === "despawning") {
        if (!oldest || agent.createdAt < oldest.createdAt) {
          oldest = agent;
        }
      }
    }
    if (oldest) {
      _activeAgents.delete(oldest.id);
    } else {
      return { ok: false, error: "max_instant_agents_reached" };
    }
  }

  // Get construction profile for the agent
  const spawnResult = construction.spawnAgent(`instant-${construction.id}-${_agentCounter + 1}`);

  const agent = new InstantAgent(construction.id, spawnResult.profile, {
    ttlMs: options.ttlMs || AGENT_TTL_MS
  });

  _activeAgents.set(agent.id, agent);

  // Register PID (in-memory)
  registerPid(agent.id, {
    pid: process.pid,
    deviceBinding: options.deviceBinding || "rayssa-desktop",
    lxRef: options.lxRef || "—"
  });

  // Register in persistent file-based PID registry (LX-249 universal auto-PID)
  if (_persistentPid && _persistentPid.registerSpawnPid && _persistentPid.generateVirtualPid) {
    try {
      const virtualPid = _persistentPid.generateVirtualPid("instant-" + agent.id);
      _persistentPid.registerSpawnPid("instant-" + agent.id, virtualPid);
      agent._persistentPid = virtualPid;
    } catch (_) { /* persistent PID failure is non-fatal */ }
  }

  // Notify tracers
  for (const tracer of _tracers.values()) {
    tracer.observe({
      constructionId: construction.id,
      agentId: agent.id,
      type: "spawn",
      summary: `Instant agent ${agent.id} spawned at ${construction.label}`,
      direction: "system"
    });
  }

  // Process the message
  agent.processMessage(message);

  spawnerEmitter.emit("instant_agent_spawned", {
    agentId: agent.id,
    constructionId: construction.id
  });

  return { ok: true, agent };
}

/**
 * Complete an instant agent's processing and handle energy transfer.
 */
function completeAndTransfer(agentId, response, nextConstruction = null) {
  const agent = _activeAgents.get(agentId);
  if (!agent) return { ok: false, error: "agent_not_found" };

  // Complete the agent
  agent.complete(response);

  // Get the construction to despawn from
  let fromConstruction = null;
  try {
    const { getConstruction } = require("./constructionIndex");
    fromConstruction = getConstruction(agent.constructionId);
  } catch (_) { /* constructionIndex not yet available */ }

  let transferPacket = null;
  if (fromConstruction) {
    transferPacket = fromConstruction.despawnAgent(agent.getTransferPacket());

    // Record the outbound message
    fromConstruction.recordMessage({
      text: response.text,
      direction: "outbound",
      source: agent.id
    });
  }

  // Energy transfer to next construction
  if (nextConstruction && transferPacket) {
    nextConstruction.receiveEnergy(transferPacket);
  }

  // Auto-despawn from persistent PID registry (LX-249 universal auto-PID)
  if (_persistentPid && _persistentPid.despawnPid) {
    try {
      _persistentPid.despawnPid("instant-" + agent.id);
    } catch (_) { /* persistent PID despawn failure is non-fatal */ }
  }

  // Clear in-memory PID
  clearPid(agent.id);

  // Notify tracers of despawn
  for (const tracer of _tracers.values()) {
    tracer.observe({
      constructionId: agent.constructionId,
      agentId: agent.id,
      type: "despawn",
      summary: `Agent ${agent.id} completed and transferred energy`,
      direction: "system",
      patterns: agent.learnedPatterns.slice(0, 3)
    });
  }

  // Emit graph event for energy transfer
  if (nextConstruction) {
    appendGraphEvent({
      component: "instant-agent-spawner",
      category: "energy_transfer",
      action: "construction_energy_transfer",
      actor: { type: "construction", id: agent.constructionId, domain: "simulation" },
      target: { type: "construction", id: nextConstruction.id, domain: "simulation" },
      context: {
        fromAgent: agent.id,
        energyTransferred: String(transferPacket?.energyLevel || 0),
        patternsTransferred: String(agent.learnedPatterns.length)
      }
    });
  }

  // Clear PID and clean up after cooldown
  clearPid(agentId);
  setTimeout(() => {
    _activeAgents.delete(agentId);
  }, COOLDOWN_MS);

  return {
    ok: true,
    transferPacket,
    agentId: agent.id,
    completedAt: agent.completedAt
  };
}

/**
 * Create or get a tracer spindle.
 */
function ensureTracer(id, options = {}) {
  if (_tracers.has(`tracer:${id}`)) {
    return _tracers.get(`tracer:${id}`);
  }
  const tracer = new TracerSpindle(id, options);
  _tracers.set(tracer.id, tracer);
  return tracer;
}

function getTracer(id) {
  return _tracers.get(`tracer:${id}`) || null;
}

function getAllTracers() {
  return Array.from(_tracers.values());
}

function getActiveAgents() {
  return Array.from(_activeAgents.values());
}

function getSpawnerStatus() {
  return {
    activeAgents: _activeAgents.size,
    maxAgents: MAX_INSTANT_AGENTS,
    tracers: _tracers.size,
    agents: Array.from(_activeAgents.values()).map(a => a.toJSON()),
    tracerSummary: Array.from(_tracers.values()).map(t => ({
      id: t.id,
      status: t.status,
      observationCount: t.observationCount,
      watchedConstructions: t.watchedConstructions.size
    }))
  };
}

// ── Initialize default tracers ──

function initializeTracers() {
  // Phone tracer — watches phone-related construction activity
  ensureTracer("phone-watcher", {
    label: "Phone Agent Watcher",
    watchedConstructions: []
  });

  // Index/catalog tracer — watches index and catalog operations
  ensureTracer("index-watcher", {
    label: "Index/Catalog Watcher",
    watchedConstructions: []
  });

  // Global simulation tracer — watches everything
  ensureTracer("global-watcher", {
    label: "Global Simulation Watcher",
    watchedConstructions: [] // empty = watch all
  });
}

module.exports = {
  InstantAgent,
  TracerSpindle,
  spawnerEmitter,
  spawnInstantAgent,
  completeAndTransfer,
  ensureTracer,
  getTracer,
  getAllTracers,
  getActiveAgents,
  getSpawnerStatus,
  initializeTracers,
  registerPid,
  clearPid,
  getPidRegistry,
  MAX_INSTANT_AGENTS
};
