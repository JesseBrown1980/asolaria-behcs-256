// Item 082 · /drift.report on :4947 (piggy-backs LAW-001 primary — bus endpoint multiplexes)
// Called via POST /drift.report with a drift envelope body.

const http = require("node:http");
const { handleDrift } = require("./halt-handler.js");
const { broadcastDrift } = require("./broadcast.js");

const PORT = Number(process.env.ASOLARIA_DRIFT_PORT || 4947);

// Default sender: local no-op echo (real dispatcher wires into bus-and-kick + whatsapp + sms + adb)
async function defaultSend(target, envelope) {
  return { ok: true, target, echoed: envelope.kind };
}

function startServer({ sendFn = defaultSend } = {}) {
  const srv = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/drift.report") {
      let body = ""; req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const env = JSON.parse(body || "{}");
          const drift = env.body || {};
          const r = await handleDrift(drift, sendFn);
          res.end(JSON.stringify({ ok: true, result: r }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "not-found" }));
  });
  // Note: :4947 is LAW-001 primary; real integration mounts this as a route, not a separate listener.
  // This standalone listener is for dev-only.
  return srv;
}

module.exports = { startServer, PORT, defaultSend };
