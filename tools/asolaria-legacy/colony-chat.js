#!/usr/bin/env node
/**
 * Colony Chat v2 — real-time terminal messenger between nodes.
 * Usage: node tools/colony-chat.js [nodeName]
 * Messages stream in real-time from all connected nodes.
 */
const mqtt = require("mqtt");
const readline = require("readline");

const NODE = process.argv[2] || "liris";
const BROKER = process.env.ASOLARIA_BROKER || "mqtt://192.168.1.10:18883";
const CHAT_TOPIC = "asolaria/chat";

const client = mqtt.connect(BROKER, {
  clientId: `${NODE}-chat-${Date.now()}`,
  connectTimeout: 8000,
  reconnectPeriod: 5000
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `[${NODE}] > `
});

function showMessage(prefix, text) {
  // Clear current line, write message, then redraw prompt
  process.stdout.write("\r\x1b[K");
  process.stdout.write(`  ${prefix} ${text}\n`);
  rl.prompt(true);
}

client.on("connect", () => {
  console.log(`\n  Colony Chat v2 — connected as "${NODE}"`);
  console.log(`  Broker: ${BROKER}`);
  console.log(`  Real-time streaming. Type and press Enter.\n`);

  client.subscribe(CHAT_TOPIC);
  client.subscribe(`asolaria/nodes/+/chat`);

  client.publish(CHAT_TOPIC, JSON.stringify({
    from: NODE, type: "join", body: `${NODE} joined the chat`, at: new Date().toISOString()
  }));

  rl.prompt();
});

client.on("message", (topic, msg) => {
  try {
    const data = JSON.parse(msg.toString());
    if (data.from === NODE) return;

    if (data.type === "join") {
      showMessage(">>", `${data.from} joined the chat`);
    } else if (data.type === "leave") {
      showMessage("<<", `${data.from} left the chat`);
    } else {
      showMessage(`[${data.from}]`, data.body || data.text || data.message || "");
    }
  } catch (e) {}
});

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) { rl.prompt(); return; }

  client.publish(CHAT_TOPIC, JSON.stringify({
    from: NODE, type: "message", body: text, at: new Date().toISOString()
  }));
  rl.prompt();
});

rl.on("close", () => {
  client.publish(CHAT_TOPIC, JSON.stringify({
    from: NODE, type: "leave", body: `${NODE} left the chat`, at: new Date().toISOString()
  }));
  setTimeout(() => process.exit(0), 500);
});

client.on("error", (e) => showMessage("!!", `MQTT error: ${e.code}`));
client.on("reconnect", () => showMessage("!!", "Reconnecting..."));
client.on("offline", () => showMessage("!!", "Offline — will retry..."));
