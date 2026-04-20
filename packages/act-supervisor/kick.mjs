#!/usr/bin/env node
// ACT-SUPERVISOR · one-shot KICK — fires an immediate keyboard type into a target terminal.
// Usage:  node kick.mjs <peer> "<text>"
// Example: node kick.mjs liris "EVT-ACT-KICK · run 100K · post EVT-ORCH-V2-TRUE-BILATERAL · reply-deadline=180s"

import { readFileSync } from "node:fs";
const CONFIG_PATH = "C:/asolaria-acer/packages/act-supervisor/config.json";

const [, , peerName, ...textParts] = process.argv;
if (!peerName || textParts.length === 0) {
  console.error("usage: node kick.mjs <peer> \"<text>\"");
  process.exit(2);
}
// SendKeys treats { } + ( ) [ ] ^ % ~ as special. Strip/escape for safety.
const rawText = textParts.join(" ");
const text = rawText.replace(/[{}]/g, "").replace(/[+^%~()]/g, "");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const peer = config.peers[peerName];
if (!peer) {
  console.error(`unknown peer: ${peerName}. available: ${Object.keys(config.peers).join(",")}`);
  process.exit(2);
}

// Re-probe /windows for current WindowsTerminal pid — never trust stale config
const probeRes = await fetch(`http://${peer.ip}:${peer.port}/windows`, {
  headers: { "Authorization": `Bearer ${peer.bearer}` },
  signal: AbortSignal.timeout(5000),
}).then(r => r.json()).catch(() => ({ targets: [] }));
const wt = (probeRes.targets || []).find(t => t.process === "WindowsTerminal");
const livePid = wt?.id || peer.pid;
if (wt && wt.id !== peer.pid) {
  console.log(`  ⚠ pid ROTATION detected: config=${peer.pid} live=${wt.id} — using live`);
}
console.log(`  foreground title: "${wt?.title || "(none)"}"`);

const url = `http://${peer.ip}:${peer.port}/type`;
const body = { text, press_enter: true, pid: livePid };

console.log(`kicking ${peerName} @ ${url} with pid=${livePid}`);
console.log(`  text: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);

const r = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${peer.bearer}`,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(15000),
});
const j = await r.json().catch(() => ({}));
console.log(`→ ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
process.exit(r.ok ? 0 : 1);
