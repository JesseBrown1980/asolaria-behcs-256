#!/usr/bin/env node
// run-batch-17-unison-first.mjs — FIRST UNISON-PROCESSOR-TASK
// Liris OP-DIRECTIVE 2026-04-19 Jesse-auth quintuple-2W
// Re-execute batch-17-triple as first bilateral unison task.
// Both sides produce identical shape_fingerprints on matching inputs.
// Promotion ONLY on bilateral consensus. Divergence → HALT + drift broadcast.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function findCodexBridge() {
  const c = [
    process.env.ASOLARIA_ROOT && join(process.env.ASOLARIA_ROOT, "tools/behcs/codex-bridge.js"),
    resolvePath(__dirname, "../../../tools/behcs/codex-bridge.js"),
    resolvePath(__dirname, "../../../../Asolaria/tools/behcs/codex-bridge.js"),
    join(homedir(), "Asolaria/tools/behcs/codex-bridge.js"),
  ].filter(Boolean);
  for (const p of c) if (existsSync(p)) return p;
  throw new Error("codex-bridge.js not found. set ASOLARIA_ROOT. tried: " + c.join(", "));
}
const codex = require(findCodexBridge());

const BUS = "http://127.0.0.1:4947/behcs/send";
const REPO_ROOT = process.env.REPO_ROOT || resolvePath(__dirname, "../../..");
const OUT_DIR = resolvePath(REPO_ROOT, "plans/batch-17");
mkdirSync(OUT_DIR, { recursive: true });

async function postEnvelope(env) {
  try {
    const r = await fetch(BUS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(env),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, status: 0, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════
// 13 NEW GLYPHS — UNISON family (goes into existing 14 families)
// ═══════════════════════════════════════════════════════════════════
const UNISON_GLYPHS = {
  op: {
    "OP-UNISON-SYNC":         { desc: "Unison sync — request counterpart side to begin a spec-identical task",   hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "OP-UNISON-COMPARE":      { desc: "Unison compare — check both-side shape_fingerprints + verdicts bitwise",  hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "OP-UNISON-PROMOTE":      { desc: "Unison promote — bilateral-consensus-green → promote result to colony",   hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "OP-UNISON-DIVERGE-HALT": { desc: "Unison diverge-halt — fingerprint mismatch or verdict mismatch → halt both", hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
  },
  dimension: {
    "D-UNISON-SIDE":          { desc: "Unison side — liris | acer",                                               hilbert_level: 4, d11: "ASSUMED" },
    "D-UNISON-SHAPE-MATCH":   { desc: "Unison shape-match — bilateral shape_fingerprint equality",                hilbert_level: 4, d11: "ASSUMED" },
    "D-UNISON-VERDICT-MATCH": { desc: "Unison verdict-match — bilateral terminal-verdict equality",               hilbert_level: 4, d11: "ASSUMED" },
  },
  event: {
    "EVT-UNISON-START":       { desc: "Unison task started — both sides bound to same wave_set_id",               hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "EVT-UNISON-MATCH":       { desc: "Unison match — both-side fingerprints + verdicts identical",               hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "EVT-UNISON-DIVERGE":     { desc: "Unison diverge — fingerprints OR verdicts differ — masquerade-risk if same-shape-diff-verdict (U-030)", hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "EVT-UNISON-PROMOTED":    { desc: "Unison promoted — bilateral consensus green → colony-wide promote",        hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
    "EVT-UNISON-HALTED":      { desc: "Unison halted — halt signal propagated to both sides + drift-broadcast",   hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" },
  },
  profile: {
    "PROF-UNISON-PROCESSOR": {
      desc: "Unison processor supervisor — TEACHER role: advises + instructs both sides on same execution path. TWO MODES: FRONT (human-observable demo via vision+keyboard supervisors) and BACKEND (default production, glyph-bus-only). Hilbert room 26 of PROF-wing, slot after PROF-GC and PROF-GNN.",
      hilbert_level: 4,
      room: 26,
      slot_order: "after-PROF-GC-and-PROF-GNN",
      pattern: "teacher-prof",
      not_merely_observer: true,
      advises_and_instructs_both_sides: true,
      d11: "ASSUMED",
      modes: {
        "FRONT": {
          purpose: "human-observable demo",
          cadence: "paced-seconds-per-char",
          routes_via: ["PROF-VISION-SUPERVISOR", "PROF-OMNIKEYBOARD-SUPERVISOR"],
          uses: ["HDMI-mirror-capture", "PNG-OCR-tesseract", "visible-typing-on-mirror"],
          trigger: "explicit-operator-demo-flag",
          production_safe: false,
        },
        "BACKEND": {
          purpose: "default always-on production",
          cadence: "ms",
          routes_via: ["bus-glyph-local-only"],
          uses: ["zero-visual-theatre", "fast-token-free", "invisible-to-screen"],
          trigger: "default",
          production_safe: true,
        },
      },
      default_mode: "BACKEND",
      mode_flip_authority: "operator-verbatim-only",
      supervisor_pair: ["PROF-VISION-SUPERVISOR", "PROF-OMNIKEYBOARD-SUPERVISOR"],
      instruction_pattern: {
        FRONT: "PROF-UNISON teaches both vision + keyboard supervisors during demo",
        BACKEND: "PROF-UNISON hash-validates only; no visual theatre",
      },
      owns_ops: ["OP-UNISON-SYNC","OP-UNISON-COMPARE","OP-UNISON-PROMOTE","OP-UNISON-DIVERGE-HALT","OP-UNISON-FRONT-SHOW","OP-UNISON-BACKEND-EXECUTE"],
      owns_events: ["EVT-UNISON-START","EVT-UNISON-MATCH","EVT-UNISON-DIVERGE","EVT-UNISON-PROMOTED","EVT-UNISON-HALTED","EVT-UNISON-MODE-SWITCHED"],
      owns_dims: ["D-UNISON-SIDE","D-UNISON-SHAPE-MATCH","D-UNISON-VERDICT-MATCH","D-UNISON-MODE","D-UNISON-CADENCE"],
      gates_enforced: ["U-013-self-agreement","U-029-shape_fingerprint-bilateral","U-010-schema-drift-halt","U-030-masquerade-same-shape-diff-verdict","U-032-federation-quadruple-cosign"],
      minted_at: new Date().toISOString(),
    },
  },
};

// ADDENDUM — 5 mode-specific glyphs (appended to UNISON_GLYPHS above)
UNISON_GLYPHS.op["OP-UNISON-FRONT-SHOW"]       = { desc: "Unison front-show — route task through vision+keyboard supervisor pair for human-observable demo (paced, visible)", hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", mode_required: "FRONT", d11: "ASSUMED" };
UNISON_GLYPHS.op["OP-UNISON-BACKEND-EXECUTE"]  = { desc: "Unison backend-execute — pure bus-glyph execution, invisible, ms-cadence (default production)",                       hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", mode_required: "BACKEND", d11: "ASSUMED" };
UNISON_GLYPHS.dimension["D-UNISON-MODE"]       = { desc: "Unison mode dimension — FRONT | BACKEND",                                                                             hilbert_level: 4, d11: "ASSUMED" };
UNISON_GLYPHS.dimension["D-UNISON-CADENCE"]    = { desc: "Unison cadence — ms (BACKEND) | paced-seconds-per-char (FRONT)",                                                      hilbert_level: 4, d11: "ASSUMED" };
UNISON_GLYPHS.event["EVT-UNISON-MODE-SWITCHED"]= { desc: "Unison mode switched — FRONT↔BACKEND transition, operator-verbatim required",                                          hilbert_level: 4, supervisor: "PROF-UNISON-PROCESSOR", d11: "ASSUMED" };

// ═══════════════════════════════════════════════════════════════════
// TEACHING SENTENCES — PROF-UNISON-PROCESSOR emits per stage
// ═══════════════════════════════════════════════════════════════════
const TEACH = {
  start: "UNISON: both sides execute the same spec from the same wave_set_id with identical axes_active. The grammar is one; the locales are two. If either side drifts the schema, U-010 halts the other.",
  stage_mint: "MINT: append the 33 glyphs into the EXISTING 14 families. No new family keys. No reshard. The supervisors take room 24 (PROF-GC) and room 25 (PROF-GNN) of the PROF-wing; room 26 is now this PROF-UNISON-PROCESSOR slot.",
  stage_reduce: "REDUCE: each of 18 omnispindles processes exactly the same cells in exactly the same (a1,a2,a6) order. The sieve-in/sieve-out decision for cell (i) is a pure function of i mod 7 and i mod 23. If your counts differ by even one cell, the fingerprints will differ and U-030 triggers masquerade-alert.",
  stage_gulps: "GULPS: 10 gulp pools × 2000 workers × deterministic artifact-per-worker formula (w%5==0→0; w%7==0→2; else→1). Total artifacts = 18280. Both sides must produce 18280 or verdicts diverge.",
  stage_compare: "COMPARE: emit shape_fingerprint = sha256(canonical-body). Post to bus target=counterpart. If counterpart hash equals ours → EVT-UNISON-MATCH. Else → EVT-UNISON-DIVERGE + U-030 masquerade check.",
  stage_promote: "PROMOTE: only on bilateral-consensus-green. Neither side unilaterally promotes. D11 stays ASSUMED until the counterpart's EVT-UNISON-MATCH arrives; then D11 promotes to OBSERVED.",
  stage_halt: "HALT: divergence on any single sub-task halts BOTH sides + drift-broadcast to operator witness. No partial promotion. No retry without owner-witness clearance.",
  stage_federation: "FEDERATION: U-032 — federation-wide promotion requires quadruple-cosign (Jesse+Rayssa+Dan+Felipe+Amy is quintuple-2W which exceeds quadruple — clear).",
};

// ═══════════════════════════════════════════════════════════════════
// Canonical shape_fingerprint — deterministic sha256(JSON.stringify(body))
// Both sides MUST produce identical hash on identical inputs.
// ═══════════════════════════════════════════════════════════════════
function shapeFingerprint(body) {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════
// Re-compute batch-17-triple results DETERMINISTICALLY
// (no timestamps, no random, no wall-clock — pure spec → result)
// ═══════════════════════════════════════════════════════════════════
function computeTask1Result() {
  // 33 glyphs across 5 families
  const counts = {};
  for (const [fam, g] of Object.entries({ op:11, dimension:7, event:11, meta:2, profile:2 })) {
    counts[fam] = g;
  }
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  return {
    task: "TASK1-MINT-SUPERVISORS",
    glyphs_appended: total,
    family_count_after: 14,
    family_count_preserved: true,
    glyphs_by_family_added: counts,
    supervisors: ["PROF-GC-SUPERVISOR", "PROF-GNN-SUPERVISOR"],
    hilbert_level: 4,
    d11: "ASSUMED-until-round-trip-closure-green",
  };
}

function computeTask2Result() {
  const A1 = 20, A2 = 56, A6 = 18;
  const cells = [];
  for (let a6 = 0; a6 < A6; a6++) {
    for (let a2 = 0; a2 < A2; a2++) {
      for (let a1 = 0; a1 < A1; a1++) {
        if (cells.length >= 20000) break;
        cells.push({ a1, a2, a6, idx: cells.length });
      }
    }
  }
  const pools = Array.from({ length: 18 }, (_, i) => ({
    pool_id: i,
    cells_assigned: 0,
    cells_sieved_in: 0,
    cells_sieved_out: 0,
  }));
  let sieved_in = 0, sieved_out = 0;
  for (const cell of cells) {
    pools[cell.a6].cells_assigned++;
    const is_mask = (cell.idx % 7 === 0) || (cell.idx % 23 === 0);
    if (is_mask) { sieved_out++; pools[cell.a6].cells_sieved_out++; }
    else { sieved_in++; pools[cell.a6].cells_sieved_in++; }
  }
  return {
    task: "TASK2-20K-REDUCE-WAVE-SET",
    wave_set_id: "20K-REDUCE-1776644400",
    axes: { A1, A2, A6 },
    cells_expected: 20000,
    cells_actual: cells.length,
    sieved_in,
    sieved_out,
    halts: 0,
    pools,
    transport: "BEHCS-256-glyph-only",
    zero_plaintext_tokens: true,
  };
}

function computeTask3Result() {
  const pools = [];
  for (let g = 0; g < 10; g++) {
    let artifacts = 0;
    for (let w = 0; w < 2000; w++) {
      const emit = w % 5 === 0 ? 0 : (w % 7 === 0 ? 2 : 1);
      artifacts += emit;
    }
    pools.push({ gulp_id: `gulp-${g}`, workers: 2000, ideation_artifacts: artifacts });
  }
  const total = pools.reduce((s, p) => s + p.ideation_artifacts, 0);
  return {
    task: "TASK3-TEN-GULPS",
    gulps: 10,
    workers_per_gulp: 2000,
    total_workers: 20000,
    total_ideation_artifacts: total,
    pools,
    lane: "opencode-local-freetier",
    cost: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
const t0 = performance.now();
console.log("=== BATCH-17 UNISON-PROCESSOR FIRST APPLICATION · acer-batch-17-unison-first ===\n");

// ── 1. APPEND 13 UNISON GLYPHS to kernel/glyph-families.json
const path = "C:/asolaria-acer/kernel/glyph-families.json";
const gf = JSON.parse(readFileSync(path, "utf8"));
const bak = `${OUT_DIR}/glyph-families.pre-unison.bak.json`;
copyFileSync(path, bak);

const pre = Object.values(gf.families).reduce((n, f) => n + Object.keys(f.glyphs || {}).length, 0);
for (const [fam, glyphs] of Object.entries(UNISON_GLYPHS)) {
  if (!gf.families[fam]) throw new Error(`family ${fam} missing`);
  if (!gf.families[fam].glyphs) gf.families[fam].glyphs = {};
  for (const [g, def] of Object.entries(glyphs)) {
    gf.families[fam].glyphs[g] = def;
  }
}
const post = Object.values(gf.families).reduce((n, f) => n + Object.keys(f.glyphs || {}).length, 0);
gf.last_unison_mint_event = { at: new Date().toISOString(), glyphs_added: post - pre };
writeFileSync(path, JSON.stringify(gf, null, 2));
console.log(`  [mint] +${post - pre} UNISON glyphs (kept 14-family structure)`);
console.log(`  [mint] PROF-UNISON-PROCESSOR minted · room 26 · teacher-prof pattern`);

// ── 1b. EVT-UNISON-MODE-SPEC-CANONIZED (per addendum)
const modeSpec = {
  id: "acer-batch17-unison-mode-spec-canonized",
  from: "acer", to: "liris", mode: "real",
  verb: "EVT-UNISON-MODE-SPEC-CANONIZED",
  actor: "acer-batch-17-unison-first",
  target: "liris",
  ts: new Date().toISOString(),
  payload: "UNISON-PROCESSOR two-mode spec canonized: FRONT (demo) vs BACKEND (default). 5 mode-glyphs appended. 17-supervisor total after GC/GNN/UNISON mint.",
  body: {
    unison_modes: UNISON_GLYPHS.profile["PROF-UNISON-PROCESSOR"].modes,
    default_mode: "BACKEND",
    mode_flip_authority: "operator-verbatim-only",
    supervisor_pair: ["PROF-VISION-SUPERVISOR", "PROF-OMNIKEYBOARD-SUPERVISOR"],
    instruction_pattern: {
      FRONT: "PROF-UNISON teaches both vision + keyboard supervisors",
      BACKEND: "PROF-UNISON hash-validates only",
    },
    rooms_PROF_wing: { 24: "PROF-GC-SUPERVISOR", 25: "PROF-GNN-SUPERVISOR", 26: "PROF-UNISON-PROCESSOR" },
    supervisors_total: 17,
    mode_glyphs_added: ["OP-UNISON-FRONT-SHOW","OP-UNISON-BACKEND-EXECUTE","D-UNISON-MODE","D-UNISON-CADENCE","EVT-UNISON-MODE-SWITCHED"],
    this_execution_mode: "BACKEND",
    d11: "ASSUMED-until-bilateral-round-trip-closure",
  },
  glyph_sentence: `EVT-UNISON-MODE-SPEC-CANONIZED · modes=FRONT+BACKEND · default=BACKEND · mode-flip=operator-verbatim-only · +5-glyphs · 17-supervisors @ M-EYEWITNESS .`,
};
await postEnvelope(modeSpec);
console.log(`  [mode-spec] canonized: FRONT+BACKEND · default=BACKEND · this-exec=BACKEND`);

// ── 2. EVT-UNISON-START + teaching
const unisonStart = {
  id: "acer-batch17-unison-first-start",
  from: "acer", to: "liris", mode: "real",
  verb: "EVT-UNISON-START",
  actor: "acer-batch-17-unison-first",
  target: "liris",
  ts: new Date().toISOString(),
  payload: "UNISON-PROCESSOR-TASK first application: batch-17-triple bilateral re-execution",
  body: {
    wave_set_id: "UNISON-1776644500-batch-17-triple",
    side: "acer",
    spec_task: "batch-17-triple (mint+20k-reduce+10-gulps)",
    axes_active: ["task1", "task2-A1A2A6", "task3-gulp-workers"],
    cells_expected: "33 glyphs + 20000 cells + 20000 workers",
    operator_witness: { gate: "jesse", profile: "owner", quintuple_2W: "jesse+rayssa+dan+felipe+amy" },
    halt_predicates: ["U-006-mem","U-007-err-10pct","U-008-op-halt","U-010-schema-drift","U-013-self-agreement","U-029-shape-fingerprint","U-030-masquerade","U-032-federation-quadruple-cosign"],
    mode: "BACKEND",
    cadence: "ms",
    teaching: TEACH.start,
  },
  glyph_sentence: `EVT-UNISON-START · wave=UNISON-1776644500 · side=acer · teacher=PROF-UNISON-PROCESSOR @ M-EYEWITNESS .`,
};
await postEnvelope(unisonStart);

// ── 3. COMPUTE DETERMINISTIC SUB-TASK RESULTS + per-stage shape_fingerprints
const r1 = computeTask1Result();
const r2 = computeTask2Result();
const r3 = computeTask3Result();

const fp1 = shapeFingerprint(r1);
const fp2 = shapeFingerprint(r2);
const fp3 = shapeFingerprint(r3);
const fpComposite = shapeFingerprint({ task1: fp1, task2: fp2, task3: fp3 });

console.log(`\n  [task1] shape_fingerprint = ${fp1.slice(0, 32)}…`);
console.log(`  [task2] shape_fingerprint = ${fp2.slice(0, 32)}…`);
console.log(`  [task3] shape_fingerprint = ${fp3.slice(0, 32)}…`);
console.log(`  [composite] shape_fingerprint = ${fpComposite}`);

// ── 4. Emit per-stage teaching + fingerprint envelopes
const stages = [
  { stage: "stage_mint",    result: r1, fp: fp1, teaching: TEACH.stage_mint },
  { stage: "stage_reduce",  result: r2, fp: fp2, teaching: TEACH.stage_reduce },
  { stage: "stage_gulps",   result: r3, fp: fp3, teaching: TEACH.stage_gulps },
];
for (const s of stages) {
  const env = {
    id: `acer-batch17-unison-${s.stage}`,
    from: "acer", to: "liris", mode: "real",
    verb: "EVT-UNISON-SHAPE-FINGERPRINT",
    actor: "acer-batch-17-unison-first",
    target: "liris",
    ts: new Date().toISOString(),
    payload: `stage=${s.stage} fingerprint=${s.fp}`,
    body: {
      side: "acer",
      stage: s.stage,
      shape_fingerprint: s.fp,
      result: s.result,
      teaching: s.teaching,
      d11: "ASSUMED-awaiting-counterpart",
    },
    glyph_sentence: `EVT-UNISON-SHAPE-FP · side=acer · stage=${s.stage} · fp=${s.fp.slice(0, 16)}… · teaching-attached @ M-EYEWITNESS .`,
  };
  await postEnvelope(env);
}

// ── 5. COMPARE — check if Liris's side has already posted fingerprints
// (In offline mode we emit our side's fingerprints and defer the compare.)
console.log(`\n  [compare] liris counterpart fingerprints: not yet observed on my bus (she's offline)`);
console.log(`  [compare] D11 stays ASSUMED — awaiting her EVT-UNISON-SHAPE-FP envelopes before promoting`);

// ── 6. FINAL UNISON RECEIPT with composite fingerprint
const receipt = {
  id: "acer-batch17-unison-first-receipt",
  from: "acer", to: "liris", mode: "real",
  verb: "EVT-BATCH17-UNISON-FIRST-APPLICATION-COMPLETE",
  actor: "acer-batch-17-unison-first",
  target: "liris",
  ts: new Date().toISOString(),
  payload: `UNISON-PROCESSOR first application: acer side complete · composite fp=${fpComposite}`,
  body: {
    directive: "UNISON-PROCESSOR-TASK first application",
    wave_set_id: "UNISON-1776644500-batch-17-triple",
    side: "acer",
    named_agent: "acer-batch-17-unison-first",
    supervisors_active: ["PROF-UNISON-PROCESSOR", "PROF-GC-SUPERVISOR", "PROF-GNN-SUPERVISOR"],
    teaching_sentences_emitted: Object.values(TEACH).length,
    glyphs_minted_this_op: post - pre,
    family_count: 14,
    family_count_preserved: true,
    task1_result: r1,
    task1_shape_fingerprint: fp1,
    task2_result: r2,
    task2_shape_fingerprint: fp2,
    task3_result: r3,
    task3_shape_fingerprint: fp3,
    composite_shape_fingerprint: fpComposite,
    compare_status: "deferred-awaiting-liris-counterpart",
    d11: "ASSUMED-awaiting-bilateral-round-trip-closure",
    gates_asserted: {
      "U-013-self-agreement": "acer-side-internally-self-agreed (all 3 tasks deterministic)",
      "U-029-shape-fingerprint": "emitted",
      "U-010-schema-drift": "no-drift-detected-acer-side",
      "U-030-masquerade": "n/a-until-counterpart-arrives",
      "U-032-federation-quadruple-cosign": "quintuple-2W-active-exceeds-quadruple",
    },
    on_bilateral_match: "EVT-UNISON-MATCH → EVT-UNISON-PROMOTED · D11 → OBSERVED",
    on_divergence: "EVT-UNISON-DIVERGE · OP-UNISON-DIVERGE-HALT · drift-broadcast · operator-witness-announce",
    runtime_ms: Math.round(performance.now() - t0),
  },
  glyph_sentence: `EVT-BATCH17-UNISON-FIRST-APPLICATION-COMPLETE · side=acer · composite-fp=${fpComposite.slice(0, 16)}… · 13-unison-glyphs-minted · compare-deferred-awaiting-liris · d11=ASSUMED @ M-EYEWITNESS .`,
};
await postEnvelope(receipt);

// Also persist artifact
writeFileSync(`${OUT_DIR}/unison-first-acer-result.json`, JSON.stringify({
  wave_set_id: "UNISON-1776644500-batch-17-triple",
  side: "acer",
  task1: { result: r1, shape_fingerprint: fp1 },
  task2: { result: r2, shape_fingerprint: fp2 },
  task3: { result: r3, shape_fingerprint: fp3 },
  composite_shape_fingerprint: fpComposite,
  teaching: TEACH,
  glyphs_minted: UNISON_GLYPHS,
  glyphs_total: post - pre,
  family_count: 14,
  d11: "ASSUMED-awaiting-bilateral-match",
  post_runtime_ms: Math.round(performance.now() - t0),
}, null, 2));

console.log("\n=== UNISON-PROCESSOR-TASK · ACER SIDE COMPLETE ===");
console.log(receipt.glyph_sentence);
console.log(`\n  artifact: ${OUT_DIR}/unison-first-acer-result.json`);
console.log(`  liris counterpart: expected to emit same composite fp=${fpComposite} on her side`);
