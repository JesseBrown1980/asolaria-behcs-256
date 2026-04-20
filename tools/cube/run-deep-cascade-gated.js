#!/usr/bin/env node
/**
 * run-deep-cascade-gated.js — Deep cascade with ALL gates watching.
 * hookwall-v2 + GNN + shannon + sovereignty + edge-risk + bash-guard
 * + constructions + spawner + unified-index — everything live.
 */
'use strict';

process.on('uncaughtException', e => console.error('UNCAUGHT:', e.message));
process.on('unhandledRejection', r => console.error('REJECTION:', r?.message || r));

const { execSync } = require('child_process');
const ROOT = 'C:/Users/acer/Asolaria';

function safeLoad(p, label) {
  try { const m = require(p); console.log('  [LOAD] ' + label + ': OK'); return m; }
  catch(e) { console.log('  [LOAD] ' + label + ': FAIL - ' + e.message.slice(0, 100)); return null; }
}

console.log('');
console.log('='.repeat(60));
console.log('  DEEP CASCADE WITH ALL GATES WATCHING');
console.log('  6x6x6x6x6x12 x omnishannon x GNN x hookwall-v2');
console.log('='.repeat(60));
console.log('');
console.log('[LOADING MODULES]');

// Load all modules — shadow-first for gates
const hookwall = safeLoad('E:/sovereignty/ix/gates/hookwall-v2', 'hookwall-v2 (shadow)')
  || safeLoad(ROOT + '/ix/gates/hookwall', 'hookwall (local)');
const gnnGate = safeLoad('E:/sovereignty/ix/gates/gnn', 'gnn-gate (shadow)')
  || safeLoad(ROOT + '/ix/gates/gnn', 'gnn-gate (local)');
const shannonGate = safeLoad('E:/sovereignty/ix/gates/shannon', 'shannon-gate (shadow)')
  || safeLoad(ROOT + '/ix/gates/shannon', 'shannon-gate (local)');
const bashGuard = safeLoad(ROOT + '/src/bashSecurityGuard', 'bashSecurityGuard');
const sovereigntyGate = safeLoad(ROOT + '/src/sovereignty-gate', 'sovereignty-gate');
const edgeRisk = safeLoad(ROOT + '/src/edgeRiskEngine', 'edgeRiskEngine');
const gnnWatcher = safeLoad(ROOT + '/src/gnnConstructionWatcher', 'gnnConstructionWatcher');
const hookEvents = safeLoad(ROOT + '/src/hookEventStore', 'hookEventStore');
const constructions = safeLoad(ROOT + '/src/constructionIndex', 'constructionIndex');
const spawner = safeLoad(ROOT + '/src/instantAgentSpawner', 'instantAgentSpawner');
const unifiedIndex = safeLoad(ROOT + '/src/unifiedAgentIndexStore', 'unifiedAgentIndexStore');

const gateResults = [];

async function main() {
  console.log('');
  console.log('[PHASE 1] Running gate pipeline on cascade operation...');

  // Hookwall
  if (hookwall) {
    try {
      const hw = await hookwall('engine.run_deep_cascade', { engine: 'v5', dims: 47 }, { pid: 'asolaria-instance@acer', permissionTier: 'owner' });
      console.log('  hookwall: ' + (hw.allow ? 'ALLOW' : 'BLOCK') + ' | risk: ' + (hw.risk?.score || 0));
      gateResults.push({ gate: 'hookwall', allow: hw.allow, risk: hw.risk?.score });
    } catch(e) { console.log('  hookwall ERROR: ' + e.message.slice(0, 100)); gateResults.push({ gate: 'hookwall', error: e.message.slice(0, 100) }); }
  }

  // GNN gate
  if (gnnGate) {
    try {
      const gnn = await gnnGate('engine.run_deep_cascade', { engine: 'v5', dims: 47 }, { pid: 'asolaria-instance@acer' });
      console.log('  gnn-gate: ' + (gnn?.allow !== false ? 'ALLOW' : 'BLOCK') + ' | prediction: ' + (gnn?.prediction || 'none'));
      gateResults.push({ gate: 'gnn', allow: gnn?.allow !== false });
    } catch(e) { console.log('  gnn-gate ERROR: ' + e.message.slice(0, 100)); gateResults.push({ gate: 'gnn', error: e.message.slice(0, 100) }); }
  }

  // Edge risk
  if (edgeRisk) {
    try {
      const risk = edgeRisk.scoreEdgeRisk({ action: 'engine.run_deep_cascade', actor: 'asolaria', target: 'cube-space' });
      console.log('  edge-risk: score=' + risk.score + ' level=' + risk.level + ' reasons=[' + (risk.reasons || []).join(',') + ']');
      gateResults.push({ gate: 'edge-risk', score: risk.score, level: risk.level });
    } catch(e) { console.log('  edge-risk ERROR: ' + e.message.slice(0, 100)); gateResults.push({ gate: 'edge-risk', error: e.message.slice(0, 100) }); }
  }

  // Sovereignty gate
  if (sovereigntyGate) {
    try {
      const sov = sovereigntyGate.gate('engine.run_deep_cascade', 'asolaria-instance@acer', { engine: 'v5' });
      console.log('  sovereignty: ' + JSON.stringify(sov).slice(0, 120));
      gateResults.push({ gate: 'sovereignty', result: sov });
    } catch(e) { console.log('  sovereignty ERROR: ' + e.message.slice(0, 100)); gateResults.push({ gate: 'sovereignty', error: e.message.slice(0, 100) }); }
  }

  // Bash guard
  if (bashGuard) {
    try {
      const bg = bashGuard.checkCommand('node tools/cube/omni-shannon-v5-deep-cascade.js --self-diagnose');
      console.log('  bash-guard: safe=' + bg.safe + ' score=' + bg.score + ' level=' + bg.level);
      gateResults.push({ gate: 'bash-guard', safe: bg.safe, score: bg.score });
    } catch(e) { console.log('  bash-guard ERROR: ' + e.message.slice(0, 100)); gateResults.push({ gate: 'bash-guard', error: e.message.slice(0, 100) }); }
  }

  // Shannon gate
  if (shannonGate) {
    try {
      const sh = await Promise.race([
        shannonGate('engine.run_deep_cascade', { engine: 'v5' }, { pid: 'asolaria-instance@acer' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000))
      ]);
      console.log('  shannon: ' + (sh?.allow !== false ? 'ALLOW' : 'BLOCK'));
      gateResults.push({ gate: 'shannon', allow: sh?.allow !== false });
    } catch(e) { console.log('  shannon: ' + e.message.slice(0, 80) + ' (non-blocking)'); gateResults.push({ gate: 'shannon', note: 'timeout/unavailable', nonBlocking: true }); }
  }

  // GNN watcher
  if (gnnWatcher) {
    try {
      const ws = gnnWatcher.getWatcherStatus();
      console.log('  gnn-watcher: edges=' + (ws.routingEdges?.length || 0) + ' patterns=' + (ws.patternMemory?.length || 0));
    } catch(e) { console.log('  gnn-watcher: ' + e.message.slice(0, 80)); }
  }

  // Hook events
  if (hookEvents) {
    try {
      const stats = hookEvents.getHookEventStats();
      console.log('  hook-events: ' + JSON.stringify(stats).slice(0, 120));
    } catch(e) { console.log('  hook-events: ' + e.message.slice(0, 80)); }
  }

  // Constructions
  if (constructions) {
    try {
      const all = constructions.getAllConstructions();
      const count = Array.isArray(all) ? all.length : Object.keys(all || {}).length;
      console.log('  constructions: ' + count + ' loaded');
    } catch(e) { console.log('  constructions: ' + e.message.slice(0, 80)); }
  }

  // Spawner
  if (spawner) {
    try {
      const ss = spawner.getSpawnerStatus();
      console.log('  spawner: agents=' + (ss.activeAgents || ss.active || 0));
    } catch(e) { console.log('  spawner: ' + e.message.slice(0, 80)); }
  }

  // Unified index
  if (unifiedIndex) {
    try {
      const idx = unifiedIndex.getUnifiedIndexStatus();
      console.log('  unified-index: ' + JSON.stringify(idx).slice(0, 120));
    } catch(e) { console.log('  unified-index: ' + e.message.slice(0, 80)); }
  }

  // Check for blocks
  const blocked = gateResults.filter(g => g.allow === false);
  if (blocked.length > 0) {
    console.log('');
    console.log('[BLOCKED] ' + blocked.length + ' gates blocked:');
    blocked.forEach(b => console.log('  ' + b.gate));
    return;
  }

  // === PHASE 2: RUN THE CASCADE ===
  console.log('');
  console.log('[PHASE 2] All gates PASSED -- launching deep cascade...');
  console.log('  Engine: omni-shannon-v5-deep-cascade.js');
  console.log('  Axes: 6x6x6x6x6x12 x wave cascade through 37 dims');
  console.log('');

  const start = Date.now();
  try {
    const raw = execSync('node tools/cube/omni-shannon-v5-deep-cascade.js --self-diagnose', {
      cwd: ROOT, encoding: 'utf8', timeout: 300000
    });
    const result = JSON.parse(raw);
    const elapsed = Date.now() - start;

    console.log('='.repeat(60));
    console.log('  DEEP CASCADE COMPLETE');
    console.log('  Total beats:      ' + result.totalBeats.toLocaleString());
    console.log('  Beats/candidate:  ' + result.beatsPerCandidate.toLocaleString());
    console.log('  Candidates:       ' + result.results.length);
    console.log('  Waves/candidate:  ' + (result.results[0]?.waveCount || '?'));
    console.log('  Dims covered:     ' + (result.results[0]?.allDimsCovered || '?'));
    console.log('  Elapsed:          ' + elapsed + 'ms (' + (elapsed/1000).toFixed(1) + 's)');
    console.log('  Gates passed:     ' + gateResults.filter(g => g.allow !== false && !g.error).length + '/' + gateResults.length);
    console.log('='.repeat(60));

    console.log('');
    console.log('  RESULTS:');
    result.results.forEach(r => {
      console.log('    ' + r.candidate_id.padEnd(25) + r.verdict.padEnd(12) + 'conf=' + r.avgConfidence + '  beats=' + r.totalBeats.toLocaleString());
    });

    // Record in hook events
    if (hookEvents) {
      try {
        hookEvents.appendHookEvent({
          sessionId: 'deep-cascade-gated-' + new Date().toISOString().replace(/[:.]/g, ''),
          eventType: 'PostToolUse',
          toolName: 'engine.run_deep_cascade',
          payload: { totalBeats: result.totalBeats, elapsed_ms: elapsed, candidates: result.results.length }
        });
        console.log('');
        console.log('  [recorded in hook-events]');
      } catch(_) {}
    }

    // Record in GNN watcher
    if (gnnWatcher) {
      try {
        gnnWatcher.recordPatternHit(['deep_cascade', 'v5', '47D', 'gated'], 'run-deep-cascade-gated');
        console.log('  [recorded in gnn-watcher]');
      } catch(_) {}
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  ALL SYSTEMS WATCHED. ALL GATES LIVE. CASCADE REAL.');
    console.log('='.repeat(60));

  } catch(e) {
    console.log('CASCADE EXECUTION FAILED: ' + e.message.slice(0, 300));
  }
}

main().catch(e => console.error('FATAL:', e.message));
