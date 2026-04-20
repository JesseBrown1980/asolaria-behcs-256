// Item 057 · /agent.list /agent.spawn /agent.close HTTP endpoints (:4952)

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawnAgent } = require("./spawner.js");
const { recycleAgent } = require("./recycler.js");
const { probeNamedAgentRunning } = require("./probe.js");
const { bindCheck } = require("./bind-check.js");

const PORT = Number(process.env.ASOLARIA_AGENT_PORT || 4952);
const REGISTRY_PATH = process.env.ASOLARIA_AGENT_REGISTRY || path.join(__dirname, "../../data/agent-registry.json");

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")); }
  catch { return { agents: {} }; }
}
function saveRegistry(r) { fs.writeFileSync(REGISTRY_PATH, JSON.stringify(r, null, 2)); }

function startServer() {
  const srv = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/agent.list") {
      return res.end(JSON.stringify(loadRegistry()));
    }
    if (req.method === "POST" && req.url === "/agent.spawn") {
      let body = ""; req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const profile = JSON.parse(body || "{}");
          const bc = bindCheck(profile);
          if (!bc.ok) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: "bind-check-fail", bc })); }
          const p = await probeNamedAgentRunning(profile.named_agent);
          if (p.running) { res.statusCode = 409; return res.end(JSON.stringify({ ok: false, error: "already-running", pids: p.pids })); }
          const sp = spawnAgent(profile);
          const reg = loadRegistry();
          reg.agents[profile.named_agent] = { ...sp.agent };
          saveRegistry(reg);
          res.end(JSON.stringify({ ok: true, agent: sp.agent, envelope: sp.envelope }));
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e.message || e) })); }
      });
      return;
    }
    if (req.method === "POST" && req.url === "/agent.close") {
      let body = ""; req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const { named_agent } = JSON.parse(body || "{}");
          const reg = loadRegistry();
          const agent = reg.agents[named_agent];
          if (!agent) { res.statusCode = 404; return res.end(JSON.stringify({ ok: false, error: "not-registered" })); }
          // Operator-provided typeKick in prod; stub here:
          const stubKick = async () => {};
          const r = await recycleAgent(agent, stubKick);
          reg.agents[named_agent] = r.agent;
          saveRegistry(reg);
          res.end(JSON.stringify({ ok: true, agent: r.agent, envelope: r.envelope }));
        } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e.message || e) })); }
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "not-found", routes: ["GET /agent.list", "POST /agent.spawn", "POST /agent.close"] }));
  });
  srv.listen(PORT, "127.0.0.1", () => console.log(`[agent-server] :${PORT}`));
  return srv;
}

module.exports = { startServer, PORT };
if (require.main === module) startServer();
