// Item 043 · HTTP :4951 /llm/complete endpoint (non-LAW port, outside 4947/4950 rule)

const http = require("node:http");
const mux = require("./mux.js");
const router = require("./router.js");

const PORT = Number(process.env.ASOLARIA_LLM_PORT || 4951);

function startServer() {
  const srv = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, service: "asolaria-llm-mux", port: PORT, ts: new Date().toISOString() }));
      return;
    }
    if (req.method === "POST" && req.url === "/llm/complete") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const j = JSON.parse(body || "{}");
          const r = await router.complete(j);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(r));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "not-found", routes: ["/health", "POST /llm/complete"] }));
  });
  srv.listen(PORT, "127.0.0.1", () => console.log(`[llm-server] listening :${PORT}`));
  return srv;
}

module.exports = { startServer, PORT };
if (require.main === module) startServer();
