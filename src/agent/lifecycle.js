// Item 048 · Agent lifecycle states + transition rules

const STATES = Object.freeze({
  SPAWN:   "SPAWN",
  RUN:     "RUN",
  PAUSE:   "PAUSE",
  RECYCLE: "RECYCLE",
  CLOSE:   "CLOSE",
});

// Allowed transitions per state (directed graph).
const TRANSITIONS = {
  SPAWN:   ["RUN", "CLOSE"],
  RUN:     ["PAUSE", "RECYCLE", "CLOSE"],
  PAUSE:   ["RUN", "RECYCLE", "CLOSE"],
  RECYCLE: ["SPAWN", "CLOSE"],
  CLOSE:   [],
};

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

function transition(agent, to) {
  if (!canTransition(agent.state, to)) {
    throw new Error(`invalid transition ${agent.state} → ${to}`);
  }
  const from = agent.state;
  agent.state = to;
  agent.state_history = agent.state_history || [];
  agent.state_history.push({ from, to, ts: new Date().toISOString() });
  return { agent, envelope: {
    kind: `EVT-AGENT-${to}`,
    body: { named_agent: agent.named_agent, from, to, ts: new Date().toISOString() },
  }};
}

module.exports = { STATES, TRANSITIONS, canTransition, transition };
