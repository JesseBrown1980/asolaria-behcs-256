// Item 190 · Agent Console → agent manager bridge

async function listAgents({ agentUrl = "http://127.0.0.1:4952" } = {}) {
  const r = await fetch(`${agentUrl}/agent.list`, { signal: AbortSignal.timeout(5000) });
  return r.json();
}

async function spawnAgent(profile, { agentUrl = "http://127.0.0.1:4952" } = {}) {
  const r = await fetch(`${agentUrl}/agent.spawn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

async function closeAgent(named_agent, { agentUrl = "http://127.0.0.1:4952" } = {}) {
  const r = await fetch(`${agentUrl}/agent.close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ named_agent }),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

module.exports = { listAgents, spawnAgent, closeAgent };
