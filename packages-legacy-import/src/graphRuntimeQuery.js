const fs = require("fs");
const {
  graphRuntimeEventsPath,
  graphRuntimeManifestsPath
} = require("./graphRuntimeStore");

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function safeTimestamp(value) {
  const parsed = new Date(value || "");
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : 0;
}

function levelRank(level) {
  switch (String(level || "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function readNdjson(filePath, maxLines = 5000) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.trim()) {
      return [];
    }
    const lines = text.split(/\r?\n/).filter(Boolean);
    const slice = maxLines > 0 ? lines.slice(-maxLines) : lines;
    const out = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line));
      } catch (_error) {
        // Skip malformed lines without blocking the viewer.
      }
    }
    return out;
  } catch (_error) {
    return [];
  }
}

function filterByWindow(items, timeField, sinceMs) {
  if (!sinceMs) return items.slice();
  return items.filter((item) => safeTimestamp(item?.[timeField]) >= sinceMs);
}

function filterLowRisk(items, includeLow) {
  if (includeLow) return items.slice();
  return items.filter((item) => levelRank(item?.risk?.level) >= levelRank("medium"));
}

function tailLimit(items, limit) {
  const safeLimit = clampInteger(limit, 1, 5000, 200);
  return items.slice(-safeLimit);
}

function summarizeLevels(items) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0
  };
  for (const item of items) {
    const level = String(item?.risk?.level || "unknown").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, level)) {
      counts[level] += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

function summarizeByKey(items, key, maxItems = 8) {
  const counts = new Map();
  for (const item of items) {
    const value = String(item?.[key] || "").trim() || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, maxItems);
}

function mapCountsToSortedList(countsMap, maxItems = 8) {
  return Array.from(countsMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, maxItems);
}

function uniqueSorted(items, mapper) {
  const values = new Set();
  for (const item of items) {
    const mapped = String(mapper(item) || "").trim();
    if (mapped) values.add(mapped);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function earliestTimestamp(items, timeField) {
  let earliest = 0;
  for (const item of items) {
    const time = safeTimestamp(item?.[timeField]);
    if (!time) continue;
    if (!earliest || time < earliest) {
      earliest = time;
    }
  }
  return earliest;
}

function latestTimestamp(items, timeField) {
  let latest = 0;
  for (const item of items) {
    const time = safeTimestamp(item?.[timeField]);
    if (time > latest) {
      latest = time;
    }
  }
  return latest;
}

function normalizeActionText(value) {
  return String(value || "").trim().toLowerCase();
}

function recordTime(record) {
  return safeTimestamp(record?.at || record?.createdAt);
}

function describeArchetypesForRecord(record) {
  const action = normalizeActionText(record?.action);
  const component = normalizeActionText(record?.component);
  const category = normalizeActionText(record?.category);
  const approvalState = normalizeActionText(record?.policy?.approvalState);
  const actorDomain = normalizeActionText(record?.risk?.actorDomain || record?.actor?.domain);
  const targetDomain = normalizeActionText(record?.risk?.targetDomain || record?.target?.domain);
  const targetCriticality = normalizeActionText(record?.target?.criticality);
  const tags = new Set();

  if (component === "brain-orchestrator" && (action.includes("provider") || category.includes("provider"))) {
    tags.add("autonomous-provider-route");
  }
  if (component === "phone-edge" && action.startsWith("assistant_")) {
    tags.add("phone-live-loop");
  }
  if (component === "task-ledger" && action.startsWith("chat_")) {
    tags.add("chat-task-lifecycle");
  }
  if (approvalState === "required" || approvalState === "pending" || approvalState === "approved" || approvalState === "denied") {
    tags.add("approval-path");
  }
  if (actorDomain && targetDomain && actorDomain !== targetDomain) {
    tags.add("cross-domain-bridge");
  }
  if (
    action.includes("secret")
    || action.includes("iam")
    || action.includes("privilege")
    || action.includes("deploy")
    || action.includes("tunnel")
    || action.includes("external")
  ) {
    tags.add("privileged-control-edge");
  }
  if (targetCriticality === "high" || targetCriticality === "critical") {
    tags.add("high-criticality-target");
  }
  if ((record?.risk?.score || 0) >= 8) {
    tags.add("hot-risk-edge");
  }
  return Array.from(tags);
}

function summarizeArchetypes(records, maxItems = 8) {
  const counts = new Map();
  for (const record of records) {
    for (const tag of describeArchetypesForRecord(record)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return mapCountsToSortedList(counts, maxItems);
}

function buildActivityTimeline(events, manifests, options = {}) {
  const bucketCount = clampInteger(options.bucketCount, 6, 48, 18);
  const allRecords = [
    ...events.map((record) => ({ ...record, _kind: "graph_event" })),
    ...manifests.map((record) => ({ ...record, _kind: "action_manifest" }))
  ];
  const earliest = allRecords.reduce((min, record) => {
    const time = recordTime(record);
    if (!time) return min;
    if (!min || time < min) return time;
    return min;
  }, 0);
  const latest = allRecords.reduce((max, record) => Math.max(max, recordTime(record)), 0);
  if (!earliest || !latest || earliest === latest) {
    return {
      earliestAt: earliest > 0 ? new Date(earliest).toISOString() : "",
      latestAt: latest > 0 ? new Date(latest).toISOString() : "",
      buckets: []
    };
  }

  const span = Math.max(1, latest - earliest);
  const bucketWidth = Math.max(1, Math.ceil(span / bucketCount));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    index,
    startAt: new Date(earliest + (index * bucketWidth)).toISOString(),
    endAt: new Date(Math.min(latest, earliest + ((index + 1) * bucketWidth))).toISOString(),
    events: 0,
    manifests: 0,
    total: 0,
    weightedRisk: 0
  }));

  for (const record of allRecords) {
    const time = recordTime(record);
    if (!time) continue;
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor((time - earliest) / bucketWidth)));
    const bucket = buckets[index];
    if (record._kind === "action_manifest") {
      bucket.manifests += 1;
    } else {
      bucket.events += 1;
    }
    bucket.total += 1;
    bucket.weightedRisk += Math.max(1, levelRank(record?.risk?.level) + Math.round(Number(record?.risk?.score || 0) / 4));
  }

  const maxTotal = buckets.reduce((max, bucket) => Math.max(max, bucket.total), 0);
  const maxWeightedRisk = buckets.reduce((max, bucket) => Math.max(max, bucket.weightedRisk), 0);
  for (const bucket of buckets) {
    bucket.totalRatio = maxTotal ? Number((bucket.total / maxTotal).toFixed(3)) : 0;
    bucket.riskRatio = maxWeightedRisk ? Number((bucket.weightedRisk / maxWeightedRisk).toFixed(3)) : 0;
  }

  return {
    earliestAt: new Date(earliest).toISOString(),
    latestAt: new Date(latest).toISOString(),
    buckets
  };
}

function freshnessBand(freshness) {
  if (freshness >= 0.85) return "hot";
  if (freshness >= 0.55) return "warm";
  if (freshness >= 0.25) return "cool";
  return "cold";
}

function annotateGraphFreshness(graph, latestAtMs, earliestAtMs) {
  const span = Math.max(1, latestAtMs - earliestAtMs);
  const annotate = (item) => {
    const lastSeenMs = safeTimestamp(item?.lastSeen);
    const ageMs = latestAtMs ? Math.max(0, latestAtMs - lastSeenMs) : 0;
    const freshness = latestAtMs ? Math.max(0, 1 - (ageMs / span)) : 0;
    return {
      ...item,
      ageMs,
      freshness: Number(freshness.toFixed(3)),
      freshnessBand: freshnessBand(freshness)
    };
  };
  return {
    nodes: (graph?.nodes || []).map(annotate),
    edges: (graph?.edges || []).map(annotate)
  };
}

function buildGraphDiff(currentGraph, baselineGraph) {
  if (!baselineGraph) {
    return {
      compareEnabled: false,
      addedNodes: [],
      removedNodes: [],
      changedNodes: [],
      addedEdges: [],
      removedEdges: [],
      changedEdges: [],
      summary: {
        addedNodes: 0,
        removedNodes: 0,
        changedNodes: 0,
        addedEdges: 0,
        removedEdges: 0,
        changedEdges: 0
      }
    };
  }

  const currentNodes = new Map((currentGraph?.nodes || []).map((item) => [item.id, item]));
  const baselineNodes = new Map((baselineGraph?.nodes || []).map((item) => [item.id, item]));
  const currentEdges = new Map((currentGraph?.edges || []).map((item) => [item.id, item]));
  const baselineEdges = new Map((baselineGraph?.edges || []).map((item) => [item.id, item]));

  const addedNodes = [];
  const removedNodes = [];
  const changedNodes = [];
  const addedEdges = [];
  const removedEdges = [];
  const changedEdges = [];

  for (const [id, node] of currentNodes.entries()) {
    const baselineNode = baselineNodes.get(id);
    if (!baselineNode) {
      addedNodes.push(node);
      continue;
    }
    if (
      baselineNode.count !== node.count
      || baselineNode.maxRiskLevel !== node.maxRiskLevel
      || baselineNode.primaryComponent !== node.primaryComponent
    ) {
      changedNodes.push({
        id,
        label: node.label,
        type: node.type,
        countDelta: node.count - baselineNode.count,
        riskFrom: baselineNode.maxRiskLevel,
        riskTo: node.maxRiskLevel,
        componentFrom: baselineNode.primaryComponent,
        componentTo: node.primaryComponent
      });
    }
  }
  for (const [id, node] of baselineNodes.entries()) {
    if (!currentNodes.has(id)) {
      removedNodes.push(node);
    }
  }

  for (const [id, edge] of currentEdges.entries()) {
    const baselineEdge = baselineEdges.get(id);
    if (!baselineEdge) {
      addedEdges.push(edge);
      continue;
    }
    if (
      baselineEdge.count !== edge.count
      || baselineEdge.maxRiskLevel !== edge.maxRiskLevel
      || baselineEdge.primaryComponent !== edge.primaryComponent
    ) {
      changedEdges.push({
        id,
        source: edge.source,
        target: edge.target,
        countDelta: edge.count - baselineEdge.count,
        riskFrom: baselineEdge.maxRiskLevel,
        riskTo: edge.maxRiskLevel,
        componentFrom: baselineEdge.primaryComponent,
        componentTo: edge.primaryComponent
      });
    }
  }
  for (const [id, edge] of baselineEdges.entries()) {
    if (!currentEdges.has(id)) {
      removedEdges.push(edge);
    }
  }

  return {
    compareEnabled: true,
    addedNodes: addedNodes.slice(0, 8),
    removedNodes: removedNodes.slice(0, 8),
    changedNodes: changedNodes.slice(0, 10),
    addedEdges: addedEdges.slice(0, 10),
    removedEdges: removedEdges.slice(0, 10),
    changedEdges: changedEdges.slice(0, 12),
    summary: {
      addedNodes: addedNodes.length,
      removedNodes: removedNodes.length,
      changedNodes: changedNodes.length,
      addedEdges: addedEdges.length,
      removedEdges: removedEdges.length,
      changedEdges: changedEdges.length
    }
  };
}

function buildSuspiciousEdges(graph, maxItems = 8) {
  const nodesById = new Map((graph?.nodes || []).map((node) => [node.id, node]));
  return (graph?.edges || [])
    .map((edge) => {
      const sourceNode = nodesById.get(edge.source);
      const targetNode = nodesById.get(edge.target);
      const dominantAction = (edge.actions || [])[0] || "";
      const domainsDiffer = Boolean(sourceNode?.domain && targetNode?.domain && sourceNode.domain !== targetNode.domain);
      return {
        ...edge,
        sourceLabel: sourceNode?.label || edge.source,
        targetLabel: targetNode?.label || edge.target,
        dominantAction,
        sourceDomain: sourceNode?.domain || "",
        targetDomain: targetNode?.domain || "",
        targetCriticality: targetNode?.criticality || "",
        domainsDiffer,
        suspiciousScore: Number((Number(edge.maxRiskScore || 0) + (edge.count * 0.35) + (edge.freshness * 2)).toFixed(2)),
        tags: describeArchetypesForRecord({
          action: dominantAction,
          component: edge.primaryComponent || "",
          target: {
            criticality: targetNode?.criticality || ""
          },
          risk: {
            score: edge.maxRiskScore || 0,
            actorDomain: sourceNode?.domain || "",
            targetDomain: targetNode?.domain || ""
          }
        })
      };
    })
    .sort((a, b) =>
      b.suspiciousScore - a.suspiciousScore
      || b.count - a.count
      || safeTimestamp(b.lastSeen) - safeTimestamp(a.lastSeen)
    )
    .slice(0, maxItems);
}

const experimentalEdgePrototypes = [
  {
    id: "provider-route",
    label: "Autonomous Provider Route",
    description: "orchestrator/provider edges touching high-criticality providers",
    score(edge) {
      let score = 0;
      if (edge.primaryComponent === "brain-orchestrator") score += 0.35;
      if (String(edge.dominantAction || "").includes("provider")) score += 0.35;
      if (edge.maxRiskScore >= 6) score += 0.2;
      if (edge.targetCriticality === "high" || edge.targetCriticality === "critical") score += 0.1;
      return Math.min(1, score);
    }
  },
  {
    id: "phone-loop",
    label: "Phone Live Loop",
    description: "mobile assistant request/reply loop edges",
    score(edge) {
      let score = 0;
      if (edge.primaryComponent === "phone-edge") score += 0.45;
      if (String(edge.dominantAction || "").startsWith("assistant_")) score += 0.35;
      if (edge.count >= 4) score += 0.1;
      if (edge.freshness >= 0.2) score += 0.1;
      return Math.min(1, score);
    }
  },
  {
    id: "task-flow",
    label: "Tracked Task Flow",
    description: "chat/task lifecycle and task-ledger transitions",
    score(edge) {
      let score = 0;
      if (edge.primaryComponent === "task-ledger" || edge.primaryComponent === "chat-ingress") score += 0.45;
      if (String(edge.dominantAction || "").startsWith("chat_")) score += 0.35;
      if ((edge.tags || []).includes("chat-task-lifecycle")) score += 0.2;
      return Math.min(1, score);
    }
  },
  {
    id: "privileged-control",
    label: "Privileged Control Edge",
    description: "high-impact or cross-domain control-plane edges",
    score(edge) {
      let score = 0;
      if ((edge.tags || []).includes("high-criticality-target")) score += 0.25;
      if ((edge.tags || []).includes("hot-risk-edge")) score += 0.25;
      if ((edge.tags || []).includes("privileged-control-edge")) score += 0.3;
      if (edge.domainsDiffer) score += 0.2;
      return Math.min(1, score);
    }
  }
];

function buildPrototypeLane(suspiciousEdges, maxItems = 8) {
  const summaryCounts = new Map();
  const matches = suspiciousEdges
    .map((edge) => {
      const scored = experimentalEdgePrototypes
        .map((prototype) => ({
          id: prototype.id,
          label: prototype.label,
          description: prototype.description,
          similarity: Number(prototype.score(edge).toFixed(3))
        }))
        .sort((a, b) => b.similarity - a.similarity || a.label.localeCompare(b.label));
      const best = scored[0];
      if (best && best.similarity > 0) {
        summaryCounts.set(best.label, (summaryCounts.get(best.label) || 0) + 1);
      }
      return {
        edgeId: edge.id,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
        suspiciousScore: edge.suspiciousScore,
        bestPrototype: best || null,
        candidates: scored.slice(0, 3),
        agreement: best ? Number((Math.min(1, best.similarity * (edge.suspiciousScore / 10))).toFixed(3)) : 0
      };
    })
    .sort((a, b) =>
      (b.bestPrototype?.similarity || 0) - (a.bestPrototype?.similarity || 0)
      || b.suspiciousScore - a.suspiciousScore
    )
    .slice(0, maxItems);

  return {
    summary: mapCountsToSortedList(summaryCounts, 8),
    matches
  };
}

function classifyRiskLabel(level, score) {
  const normalized = String(level || "").trim().toLowerCase();
  const numericScore = Number(score || 0);
  if (normalized === "critical" || normalized === "high" || numericScore >= 8) {
    return "suspicious";
  }
  if (normalized === "medium" || numericScore >= 5) {
    return "watch";
  }
  return "benign";
}

function recordRefKeys(record) {
  const refs = [];
  for (const key of ["actor", "subject", "target"]) {
    const normalized = normalizeRef(record?.[key], key);
    if (normalized) {
      refs.push(refKey(normalized));
    }
  }
  return refs;
}

function recordEdgeKeys(record) {
  const refs = recordRefKeys(record);
  const actorKey = refs[0] || "";
  const subjectKey = refs[1] || "";
  const targetKey = refs[2] || "";
  const edgeKeys = [];
  if (record?.kind === "action_manifest") {
    if (actorKey && targetKey && actorKey !== targetKey) {
      edgeKeys.push(`${actorKey}=>${targetKey}`);
    }
    return edgeKeys;
  }
  if (actorKey && subjectKey && actorKey !== subjectKey) {
    edgeKeys.push(`${actorKey}=>${subjectKey}`);
  }
  if (subjectKey && targetKey && subjectKey !== targetKey) {
    edgeKeys.push(`${subjectKey}=>${targetKey}`);
  } else if (actorKey && targetKey && actorKey !== targetKey) {
    edgeKeys.push(`${actorKey}=>${targetKey}`);
  }
  return edgeKeys;
}

function buildDiffReportMarkdown(snapshot, query = {}) {
  const compare = snapshot?.compare || null;
  const diff = compare?.diff || null;
  const lines = [
    "# Asolaria Graph Runtime Diff Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Window: ${snapshot?.windowMinutes || 0} minutes`,
    `Current slice latest: ${snapshot?.latestAt || snapshot?.generatedAt || "unknown"}`,
    `Component filter: ${query.component || "all"}`,
    `Action filter: ${query.action || "all"}`,
    `Minimum risk: ${query.minRisk || "all"}`,
    `Include low risk: ${query.includeLowRisk ? "yes" : "no"}`,
    ""
  ];

  if (!diff?.compareEnabled) {
    lines.push("No compare baseline is active for this slice.");
    return lines.join("\n");
  }

  lines.push(
    `Baseline: ${compare?.effectiveCutoffAt || "unknown"}`,
    "",
    "## Diff Summary",
    "",
    `- Added nodes: ${diff.summary?.addedNodes || 0}`,
    `- Removed nodes: ${diff.summary?.removedNodes || 0}`,
    `- Changed nodes: ${diff.summary?.changedNodes || 0}`,
    `- Added edges: ${diff.summary?.addedEdges || 0}`,
    `- Removed edges: ${diff.summary?.removedEdges || 0}`,
    `- Changed edges: ${diff.summary?.changedEdges || 0}`,
    ""
  );

  const suspiciousEdges = Array.isArray(snapshot?.insights?.suspiciousEdges) ? snapshot.insights.suspiciousEdges : [];
  if (suspiciousEdges.length) {
    lines.push("## Suspicious Edges", "");
    for (const edge of suspiciousEdges.slice(0, 8)) {
      lines.push(
        `- ${edge.sourceLabel} -> ${edge.targetLabel} | score ${edge.suspiciousScore} | ${edge.maxRiskLevel} | ${edge.primaryComponent || "unknown"}`
      );
    }
    lines.push("");
  }

  const archetypes = Array.isArray(snapshot?.insights?.archetypes) ? snapshot.insights.archetypes : [];
  if (archetypes.length) {
    lines.push("## Archetypes", "");
    for (const item of archetypes.slice(0, 8)) {
      lines.push(`- ${item.value}: ${item.count}`);
    }
    lines.push("");
  }

  const sections = [
    ["Added Edges", diff.addedEdges, (item) => `${item.source} -> ${item.target} | ${item.primaryComponent || "unknown"} | ${item.maxRiskLevel} | count ${item.count}`],
    ["Changed Edges", diff.changedEdges, (item) => `${item.source} -> ${item.target} | count ${item.countDelta >= 0 ? "+" : ""}${item.countDelta} | ${item.riskFrom} -> ${item.riskTo}`],
    ["Removed Edges", diff.removedEdges, (item) => `${item.source} -> ${item.target} | ${item.primaryComponent || "unknown"} | ${item.maxRiskLevel} | count ${item.count}`],
    ["Added Nodes", diff.addedNodes, (item) => `${item.label} | ${item.type} | ${item.primaryComponent || "unknown"} | ${item.maxRiskLevel}`],
    ["Changed Nodes", diff.changedNodes, (item) => `${item.label} | count ${item.countDelta >= 0 ? "+" : ""}${item.countDelta} | ${item.riskFrom} -> ${item.riskTo}`],
    ["Removed Nodes", diff.removedNodes, (item) => `${item.label} | ${item.type} | ${item.primaryComponent || "unknown"} | ${item.maxRiskLevel}`]
  ];

  for (const [title, items, formatter] of sections) {
    if (!Array.isArray(items) || !items.length) continue;
    lines.push(`## ${title}`, "");
    for (const item of items.slice(0, 12)) {
      lines.push(`- ${formatter(item)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function normalizeRef(ref = {}, fallbackType = "unknown") {
  if (!ref || typeof ref !== "object") return null;
  const type = String(ref.type || fallbackType).trim().toLowerCase() || fallbackType;
  const id = String(ref.id || ref.label || "").trim();
  const label = String(ref.label || ref.id || type).trim() || type;
  if (!id && !label) return null;
  return {
    type,
    id: id || label,
    label,
    domain: String(ref.domain || "").trim().toLowerCase(),
    criticality: String(ref.criticality || "").trim().toLowerCase()
  };
}

function refKey(ref) {
  if (!ref) return "";
  return `${ref.type}:${ref.id}`;
}

function touchNode(nodeMap, ref, role, record) {
  const normalized = normalizeRef(ref);
  if (!normalized) return "";
  const key = refKey(normalized);
  const riskScore = Number(record?.risk?.score || 0);
  const existing = nodeMap.get(key) || {
    id: key,
    type: normalized.type,
    entityId: normalized.id,
    label: normalized.label,
    domain: normalized.domain || "",
    criticality: normalized.criticality || "",
    roles: new Set(),
    componentCounts: new Map(),
    count: 0,
    degree: 0,
    maxRiskScore: 0,
    maxRiskLevel: "low",
    lastSeen: ""
  };
  existing.label = existing.label || normalized.label;
  existing.domain = existing.domain || normalized.domain || "";
  existing.criticality = existing.criticality || normalized.criticality || "";
  existing.roles.add(role);
  const component = String(record?.component || "").trim() || "unknown";
  existing.componentCounts.set(component, (existing.componentCounts.get(component) || 0) + 1);
  existing.count += 1;
  existing.lastSeen = String(record?.at || record?.createdAt || existing.lastSeen || "");
  if (riskScore >= existing.maxRiskScore) {
    existing.maxRiskScore = riskScore;
    existing.maxRiskLevel = String(record?.risk?.level || existing.maxRiskLevel || "low");
  }
  nodeMap.set(key, existing);
  return key;
}

function touchEdge(edgeMap, nodeMap, sourceKey, targetKey, payload) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return;
  const key = `${sourceKey}=>${targetKey}`;
  const riskScore = Number(payload?.risk?.score || 0);
  const existing = edgeMap.get(key) || {
    id: key,
    source: sourceKey,
    target: targetKey,
    count: 0,
    maxRiskScore: 0,
    maxRiskLevel: "low",
    actions: new Set(),
    components: new Set(),
    componentCounts: new Map(),
    kinds: new Set(),
    lastSeen: ""
  };
  existing.count += 1;
  existing.actions.add(String(payload?.action || payload?.category || "event").trim() || "event");
  const component = String(payload?.component || "unknown").trim() || "unknown";
  existing.components.add(component);
  existing.componentCounts.set(component, (existing.componentCounts.get(component) || 0) + 1);
  existing.kinds.add(String(payload?.kind || "graph_event").trim() || "graph_event");
  existing.lastSeen = String(payload?.at || payload?.createdAt || existing.lastSeen || "");
  if (riskScore >= existing.maxRiskScore) {
    existing.maxRiskScore = riskScore;
    existing.maxRiskLevel = String(payload?.risk?.level || existing.maxRiskLevel || "low");
  }
  edgeMap.set(key, existing);
  const sourceNode = nodeMap.get(sourceKey);
  const targetNode = nodeMap.get(targetKey);
  if (sourceNode) sourceNode.degree += 1;
  if (targetNode) targetNode.degree += 1;
}

function buildGraph(events, manifests, options = {}) {
  const maxNodes = clampInteger(options.maxNodes, 8, 180, 48);
  const maxEdges = clampInteger(options.maxEdges, 8, 320, 120);
  const nodeMap = new Map();
  const edgeMap = new Map();

  for (const event of events) {
    const actorKey = touchNode(nodeMap, event.actor, "actor", event);
    const subjectKey = touchNode(nodeMap, event.subject, "subject", event);
    const targetKey = touchNode(nodeMap, event.target, "target", event);
    if (actorKey && subjectKey && actorKey !== subjectKey) {
      touchEdge(edgeMap, nodeMap, actorKey, subjectKey, event);
    }
    if (subjectKey && targetKey && subjectKey !== targetKey) {
      touchEdge(edgeMap, nodeMap, subjectKey, targetKey, event);
    } else if (actorKey && targetKey && actorKey !== targetKey) {
      touchEdge(edgeMap, nodeMap, actorKey, targetKey, event);
    }
  }

  for (const manifest of manifests) {
    const actorKey = touchNode(nodeMap, manifest.actor, "actor", manifest);
    const targetKey = touchNode(nodeMap, manifest.target, "target", manifest);
    if (actorKey && targetKey && actorKey !== targetKey) {
      touchEdge(edgeMap, nodeMap, actorKey, targetKey, manifest);
    }
  }

  const sortedNodes = Array.from(nodeMap.values())
    .sort((a, b) =>
      b.maxRiskScore - a.maxRiskScore
      || b.degree - a.degree
      || b.count - a.count
      || String(a.label || "").localeCompare(String(b.label || ""))
    )
    .slice(0, maxNodes)
    .map((node) => {
      const { roles, componentCounts, ...rest } = node;
      const rankedComponents = mapCountsToSortedList(componentCounts, 6);
      return {
        ...rest,
        roles: Array.from(roles).sort(),
        components: rankedComponents,
        primaryComponent: rankedComponents[0]?.value || "unknown"
      };
    });

  const allowed = new Set(sortedNodes.map((node) => node.id));
  const sortedEdges = Array.from(edgeMap.values())
    .filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
    .sort((a, b) =>
      b.maxRiskScore - a.maxRiskScore
      || b.count - a.count
      || safeTimestamp(b.lastSeen) - safeTimestamp(a.lastSeen)
    )
    .slice(0, maxEdges)
    .map((edge) => {
      const { actions, kinds, componentCounts, components, ...rest } = edge;
      const rankedComponents = mapCountsToSortedList(componentCounts, 6);
      return {
        ...rest,
        actions: Array.from(actions).sort().slice(0, 6),
        components: rankedComponents,
        primaryComponent: rankedComponents[0]?.value || "unknown",
        kinds: Array.from(kinds).sort()
      };
    });

  return {
    nodes: sortedNodes,
    edges: sortedEdges
  };
}

function filterRuntimeRecords(items, options = {}) {
  const componentFilter = String(options.component || "").trim().toLowerCase();
  const actionFilter = String(options.action || "").trim().toLowerCase();
  const minRisk = String(options.minRisk || "").trim().toLowerCase();
  const cutoffAtMs = safeTimestamp(options.cutoffAt);
  return items.filter((item) => {
    const component = String(item?.component || "").trim().toLowerCase();
    const action = String(item?.action || "").trim().toLowerCase();
    const riskLevel = String(item?.risk?.level || "").trim().toLowerCase();
    const occurredAt = safeTimestamp(item?.at || item?.createdAt);
    if (componentFilter && component !== componentFilter) return false;
    if (actionFilter && action !== actionFilter) return false;
    if (minRisk && levelRank(riskLevel) < levelRank(minRisk)) return false;
    if (cutoffAtMs && occurredAt > cutoffAtMs) return false;
    return true;
  });
}

function listGraphRuntimeRecords(options = {}) {
  const windowMinutes = clampInteger(options.windowMinutes, 1, 7 * 24 * 60, 360);
  const sinceMs = Date.now() - (windowMinutes * 60 * 1000);
  const includeLowRisk = Boolean(options.includeLowRisk);
  const maxEventLines = clampInteger(options.maxEventLines, 100, 20000, 8000);
  const maxManifestLines = clampInteger(options.maxManifestLines, 100, 20000, 4000);
  const rawEvents = readNdjson(graphRuntimeEventsPath, maxEventLines);
  const rawManifests = readNdjson(graphRuntimeManifestsPath, maxManifestLines);
  const windowEvents = tailLimit(
    filterLowRisk(
      filterByWindow(rawEvents, "at", sinceMs),
      includeLowRisk
    ),
    options.eventLimit || 400
  );
  const windowManifests = tailLimit(
    filterLowRisk(
      filterByWindow(rawManifests, "createdAt", sinceMs),
      includeLowRisk
    ),
    options.manifestLimit || 200
  );
  const events = filterRuntimeRecords(windowEvents, options);
  const manifests = filterRuntimeRecords(windowManifests, options);
  return {
    windowMinutes,
    sinceMs,
    includeLowRisk,
    rawCounts: {
      events: rawEvents.length,
      manifests: rawManifests.length
    },
    timeline: {
      earliestAt: [earliestTimestamp(windowEvents, "at"), earliestTimestamp(windowManifests, "createdAt")]
        .filter(Boolean)
        .reduce((min, value) => (min && min < value ? min : value), 0),
      latestAt: Math.max(latestTimestamp(windowEvents, "at"), latestTimestamp(windowManifests, "createdAt"))
    },
    available: {
      components: uniqueSorted([...windowEvents, ...windowManifests], (item) => item?.component),
      actions: uniqueSorted([...windowEvents, ...windowManifests], (item) => item?.action),
      riskLevels: ["low", "medium", "high", "critical"]
    },
    filtersApplied: {
      component: String(options.component || "").trim(),
      action: String(options.action || "").trim(),
      minRisk: String(options.minRisk || "").trim(),
      cutoffAt: safeTimestamp(options.cutoffAt) > 0 ? new Date(safeTimestamp(options.cutoffAt)).toISOString() : ""
    },
    events,
    manifests
  };
}

function buildGraphRuntimeSnapshot(options = {}) {
  const {
    windowMinutes,
    includeLowRisk,
    rawCounts,
    timeline,
    available,
    filtersApplied,
    events,
    manifests
  } = listGraphRuntimeRecords(options);
  const latestVisibleAt = Math.max(
    0,
    ...events.map((item) => safeTimestamp(item.at)),
    ...manifests.map((item) => safeTimestamp(item.createdAt))
  );
  const earliestVisibleAt = [
    earliestTimestamp(events, "at"),
    earliestTimestamp(manifests, "createdAt")
  ].filter(Boolean).reduce((min, value) => (min && min < value ? min : value), 0);
  const graph = annotateGraphFreshness(
    buildGraph(events, manifests, options),
    latestVisibleAt || safeTimestamp(timeline.latestAt),
    earliestVisibleAt || safeTimestamp(timeline.earliestAt)
  );
  const recentEvents = tailLimit(events, options.recentEventLimit || 25).reverse();
  const recentManifests = tailLimit(manifests, options.recentManifestLimit || 15).reverse();
  const latestAt = latestVisibleAt;
  const recordsForAnalysis = [...events, ...manifests];
  const activity = buildActivityTimeline(events, manifests, {
    bucketCount: options.timelineBuckets
  });
  const compareRequestedMs = safeTimestamp(options.compareCutoffAt);
  const currentRequestedMs = safeTimestamp(filtersApplied.cutoffAt);
  let compare = null;
  if (compareRequestedMs > 0) {
    const ceilingMs = currentRequestedMs || safeTimestamp(timeline.latestAt);
    const effectiveCompareMs = ceilingMs > 0 ? Math.min(compareRequestedMs, ceilingMs) : compareRequestedMs;
    const baselineOptions = {
      ...options,
      compareCutoffAt: undefined,
      cutoffAt: new Date(effectiveCompareMs).toISOString()
    };
    const baselineRecords = listGraphRuntimeRecords(baselineOptions);
    const baselineLatestAt = Math.max(
      0,
      ...baselineRecords.events.map((item) => safeTimestamp(item.at)),
      ...baselineRecords.manifests.map((item) => safeTimestamp(item.createdAt))
    );
    const baselineEarliestAt = [
      earliestTimestamp(baselineRecords.events, "at"),
      earliestTimestamp(baselineRecords.manifests, "createdAt")
    ].filter(Boolean).reduce((min, value) => (min && min < value ? min : value), 0);
    const baselineGraph = annotateGraphFreshness(
      buildGraph(baselineRecords.events, baselineRecords.manifests, baselineOptions),
      baselineLatestAt || effectiveCompareMs,
      baselineEarliestAt || safeTimestamp(timeline.earliestAt)
    );
    compare = {
      requestedCutoffAt: new Date(compareRequestedMs).toISOString(),
      effectiveCutoffAt: new Date(effectiveCompareMs).toISOString(),
      baselineCounts: {
        events: baselineRecords.events.length,
        manifests: baselineRecords.manifests.length,
        nodes: baselineGraph.nodes.length,
        edges: baselineGraph.edges.length
      },
      diff: buildGraphDiff(graph, baselineGraph)
    };
  }
  const suspiciousEdges = buildSuspiciousEdges(graph, 10);
  const archetypes = summarizeArchetypes(recordsForAnalysis, 10);
  const prototypeLane = buildPrototypeLane(suspiciousEdges, 10);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    windowMinutes,
    includeLowRisk,
    rangeStart: new Date(Date.now() - (windowMinutes * 60 * 1000)).toISOString(),
    latestAt: latestAt > 0 ? new Date(latestAt).toISOString() : "",
    timeline: {
      earliestAt: timeline.earliestAt > 0 ? new Date(timeline.earliestAt).toISOString() : "",
      latestAt: timeline.latestAt > 0 ? new Date(timeline.latestAt).toISOString() : ""
    },
    available,
    filtersApplied,
    counts: {
      storedEvents: rawCounts.events,
      storedManifests: rawCounts.manifests,
      visibleEvents: events.length,
      visibleManifests: manifests.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length
    },
    risk: {
      events: summarizeLevels(events),
      manifests: summarizeLevels(manifests)
    },
    breakdown: {
      eventComponents: summarizeByKey(events, "component"),
      eventActions: summarizeByKey(events, "action"),
      manifestActions: summarizeByKey(manifests, "action")
    },
    activity,
    compare,
    insights: {
      archetypes,
      suspiciousEdges,
      prototypeLane
    },
    recent: {
      events: recentEvents,
      manifests: recentManifests
    },
    records: {
      events,
      manifests
    },
    graph
  };
}

function buildGraphRuntimeDiffReport(options = {}) {
  const snapshot = buildGraphRuntimeSnapshot(options);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    query: {
      windowMinutes: snapshot.windowMinutes,
      includeLowRisk: snapshot.includeLowRisk,
      component: snapshot?.filtersApplied?.component || "",
      action: snapshot?.filtersApplied?.action || "",
      minRisk: snapshot?.filtersApplied?.minRisk || "",
      cutoffAt: snapshot?.filtersApplied?.cutoffAt || "",
      compareCutoffAt: snapshot?.compare?.effectiveCutoffAt || ""
    },
    markdown: buildDiffReportMarkdown(snapshot, {
      includeLowRisk: snapshot.includeLowRisk,
      component: snapshot?.filtersApplied?.component || "",
      action: snapshot?.filtersApplied?.action || "",
      minRisk: snapshot?.filtersApplied?.minRisk || ""
    }),
    snapshot
  };
}

function buildGraphRuntimeTrainingDataset(options = {}) {
  const snapshot = buildGraphRuntimeSnapshot(options);
  const suspiciousEdgeMap = new Map(
    (Array.isArray(snapshot?.insights?.suspiciousEdges) ? snapshot.insights.suspiciousEdges : [])
      .map((edge) => [edge.id, edge])
  );
  const prototypeMap = new Map(
    (Array.isArray(snapshot?.insights?.prototypeLane?.matches) ? snapshot.insights.prototypeLane.matches : [])
      .map((match) => [match.edgeId, match])
  );
  const nodes = (snapshot?.graph?.nodes || []).map((node) => ({
    id: node.id,
    type: node.type,
    entityId: node.entityId,
    label: node.label,
    domain: node.domain || "",
    criticality: node.criticality || "",
    degree: node.degree || 0,
    count: node.count || 0,
    roles: Array.isArray(node.roles) ? node.roles : [],
    primaryComponent: node.primaryComponent || "unknown",
    maxRiskLevel: node.maxRiskLevel || "unknown",
    maxRiskScore: Number(node.maxRiskScore || 0),
    freshness: Number(node.freshness || 0),
    freshnessBand: node.freshnessBand || "unknown"
  }));
  const edgeSamples = (snapshot?.graph?.edges || []).map((edge) => {
    const suspicious = suspiciousEdgeMap.get(edge.id) || null;
    const prototype = prototypeMap.get(edge.id) || null;
    return {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      primaryComponent: edge.primaryComponent || "unknown",
      kinds: Array.isArray(edge.kinds) ? edge.kinds : [],
      actions: Array.isArray(edge.actions) ? edge.actions : [],
      count: edge.count || 0,
      maxRiskLevel: edge.maxRiskLevel || "unknown",
      maxRiskScore: Number(edge.maxRiskScore || 0),
      freshness: Number(edge.freshness || 0),
      freshnessBand: edge.freshnessBand || "unknown",
      suspiciousScore: Number(suspicious?.suspiciousScore || edge.maxRiskScore || 0),
      archetypeTags: Array.isArray(suspicious?.tags) ? suspicious.tags : [],
      prototypeId: prototype?.bestPrototype?.id || "",
      prototypeLabel: prototype?.bestPrototype?.label || "",
      prototypeSimilarity: Number(prototype?.bestPrototype?.similarity || 0),
      pseudoLabel: classifyRiskLabel(edge.maxRiskLevel, suspicious?.suspiciousScore || edge.maxRiskScore || 0)
    };
  });
  const recordSamples = [
    ...(snapshot?.records?.events || []),
    ...(snapshot?.records?.manifests || [])
  ].map((record) => ({
    recordId: record.id,
    kind: record.kind,
    at: record.at || record.createdAt || "",
    component: record.component || "unknown",
    category: record.category || "",
    action: record.action || "",
    status: record.status || "",
    actor: normalizeRef(record.actor, "actor"),
    subject: normalizeRef(record.subject, "subject"),
    target: normalizeRef(record.target, "target"),
    refKeys: recordRefKeys(record),
    edgeKeys: recordEdgeKeys(record),
    riskLevel: record?.risk?.level || "unknown",
    riskScore: Number(record?.risk?.score || 0),
    approvalState: record?.policy?.approvalState || "",
    archetypeTags: describeArchetypesForRecord(record),
    pseudoLabel: classifyRiskLabel(record?.risk?.level, record?.risk?.score)
  }));

  const pseudoLabels = recordSamples.reduce((counts, sample) => {
    counts[sample.pseudoLabel] = (counts[sample.pseudoLabel] || 0) + 1;
    return counts;
  }, {});

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    note: "Pseudo-labeled read-only export for offline graph-runtime experiments. Not for online policy decisions.",
    slice: {
      windowMinutes: snapshot.windowMinutes,
      includeLowRisk: snapshot.includeLowRisk,
      latestAt: snapshot.latestAt || snapshot.generatedAt,
      filtersApplied: snapshot.filtersApplied || {}
    },
    stats: {
      nodes: nodes.length,
      edgeSamples: edgeSamples.length,
      recordSamples: recordSamples.length,
      pseudoLabels
    },
    nodes,
    edgeSamples,
    recordSamples
  };
}

module.exports = {
  buildGraphRuntimeSnapshot,
  listGraphRuntimeRecords,
  buildGraphRuntimeDiffReport,
  buildGraphRuntimeTrainingDataset
};
