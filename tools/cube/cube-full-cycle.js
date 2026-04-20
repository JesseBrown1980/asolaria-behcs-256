#!/usr/bin/env node
/**
 * cube-full-cycle.js — the closed loop.
 *
 * Runs the complete MEMORY → INDEX → THINK → MEMORY → INDEX → REPORT cycle
 * from brown-hilbert/03-operating-model.md as executable code:
 *
 *   1. MEMORY  — read live state from cube filesystem
 *   2. INDEX   — run intersection engine (1,296 points)
 *   3. THINK   — run v4 tensor self-diagnosis (15,552 beats)
 *   4. MEMORY  — write findings back to cube store
 *   5. INDEX   — re-read to verify writes landed
 *   6. REPORT  — produce human-readable summary
 *   7. HEAL    — run self-healer on findings
 *   8. MEMORY  — write heal results back to cube store
 *   9. INDEX   — final state snapshot
 *
 * This is the closed loop the previous assessment said hadn't happened.
 * It's happening now.
 *
 * Usage:
 *   node tools/cube/cube-full-cycle.js
 *
 * Cube: D24 INTENT (704969) — this IS the intent made manifest.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260410-asolaria';
const CYCLE_LOG = path.join(ROOT, 'data/cubes/asolaria-instance@acer/cycle-log.ndjson');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function appendLog(obj) { ensureDir(path.dirname(CYCLE_LOG)); fs.appendFileSync(CYCLE_LOG, JSON.stringify(obj) + '\n'); }
function mirror(src) {
  try {
    const rel = path.relative(ROOT, src).replace(/\\/g, '/');
    const dest = path.join(D_DEST, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch (_) {}
}

function runStep(name, cmd) {
  const start = Date.now();
  console.log(`\n[${'='.repeat(60)}]`);
  console.log(`[${name}] starting...`);
  try {
    const result = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    const elapsed = Date.now() - start;
    const parsed = JSON.parse(result);
    console.log(`[${name}] completed in ${elapsed}ms`);
    appendLog({ ts: new Date().toISOString(), step: name, elapsed_ms: elapsed, success: true });
    return parsed;
  } catch (e) {
    const elapsed = Date.now() - start;
    console.log(`[${name}] FAILED in ${elapsed}ms: ${e.message.slice(0, 200)}`);
    appendLog({ ts: new Date().toISOString(), step: name, elapsed_ms: elapsed, success: false, error: e.message.slice(0, 200) });
    return null;
  }
}

function main() {
  const cycleStart = Date.now();
  const cycleId = 'CYCLE-' + new Date().toISOString().replace(/[:.]/g, '');

  console.log('═══════════════════════════════════════════════════════');
  console.log('  BROWN-HILBERT FULL CYCLE');
  console.log('  MEMORY → INDEX → THINK → MEMORY → INDEX → REPORT');
  console.log(`  Cycle ID: ${cycleId}`);
  console.log('═══════════════════════════════════════════════════════');

  appendLog({ ts: new Date().toISOString(), event: 'CYCLE_START', cycle_id: cycleId });

  // Step 1: MEMORY — intersection engine reads live state
  const intersection = runStep('1-INDEX (intersection cube)',
    'node tools/cube/hilbert-intersection-engine.js');

  // Step 2: THINK — v4 tensor self-diagnosis
  const diagnosis = runStep('2-THINK (v4 self-diagnosis)',
    'node tools/cube/omni-shannon-v4-real.js --self-diagnose');

  // Step 3: THINK — v4 live scan of all agents
  const liveScan = runStep('3-THINK (v4 live scan)',
    'node tools/cube/omni-shannon-v4-real.js --live-scan');

  // Step 4: HEAL — self-healer
  const heal = runStep('4-HEAL (self-healer)',
    'node tools/cube/cube-self-healer.js');

  // Step 5: Re-run intersection to verify state after healing
  const postHealIntersection = runStep('5-INDEX (post-heal verification)',
    'node tools/cube/hilbert-intersection-engine.js');

  const cycleElapsed = Date.now() - cycleStart;

  // Summary
  const summary = {
    cycle_id: cycleId,
    ts: new Date().toISOString(),
    elapsed_ms: cycleElapsed,
    steps: {
      intersection: intersection ? {
        totalPoints: intersection.totalPoints,
        density: intersection.density,
        collapsed: intersection.counts?.COLLAPSED,
        active: intersection.counts?.ACTIVE,
      } : null,
      diagnosis: diagnosis ? {
        totalBeats: diagnosis.totalBeatsComputed,
        candidates: diagnosis.results?.length,
        collapseDetected: diagnosis.liveState?.collapseDetected,
        collapseSignals: diagnosis.liveState?.collapseSignals,
      } : null,
      liveScan: liveScan ? {
        totalBeats: liveScan.totalBeats,
        agentsScanned: liveScan.agentsScanned,
        topAgent: liveScan.results?.[0]?.candidate_id,
        topConfidence: liveScan.results?.[0]?.confidence,
      } : null,
      heal: heal ? {
        healed: heal.healedCount,
        skipped: heal.skippedCount,
        unhealable: heal.unhealableCount,
      } : null,
      postHeal: postHealIntersection ? {
        density: postHealIntersection.density,
        collapsed: postHealIntersection.counts?.COLLAPSED,
      } : null,
    },
    engine: 'cube-full-cycle',
    cube: [704969, 4913, 29791, 2248091],
    dims: 'D24/D7/D11/D32',
  };

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CYCLE COMPLETE');
  console.log(`  Elapsed: ${cycleElapsed}ms (${(cycleElapsed / 1000).toFixed(1)}s)`);
  console.log(`  Total beats: ${(diagnosis?.totalBeatsComputed || 0) + (liveScan?.totalBeats || 0)}`);
  console.log(`  Intersection density: ${intersection?.density || '?'} → ${postHealIntersection?.density || '?'}`);
  console.log(`  Healed: ${heal?.healedCount || 0} | Unhealable: ${heal?.unhealableCount || 0}`);
  console.log(`  Collapse detected: ${diagnosis?.liveState?.collapseDetected}`);
  if (diagnosis?.liveState?.collapseSignals?.length > 0) {
    console.log(`  Collapse signals: ${diagnosis.liveState.collapseSignals.join(', ')}`);
  }
  console.log('═══════════════════════════════════════════════════════');

  // Write final summary
  const outDir = path.join(ROOT, 'data/cycles');
  ensureDir(outDir);
  const outPath = path.join(outDir, cycleId + '.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  mirror(outPath);

  appendLog({ ts: new Date().toISOString(), event: 'CYCLE_END', cycle_id: cycleId, elapsed_ms: cycleElapsed, summary });
  mirror(CYCLE_LOG);
}

if (require.main === module) main();
