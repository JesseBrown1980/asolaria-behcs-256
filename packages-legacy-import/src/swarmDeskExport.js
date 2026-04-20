const fs = require("fs");
const path = require("path");
const { projectRoot } = require("./runtimePaths");

const REPORT_ROOT = path.join(projectRoot, "reports", "super-swarm");
const BASELINE_PATH = path.join(REPORT_ROOT, "2026-03-12-super-swarm-baseline.md");
const GRAPH_PATH = path.join(REPORT_ROOT, "2026-03-12-super-swarm-graph.json");
const POLL_PATH = path.join(REPORT_ROOT, "2026-03-12-super-swarm-agent-poll.json");

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function clipText(value, maxChars = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function buildAssistantMessages(payload) {
  const graph = payload.graph && typeof payload.graph === "object" ? payload.graph : {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const worldState = payload.worldState && typeof payload.worldState === "object" ? payload.worldState : {};
  const worldSummary = worldState.summary && typeof worldState.summary === "object" ? worldState.summary : {};
  const districts = Array.isArray(worldState.districts) ? worldState.districts : [];
  const topDistricts = districts
    .filter((item) => Number(item?.count || 0) > 0)
    .slice(0, 5)
    .map((item) => `- ${item.label}: ${Number(item.count || 0)} entities`);
  const poll = payload.agentPoll && typeof payload.agentPoll === "object" ? payload.agentPoll : {};
  const responses = Array.isArray(poll.responses) ? poll.responses : [];
  const connectedNodes = nodes.filter((node) => node && node.status && !String(node.status).includes("failed"));
  const pollLines = responses.map((row) => {
    const bullets = Array.isArray(row.summary) ? row.summary.join(" | ") : "";
    return `- ${row.agent} (${row.role}, ${row.status}): ${bullets}`;
  });
  const observations = Array.isArray(graph.observations) ? graph.observations : [];

  const userContent = [
    "Sync Asolaria into SwarmDesk as a first-class tracked civilization and entity graph.",
    "",
    "Verified live world snapshot:",
    `- Graph nodes: ${nodes.length}`,
    `- Graph edges: ${edges.length}`,
    `- Connected graph nodes: ${connectedNodes.length}`,
    `- World entities: ${Number(worldSummary.entities || 0)}`,
    `- Agents: ${Number(worldSummary.agents || 0)}`,
    `- Towers: ${Number(worldSummary.towers || 0)}`,
    `- Gates: ${Number(worldSummary.gates || 0)}`,
    `- Packets: ${Number(worldSummary.packets || 0)}`,
    `- Routes: ${Number(worldSummary.routes || 0)}`,
    "",
    "District counts:",
    ...topDistricts,
    "",
    "Verified observations:",
    ...observations.map((item) => `- ${item}`),
    "",
    "Verified agent guidance:",
    ...pollLines,
    "",
    "Required outcome:",
    "- render Asolaria as a civilization with sovereign core, agents, guardian towers, gates, packets, and routes",
    "- make the live runtime the source for visible world state instead of static placeholders",
    "- stop treating Omnispindle as the only code-city source",
    "- preserve provenance across Codex, Claude Code, Gemini, and bridge lanes",
    "",
    "Use this as an integration brief, not a brainstorming prompt."
  ].join("\n");

  return [
    {
      role: "system",
      content: "You are the trusted MadnessInteractive assistant. Consume the verified Asolaria runtime export and help integrate it into SwarmDesk without inventing missing state."
    },
    {
      role: "user",
      content: userContent
    }
  ];
}

function buildSwarmDeskExportPayload(options = {}) {
  const trustedEntities = options.trustedEntities && typeof options.trustedEntities === "object"
    ? options.trustedEntities
    : null;
  const graph = options.graph && typeof options.graph === "object"
    ? options.graph
    : safeReadJson(GRAPH_PATH) || {};
  const agentPoll = options.agentPoll && typeof options.agentPoll === "object"
    ? options.agentPoll
    : safeReadJson(POLL_PATH) || {};
  const worldState = options.worldState && typeof options.worldState === "object"
    ? options.worldState
    : null;
  const baseline = options.baselineText !== undefined
    ? String(options.baselineText || "")
    : safeReadText(BASELINE_PATH);
  const summary = {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edges: Array.isArray(graph.edges) ? graph.edges.length : 0,
    agentResponses: Array.isArray(agentPoll.responses) ? agentPoll.responses.length : 0,
    trustedEntities: Array.isArray(trustedEntities?.entities) ? trustedEntities.entities.length : 0,
    worldEntities: Number(worldState?.summary?.entities || 0) || 0,
    worldRoutes: Number(worldState?.summary?.routes || 0) || 0
  };
  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: "asolaria_super_swarm_export",
    summary,
    files: {
      baselinePath: BASELINE_PATH,
      graphPath: GRAPH_PATH,
      agentPollPath: POLL_PATH
    },
    trustedEntities,
    worldState,
    graph,
    agentPoll,
    baselinePreview: clipText(baseline, 900)
  };
  payload.assistantSync = {
    baseUrl: "https://madnessinteractive.cc",
    authRequired: true,
    endpoints: {
      providerConfig: "/api/ai-provider-keys",
      chatCompletion: "/api/ai/chat-completion",
      mcp: "/api/mcp"
    },
    messages: buildAssistantMessages(payload)
  };
  return payload;
}

module.exports = {
  buildSwarmDeskExportPayload,
  BASELINE_PATH,
  GRAPH_PATH,
  POLL_PATH
};
