// Item 051 · Agent recycler · closes stale workers via /type+enter
// Honors feedback_reprobe_pid_before_kick + feedback_never_steal_foreground

const { transition, STATES } = require("./lifecycle.js");

async function recycleAgent(agent, typeKick /* injected: (text, pid) => Promise */) {
  if (!agent.pid) throw new Error("recycleAgent: no pid on agent");
  // Step 1: send /exit to let the agent flush its log
  await typeKick("/exit", agent.pid);
  await new Promise(r => setTimeout(r, 2000));
  const t = transition(agent, STATES.RECYCLE);
  return { agent: t.agent, envelope: t.envelope };
}

module.exports = { recycleAgent };
