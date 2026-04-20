#!/usr/bin/env node
// super-gulp tier-3 consumer daemon
// Loop: promote tier-2 → tier-3 (move oldest inbox-archive to super-gulp-queue when >20 files) → consume one super-gulp-queue file → extract task-candidates → emit EVT-SUPER-GULP-TASK-CANDIDATES-EXTRACTED

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { promoteTier2ToTier3, TIER2_TIER3_CONFIG } from "./promoter.mjs";
import { consumeOneSuperGulpFile, TIER3_CONFIG } from "./consumer.mjs";

const BUS = process.env.ASOLARIA_BUS_URL || "http://127.0.0.1:4947/behcs/send";
const LIRIS_BUS = "http://192.168.100.2:4947/behcs/send";
const LOG_PATH = "C:/asolaria-acer/tmp/super-gulp-tier3.log";
const POLL_MS = 30_000;

if (!existsSync("C:/asolaria-acer/tmp")) mkdirSync("C:/asolaria-acer/tmp", { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

async function busPost(envelope) {
  const body = JSON.stringify({
    id: envelope.id || `acer-sg-tier3-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    from: "acer", to: envelope.to || "federation", mode: "real",
    actor: "acer-super-gulp-tier3-daemon",
    supervisor_pid: "PID-H04-A01-W037000000-P037-N00001",
    prof_glyph: "PROF-SUPER-GULP-SUPERVISOR",
    hilbert_hotel_room: 37,
    target: envelope.target || "federation",
    ts: new Date().toISOString(),
    ...envelope,
  });
  try { await fetch(BUS, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) }); } catch {}
  try { await fetch(LIRIS_BUS, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) }); } catch {}
}

async function tick() {
  // 1) promote tier-2 → tier-3
  const promo = promoteTier2ToTier3();
  if (promo.promoted > 0) {
    log(`  TIER-2→3 promoted ${promo.promoted} file(s); archive now has ${promo.archive_count_after}`);
    await busPost({
      verb: "EVT-TIER-2-TO-TIER-3-PROMOTED",
      payload: `promoted ${promo.promoted} file(s) from inbox-archives/ to super-gulp-queue/ · archive now ${promo.archive_count_after}/20`,
      body: promo,
    });
  }

  // 2) consume one super-gulp-queue file (reverse-gain-GNN extract task-candidates)
  const cons = consumeOneSuperGulpFile();
  if (cons.consumed) {
    log(`  TIER-3 consumed ${cons.consumed} · lines=${cons.lines_scanned} · task-candidates=${cons.task_candidates_extracted} · outcomes=${JSON.stringify(cons.outcome_counts)}`);
    if (cons.task_candidates_extracted > 0) {
      await busPost({
        verb: "EVT-SUPER-GULP-TASK-CANDIDATES-EXTRACTED",
        payload: `extracted ${cons.task_candidates_extracted} task-candidates from ${cons.consumed} · appended to SMP-v5+ ledger`,
        body: cons,
      });
    }
  } else {
    log(`  TIER-3 idle (queue empty)`);
  }
}

async function main() {
  log(`super-gulp-tier3-consumer ONLINE · promote+consume every ${POLL_MS}ms · ${TIER2_TIER3_CONFIG.archive_max_files}-file archive cap · ledger=${TIER3_CONFIG.task_candidates_ledger}`);
  await busPost({
    verb: "EVT-SUPER-GULP-TIER3-CONSUMER-ONLINE",
    payload: `tier-3 super-gulp consumer LIVE · PROF-SUPER-GULP-SUPERVISOR room 37 · archive cap ${TIER2_TIER3_CONFIG.archive_max_files} · ledger ${TIER3_CONFIG.task_candidates_ledger}`,
    body: {
      promoter_config: TIER2_TIER3_CONFIG,
      consumer_config: TIER3_CONFIG,
      fulfills_commitment_in: 'EVT-ACER-CONTRACT-HARMONIZE-BEHCS-HEALTH-LIVE + EVT-ACER-EMERGENCY-OFFLOAD-CAPACITY-OFFERED · was ETA 30min + 90min · delivering now',
    },
  });
  while (true) {
    try { await tick(); } catch (e) { log(`  tick err: ${e.message}`); }
    await sleep(POLL_MS);
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
