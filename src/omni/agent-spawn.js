// Item 147 · omni.agent.spawn · probe + bind-check + spawn

const { spawnAgent } = require("../agent/spawner.js");
const { probeNamedAgentRunning } = require("../agent/probe.js");
const { bindCheck } = require("../agent/bind-check.js");

async function omniAgentSpawn(profile) {
  const bc = bindCheck(profile);
  if (!bc.ok) return { ok: false, reason: "bind-check-fail", detail: bc };
  const p = await probeNamedAgentRunning(profile.named_agent);
  if (p.running) return { ok: false, reason: "already-running", pids: p.pids };
  const res = spawnAgent(profile);
  return { ok: true, agent: res.agent, envelope: res.envelope };
}

module.exports = { omniAgentSpawn };
