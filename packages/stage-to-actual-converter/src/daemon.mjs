#!/usr/bin/env node
// STAGE→ACTUAL converter daemon · polls bus every 10s, processes new envelopes through the complex, writes per-outcome ndjson, emits per-promotion bus events.

import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { convertStageToActual, SUPERVISOR_PIDS } from "./converter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, "../../..");
const BUS = process.env.ASOLARIA_BUS_URL || "http://127.0.0.1:4947/behcs/send";
const LIRIS_BUS = "http://192.168.100.2:4947/behcs/send";
const INBOX = process.env.ASOLARIA_INBOX_URL || "http://127.0.0.1:4947/behcs/inbox";
const OUT_DIR = resolvePath(REPO_ROOT, "D:/liris-dataset-offload/stage-to-actual");
const STATE_PATH = resolvePath(OUT_DIR, "daemon.state.json");
const LOG_PATH = resolvePath(OUT_DIR, "daemon.log");
const POLL_MS = 10_000;
const REPORT_EVERY_N = 50;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { last_ts: new Date(Date.now() - 60_000).toISOString(), counts: { actual: 0, candidate: 0, stage: 0, halt_super_gulp: 0 }, processed_ids: [] };
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); }
  catch { return { last_ts: new Date(Date.now() - 60_000).toISOString(), counts: { actual: 0, candidate: 0, stage: 0, halt_super_gulp: 0 }, processed_ids: [] }; }
}
function saveState(s) {
  try { writeFileSync(STATE_PATH + ".tmp", JSON.stringify(s, null, 2)); writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch {}
}

async function busPost(envelope) {
  const body = JSON.stringify({
    id: envelope.id || `acer-s2a-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    from: "acer", to: envelope.to || "federation", mode: "real",
    actor: envelope.actor || "stage-to-actual-converter",
    target: envelope.target || "federation",
    ts: new Date().toISOString(),
    ...envelope,
  });
  try { await fetch(BUS, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) }); } catch {}
  try { await fetch(LIRIS_BUS, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) }); } catch {}
}

async function busPull(sinceIso) {
  const url = `${INBOX}?limit=200&since=${encodeURIComponent(sinceIso)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j.messages || [];
  } catch { return []; }
}

function writeBucket(bucket, entry) {
  const p = resolvePath(OUT_DIR, `${bucket}.ndjson`);
  try { appendFileSync(p, JSON.stringify(entry) + "\n"); } catch {}
}

let inFlight = false;
async function tick() {
  if (inFlight) { log("  skip (in-flight)"); return; }
  inFlight = true;
  try {
    const state = loadState();
    const msgs = await busPull(state.last_ts);
    if (!msgs.length) { log(`  poll · 0 new msgs · counts=${JSON.stringify(state.counts)}`); return; }
    let maxTs = state.last_ts;
    let processedThisTick = 0;
    const seen = new Set(state.processed_ids.slice(-5000));
    for (const m of msgs) {
      if (!m.ts) continue;
      if (m.ts > maxTs) maxTs = m.ts;
      // skip heartbeats + own envelopes + already-processed
      const v = String(m.verb || "");
      if (!v) continue;
      if (v.includes("HEARTBEAT") || v.includes("behcs.heartbeat") || v.includes("fleet-report")) continue;
      // Skip shadow-mode envelopes (liris's Brown-Hilbert-glyph-encoded heartbeats use non-ASCII verbs)
      if (m.mode === "shadow") continue;
      if (/[^\x20-\x7E]/.test(v)) continue;  // any non-ASCII = shadow-encoded
      // Skip milk-status + other non-signal spam
      if (v === "falcon-milk-status" || v === "falcon-milk-report" || v === "falcon-liris-found") continue;
      if (v === "EVT-ACER-ALIVE-AND-WORKING") continue;
      if (v === "EVT-STAGE-TO-ACTUAL-PROMOTED" || v === "EVT-STAGE-TO-ACTUAL-DAEMON-PROGRESS" || v === "EVT-STAGE-TO-ACTUAL-HALT-SUPER-GULP" || v === "EVT-STAGE-TO-ACTUAL-CONVERTER-ONLINE") continue;
      if (m.id && seen.has(m.id)) continue;
      if (m.id) seen.add(m.id);

      const result = convertStageToActual(m);
      const bucket = result.final_outcome === "actual" ? "actual"
                   : result.final_outcome === "candidate" ? "candidate"
                   : result.final_outcome === "stage" ? "stage"
                   : "halt_super_gulp";
      state.counts[bucket] = (state.counts[bucket] || 0) + 1;
      writeBucket(bucket, result);
      processedThisTick++;

      // Emit per-promotion bus event ONLY for actual + halt_super_gulp (noise control for the rest)
      if (bucket === "actual") {
        await busPost({
          verb: "EVT-STAGE-TO-ACTUAL-PROMOTED",
          actor: "acer-stage-to-actual-converter",
          target: "federation",
          payload: `PROMOTED envelope_id=${result.envelope_id} verb=${result.envelope_verb} omni=${result.omni_gnn.score.toFixed(3)} reverse=${result.reverse_gnn.score.toFixed(3)} confidence=${result.agreement.confidence?.toFixed(3) ?? "n/a"}`,
          body: { source_envelope_id: result.envelope_id, source_verb: result.envelope_verb, joint_decision: result.agreement.joint_decision, confidence: result.agreement.confidence, supervisor_chain: result.supervisor_chain, cube_address: result.whiteroom.cube_address },
          glyph_sentence: `EVT-STAGE-TO-ACTUAL-PROMOTED · ${result.envelope_verb} · confidence=${result.agreement.confidence?.toFixed(3) ?? "n/a"} @ M-EYEWITNESS .`,
        });
      } else if (bucket === "halt_super_gulp") {
        await busPost({
          verb: "EVT-STAGE-TO-ACTUAL-HALT-SUPER-GULP",
          actor: "acer-stage-to-actual-converter",
          target: SUPERVISOR_PIDS.super_gulp.glyph,
          payload: `DUAL-GNN DISAGREEMENT on envelope_id=${result.envelope_id} · omni=${result.omni_gnn.decision} reverse=${result.reverse_gnn.decision} · escalating to ${SUPERVISOR_PIDS.super_gulp.glyph} room 37`,
          body: { source_envelope_id: result.envelope_id, source_verb: result.envelope_verb, omni_decision: result.omni_gnn.decision, reverse_decision: result.reverse_gnn.decision, escalate_to: SUPERVISOR_PIDS.super_gulp },
          glyph_sentence: `EVT-STAGE-TO-ACTUAL-HALT-SUPER-GULP · omni=${result.omni_gnn.decision} reverse=${result.reverse_gnn.decision} · adjudicate-at-room-37 @ M-EYEWITNESS .`,
        });
      }
    }

    // Progress report every N
    if (processedThisTick && (state.counts.actual + state.counts.candidate + state.counts.stage + state.counts.halt_super_gulp) % REPORT_EVERY_N < processedThisTick) {
      await busPost({
        verb: "EVT-STAGE-TO-ACTUAL-DAEMON-PROGRESS",
        payload: `acer s2a processed total=${state.counts.actual + state.counts.candidate + state.counts.stage + state.counts.halt_super_gulp} actual=${state.counts.actual} candidate=${state.counts.candidate} stage=${state.counts.stage} halt=${state.counts.halt_super_gulp}`,
        body: { counts: state.counts, tick_delta: processedThisTick },
      });
    }

    state.last_ts = maxTs;
    state.processed_ids = Array.from(seen).slice(-5000);
    saveState(state);
    log(`  poll · ${msgs.length} msgs · ${processedThisTick} processed · counts=${JSON.stringify(state.counts)}`);
  } finally {
    inFlight = false;
  }
}

async function main() {
  log(`stage-to-actual-converter daemon ONLINE · OUT=${OUT_DIR} · poll=${POLL_MS}ms · supervisors: GC-GNN-FEEDER(38)+GNN(25)+SUPER-GULP(37)`);
  await busPost({
    verb: "EVT-STAGE-TO-ACTUAL-CONVERTER-ONLINE",
    payload: "stage→actual converter LIVE on acer · OmniGNN + reverse-gain GNN agreement gate · halt on dual-GNN disagreement · wired through hookwall + Shannon + whiteroom",
    body: {
      supervisors_wired: Object.values(SUPERVISOR_PIDS).map(s => ({ room: s.room, pid: s.pid, glyph: s.glyph })),
      out_dir: OUT_DIR,
      poll_ms: POLL_MS,
    },
  });
  while (true) {
    try { await tick(); } catch (e) { log(`  tick error: ${e.message}`); }
    await sleep(POLL_MS);
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
