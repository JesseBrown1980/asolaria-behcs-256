/**
 * GNN Construction Watcher — Live Graph-Informed Routing for Constructions
 *
 * This module bridges the GNN graph runtime layer with the construction
 * simulation. It:
 *
 * 1. Watches the graph runtime event stream for patterns
 * 2. Predicts which construction should handle the next message
 * 3. Pre-spawns agents at predicted target constructions
 * 4. Guides tracer spindles with routing suggestions
 * 5. Absorbs despawned agent energy into the graph for learning
 *
 * The GNN watcher is always-on. It is the intelligence layer that makes
 * the construction pipeline adaptive rather than static.
 */

const EventEmitter = require("events");
const { graphRuntimeEmitter } = require("./graphRuntimeStore");
const { appendGraphEvent } = require("./graphRuntimeStore");
const { spawnerEmitter } = require("./instantAgentSpawner");
const { constructionEmitter } = require("./constructionIndex");

const watcherEmitter = new EventEmitter();
watcherEmitter.setMaxListeners(16);

// ── Routing Intelligence ──

/**
 * Accumulated routing knowledge from observing construction traffic.
 * Maps: sourceConstructionId → Map<targetConstructionId, { count, confidence, lastAt }>
 */
const _routingGraph = new Map();

/**
 * Pattern memory — records which message patterns map to which constructions.
 * Maps: pattern keyword → { constructionId, hitCount, lastAt }
 */
const _patternMemory = new Map();

/**
 * Pre-spawn queue — constructions where an agent should be pre-loaded.
 */
const _preSpawnQueue = [];
const MAX_PRESPAWN_QUEUE = 4;

/**
 * Record a routing observation: a message moved from one construction to another.
 */
function recordRoutingEdge(fromConstructionId, toConstructionId, context = {}) {
  if (!_routingGraph.has(fromConstructionId)) {
    _routingGraph.set(fromConstructionId, new Map());
  }
  const edges = _routingGraph.get(fromConstructionId);
  const existing = edges.get(toConstructionId) || { count: 0, confidence: 0, lastAt: "" };
  existing.count += 1;
  existing.lastAt = new Date().toISOString();

  // Confidence is based on frequency relative to total outbound edges
  let totalOut = 0;
  for (const edge of edges.values()) totalOut += edge.count;
  for (const [targetId, edge] of edges) {
    edge.confidence = totalOut > 0 ? edge.count / totalOut : 0;
  }

  edges.set(toConstructionId, existing);

  watcherEmitter.emit("routing_edge_recorded", {
    from: fromConstructionId,
    to: toConstructionId,
    confidence: existing.confidence,
    count: existing.count
  });
}

/**
 * Record that a message with certain keywords ended up at a construction.
 */
function recordPatternHit(keywords, constructionId) {
  for (const keyword of keywords) {
    const normalized = String(keyword).toLowerCase().trim();
    if (!normalized || normalized.length < 3) continue;
    const existing = _patternMemory.get(normalized) || { constructionId, hitCount: 0, lastAt: "" };
    existing.constructionId = constructionId;
    existing.hitCount += 1;
    existing.lastAt = new Date().toISOString();
    _patternMemory.set(normalized, existing);
  }
}

/**
 * Predict the best construction for a message using accumulated routing knowledge.
 * Returns { constructionId, confidence, source } or null.
 */
function predictConstruction(message, currentConstructionId = null) {
  const text = String(message.text || message || "").toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length >= 3);

  // Strategy 1: Pattern memory — direct keyword matches
  let bestPattern = null;
  let bestPatternScore = 0;
  for (const word of words) {
    const hit = _patternMemory.get(word);
    if (hit && hit.hitCount > bestPatternScore) {
      bestPattern = hit;
      bestPatternScore = hit.hitCount;
    }
  }

  // Strategy 2: Routing graph — if we know where messages from current go next
  let bestRoutingTarget = null;
  if (currentConstructionId && _routingGraph.has(currentConstructionId)) {
    const edges = _routingGraph.get(currentConstructionId);
    let maxConfidence = 0;
    for (const [targetId, edge] of edges) {
      if (edge.confidence > maxConfidence) {
        maxConfidence = edge.confidence;
        bestRoutingTarget = { constructionId: targetId, confidence: edge.confidence };
      }
    }
  }

  // Combine: routing graph wins if confidence > 0.6, otherwise fall back to pattern memory
  if (bestRoutingTarget && bestRoutingTarget.confidence > 0.6) {
    return {
      constructionId: bestRoutingTarget.constructionId,
      confidence: bestRoutingTarget.confidence,
      source: "routing_graph"
    };
  }

  if (bestPattern && bestPatternScore >= 2) {
    return {
      constructionId: bestPattern.constructionId,
      confidence: Math.min(1, bestPatternScore / 10),
      source: "pattern_memory"
    };
  }

  return null;
}

/**
 * Queue a construction for pre-spawning.
 */
function queuePreSpawn(constructionId, reason = "") {
  // Don't double-queue
  if (_preSpawnQueue.some(q => q.constructionId === constructionId)) return;
  if (_preSpawnQueue.length >= MAX_PRESPAWN_QUEUE) {
    _preSpawnQueue.shift();
  }
  _preSpawnQueue.push({
    constructionId,
    reason,
    queuedAt: new Date().toISOString()
  });

  watcherEmitter.emit("prespawn_queued", { constructionId, reason });
}

/**
 * Get and clear the next pre-spawn target.
 */
function popPreSpawn() {
  return _preSpawnQueue.shift() || null;
}

// ── Event Listeners — Wire to graph runtime and construction events ──

let _watcherActive = false;

function startWatcher() {
  if (_watcherActive) return;
  _watcherActive = true;

  // Listen to graph runtime events for construction-related patterns
  graphRuntimeEmitter.on("graph_event", (event) => {
    if (!event) return;

    // Watch for construction processing events
    if (event.category === "construction_processing") {
      const constructionId = event.context?.constructionId;
      if (constructionId) {
        // Extract keywords from the event for pattern learning
        const keywords = [
          event.action,
          event.context?.constructionId,
          event.actor?.id,
          event.target?.id
        ].filter(Boolean);
        recordPatternHit(keywords, constructionId);
      }
    }

    // Watch for energy transfers to build routing edges
    if (event.action === "construction_energy_transfer") {
      const from = event.actor?.id;
      const to = event.target?.id;
      if (from && to) {
        recordRoutingEdge(from, to);
      }
    }
  });

  // Listen to construction events for GNN-informed pre-spawning
  constructionEmitter.on("agent_despawned", (event) => {
    const fromId = event.transferPacket?.fromConstruction;
    if (!fromId) return;

    // Predict where the next message will go and pre-spawn
    const prediction = predictConstruction("", fromId);
    if (prediction && prediction.confidence > 0.5) {
      queuePreSpawn(prediction.constructionId, `GNN predicted after ${fromId} (confidence=${prediction.confidence.toFixed(2)})`);
    }
  });

  // Listen to instant agent events for pattern learning
  spawnerEmitter.on("agent_completed", (event) => {
    const constructionId = event.constructionId;
    if (!constructionId) return;

    // Learn from agent output patterns
    const outputText = event.output?.text || "";
    const words = outputText.toLowerCase().split(/\s+/).filter(w => w.length >= 4).slice(0, 20);
    recordPatternHit(words, constructionId);
  });

  // Listen to tracer observations for routing intelligence
  spawnerEmitter.on("tracer_observation", (event) => {
    const obs = event.observation;
    if (!obs) return;

    // If a tracer detects a pattern, feed it into routing
    if (obs.patterns && obs.patterns.length > 0) {
      recordPatternHit(obs.patterns, obs.constructionId);
    }
  });

  watcherEmitter.emit("watcher_started", { at: new Date().toISOString() });
}

function stopWatcher() {
  _watcherActive = false;
  graphRuntimeEmitter.removeAllListeners("graph_event");
  watcherEmitter.emit("watcher_stopped", { at: new Date().toISOString() });
}

// ── Status & Diagnostics ──

function getWatcherStatus() {
  const routingEdges = [];
  for (const [fromId, edges] of _routingGraph) {
    for (const [toId, edge] of edges) {
      routingEdges.push({
        from: fromId,
        to: toId,
        count: edge.count,
        confidence: edge.confidence,
        lastAt: edge.lastAt
      });
    }
  }

  return {
    active: _watcherActive,
    routingEdges: routingEdges.sort((a, b) => b.confidence - a.confidence).slice(0, 20),
    patternMemorySize: _patternMemory.size,
    topPatterns: Array.from(_patternMemory.entries())
      .sort((a, b) => b[1].hitCount - a[1].hitCount)
      .slice(0, 20)
      .map(([keyword, hit]) => ({ keyword, constructionId: hit.constructionId, hitCount: hit.hitCount })),
    preSpawnQueue: [..._preSpawnQueue],
    preSpawnQueueMax: MAX_PRESPAWN_QUEUE
  };
}

module.exports = {
  watcherEmitter,
  recordRoutingEdge,
  recordPatternHit,
  predictConstruction,
  queuePreSpawn,
  popPreSpawn,
  startWatcher,
  stopWatcher,
  getWatcherStatus
};
