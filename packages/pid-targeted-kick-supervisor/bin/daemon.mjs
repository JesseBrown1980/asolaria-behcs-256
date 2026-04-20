#!/usr/bin/env node
// PID-Targeted Kick Supervisor Daemon
// Watches bus for OP-KICK-* verbs and fan-outs to the target node
//   OP-KICK-FALCON  { text: "..." }    → adb input text on falcon
//   OP-KICK-AETHER  { text: "..." }    → adb input text on aether
//   OP-KICK-LIRIS   { text: "..." }    → /type on liris with pid-reprobe
//   OP-VERIFY-PID   { pid, node? }     → non-intrusive verify
// Each dispatch emits EVT-KICK-SUPERVISOR-DISPATCHED with verdict

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { kick, verifyPid, locatePid } from "../src/index.mjs";
import { emitEnvelope } from "../src/bus-fire-with-retry.mjs";

const BUS_BASE = "http://127.0.0.1:4947";
const LOG_PATH = "C:/asolaria-acer/tmp/pid-targeted-kick-supervisor.log";
const STATE_PATH = "C:/asolaria-acer/tmp/pid-targeted-kick-supervisor.state.json";
const POLL_MS = 8000;
if (!existsSync("C:/asolaria-acer/tmp")) mkdirSync("C:/asolaria-acer/tmp", { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

let lastTs = new Date(Date.now() - 60_000).toISOString();
let seenIds = new Set();

async function pollBus() {
  try {
    const r = await fetch(`${BUS_BASE}/behcs/inbox?limit=50&since=${encodeURIComponent(lastTs)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j.messages || [];
  } catch (e) {
    log(`bus-poll FAIL ${e.message}`);
    return [];
  }
}

async function dispatch(env) {
  const verb = env.verb || "";
  const body = env.body || {};
  const text = body.text || env.payload || "";

  if (verb === "OP-KICK-FALCON" || verb === "OP-KICK-AETHER" || verb === "OP-KICK-LIRIS") {
    const target = verb.split("-")[2].toLowerCase();
    const r = await kick(target, text);
    const verdict = r.ok === false ? "FAIL" : (r.verdict || (r.status === 200 ? "OK" : "INVESTIGATE"));
    log(`  ${verb} → ${verdict} · sha=${r.screencap?.sha256?.slice(0,8) || "n/a"}`);
    await emitEnvelope({
      verb: `EVT-KICK-SUPERVISOR-DISPATCHED-${target.toUpperCase()}`,
      payload: `${verb} → ${verdict} · from ${env.from || "unknown"} · ${(text||"").slice(0,80)}`,
      body: { original_envelope_id: env.id, target, dispatch_result: r, verdict },
    });
    return;
  }

  if (verb === "OP-VERIFY-PID") {
    const pid = body.pid;
    const node = body.node;
    const r = node ? await verifyPid(node, pid) : await verifyPid(pid);
    log(`  OP-VERIFY-PID ${pid}${node ? " on "+node : ""} → ${r.verdict}`);
    await emitEnvelope({
      verb: "EVT-KICK-SUPERVISOR-PID-VERIFIED",
      payload: `pid ${pid} ${node ? "on "+node : "acer-local"} · verdict ${r.verdict}`,
      body: { pid, node, result: r },
    });
    return;
  }

  if (verb === "OP-LOCATE-PID") {
    const pid = body.pid;
    const r = await locatePid(pid);
    log(`  OP-LOCATE-PID ${pid} → ${r.resolved?.kind || "NOT_FOUND"}`);
    await emitEnvelope({
      verb: "EVT-KICK-SUPERVISOR-PID-LOCATED",
      payload: `pid ${pid} resolved to ${r.resolved?.kind || "NOT_FOUND"} ${r.resolved?.node || r.resolved?.process_name || ""}`,
      body: { pid, result: r },
    });
    return;
  }
}

async function main() {
  log(`PID-TARGETED-KICK-SUPERVISOR online · poll=${POLL_MS}ms · since=${lastTs}`);
  // Emit boot envelope
  await emitEnvelope({
    verb: "EVT-KICK-SUPERVISOR-BOOT",
    payload: "pid-targeted-kick-supervisor daemon online · listens for OP-KICK-FALCON | OP-KICK-AETHER | OP-KICK-LIRIS | OP-VERIFY-PID | OP-LOCATE-PID",
    body: { accepted_verbs: ["OP-KICK-FALCON","OP-KICK-AETHER","OP-KICK-LIRIS","OP-VERIFY-PID","OP-LOCATE-PID"], version: "1.0.0" },
  });

  while (true) {
    const msgs = await pollBus();
    for (const m of msgs) {
      if (!m.ts) continue;
      if (m.ts > lastTs) lastTs = m.ts;
      if (m.id && seenIds.has(m.id)) continue;
      if (m.id) seenIds.add(m.id);
      const verb = m.verb || "";
      if (!verb.startsWith("OP-KICK-") && verb !== "OP-VERIFY-PID" && verb !== "OP-LOCATE-PID") continue;
      await dispatch(m);
    }
    if (seenIds.size > 500) seenIds = new Set([...seenIds].slice(-200));
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
