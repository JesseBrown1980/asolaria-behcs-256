/**
 * Index Catalog Sync — MQTT catalog exchange between colonies.
 * Reads local CATALOG-*.md files, publishes a JSON summary via MQTT,
 * and stores inbound catalog snapshots from remote nodes.
 * PID: forge-20260324-catalog-sync
 */
const fs = require("fs");
const path = require("path");
const { projectRoot } = require("./runtimePaths");

const AGENT_INDEX_DIR = path.join(projectRoot, "data", "agent-index");
const CATALOG_TOPIC_SUFFIX = "index/catalog";
const SUBSCRIPTION_TOPICS = ["asolaria/nodes/+/index/catalog"];

const remoteCatalogs = new Map();
let lastPublishedAt = "";
let lastReceivedAt = "";
let localSnapshotCache = null;

function findCatalogFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "sub-colonies") continue; // federated, not local
        results.push(...findCatalogFiles(full));
      } else if (entry.isFile() && /^CATALOG.*\.md$/i.test(entry.name)) {
        results.push(full);
      }
    }
  } catch (_) { /* directory may not exist */ }
  return results;
}

function parseCatalogFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, "utf8"); } catch (_) { return null; }

  const relativePath = path.relative(AGENT_INDEX_DIR, filePath).replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);

  let entryCount = 0;
  const countMatch = content.match(/(\d+)\s+entries?\b/i);
  if (countMatch) entryCount = parseInt(countMatch[1], 10) || 0;

  const entryIds = [];
  for (const line of lines) {
    const m = line.match(/\|\s*(IX-\d+|LX-\d+|FX-\d+)\s*\|/);
    if (m) entryIds.push(m[1]);
  }
  if (entryIds.length > 0 && entryCount === 0) entryCount = entryIds.length;

  let mtime = "";
  try { mtime = fs.statSync(filePath).mtime.toISOString(); } catch (_) { /* ok */ }

  return { path: relativePath, entries: entryCount, entryIds, lastModified: mtime };
}

function buildCatalogSnapshot() {
  const nodeId = String(process.env.ASOLARIA_NODE_ID || "sovereign").trim();
  const catalogFiles = findCatalogFiles(AGENT_INDEX_DIR);
  const catalogs = {};
  let totalEntries = 0;

  for (const file of catalogFiles) {
    const parsed = parseCatalogFile(file);
    if (!parsed) continue;
    catalogs[parsed.path] = {
      entries: parsed.entries,
      entryIds: parsed.entryIds,
      lastModified: parsed.lastModified
    };
    totalEntries += parsed.entries;
  }

  const snapshot = {
    nodeId, catalogs, totalEntries,
    catalogCount: Object.keys(catalogs).length,
    at: new Date().toISOString()
  };
  localSnapshotCache = snapshot;
  return snapshot;
}

function publishCatalogSnapshot(mqttPublishFn) {
  if (typeof mqttPublishFn !== "function") {
    throw new Error("indexCatalogSync: mqttPublishFn must be a function");
  }
  const snapshot = buildCatalogSnapshot();
  const topic = `asolaria/nodes/${snapshot.nodeId}/${CATALOG_TOPIC_SUFFIX}`;
  mqttPublishFn(topic, JSON.stringify(snapshot), { retain: true, qos: 1 });
  lastPublishedAt = new Date().toISOString();
  return snapshot;
}

function handleRemoteCatalog(nodeId, payload) {
  if (!nodeId || !payload) return;
  let data;
  if (typeof payload === "string") {
    try { data = JSON.parse(payload); } catch (_) { return; }
  } else if (typeof payload === "object" && payload !== null) {
    data = payload;
  } else { return; }

  const localId = String(process.env.ASOLARIA_NODE_ID || "sovereign").trim();
  if (nodeId === localId) return; // ignore own broadcasts

  // Accept both formats: Gaia-style { catalogs, totalEntries } and Liris-style { lxTotal, catalogLines }
  const totalEntries = data.totalEntries || data.lxTotal || 0;
  const catalogCount = data.catalogCount || (data.catalogLines ? 1 : 0) || 0;
  remoteCatalogs.set(nodeId, {
    nodeId,
    catalogs: data.catalogs || {},
    totalEntries,
    catalogCount,
    lxTotal: data.lxTotal || undefined,
    receivedAt: new Date().toISOString(),
    originalAt: data.at || ""
  });
  lastReceivedAt = new Date().toISOString();
}

function getRemoteCatalogs() {
  const result = {};
  for (const [id, data] of remoteCatalogs) result[id] = data;
  return result;
}

function searchRemoteCatalogs(query) {
  if (!query || typeof query !== "string") return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [];
  for (const [nodeId, data] of remoteCatalogs) {
    for (const [catalogPath, info] of Object.entries(data.catalogs || {})) {
      const haystack = `${catalogPath} ${(info.entryIds || []).join(" ")}`.toLowerCase();
      if (terms.some(t => haystack.includes(t))) {
        matches.push({
          nodeId, catalogPath,
          entries: info.entries,
          entryIds: info.entryIds || [],
          lastModified: info.lastModified
        });
      }
    }
  }
  return matches;
}

function getSubscriptionTopics() {
  return [...SUBSCRIPTION_TOPICS];
}

function getCatalogSyncStatus() {
  return {
    localSnapshot: localSnapshotCache || buildCatalogSnapshot(),
    remoteCatalogs: getRemoteCatalogs(),
    lastPublished: lastPublishedAt,
    lastReceived: lastReceivedAt
  };
}

module.exports = {
  buildCatalogSnapshot,
  publishCatalogSnapshot,
  handleRemoteCatalog,
  getRemoteCatalogs,
  searchRemoteCatalogs,
  getSubscriptionTopics,
  getCatalogSyncStatus
};
