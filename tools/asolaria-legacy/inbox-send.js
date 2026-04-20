#!/usr/bin/env node
/**
 * inbox-send.js — Send messages to any agent's inbox in the Asolaria colony.
 *
 * Usage:
 *   node inbox-send.js <target> <message> [--source <name>] [--reason <reason>]
 *
 * Targets: helm, sentinel, dasein, gaia, liris
 *
 * Examples:
 *   node inbox-send.js helm "Bridge is back up"
 *   node inbox-send.js dasein "Run QDD tests" --source Gaia --reason orchestration
 *   node inbox-send.js liris "Set up your index" --source Gaia
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Inbox registry — maps agent names to their inbox file paths
const INBOXES = {
  helm: path.join(__dirname, "..", "runtime", "admin-terminals", "helm", "inbox.ndjson"),
  sentinel: path.join(__dirname, "..", "runtime", "admin-terminals", "sentinel", "inbox.ndjson"),
  dasein: path.join(__dirname, "..", "runtime", "dasein-inbox.ndjson"),
  gaia: path.join(__dirname, "..", "runtime", "gaia-inbox.ndjson"),
  // Liris is remote — write to a local outbound file for relay
  liris: path.join(__dirname, "..", "runtime", "outbound-liris-inbox.ndjson"),
  kuromi: path.join(__dirname, "..", "runtime", "outbound-liris-inbox.ndjson"),
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { target: null, message: null, source: "cli", reason: "manual" };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      result.source = args[++i];
    } else if (args[i] === "--reason" && args[i + 1]) {
      result.reason = args[++i];
    } else {
      positional.push(args[i]);
    }
  }

  result.target = (positional[0] || "").toLowerCase();
  result.message = positional.slice(1).join(" ");
  return result;
}

function sendMessage(target, message, source, reason) {
  const inboxPath = INBOXES[target];
  if (!inboxPath) {
    const available = Object.keys(INBOXES).join(", ");
    console.error(`Unknown target: "${target}". Available: ${available}`);
    process.exit(1);
  }

  // Ensure parent directory exists
  const dir = path.dirname(inboxPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const id = `${source.toLowerCase()}_${target}_${crypto.randomBytes(6).toString("hex")}`;
  const entry = {
    id,
    ts: new Date().toISOString(),
    source,
    reason,
    mode: "append",
    text: message,
  };

  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(inboxPath, line, "utf8");

  console.log(`Sent to ${target} (${path.basename(inboxPath)}):`);
  console.log(`  id: ${id}`);
  console.log(`  from: ${source}`);
  console.log(`  message: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`);

  if (target === "liris" || target === "kuromi") {
    console.log(`\n  NOTE: Liris is remote. Message saved to outbound file.`);
    console.log(`  Relay via: MQTT (asolaria/liris/commands) or WhatsApp manual relay.`);
  }

  return id;
}

function listInboxes() {
  console.log("Agent Inboxes:\n");
  for (const [name, filepath] of Object.entries(INBOXES)) {
    const exists = fs.existsSync(filepath);
    let count = 0;
    if (exists) {
      const content = fs.readFileSync(filepath, "utf8").trim();
      count = content ? content.split("\n").length : 0;
    }
    const status = exists ? `${count} messages` : "not created";
    console.log(`  ${name.padEnd(10)} ${status.padEnd(15)} ${filepath}`);
  }
}

function readInbox(target, n = 5) {
  const inboxPath = INBOXES[target];
  if (!inboxPath || !fs.existsSync(inboxPath)) {
    console.error(`No inbox found for "${target}"`);
    process.exit(1);
  }

  const lines = fs.readFileSync(inboxPath, "utf8").trim().split("\n").filter(Boolean);
  const recent = lines.slice(-n);

  console.log(`Last ${recent.length} messages in ${target}'s inbox:\n`);
  for (const line of recent) {
    try {
      const msg = JSON.parse(line);
      const time = new Date(msg.ts).toLocaleTimeString();
      console.log(`  [${time}] ${msg.source}: ${(msg.text || "").substring(0, 120)}`);
    } catch {
      console.log(`  (unparseable): ${line.substring(0, 100)}`);
    }
  }
}

// Main
const args = parseArgs(process.argv);

if (args.target === "list" || args.target === "ls") {
  listInboxes();
} else if (args.target === "read" && args.message) {
  readInbox(args.message, 5);
} else if (!args.target || !args.message) {
  console.log("Usage: node inbox-send.js <target> <message> [--source <name>] [--reason <reason>]");
  console.log("       node inbox-send.js list                    — show all inboxes");
  console.log("       node inbox-send.js read <target>           — read last 5 messages");
  console.log(`\nTargets: ${Object.keys(INBOXES).join(", ")}`);
} else {
  sendMessage(args.target, args.message, args.source, args.reason);
}
