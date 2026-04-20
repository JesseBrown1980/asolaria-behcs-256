// Item 050 · Agent spawner · reads profile + launches worker

const { spawn } = require("node:child_process");
const { transition, STATES } = require("./lifecycle.js");

function spawnAgent(profile, { cwd = process.cwd(), env = {} } = {}) {
  const { named_agent, role, tools, limits = {} } = profile;
  if (!named_agent) throw new Error("spawnAgent: named_agent required");
  const launcherCmd = profile.launcher_cmd || "node";
  const launcherArgs = profile.launcher_args || ["--version"]; // caller should override
  const cp = spawn(launcherCmd, launcherArgs, {
    cwd,
    env: { ...process.env, ASOLARIA_NAMED_AGENT: named_agent, ASOLARIA_ROLE: role, ...env },
    shell: false, windowsHide: true, detached: true, stdio: "ignore",
  });
  cp.unref();
  const agent = {
    named_agent, role, tools, limits,
    pid: cp.pid, state: STATES.SPAWN,
    spawned_at: new Date().toISOString(),
    device_binding: profile.device_binding || null,
    room: profile.room || null,
  };
  const t = transition(agent, STATES.RUN);
  return { agent: t.agent, envelope: t.envelope };
}

module.exports = { spawnAgent };
