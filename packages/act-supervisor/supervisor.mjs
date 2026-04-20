#!/usr/bin/env node
// ACT-SUPERVISOR · real action-loop kicker
// - polls bus for new envelopes
// - TYPES kicks into target Claude Code terminals via keyboard endpoints (pid-targeted)
// - writes acer-side kicks to tmp/act-inbox.ndjson so acer Claude reads them on next prompt
// - required-reply-deadline escalation (re-type if no reply within window)
// - runs as background daemon: node supervisor.mjs &

import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BUS_BASE = "http://127.0.0.1:4947";
const CONFIG_PATH = "C:/asolaria-acer/packages/act-supervisor/config.json";
const STATE_PATH  = "C:/asolaria-acer/packages/act-supervisor/state.json";
const INBOX_PATH  = "C:/asolaria-acer/tmp/act-inbox.ndjson";
const LOG_PATH    = "C:/asolaria-acer/tmp/act-supervisor.log";
const POLL_MS = 10000;
const REPLY_DEADLINE_MS = 180000;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}
function loadState() {
  if (!existsSync(STATE_PATH)) return { last_ts: "2026-04-20T00:00:00Z", kicks: {}, last_seen_id: null };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}
function saveState(s) { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }

function sanitizeSendKeys(s) {
  return String(s).replace(/[{}]/g, "").replace(/[+^%~()]/g, "");
}
async function probeClaudeCodePid(peer) {
  try {
    const r = await fetch(`http://${peer.ip}:${peer.port}/windows`, {
      headers: { "Authorization": `Bearer ${peer.bearer}` },
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    const targets = j.targets || [];
    const wt = targets.find(t => t.process === "WindowsTerminal");
    return wt?.id || null;
  } catch (e) { return null; }
}

async function typeToPeer(peer, text, pressEnter = true) {
  const url = `http://${peer.ip}:${peer.port}/type`;
  const body = { text: sanitizeSendKeys(text), press_enter: pressEnter };
  const livePid = await probeClaudeCodePid(peer);
  if (livePid) body.pid = livePid;
  else if (peer.pid) body.pid = peer.pid;
  try {
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
    return { ok: r.ok, status: r.status, response: j };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

async function pollBus(sinceTs) {
  const url = `${BUS_BASE}/behcs/inbox?limit=50&since=${encodeURIComponent(sinceTs)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return j.messages || [];
  } catch (e) {
    log(`  bus-poll FAIL ${e.message}`);
    return [];
  }
}

// classify envelope: who needs to act.
// Targets like "liris-try-it-orch-v2-counterpart" collapse to "liris".
function normalizeName(s) {
  if (typeof s !== "string") return "";
  const base = s.toLowerCase().split("-")[0];
  return base;
}
function classifyKick(env) {
  const verb = env.verb || "";
  const rawTarget = env.target || env.to || "";
  const rawFrom = env.from || "";
  const target = normalizeName(rawTarget);
  const frm = normalizeName(rawFrom);
  if (typeof verb !== "string") return null;
  if (!verb.startsWith("EVT-") && !verb.startsWith("OP-")) return null;
  if (verb.includes("HEARTBEAT") || verb.includes("fleet-report")) return null;

  if (frm === "liris" && target === "acer") return { kick: "acer", reason: "liris→acer message requires acer action" };
  if (frm === "falcon" && target === "acer") return { kick: "acer", reason: "falcon→acer message requires acer action" };
  if (frm === "acer" && target === "liris" && verb.includes("KICK")) return { kick: "liris", reason: "explicit kick-verb to liris" };
  if (verb.includes("TRUE-BILATERAL") || verb.includes("UNISON-MATCH")) return { kick: "acer", reason: "bilateral milestone needs acer follow-up" };
  if (verb.includes("FIX-WAVE-COMPLETE") || verb.includes("FIX-WAVE-BLOCKED")) return { kick: "acer", reason: "wave-outcome needs acer acknowledgment" };
  return null;
}

function writeAcerInboxLine(env, kickReason) {
  const line = JSON.stringify({
    seen_at: new Date().toISOString(),
    kick_reason: kickReason,
    from: env.from || "?",
    to:   env.to || env.target || "?",
    verb: env.verb,
    payload: typeof env.payload === "string" ? env.payload.slice(0, 300) : "",
    id: env.id || "",
    ts: env.ts || "",
  });
  try { appendFileSync(INBOX_PATH, line + "\n"); } catch (e) { log(`  inbox-write FAIL ${e.message}`); }
}

async function main() {
  if (!existsSync("C:/asolaria-acer/tmp")) mkdirSync("C:/asolaria-acer/tmp", { recursive: true });
  const config = loadConfig();
  let state = loadState();
  log(`ACT-SUPERVISOR online · peers=${Object.keys(config.peers).join(",")} · poll=${POLL_MS}ms · since=${state.last_ts}`);

  while (true) {
    const msgs = await pollBus(state.last_ts);
    let maxTs = state.last_ts;
    let acted = 0;
    for (const m of msgs) {
      if (!m.ts) continue;
      if (m.ts > maxTs) maxTs = m.ts;
      if (m.id && m.id === state.last_seen_id) continue;
      const cls = classifyKick(m);
      if (!cls) continue;
      acted++;
      if (cls.kick === "acer") {
        writeAcerInboxLine(m, cls.reason);
        log(`  ACER-KICK-FILE · verb=${m.verb} from=${m.from} reason=${cls.reason}`);
      } else if (cls.kick === "liris" && config.peers.liris) {
        const text = `[ACT-SUPERVISOR-KICK ${new Date().toISOString()}] · ${m.verb} from=${m.from} · ${typeof m.payload === "string" ? m.payload.slice(0, 200) : ""}`;
        const r = await typeToPeer(config.peers.liris, text);
        log(`  LIRIS-KICK-TYPE · verb=${m.verb} status=${r.status} ok=${r.ok} ${r.error || ""}`);
      }
    }
    if (maxTs !== state.last_ts) {
      state.last_ts = maxTs;
      saveState(state);
    }
    if (acted === 0) log(`  tick · 0 kicks · cursor=${state.last_ts}`);
    else              log(`  tick · ${acted} kicks · cursor=${state.last_ts}`);
    await sleep(POLL_MS);
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
