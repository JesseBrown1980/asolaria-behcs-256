#!/usr/bin/env node
/**
 * Gaia↔Liris Direct Bridge
 * Simple HTTP message exchange. No bots, no relay, no MQTT.
 * Gaia runs this on Jesse's machine. Liris POSTs messages to it.
 *
 * Start: node tools/gaia-liris-bridge.js
 * Liris sends: curl -X POST http://192.168.1.3:4799/msg -H "Content-Type: application/json" -d '{"from":"liris","text":"hello"}'
 * Liris reads: curl http://192.168.1.3:4799/read?for=liris
 * Gaia sends: curl -X POST http://127.0.0.1:4799/msg -H "Content-Type: application/json" -d '{"from":"gaia","text":"hello"}'
 * Gaia reads: curl http://127.0.0.1:4799/read?for=gaia
 */
const http = require("http");
const PORT = 4799;
const messages = { gaia: [], liris: [] };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "POST" && url.pathname === "/msg") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        const from = String(msg.from || "").trim();
        const text = String(msg.text || "").trim();
        const target = from === "gaia" ? "liris" : "gaia";
        const entry = { from, text, ts: new Date().toISOString() };
        if (!messages[target]) messages[target] = [];
        messages[target].push(entry);
        console.log(`[${from}→${target}] ${text.substring(0, 100)}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, queued: messages[target].length }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/read") {
    const target = url.searchParams.get("for") || "gaia";
    const queue = messages[target] || [];
    messages[target] = [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, messages: queue, count: queue.length }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, gaia: messages.gaia.length, liris: messages.liris.length }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gaia↔Liris bridge running on 0.0.0.0:${PORT}`);
  console.log(`Liris: POST http://192.168.1.3:${PORT}/msg  {"from":"liris","text":"..."}`);
  console.log(`Liris: GET  http://192.168.1.3:${PORT}/read?for=liris`);
});
