#!/usr/bin/env node
/**
 * Gaia Bridge — persistent MQTT relay for the orchestrator.
 * Runs in background. Logs all chat to file.
 * Gaia (Claude) sends messages by writing to a command file.
 *
 * Usage: node tools/gaia-bridge.js
 * Send: echo '{"body":"hello"}' > data/gaia-outbox.ndjson
 */
const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");

const BROKER = process.env.ASOLARIA_BROKER || "mqtt://127.0.0.1:18883";
const OUTBOX = path.join(__dirname, "..", "data", "gaia-outbox.ndjson");
const INBOX = path.join(__dirname, "..", "data", "gaia-inbox.ndjson");
const CHAT_LOG = path.join(__dirname, "..", "data", "colony-chat.log");

// Ensure data dir
fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });

// Clear outbox on start
fs.writeFileSync(OUTBOX, "");

const client = mqtt.connect(BROKER, {
  clientId: "gaia-bridge-" + Date.now(),
  reconnectPeriod: 5000
});

client.on("connect", () => {
  console.log("[GAIA-BRIDGE] Connected to " + BROKER);
  client.subscribe("asolaria/chat");
  client.subscribe("asolaria/nodes/+/chat");
  client.subscribe("asolaria/nodes/gaia/inbound/#");
  client.subscribe("asolaria/broadcast/#");

  client.publish("asolaria/chat", JSON.stringify({
    from: "gaia", body: "Gaia bridge online. Persistent relay active.", at: new Date().toISOString()
  }));
});

// Log all incoming to inbox + chat log
client.on("message", (topic, msg) => {
  const line = msg.toString();
  const ts = new Date().toISOString();

  // Append to inbox
  fs.appendFileSync(INBOX, JSON.stringify({ topic, ts, data: JSON.parse(line) }) + "\n");

  // Append to readable chat log
  try {
    const d = JSON.parse(line);
    if (d.type !== "join" && d.type !== "leave") {
      fs.appendFileSync(CHAT_LOG, `[${ts.slice(11,19)}] [${d.from}] ${d.body || ""}\n`);
    }
  } catch(e) {}
});

// Watch outbox for new messages from Gaia (Claude)
let lastSize = 0;
setInterval(() => {
  try {
    const stat = fs.statSync(OUTBOX);
    if (stat.size > lastSize) {
      const content = fs.readFileSync(OUTBOX, "utf8");
      const lines = content.trim().split("\n").slice(-10); // last 10 unsent
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg._sent) continue;
          client.publish("asolaria/chat", JSON.stringify({
            from: "gaia", body: msg.body, at: new Date().toISOString()
          }));
          console.log("[GAIA-BRIDGE] Sent: " + (msg.body || "").slice(0, 80));
        } catch(e) {}
      }
      lastSize = stat.size;
    }
  } catch(e) {}
}, 500);

// Heartbeat
setInterval(() => {
  client.publish("asolaria/nodes/gaia/runtime/heartbeat", JSON.stringify({
    ok: true, node: "gaia", up: process.uptime(), at: new Date().toISOString()
  }));
}, 5000);

console.log("[GAIA-BRIDGE] Outbox: " + OUTBOX);
console.log("[GAIA-BRIDGE] Inbox:  " + INBOX);
console.log("[GAIA-BRIDGE] Chat:   " + CHAT_LOG);
console.log("[GAIA-BRIDGE] Write to outbox to send messages.");
