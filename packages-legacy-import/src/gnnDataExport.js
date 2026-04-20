/**
 * GNN Training Data Export — Phase 10
 *
 * Converts graph runtime events into PyTorch Geometric compatible format.
 * Generates node features, edge features, and binary labels from edge prototypes.
 */

const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");

const EVENTS_PATH = resolveDataPath("graph-runtime-events.ndjson");

function loadEvents(options = {}) {
  const limit = options.limit || Infinity;
  const lines = fs.readFileSync(EVENTS_PATH, "utf8").split("\n").filter(Boolean);
  const events = [];
  for (const line of lines.slice(-limit)) {
    try { events.push(JSON.parse(line)); } catch (_) {}
  }
  return events;
}

// Node feature extraction (per ADR-0010: 8-dim)
function extractNodeFeatures(events) {
  const nodes = new Map(); // nodeId -> features

  for (const event of events) {
    const actorId = event.actor?.id || "unknown";
    const targetId = event.target?.id || "unknown";

    for (const id of [actorId, targetId]) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          type: event.actor?.id === id ? (event.actor?.type || "unknown") : (event.target?.type || "unknown"),
          edgeCount: 0,
          totalRisk: 0,
          maxRisk: 0,
          failures: 0,
          lastSeen: ""
        });
      }
      const node = nodes.get(id);
      node.edgeCount++;
      const risk = Number(event.risk?.score || 0);
      node.totalRisk += risk;
      if (risk > node.maxRisk) node.maxRisk = risk;
      if (event.status === "failed" || event.status === "error") node.failures++;
      node.lastSeen = event.at || node.lastSeen;
    }
  }

  return [...nodes.values()].map(n => ({
    id: n.id,
    type: n.type,
    edgeVolume: n.edgeCount,
    avgRisk: n.edgeCount ? Math.round(n.totalRisk / n.edgeCount * 100) / 100 : 0,
    maxRisk: n.maxRisk,
    failureRate: n.edgeCount ? Math.round(n.failures / n.edgeCount * 1000) / 1000 : 0,
    online: 1,
    trustTier: n.type === "runtime" ? 3 : n.type === "local_client" ? 2 : 1
  }));
}

// Edge feature extraction (per ADR-0010: 10-dim)
function extractEdgeFeatures(events) {
  return events.map((event, index) => {
    const risk = Number(event.risk?.score || 0);
    const level = String(event.risk?.level || "low");

    // Binary label: benign vs suspicious
    // Per ADR-0010 label policy
    let label = 0; // benign
    if (risk >= 6) label = 1; // suspicious
    if (event.status === "blocked" || event.status === "denied") label = 1;
    if (event.action?.includes("blocked") || event.action?.includes("denied")) label = 1;

    return {
      index,
      source: event.actor?.id || "unknown",
      target: event.target?.id || "unknown",
      action: String(event.action || "unknown").slice(0, 50),
      category: String(event.category || "unknown").slice(0, 30),
      component: String(event.component || "unknown").slice(0, 30),
      riskScore: risk,
      riskLevel: level,
      isMutation: event.context?.isMutation ? 1 : 0,
      crossDomain: (event.actor?.domain || "local") !== (event.target?.domain || "local") ? 1 : 0,
      approvalState: event.policy?.approvalState || "not_required",
      timestamp: event.at || "",
      label
    };
  });
}

// Export as PyTorch Geometric compatible format
function exportTrainingData(options = {}) {
  const events = loadEvents(options);
  const nodes = extractNodeFeatures(events);
  const edges = extractEdgeFeatures(events);

  const nodeMap = new Map();
  nodes.forEach((n, i) => nodeMap.set(n.id, i));

  // Build adjacency (source, target indices)
  const edgeIndex = edges.map(e => [
    nodeMap.get(e.source) ?? 0,
    nodeMap.get(e.target) ?? 0
  ]);

  const stats = {
    totalEvents: events.length,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    benign: edges.filter(e => e.label === 0).length,
    suspicious: edges.filter(e => e.label === 1).length,
    labelRatio: edges.length ? Math.round(edges.filter(e => e.label === 1).length / edges.length * 1000) / 1000 : 0,
    categories: [...new Set(edges.map(e => e.category))],
    actions: [...new Set(edges.map(e => e.action))].length
  };

  return {
    ok: true,
    exportedAt: new Date().toISOString(),
    stats,
    nodes,
    edges,
    edgeIndex,
    format: "pytorch_geometric_compatible"
  };
}

function saveTrainingExport(outputPath, options = {}) {
  const data = exportTrainingData(options);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
  return { ok: true, path: outputPath, stats: data.stats };
}

module.exports = { loadEvents, extractNodeFeatures, extractEdgeFeatures, exportTrainingData, saveTrainingExport };
