/**
 * Remote Node Registry
 *
 * Tracks sub-colony nodes that connect to this sovereign Asolaria instance
 * via MQTT. Each remote node publishes health, colony, and world snapshots
 * under namespaced topics (asolaria/nodes/<nodeId>/...).
 */

const NODE_OFFLINE_THRESHOLD_MS = 90000; // 3x health interval (30s)
const { normalizeColonyCapabilities, summarizeRemoteNodeCapabilities } = require("./colonyCapabilitySchema");
const { buildColonyLaneRouting } = require("./colonyCapabilityRouting");

const nodes = new Map();

function normalizeNodeId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 80) || "";
}

function nowIso() {
  return new Date().toISOString();
}

function ensureNode(nodeId) {
  const id = normalizeNodeId(nodeId);
  if (!id) return null;
  if (!nodes.has(id)) {
    nodes.set(id, {
      nodeId: id,
      status: "online",
      health: null,
      colony: null,
      capabilities: null,
      routing: null,
      world: null,
      lastSeenAt: nowIso(),
      firstSeenAt: nowIso(),
      healthUpdates: 0,
      colonyUpdates: 0,
      worldUpdates: 0
    });
  }
  return nodes.get(id);
}

function refreshNodeDerivedState(node) {
  if (!node || typeof node !== "object") return null;
  node.capabilities = normalizeColonyCapabilities(node.capabilities || node.colony || {}, {
    nodeId: node.nodeId,
    defaultRole: "sub_colony"
  });
  node.routing = buildColonyLaneRouting({
    ...(node.colony && typeof node.colony === "object" ? node.colony : {}),
    nodeId: node.nodeId,
    status: node.status,
    capabilities: node.capabilities
  }, {
    nodeId: node.nodeId,
    status: node.status,
    defaultRole: "sub_colony"
  });
  return node;
}

function updateNodeHealth(nodeId, payload) {
  const node = ensureNode(nodeId);
  if (!node) return null;
  node.health = payload && typeof payload === "object" ? payload : null;
  node.lastSeenAt = nowIso();
  node.status = "online";
  node.healthUpdates += 1;
  return node;
}

function updateNodeColony(nodeId, payload) {
  const node = ensureNode(nodeId);
  if (!node) return null;
  node.colony = payload && typeof payload === "object" ? payload : null;
  node.lastSeenAt = nowIso();
  node.status = "online";
  node.colonyUpdates += 1;
  return refreshNodeDerivedState(node);
}

function updateNodeWorld(nodeId, payload) {
  const node = ensureNode(nodeId);
  if (!node) return null;
  node.world = payload && typeof payload === "object" ? payload : null;
  node.lastSeenAt = nowIso();
  node.status = "online";
  node.worldUpdates += 1;
  return node;
}

function updateNodePresence(nodeId, state) {
  const node = ensureNode(nodeId);
  if (!node) return null;
  node.lastSeenAt = nowIso();
  node.status = String(state || "").toLowerCase() === "offline" ? "offline" : "online";
  return refreshNodeDerivedState(node);
}

function refreshStaleNodes() {
  const cutoff = Date.now() - NODE_OFFLINE_THRESHOLD_MS;
  for (const node of nodes.values()) {
    if (node.status !== "offline" && new Date(node.lastSeenAt).getTime() < cutoff) {
      node.status = "offline";
      refreshNodeDerivedState(node);
    }
  }
}

function getRemoteNode(nodeId) {
  refreshStaleNodes();
  const id = normalizeNodeId(nodeId);
  const node = id ? (nodes.get(id) || null) : null;
  return node ? refreshNodeDerivedState(node) : null;
}

function getRemoteNodes() {
  refreshStaleNodes();
  return new Map(nodes);
}

function getRemoteNodesSummary() {
  refreshStaleNodes();
  const all = [];
  let online = 0;
  for (const node of nodes.values()) {
    refreshNodeDerivedState(node);
    all.push({
      nodeId: node.nodeId,
      status: node.status,
      lastSeenAt: node.lastSeenAt,
      firstSeenAt: node.firstSeenAt,
      healthUpdates: node.healthUpdates,
      colonyUpdates: node.colonyUpdates,
      worldUpdates: node.worldUpdates,
      hasHealth: Boolean(node.health),
      hasColony: Boolean(node.colony),
      hasWorld: Boolean(node.world),
      capabilities: node.capabilities,
      routing: node.routing
    });
    if (node.status === "online") online += 1;
  }
  return {
    total: nodes.size,
    online,
    offline: nodes.size - online,
    capabilities: summarizeRemoteNodeCapabilities(all),
    nodes: all
  };
}

function removeNode(nodeId) {
  const id = normalizeNodeId(nodeId);
  return id ? nodes.delete(id) : false;
}

module.exports = {
  updateNodeHealth,
  updateNodeColony,
  updateNodeWorld,
  updateNodePresence,
  getRemoteNode,
  getRemoteNodes,
  getRemoteNodesSummary,
  removeNode
};
