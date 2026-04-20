#!/usr/bin/env node
// cycle-orchestrator-v2 · main loop
// Wires together the 5 upgrades from the D11=PROVEN spec (variants=9df1b413… spec=c6964e27…).
// Replaces the old weak cron-kicker.
// Run: node src/index.mjs
//      node src/index.mjs --background    (daemonize-style: log to file, keep running)

import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { writeFile as writeFileAsync, rename as renameAsync } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { freemem } from "node:os";

import { PeerStateMachine, STATES } from "./peer-state-machine.mjs";
import { UnisonTestDriver, UNISON_TESTS } from "./unison-test-driver.mjs";
import { BilateralFingerprintTracker } from "./bilateral-fingerprint-tracker.mjs";
import { GNNFeedbackCadenceAdjuster } from "./gnn-feedback-cadence-adjuster.mjs";
import { SLOGate } from "./slo-gate.mjs";
import { runUnisonTest } from "./unison-script-runners.mjs";
import { startWatchdogHeartbeat } from "./watchdog-heartbeat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, "../../..");
const BUS = process.env.ASOLARIA_BUS_URL || "http://127.0.0.1:4947/behcs/send";
const INBOX = process.env.ASOLARIA_INBOX_URL || "http://127.0.0.1:4947/behcs/inbox";
const LOG_DIR = resolvePath(REPO_ROOT, "tmp");
const LOG_PATH = resolvePath(LOG_DIR, "cycle-orchestrator-v2.log");
const STATE_PATH = resolvePath(LOG_DIR, "cycle-orchestrator-v2.state.json");
const PEER_TOKENS_PATH = "C:/Users/acer/Asolaria/data/vault/owner/agent-keyboard/peer-tokens.json";
const LIRIS_WINDOWS_URL = "http://192.168.100.2:4913/windows";
const LOCAL_MINT_NONCE_URL = "http://127.0.0.1:4821/mint-nonce";
const LIRIS_TYPE_SUPERVISED_URL = "http://192.168.100.2:4821/type-supervised";
const RESPONDING_STALE_MS = 60000;
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

async function busPost(envelope) {
  const full = {
    id: envelope.id ?? `acer-orch-${Date.now()}`,
    from: "acer", to: envelope.to ?? "federation", mode: "real",
    actor: envelope.actor ?? "cycle-orchestrator-v2",
    target: envelope.target ?? "federation",
    ts: new Date().toISOString(),
    ...envelope,
  };
  try {
    const r = await fetch(BUS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(full), signal: AbortSignal.timeout(5000) });
    return r.status;
  } catch (e) { log(`  busPost FAIL ${e.message}`); return 0; }
}

async function busPull(sinceIso) {
  const url = `${INBOX}?limit=100&since=${encodeURIComponent(sinceIso)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.messages || [];
  } catch (e) { log(`  busPull FAIL ${e.message}`); return []; }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { last_ts: new Date(Date.now() - 120000).toISOString() };
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); }
  catch { return { last_ts: new Date(Date.now() - 120000).toISOString() }; }
}
async function saveState(s) {
  const tmp = `${STATE_PATH}.tmp`;
  try {
    await writeFileAsync(tmp, JSON.stringify(s, null, 2));
    await renameAsync(tmp, STATE_PATH);
  } catch (e) {
    log(`  saveState FAIL ${e.message}`);
  }
}

// Track last bus-traffic ts per peer so RESPONDING can decay to DARK after staleness.
const peerLastBusTs = Object.create(null);

// Wire all 5 upgrades
const peers = {
  liris:  new PeerStateMachine("liris"),
  falcon: new PeerStateMachine("falcon"),
};
const fpt = new BilateralFingerprintTracker();
const gnn = new GNNFeedbackCadenceAdjuster({ min_ms: 5000, max_ms: 60000, initial_ms: 10000 });
const slo = new SLOGate();
const utd = new UnisonTestDriver({
  fingerprintTracker: fpt,
  stateMachines: peers,
  busPost: (e) => busPost(e),
  // Real deterministic runners (see unison-script-runners.mjs). Runners
  // that cannot be made deterministic today return
  // { deterministic_today:false, sha256:null } and the driver fails
  // closed rather than fabricating a bilateral match.
  scriptRunner: runUnisonTest,
});

// Classify bus messages → peer state + fingerprint + GNN feedback
function classifyIncoming(msg) {
  const frm = String(msg.from || "").toLowerCase().split("-")[0];
  const verb = msg.verb || "";
  if (typeof verb !== "string") return;
  if (verb.includes("HEARTBEAT") || verb.includes("fleet-report")) return;
  slo.observeVerb(verb);
  // S2A cadence feedback verbs carry gnn-signal semantics not error semantics — exclude from SLO error-rate.
  // Prior bug: verbs like EVT-ACER-S2A-CADENCE-FEEDBACK-HALT/BLOCKED triggered U-007-err-10pct false halts.
  const isCadenceFeedback = verb.startsWith("EVT-ACER-S2A-CADENCE-FEEDBACK") || verb.startsWith("EVT-ACER-S2A-CADENCE-");
  if (!isCadenceFeedback) {
    // Federation halt-words canon (liris proposal 2026-04-20T16:26Z): HALT, BLOCKED, STALE, FAIL,
    // DENIED, EMERGENCY, STOP, KILL, ABORT, TERMINATE, DIVERGE. Any substring match = is_error.
    const HALT_WORDS = ["HALT","BLOCKED","STALE","FAIL","DENIED","EMERGENCY","STOP","KILL","ABORT","TERMINATE","DIVERGE"];
    const isError = HALT_WORDS.some(w => verb.includes(w));
    slo.observeEvent({ is_error: isError });
  }

  const psm = peers[frm];
  if (psm) {
    // A message FROM a peer TO acer means that peer is alive.
    peerLastBusTs[frm] = Date.now();
    if (psm.state === STATES.DARK || psm.state === STATES.PROBING) psm.transition(STATES.ALIVE, `observed verb=${verb}`);
    if (psm.state === STATES.KICKED && verb.startsWith("EVT-")) psm.onReply(verb);
    gnn.onOutcome({
      verdict: verb.includes("TRUE-BILATERAL") || verb.includes("MATCH") || verb.includes("COMPLETE") ? "promote"
            :  verb.includes("BLOCKED") || verb.includes("DIVERGE") ? "demote"
            :  verb.includes("HALT") ? "halt"
            :  "neutral",
      intent: "leak",
      is_reply: true,
    });
  } else {
    // Unknown peer — still give the adjuster neutral support so cadence learns from background chatter.
    gnn.onOutcome({ verdict: "neutral", intent: "leak", is_reply: false });
  }

  // Fingerprint recording: any verb carrying {sha256}
  const body = msg.body || {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) && (k.toLowerCase().includes("sha") || k.toLowerCase().includes("hash"))) {
      fpt.record(frm, verb, k, v);
    }
  }
}

function loadLirisBearer() {
  try {
    const j = JSON.parse(readFileSync(PEER_TOKENS_PATH, "utf8"));
    return j?.peers?.["liris-rayssa"]?.token || null;
  } catch (e) { log(`  loadLirisBearer FAIL ${e.message}`); return null; }
}

async function probeLirisPid() {
  const bearer = loadLirisBearer();
  if (!bearer) return { pid: null, reason: "no-bearer" };
  try {
    const r = await fetch(LIRIS_WINDOWS_URL, {
      headers: { "Authorization": `Bearer ${bearer}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { pid: null, reason: `http-${r.status}` };
    const j = await r.json();
    const targets = Array.isArray(j?.targets) ? j.targets : [];
    const wt = targets.find(t => t && t.process === "WindowsTerminal");
    if (!wt || wt.id == null) return { pid: null, reason: "no-WindowsTerminal" };
    return { pid: wt.id, reason: "ok" };
  } catch (e) { return { pid: null, reason: `probe-err:${e.message}` }; }
}

async function mintLocalNonce(pid, text) {
  try {
    const r = await fetch(LOCAL_MINT_NONCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer_id: "liris", pid, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { header: null, reason: `mint-http-${r.status}` };
    const j = await r.json();
    const header = j?.nonce_header || j?.header || null;
    return header ? { header, reason: "ok" } : { header: null, reason: "no-header-in-response" };
  } catch (e) { return { header: null, reason: `mint-err:${e.message}` }; }
}

async function postSupervisedKick(text, pid, nonceHeader) {
  try {
    const r = await fetch(LIRIS_TYPE_SUPERVISED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-supervisor-nonce": nonceHeader },
      body: JSON.stringify({ text, pid, press_enter: true }),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, status: 0, reason: e.message }; }
}

async function onKickLiris(text) {
  // Reserve deadline + PSM state first so overdue logic is consistent regardless of path.
  const psm = peers.liris;
  peers.liris.onKick(text, 180000);

  const { pid, reason: probeReason } = await probeLirisPid();
  if (pid != null) {
    const { header, reason: mintReason } = await mintLocalNonce(pid, text);
    if (header) {
      const res = await postSupervisedKick(text, pid, header);
      if (res.ok) {
        log(`  supervised kick OK · pid=${pid} · status=${res.status}`);
        psm.onKick(text);
        return psm.snapshot();
      }
      log(`  supervised kick FAIL status=${res.status} reason=${res.reason || ""} — falling back to bus`);
    } else {
      log(`  mint-nonce FAIL (${mintReason}) — falling back to bus`);
    }
  } else {
    log(`  liris pid probe FAIL (${probeReason}) — falling back to bus`);
  }

  // Fallback: bus-only EVT-ACT-KICK with priority flag.
  await busPost({
    verb: "EVT-ACT-KICK-LIRIS",
    to: "liris", target: "liris",
    payload: text.slice(0, 200),
    body: { full_kick_text: text, reply_deadline_iso: psm.kick_deadline_iso, supervisor_path: "http://liris:4821/type-supervised (preferred) or bus" },
    priority: "P0-kick-required",
  });
  return psm.snapshot();
}

let tickInFlight = false;
let tickSkippedCount = 0;

async function tick() {
  if (tickInFlight) {
    tickSkippedCount += 1;
    log(`  tick SKIPPED (previous in-flight) · skipped_total=${tickSkippedCount}`);
    return { halted: false, skipped: true };
  }
  tickInFlight = true;
  try {
    const s = loadState();
    const msgs = await busPull(s.last_ts);
    let maxTs = s.last_ts;
    for (const m of msgs) {
      if (!m.ts) continue;
      if (m.ts > maxTs) maxTs = m.ts;
      classifyIncoming(m);
    }
    await saveState({ last_ts: maxTs });

    // Evaluate SLO on SYSTEM free memory (os.freemem), not process RSS
    slo.observeMem(freemem() / 1024 / 1024);
    const sloEval = slo.evaluate();
    if (sloEval.any_fired) {
      for (const p of Object.values(peers)) p.onHaltPredicate(sloEval.tripped_predicates.join(","));
      log(`  SLO HALT fired: ${sloEval.tripped_predicates.join(",")}`);
      return { halted: true, tripped: sloEval.tripped_predicates };
    }

    // Decay RESPONDING → DARK if the peer has gone silent on the bus for > RESPONDING_STALE_MS.
    const now = Date.now();
    for (const [name, p] of Object.entries(peers)) {
      if (p.state === STATES.RESPONDING) {
        const last = peerLastBusTs[name] || 0;
        if (now - last > RESPONDING_STALE_MS) {
          log(`  ${name} RESPONDING→DARK (no bus traffic for ${Math.round((now - last)/1000)}s)`);
          p.transition(STATES.DARK, "responding-stale");
        }
      }
    }

    // Kick liris if she's overdue on her last kick
    const lirisSnap = peers.liris.snapshot();
    if (lirisSnap.state === STATES.KICKED && peers.liris.isOverdue()) {
      log(`  liris overdue on kick ${lirisSnap.last_kick_sha256?.slice(0,16)}; re-kicking via supervised :4821`);
      await onKickLiris(`[AUTO-RE-KICK ${new Date().toISOString()}] previous kick sha=${lirisSnap.last_kick_sha256?.slice(0,16)} unanswered. Please reply via bus.`);
    }

    log(`  tick · msgs=${msgs.length} · cadence=${gnn.nextIntervalMs()}ms · fpt=${JSON.stringify(fpt.snapshot())} · peers=${JSON.stringify(Object.fromEntries(Object.entries(peers).map(([k,v])=>[k,v.state])))}`);
    return { halted: false };
  } finally {
    tickInFlight = false;
  }
}

async function main() {
  log(`cycle-orchestrator-v2 online · 5 upgrades wired (PeerStateMachine, UnisonTestDriver, BilateralFingerprintTracker, GNNFeedbackCadenceAdjuster, SLOGate)`);
  // Boot hygiene: clear any latched SLO state from prior-session crashes so a stuck predicate
  // doesn't re-halt immediately. The previous process died at 15:06 on latched U-007.
  slo.clearAll();
  log(`  SLO cleared on boot (all 9 predicates reset)`);
  // T07 · watchdog heartbeat (30s cadence · EVT-CYCLE-ORCH-HEARTBEAT on bus)
  startWatchdogHeartbeat({
    busPost,
    getStateSnapshot: () => ({
      summary: `liris=${peers.liris.state} falcon=${peers.falcon.state} fpt_keys=${fpt.snapshot().total_keys} cadence_ms=${gnn.nextIntervalMs()}`,
      peers: { liris: peers.liris.state, falcon: peers.falcon.state },
      fpt: fpt.snapshot(),
      cadence_ms: gnn.nextIntervalMs(),
    }),
  });
  log(`  T07 watchdog heartbeat started · 30s cadence`);
  // Liris starts DARK → PROBING. If her bus traffic arrives, we move ALIVE automatically.
  peers.liris.transition(STATES.PROBING, "boot");
  peers.falcon.transition(STATES.PROBING, "boot");
  let consecutiveHalts = 0;
  while (true) {
    const r = await tick();
    if (r.halted) {
      consecutiveHalts++;
      log(`  HALT observed: ${r.tripped?.join(",") ?? "unknown"} · consecutive=${consecutiveHalts}`);
      if (consecutiveHalts >= 3) { log(`  HALTED; 3 consecutive halts — stopping main loop for operator review`); break; }
      // Auto-recover: reset and continue. Three strikes = stop for real.
      slo.clearAll();
      log(`  SLO auto-reset after single halt, continuing`);
    } else {
      consecutiveHalts = 0;
    }
    await sleep(gnn.nextIntervalMs());
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
