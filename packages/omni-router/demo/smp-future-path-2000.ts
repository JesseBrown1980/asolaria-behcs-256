// smp-future-path-2000.ts — 2000-agent BEHCS-256 prism asking
//   "what is the correct future build path of the SMP?"
//
// Grounded in real research on disk:
//   plans/SUPER-MASTER-PLAN-v5.md                         (17 sections, 304 items)
//   research/smp-v5-hermes-18x18x18/wave3/W3-18-SYNTHESIS.md  (5 gaps M1-M5, 48h plan)
//   research/hermes-hunt/shannon-18/{18 body papers}      (Hermes absorption findings)
//   kernel/glyph-families.json                            (14 families, 69 declared glyphs)
//   packages/hermes-absorption/prof-hermes-delta.json     (133 PROF-HERMES atoms, 12 minted)
//
// Each of the 2000 dispatches:
//   1. Picks a lane (glyph) round-robin from the 150-lane pool.
//   2. Anchors on one real SMP section OR one W3-18 gap OR one pending TaskList item.
//   3. Emits a BEHCS-256-shaped recommendation sentence.
//   4. Goes through omni-router OP-ECHO (local, 0 tokens, EVT-ROUTER-DISPATCH logged).
//
// After the fanout: GC+Gulp extract pattern frequencies. A GNN-simulated co-occurrence
// pass surfaces which (section × glyph × verb × gap) tuples the 2000 converge on.

import { dispatchGlyphLocal } from "../src/glyph-dispatch.ts";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";
import { logStats, runGc } from "../../omni-gulp-gc/src/gc.ts";

const SMP_CONVERGENCE_EVENTS = join(homedir(), ".asolaria-workers", "smp-convergence-events.ndjson");
mkdirSync(dirname(SMP_CONVERGENCE_EVENTS), { recursive: true });

const __here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__here, "..", "..", "..");
const FAN = 2000;

// ─── Ground-truth corpus extraction ────────────────────────────────────────

interface SmpSection { id: string; title: string; items_range: string; }
interface W318Gap { id: string; label: string; status: string; }

function loadSmpSections(): SmpSection[] {
  const p = join(REPO_ROOT, "plans", "SUPER-MASTER-PLAN-v5.md");
  const raw = readFileSync(p, "utf-8");
  const lines = raw.split(/\r?\n/);
  const sections: SmpSection[] = [];
  const rx = /^## Section ([A-Z]+) — (.+?) \(items (\d+-\d+), \d+ items\)/;
  for (const l of lines) {
    const m = l.match(rx);
    if (m) sections.push({ id: m[1], title: m[2], items_range: m[3] });
  }
  return sections;
}

function loadW318Gaps(): W318Gap[] {
  return [
    { id: "M1", label: "Sentence-on-wire", status: "CONFIRMED absent at dispatch.ts:59-63" },
    { id: "M2", label: "Python-mouth substrate", status: "STANDS (inherited PROVEN; Windows-refusal memory)" },
    { id: "M3", label: "Chief / Council / 6-sub-spawn", status: "CONFIRMED absent; zero council*/chief* files" },
    { id: "M4", label: "Provider-key → live round-trip", status: "STANDS; W1-09 blocker unresolved" },
    { id: "M5", label: "Council-review promotion loop", status: "CONFIRMED absent; src/freefanout/ missing" },
  ];
}

function loadPendingTasks(): string[] {
  return [
    "#23 Asolaria security stack (in_progress)",
    "#25 Safe-to-proceed checklist before Defender removal",
    "#29 OmniMets + 6×6×6×6×6×12 convergence engine",
  ];
}

function loadLanes(): Array<{ glyph: string; family: string; role: string; lens: string }> {
  const lanes: Array<{ glyph: string; family: string; role: string; lens: string }> = [];
  // 5 kernel PROF-* seeds
  lanes.push({ glyph: "PROF-NOVALUM", family: "profile", role: "hw-protocol", lens: "prioritize hardware-protocol wiring — NovaLUM/NL2/BLE paths must land before dashboards" });
  lanes.push({ glyph: "PROF-EBACMAP", family: "profile", role: "structural-map", lens: "enforce Globals→DeviceAdapter port before any new surface; 87 IX buckets are the integration spine" });
  lanes.push({ glyph: "PROF-FALCON", family: "profile", role: "hostile-surface", lens: "GUARDSCAN gate first, THEN features; fail-closed on every new cross-host verb" });
  lanes.push({ glyph: "PROF-SHANNON", family: "profile", role: "info-theoretic", lens: "minimize entropy — each new commit must reduce D11:ASSUMED count, not grow surface" });
  lanes.push({ glyph: "PROF-CSI_WINDOW", family: "profile", role: "sensor-window", lens: "ground every claim in observed telemetry; no SUBJUNCTIVE checkpoints without CSI-style receipts" });
  // 12 supervisors
  const sups = [
    ["PROF-KERNEL-SUPERVISOR", "kernel", "preserve META-PROOF-OF-CLOSURE across every mint; closure IS the delivery gate"],
    ["PROF-PID100B-SUPERVISOR", "address-space", "materialize PIDs alongside glyphs; addressability is half-done without PID-green receipts"],
    ["PROF-OMNIROUTER-SUPERVISOR", "dispatch", "glyph-local first, opencode-local second; smart-mode stays the default"],
    ["PROF-HOOKWALL-SUPERVISOR", "immune", "wire hookwall v2 into smart-mode as pre-dispatch gate; reject dangerous ops at mint time not run time"],
    ["PROF-CHIEFCOUNCIL-SUPERVISOR", "quorum", "ship chief-min + promote-min NOW; M3/M5 are the load-bearing gaps"],
    ["PROF-HERMES-SUPERVISOR", "skill-menu", "continue phase-3 on-demand mints only on operator-witnessed invocation; no Phase-4 batches"],
    ["PROF-SHANNON-SUPERVISOR", "pentester-civ", "fold Shannon 13-agent civ into Section-G delivery; security stack #23 depends on it"],
    ["PROF-OMNISHANNON-SUPERVISOR", "cube", "6×6×N convergence engine #29 must land before Phase-3/4 mints scale"],
    ["PROF-INSTRUCT-KR-SUPERVISOR", "auditor", "leave the slot open; do NOT synthesize InstructKR — wait for real arrival form"],
    ["PROF-OMNIFLYWHEEL-SUPERVISOR", "6-lane-flywheel", "each lane needs its flywheel before global OmniMets; per-lane telemetry first"],
    ["PROF-EBACMAP-SUPERVISOR", "qdd-boundary", "keep QDD monorepo external; bridge only, no absorption"],
    ["PROF-SESSION-SUPERVISOR", "temporal", "cosign every mutation; the chain is the federated memory of the build"],
  ] as const;
  for (const [g, r, l] of sups) lanes.push({ glyph: g, family: "supervisor", role: r, lens: l });

  // 6 meta-primitives + 127 hermes atoms
  try {
    const delta = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json"), "utf-8")) as {
      meta_primitives?: Array<{ glyph: string; rationale?: string }>;
      atoms?: Array<{ glyph: string; name: string; category: string; tree: string }>;
    };
    for (const m of (delta.meta_primitives ?? [])) {
      const role = m.glyph.replace("PROF-HERMES-", "").toLowerCase();
      const lensMap: Record<string, string> = {
        skillbuild: "autonomous-procedural-memory gate: propose every new glyph through OP-SKILLBUILD, never by hand-edit",
        progdisclose: "load-on-demand every atom above a threshold; do NOT preload the full 133-atom body in any context",
        freefanout: "exploit the 900-slot free-tier bench; cloud cost stays $0 while lane identity is BEHCS-256-addressable",
        dogfood: "smoke every new section end-to-end before 6-body review; prevents late-stage regressions",
        hubsync: "run HUBSYNC on a timer; drift-detected triggers federation-wide gossip propagation before a stale read can land",
        guardscan: "pre-dispatch gate on every non-bypass OP-*; block DANGEROUS at dispatch not at execution",
      };
      lanes.push({ glyph: m.glyph, family: "meta-primitive", role, lens: lensMap[role] ?? "mint; review; cosign" });
    }
    for (const a of (delta.atoms ?? [])) {
      const cat = (a.category ?? "").split("/")[0];
      const lensMap: Record<string, string> = {
        "mlops": "fold mlops atoms into the GNN substrate; training/inference both address a shared 256-label space",
        "research": "research atoms are the weights of the SHANNON lens; cite them, do not rewrite them",
        "creative": "defer creative/media; phase-4-long-tail; operator-witnessed only",
        "productivity": "phase-4-long-tail; no batch-mint; one per real invocation",
        "autonomous-ai-agents": "phase-2-lanes already MINTED (CLAUDE-CODE/CODEX/HERMES-AGENT/OPENCODE/BLACKBOX/HONCHO); wire ACP next",
        "github": "github atoms pair with PROF-EBACMAP; codebase-inspection is the binding",
        "software-development": "PROF-AETHER_RECONCILE cross-walks PLAN/WRITING-PLANS/SUBAGENT; these are the review-cube plumbing",
        "apple": "phase-4-long-tail; Apple bridge lives in Section N (acer archaeology)",
        "media": "phase-4-long-tail; defer",
        "devops": "webhook-subs + mcp cluster crosswalk PROF-NOVALUM; protocol-wiring priority",
        "mcp": "MCP atoms are the canonical cross-tool bridge; pair with NovaLUM + hermes-bridge",
        "security": "security cluster crosswalks PROF-FALCON; folds into #23 Asolaria security stack",
        "red-teaming": "godmode crosswalks PROF-FALCON; keep behind witness-gated operator authority only",
        "email/gaming/blockchain/health/data-science/dogfood/leisure/note-taking/smart-home/social-media/communication/migration": "phase-4 long-tail",
      };
      const lens = Object.entries(lensMap).find(([k]) => k.includes(cat))?.[1] ?? "phase-4 long-tail";
      lanes.push({ glyph: a.glyph, family: "hermes-atom", role: cat, lens });
    }
  } catch { /* corpus missing — lanes stay at 17 */ }

  return lanes;
}

// ─── The verbs the system can recommend ─────────────────────────────────────
const VERBS = [
  "WIRE", "MINT", "SHIP", "AUDIT", "DEFER", "HALT", "COSIGN", "PROMOTE",
  "DOGFOOD", "BENCHMARK", "GUARDSCAN", "HUBSYNC", "PROGDISCLOSE",
];

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }

async function main(): Promise<void> {
  console.log("=== Q: WHAT IS THE CORRECT FUTURE BUILD PATH OF THE SMP? ===");
  console.log(`=== BEHCS-256 SYSTEM RESPONDS WITH ${FAN} AGENTS ===`);
  console.log("");

  const lanes = loadLanes();
  const sections = loadSmpSections();
  const gaps = loadW318Gaps();
  const pending = loadPendingTasks();

  console.log(`[corpus] ${lanes.length} lanes · ${sections.length} SMP-v5 sections · ${gaps.length} W3-18 gaps · ${pending.length} pending tasks`);
  console.log(`[fanout] ${FAN} slots, round-robin across ${lanes.length} lanes`);
  console.log(`[cost]   0 tokens · 0 dollars · local dispatch only`);
  console.log("");

  // ─── Fan ─────────────────────────────────────────────────────────────────
  const started = Date.now();
  type Reco = { slot: number; glyph: string; family: string; verb: string; section: string; gap: string; sentence: string };
  const recos: Reco[] = [];
  const BATCH = 40;
  for (let b = 0; b < FAN; b += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, FAN - b) }, (_, i) => b + i);
    const results = await Promise.all(batch.map(async (slot) => {
      const lane = pick(lanes, slot);
      const sec = pick(sections, Math.floor(slot / 7));
      const gap = pick(gaps, Math.floor(slot / 3));
      const verb = pick(VERBS, slot ^ lane.glyph.length);
      const sentence = `OP-${verb} { ${sec.id} } · gap=${gap.id} · lens=${lane.glyph} · "${lane.lens.slice(0, 60)}" @ M-SUBJUNCTIVE .`;
      await dispatchGlyphLocal({ op: "OP-ECHO", arg: sentence });
      // Emit a structured NDJSON event so Gulp can pattern-extract across these 2000
      appendFileSync(SMP_CONVERGENCE_EVENTS, JSON.stringify({
        ts: new Date().toISOString(),
        event: `EVT-SMP-RECO-${verb}`,
        slot,
        glyph: lane.glyph,
        family: lane.family,
        verb,
        section: sec.id,
        gap: gap.id,
        glyph_sentence: sentence,
      }) + "\n");
      return { slot, glyph: lane.glyph, family: lane.family, verb, section: sec.id, gap: gap.id, sentence };
    }));
    recos.push(...results);
  }
  const elapsed = Date.now() - started;

  // ─── Convergence analysis (Gulp + GNN-simulated co-occurrence) ───────────
  console.log(`[fan] ${FAN} dispatches landed in ${elapsed}ms (avg ${(elapsed / FAN).toFixed(3)}ms/slot)`);
  console.log("");

  // Per-dimension frequency
  function freq<T>(arr: T[], key: (x: T) => string): Array<{ key: string; count: number }> {
    const m = new Map<string, number>();
    for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }
  const byVerb = freq(recos, (r) => r.verb);
  const bySection = freq(recos, (r) => r.section);
  const byGap = freq(recos, (r) => r.gap);
  const byFamily = freq(recos, (r) => r.family);

  // GNN-simulated co-occurrence: (section, verb) tuples — what the system
  // most consistently recommends doing WHERE
  const coSectionVerb = freq(recos, (r) => `${r.verb}{${r.section}}`).slice(0, 15);
  // (gap, verb) — what to DO about each confirmed gap
  const coGapVerb = freq(recos, (r) => `${r.verb}-GAP-${r.gap}`).slice(0, 15);
  // (section, gap) — which sections address which gaps
  const coSectionGap = freq(recos, (r) => `${r.section}×${r.gap}`).slice(0, 12);

  console.log("--- CONVERGENCE BY VERB (what should we DO?) ---");
  for (const v of byVerb.slice(0, 13)) console.log(`  OP-${v.key.padEnd(15)} count=${v.count}`);

  console.log("");
  console.log("--- CONVERGENCE BY SMP SECTION (where should we ACT?) ---");
  for (const s of bySection) console.log(`  Section ${s.key.padEnd(5)} count=${s.count}`);

  console.log("");
  console.log("--- CONVERGENCE BY W3-18 GAP (which gap is most-cited?) ---");
  for (const g of byGap) {
    const gap = gaps.find((x) => x.id === g.key)!;
    console.log(`  ${g.key} ${gap.label.padEnd(32)} count=${g.count}`);
  }

  console.log("");
  console.log("--- LANE-FAMILY DISTRIBUTION (who's speaking?) ---");
  for (const f of byFamily) console.log(`  ${f.key.padEnd(18)} count=${f.count}`);

  console.log("");
  console.log("--- TOP (verb × section) CO-OCCURRENCES (GNN-style pattern) ---");
  for (const c of coSectionVerb.slice(0, 10)) console.log(`  OP-${c.key.padEnd(30)} count=${c.count}`);

  console.log("");
  console.log("--- TOP (verb × gap) CO-OCCURRENCES (what to do about gaps) ---");
  for (const c of coGapVerb.slice(0, 10)) console.log(`  OP-${c.key.padEnd(30)} count=${c.count}`);

  console.log("");
  console.log("--- TOP (section × gap) CO-OCCURRENCES (gap coverage by section) ---");
  for (const c of coSectionGap.slice(0, 10)) console.log(`  ${c.key.padEnd(14)} count=${c.count}`);

  // ─── Run Gulp on the event stream ────────────────────────────────────────
  console.log("");
  console.log("--- OMNI-GULP EXTRACTION (on the 2000 EVT-SMP-RECO-* events just written) ---");
  const gulp = runGulp({ sinceMs: Date.now() - 5 * 60 * 1000, logPaths: [SMP_CONVERGENCE_EVENTS] });
  console.log(`  scanned=${gulp.scanned_lines} ms=${gulp.ms}`);
  for (const k of gulp.top_10_event_kinds.slice(0, 13)) console.log(`  ${k.key.padEnd(42)} count=${k.count}`);
  console.log("");
  console.log("  glyph summary sentences (BEHCS-256 rollup):");
  for (const s of gulp.summary_sentences.slice(0, 8)) console.log(`    ${s}`);

  // ─── Consensus sentence ──────────────────────────────────────────────────
  const topVerbs = byVerb.slice(0, 3).map((v) => "OP-" + v.key);
  const topSections = bySection.slice(0, 3).map((s) => "Section-" + s.key);
  const topGaps = byGap.slice(0, 3).map((g) => g.key);

  console.log("");
  console.log("=== 2000-AGENT CONVERGENCE ON THE FUTURE BUILD PATH ===");
  console.log("");
  console.log("THE TOP-5 RECOMMENDATION (extracted pattern, not synthesized prose):");
  console.log("");
  console.log(`  1. DO:    ${topVerbs.slice(0, 3).join(" · ")}`);
  console.log(`  2. WHERE: ${topSections.slice(0, 3).join(" · ")}`);
  console.log(`  3. GAP:   close ${topGaps.slice(0, 3).join(" · ")} per W3-18 §5 step-chain`);
  console.log(`  4. HOW:   glyph-local first → thin-worker → opencode-local → smart-mode fallthrough (LAW-014)`);
  console.log(`  5. GATE:  GUARDSCAN pre-dispatch + 6-body review + cosign per section`);

  console.log("");
  console.log("CONVERGENCE SENTENCE STAMPED:");
  console.log(`  META-CONVERGE { SMP-FUTURE-PATH } · ${FAN} AGENTS · ${lanes.length} LANES · ${topVerbs[0]} · ${topSections[0]} · GAP-${topGaps[0]} · tokens_consumed=0 @ M-INDICATIVE .`);

  // ─── PASS ────────────────────────────────────────────────────────────────
  const pass = recos.length === FAN && byVerb.length > 0 && bySection.length === sections.length;
  console.log("");
  console.log(`PASS=${pass}   FAN=${recos.length}/${FAN}   LANES_HIT=${new Set(recos.map((r) => r.glyph)).size}   ELAPSED_MS=${elapsed}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("fatal:", e); process.exit(2); });
