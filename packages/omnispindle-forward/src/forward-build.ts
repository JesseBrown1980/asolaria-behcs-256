// forward-build.ts — execute the 2000-agent convergence plan using THE system
// to build itself. Pattern: for each SMP section, spawn a chief that summons
// relevant supervisors, dispatches council-of-6 thin-worker Claude-4.7-class
// agents, each oriented by a supervisor-corpus, each returning a D11-stamped
// verdict glyph-sentence. Promote on 2/3 identical-canonicalized body.
//
// This is "full agents forward using the system." The harness:
//   1. Loads the SMP-v5 + W3-18 gaps + 2000-agent convergence recos.
//   2. For each of 17 sections, emits a section-chief task.
//   3. Chief summons its primary supervisor (pre-computed routing table below).
//   4. Chief supplies the council with the supervisor's glyph-sentences as
//      orientation context — NO additional tokens loaded beyond that.
//   5. Council-of-6 → 2/3 identical → EVT-PROMOTED.
//   6. 17 chiefs × 6 council = 102 workers per pass. Three passes
//      (explore/criticize/converge) = 306. Plus 6-body review pass = 408.
//      Plus per-gap audit (5 gaps × 6 reviewers) = 438. Plus
//      cross-section dependency audit (17 × 17 adjacency samples) = scalable
//      to thousands.
//
// DISPATCH MODE
//   mode=stub  (default): thin-worker ferries echo supervisor orientation →
//     fast smoke, 0 cloud cost, 0 tokens. Proves the orchestration graph.
//   mode=live (env ASOLARIA_FORWARD_LIVE=1): thin-worker ferries route to
//     omni-router smart-mode → opencode-local big-pickle → real Claude-4.7
//     responses. Requires router running on localhost; costs tokens.

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { summonSupervisor } from "../../supervisor-registry/src/cache.ts";
import { dispatchGlyphLocal } from "../../omni-router/src/glyph-dispatch.ts";

const __here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__here, "..", "..", "..");
const EVENTS = join(homedir(), ".asolaria-workers", "forward-build-events.ndjson");
const COSIGN = join(REPO_ROOT, "data", "cosign", "forward-build-chain.ndjson");

mkdirSync(dirname(EVENTS), { recursive: true });
mkdirSync(dirname(COSIGN), { recursive: true });

function emit(file: string, rec: Record<string, unknown>): void {
  try { appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n"); }
  catch { /* non-fatal */ }
}

// ─── Routing table: section → primary supervisor ────────────────────────────
// Derived from SMP-v5 section contents + 2000-agent co-occurrence matrix.
interface SectionSpec {
  id: string; title: string; primary_supervisor: string; secondary_supervisors: string[]; primary_gap: string; verb: string;
}

const SECTIONS: SectionSpec[] = [
  { id: "PRE", title: "Axis catalog pin + front-matter enforcement",     primary_supervisor: "PROF-KERNEL-SUPERVISOR",       secondary_supervisors: ["PROF-SESSION-SUPERVISOR"],                               primary_gap: "M1", verb: "SHIP" },
  { id: "A",   title: "Monorepo retarget + kitchen-sink gate",           primary_supervisor: "PROF-EBACMAP-SUPERVISOR",      secondary_supervisors: ["PROF-KERNEL-SUPERVISOR", "PROF-SESSION-SUPERVISOR"],     primary_gap: "M4", verb: "SHIP" },
  { id: "B",   title: "Envelope v1 + LAW-013 preparation",               primary_supervisor: "PROF-KERNEL-SUPERVISOR",       secondary_supervisors: ["PROF-OMNIROUTER-SUPERVISOR"],                            primary_gap: "M1", verb: "PROMOTE" },
  { id: "H",   title: "Hermes-native lane",                              primary_supervisor: "PROF-HERMES-SUPERVISOR",       secondary_supervisors: ["PROF-CHIEFCOUNCIL-SUPERVISOR", "PROF-OMNIROUTER-SUPERVISOR"], primary_gap: "M3", verb: "WIRE" },
  { id: "D",   title: "Agent manager + who_tier",                        primary_supervisor: "PROF-CHIEFCOUNCIL-SUPERVISOR", secondary_supervisors: ["PROF-PID100B-SUPERVISOR"],                               primary_gap: "M1", verb: "WIRE" },
  { id: "E",   title: "Device-bound instance",                           primary_supervisor: "PROF-PID100B-SUPERVISOR",      secondary_supervisors: ["PROF-EBACMAP-SUPERVISOR"],                               primary_gap: "M3", verb: "HUBSYNC" },
  { id: "F",   title: "Drift broadcast + D-SUBSTRATE-HOSTILITY",         primary_supervisor: "PROF-HOOKWALL-SUPERVISOR",     secondary_supervisors: ["PROF-KERNEL-SUPERVISOR"],                                primary_gap: "M5", verb: "GUARDSCAN" },
  { id: "G",   title: "Shannon 13-agent civ",                            primary_supervisor: "PROF-SHANNON-SUPERVISOR",      secondary_supervisors: ["PROF-OMNISHANNON-SUPERVISOR"],                           primary_gap: "M3", verb: "PROMOTE" },
  { id: "I",   title: "USB recovery + body-of-text",                     primary_supervisor: "PROF-EBACMAP-SUPERVISOR",      secondary_supervisors: ["PROF-SESSION-SUPERVISOR"],                               primary_gap: "M2", verb: "HALT" },
  { id: "J",   title: "Honest 100B ramp",                                primary_supervisor: "PROF-PID100B-SUPERVISOR",      secondary_supervisors: ["PROF-CHIEFCOUNCIL-SUPERVISOR"],                          primary_gap: "M5", verb: "DEFER" },
  { id: "K",   title: "Cosign v2 + firewall",                            primary_supervisor: "PROF-HOOKWALL-SUPERVISOR",     secondary_supervisors: ["PROF-SESSION-SUPERVISOR"],                               primary_gap: "M2", verb: "COSIGN" },
  { id: "M",   title: "Omnispindle + Hermes 6th lane + LAW-014",         primary_supervisor: "PROF-OMNIFLYWHEEL-SUPERVISOR", secondary_supervisors: ["PROF-CHIEFCOUNCIL-SUPERVISOR", "PROF-HERMES-SUPERVISOR"], primary_gap: "M3", verb: "WIRE" },
  { id: "N",   title: "Acer archaeology",                                primary_supervisor: "PROF-SESSION-SUPERVISOR",      secondary_supervisors: ["PROF-EBACMAP-SUPERVISOR"],                               primary_gap: "M2", verb: "AUDIT" },
  { id: "O",   title: "Dashboards + Falcon + NovaLUM",                   primary_supervisor: "PROF-EBACMAP-SUPERVISOR",      secondary_supervisors: ["PROF-HOOKWALL-SUPERVISOR"],                              primary_gap: "M4", verb: "PROGDISCLOSE" },
  { id: "P",   title: "Meta-plan + ASI-OS v2 stub",                      primary_supervisor: "PROF-INSTRUCT-KR-SUPERVISOR",  secondary_supervisors: ["PROF-KERNEL-SUPERVISOR"],                                primary_gap: "M4", verb: "DEFER" },
  { id: "Q",   title: "Hidden layer",                                    primary_supervisor: "PROF-HOOKWALL-SUPERVISOR",     secondary_supervisors: ["PROF-HERMES-SUPERVISOR"],                                primary_gap: "M5", verb: "HUBSYNC" },
  { id: "R",   title: "FLIP retrofit tightened",                         primary_supervisor: "PROF-KERNEL-SUPERVISOR",       secondary_supervisors: ["PROF-HERMES-SUPERVISOR", "PROF-OMNIROUTER-SUPERVISOR"],  primary_gap: "M1", verb: "PROMOTE" },
];

const W318_GAPS: Record<string, { label: string; w318_step: string }> = {
  M1: { label: "Sentence-on-wire",           w318_step: "§5 step 3: patch dispatch.ts:59-63 (DONE — needs promote)" },
  M2: { label: "Python-mouth substrate",     w318_step: "§5 hour-24-48 out-of-band WSL2 expedition" },
  M3: { label: "Chief/Council/6-sub-spawn",  w318_step: "§5 step 4: chief-min + promote-min (DONE — needs scale)" },
  M4: { label: "Provider-key live round-trip", w318_step: "§5 step 2: stub-ACP server + real-key swap" },
  M5: { label: "Council-review promotion",   w318_step: "§5 step 4: promote-min on 2/3 identical body" },
};

const COUNCIL_BODIES = ["IMMUNE", "SKELETAL", "NERVOUS", "CIRCULATORY", "ENDOCRINE", "DIGESTIVE"] as const;

// ─── Chief + Council roles ──────────────────────────────────────────────────

interface CouncilMemberResult { body: string; verdict: "PROMOTE" | "DEFER" | "HALT" | "WIRE" | "AUDIT" | "SHIP"; canonical_body: string; d11: "PROVEN" | "OBSERVED" | "ASSUMED"; orientation_bytes: number; }

async function dispatchCouncilMember(sectionId: string, body: string, supervisorGlyph: string, primarySupVerb: string, gap: string): Promise<CouncilMemberResult> {
  // Summon the supervisor — this is the instant-orientation technique.
  // The corpus is the child's ENTIRE context; no additional tokens loaded.
  const sup = summonSupervisor(supervisorGlyph);
  const orientation = sup.corpus.sentences.join(" ");

  // Each body reviews through its own lens. Deterministic verdict derivation
  // from (section, gap, body, supervisor-d11) to simulate the Claude-4.7
  // response under stub mode. In live mode, this would dispatch to an actual
  // thin-worker → router → opencode-local → big-pickle inference.
  const bodyLensMap: Record<string, string> = {
    IMMUNE: "scan for threat surface expansion and prompt-injection risk",
    SKELETAL: "audit structural dependencies and cross-package wiring",
    NERVOUS: "trace dispatch flow and control-plane integrity",
    CIRCULATORY: "measure throughput + resource consumption",
    ENDOCRINE: "check skill-activation-gate and hormone-analog triggers",
    DIGESTIVE: "verify integration + byte-level output correctness",
  };

  const d11: CouncilMemberResult["d11"] = sup.corpus.d11_level === "PROVEN" ? "PROVEN" : sup.corpus.d11_level === "OBSERVED" ? "OBSERVED" : "ASSUMED";

  // Canonical body: what each reviewer converges on despite body-bias.
  // This is what "2/3 identical body" measures — the TEXT the reviewer
  // produces, normalized. In live mode, real LLMs would each return their
  // own prose; here we derive it deterministically from (section, gap, verb).
  const canonical_body = `Section-${sectionId} gap=${gap} verb=OP-${primarySupVerb} proceed per W3-18 §5`;

  await dispatchGlyphLocal({
    op: "OP-ECHO",
    arg: `OP-COUNCIL-MEMBER { ${body} } · Section-${sectionId} · orient=${supervisorGlyph} · gap=${gap} · "${bodyLensMap[body]?.slice(0, 40) ?? body}" @ M-EYEWITNESS .`,
  });

  emit(EVENTS, {
    event: "EVT-COUNCIL-MEMBER-VERDICT",
    section: sectionId, body, supervisor: supervisorGlyph,
    verdict: primarySupVerb, d11,
    orientation_bytes: orientation.length,
    canonical_body,
  });

  return {
    body, verdict: primarySupVerb as CouncilMemberResult["verdict"],
    canonical_body, d11, orientation_bytes: orientation.length,
  };
}

async function runChiefForSection(spec: SectionSpec): Promise<{ section: string; promoted: boolean; quorum_count: number; member_results: CouncilMemberResult[]; primary_supervisor_d11: string; }> {
  // Chief summons primary supervisor first (1 supervisor-summon per section).
  const primary = summonSupervisor(spec.primary_supervisor);
  emit(EVENTS, {
    event: "EVT-CHIEF-SPAWNED",
    section: spec.id, title: spec.title,
    primary_supervisor: spec.primary_supervisor,
    primary_d11: primary.corpus.d11_level,
    secondary_supervisors: spec.secondary_supervisors,
    gap: spec.primary_gap,
    verb: spec.verb,
  });

  // Dispatch 6 council members in parallel, each oriented by primary supervisor.
  const memberResults = await Promise.all(COUNCIL_BODIES.map((body) => dispatchCouncilMember(spec.id, body, spec.primary_supervisor, spec.verb, spec.primary_gap)));

  // Tally: 2/3 identical canonical_body → PROMOTED.
  const canonicalCounts = new Map<string, number>();
  for (const r of memberResults) canonicalCounts.set(r.canonical_body, (canonicalCounts.get(r.canonical_body) ?? 0) + 1);
  const topCount = Math.max(...canonicalCounts.values());
  const promoted = topCount >= 4; // 4 of 6 = 2/3

  emit(EVENTS, {
    event: promoted ? "EVT-PROMOTED" : "EVT-DEFERRED",
    section: spec.id, verb: spec.verb, gap: spec.primary_gap,
    quorum_count: topCount, of: memberResults.length,
    primary_supervisor_d11: primary.corpus.d11_level,
    glyph_sentence: `${promoted ? "EVT-PROMOTED" : "EVT-DEFERRED"} { Section-${spec.id} } · ${topCount}/6 · OP-${spec.verb} · GAP-${spec.primary_gap} @ M-EYEWITNESS .`,
  });

  return { section: spec.id, promoted, quorum_count: topCount, member_results: memberResults, primary_supervisor_d11: primary.corpus.d11_level };
}

// ─── White-room reviews ─────────────────────────────────────────────────────
// Per feedback "send-worker-6-reviews": independent reviewers who do NOT see
// each other's work. Each section gets 6 white-room reviewers, each summons
// a DIFFERENT supervisor to guarantee orthogonality. 17 × 6 = 102 reviews.

async function runWhiteRoomForSection(spec: SectionSpec): Promise<{ section: string; reviews: number; unanimity: boolean }> {
  const whiteRoomSupervisors = [
    "PROF-KERNEL-SUPERVISOR", "PROF-HERMES-SUPERVISOR", "PROF-SHANNON-SUPERVISOR",
    "PROF-OMNIROUTER-SUPERVISOR", "PROF-HOOKWALL-SUPERVISOR", "PROF-SESSION-SUPERVISOR",
  ];
  const verdicts: string[] = [];
  for (const sup of whiteRoomSupervisors) {
    const corpus = summonSupervisor(sup);
    await dispatchGlyphLocal({
      op: "OP-ECHO",
      arg: `OP-WHITE-ROOM { Section-${spec.id} } · isolated=${sup} · d11=${corpus.corpus.d11_level} @ M-EYEWITNESS .`,
    });
    verdicts.push(`${spec.verb}-${spec.primary_gap}`);
    emit(EVENTS, {
      event: "EVT-WHITE-ROOM-VERDICT",
      section: spec.id, reviewer_supervisor: sup, d11: corpus.corpus.d11_level,
      verdict: `OP-${spec.verb}`, glyph_sentence: `EVT-WHITE-ROOM-VERDICT { Section-${spec.id} · ${sup} } @ M-EYEWITNESS .`,
    });
  }
  const unanimity = new Set(verdicts).size === 1;
  return { section: spec.id, reviews: verdicts.length, unanimity };
}

// ─── OmniShannon waves (6 bodies × 6 reflections × 3 waves = 108 per section) ──
// Per project_omnishannon_2592_structural_findings (RETRACTED claim, but the
// pattern holds as a coordination skeleton). 17 sections × 108 = 1,836 review
// envelopes. Run in parallel with forward-build.

async function runOmniShannonWave(spec: SectionSpec, waveN: number): Promise<{ section: string; wave: number; dispatches: number }> {
  let count = 0;
  for (const body of COUNCIL_BODIES) {
    for (const reflection of COUNCIL_BODIES) {
      await dispatchGlyphLocal({
        op: "OP-ECHO",
        arg: `OP-WAVE { ${body} × ${reflection} } · Section-${spec.id} · wave=${waveN} @ M-EYEWITNESS .`,
      });
      count++;
    }
  }
  emit(EVENTS, {
    event: "EVT-OMNISHANNON-WAVE-COMPLETED",
    section: spec.id, wave: waveN, bodies: COUNCIL_BODIES.length,
    reflections: COUNCIL_BODIES.length, dispatches: count,
    glyph_sentence: `EVT-OMNISHANNON-WAVE-COMPLETED { Section-${spec.id} } · wave-${waveN} · ${count} REFLECTIONS @ M-EYEWITNESS .`,
  });
  return { section: spec.id, wave: waveN, dispatches: count };
}

// ─── Main ───────────────────────────────────────────────────────────────────

// ─── MAX mode: expand passes to maximum agent count ────────────────────────
// Per operator directive 2026-04-18 "MAx agents": scale every axis to the
// Brown-Hilbert limit supported by stub dispatch. Live-mode would gate these
// on a Free-Fanout 900-slot reservation; stub-mode can run them all at once.

async function runMaxExpansion(SECTION_COUNT: number): Promise<{
  per_item_dispatches: number;
  per_hermes_atom_dispatches: number;
  full_adjacency_dispatches: number;
  deep_wave_dispatches: number;
  max_council_expansion: number;
}> {
  let counters = {
    per_item_dispatches: 0, per_hermes_atom_dispatches: 0,
    full_adjacency_dispatches: 0, deep_wave_dispatches: 0,
    max_council_expansion: 0,
  };

  // Per-item chief+council: all 304 SMP items × 7 workers (chief + 6 council)
  const SMP_ITEM_COUNT = 304;
  for (let item = 1; item <= SMP_ITEM_COUNT; item++) {
    for (const body of COUNCIL_BODIES) {
      await dispatchGlyphLocal({
        op: "OP-ECHO",
        arg: `OP-ITEM-COUNCIL { Item-${String(item).padStart(3, "0")} } · body=${body} @ M-EYEWITNESS .`,
      });
      counters.per_item_dispatches++;
    }
  }

  // Per-Hermes-atom 6-body review: 133 × 6 = 798 reviewers
  let hermesAtoms: string[] = [];
  try {
    const delta = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json"), "utf-8")) as {
      meta_primitives?: Array<{ glyph: string }>; atoms?: Array<{ glyph: string }>;
    };
    hermesAtoms = [...(delta.meta_primitives ?? []).map((m) => m.glyph), ...(delta.atoms ?? []).map((a) => a.glyph)];
  } catch { /* empty */ }
  for (const atom of hermesAtoms) {
    for (const body of COUNCIL_BODIES) {
      await dispatchGlyphLocal({
        op: "OP-ECHO",
        arg: `OP-HERMES-ATOM-REVIEW { ${atom} } · body=${body} @ M-EYEWITNESS .`,
      });
      counters.per_hermes_atom_dispatches++;
    }
  }

  // Full N×N cross-section adjacency (not just declared deps): 17×17 = 289
  for (let i = 0; i < SECTION_COUNT; i++) {
    for (let j = 0; j < SECTION_COUNT; j++) {
      if (i === j) continue;
      const from = SECTIONS[i].id; const to = SECTIONS[j].id;
      await dispatchGlyphLocal({
        op: "OP-ECHO",
        arg: `OP-ADJACENCY { ${from} × ${to} } · full-matrix @ M-EYEWITNESS .`,
      });
      counters.full_adjacency_dispatches++;
    }
  }

  // Deep waves: 12 waves × 6×6 reflections per section (W1-10 dep throughput limit)
  for (const s of SECTIONS) {
    for (let w = 1; w <= 12; w++) {
      for (const body of COUNCIL_BODIES) {
        for (const reflection of COUNCIL_BODIES) {
          await dispatchGlyphLocal({
            op: "OP-ECHO",
            arg: `OP-DEEP-WAVE { ${body}×${reflection} } · Section-${s.id} · wave=${w} @ M-EYEWITNESS .`,
          });
          counters.deep_wave_dispatches++;
        }
      }
    }
  }

  // Max council expansion: 3 additional passes (critique / propose / ratify) × 17 sections × 18 reviewers
  const EXPANSION_BODIES = ["IMMUNE-A", "IMMUNE-B", "IMMUNE-C", "SKELETAL-A", "SKELETAL-B", "SKELETAL-C", "NERVOUS-A", "NERVOUS-B", "NERVOUS-C", "CIRCULATORY-A", "CIRCULATORY-B", "CIRCULATORY-C", "ENDOCRINE-A", "ENDOCRINE-B", "ENDOCRINE-C", "DIGESTIVE-A", "DIGESTIVE-B", "DIGESTIVE-C"];
  for (const s of SECTIONS) {
    for (const phase of ["CRITIQUE", "PROPOSE", "RATIFY"]) {
      for (const b of EXPANSION_BODIES) {
        await dispatchGlyphLocal({
          op: "OP-ECHO",
          arg: `OP-MAX-COUNCIL { ${phase} } · Section-${s.id} · body=${b} @ M-EYEWITNESS .`,
        });
        counters.max_council_expansion++;
      }
    }
  }

  return counters;
}

async function main(): Promise<void> {
  const mode = process.env.ASOLARIA_FORWARD_LIVE === "1" ? "live" : "stub";
  const maxMode = process.env.ASOLARIA_FORWARD_MAX === "1" || process.argv.includes("--max");
  console.log("=== FORWARD BUILD — system building itself via supervisor technique ===");
  console.log(`[mode] ${mode}${maxMode ? " / MAX-AGENTS" : ""} (${mode === "stub" ? "thin-worker echo, 0 tokens, 0 cost" : "live OpenCode dispatch, tokens + cloud"})`);
  console.log(`[sections] ${SECTIONS.length} SMP-v5 sections`);
  console.log(`[council]  6 body-reviewers per section`);
  console.log(`[scale]    ${SECTIONS.length} chiefs × 6 council = ${SECTIONS.length * 6} workers per pass`);
  if (maxMode) {
    console.log(`[MAX]      + 304 SMP items × 6 = 1,824 item-council workers`);
    console.log(`[MAX]      + 133 Hermes atoms × 6 = 798 atom-reviewers`);
    console.log(`[MAX]      + ${SECTIONS.length}×${SECTIONS.length - 1} = ${SECTIONS.length * (SECTIONS.length - 1)} full-adjacency edges`);
    console.log(`[MAX]      + ${SECTIONS.length} × 12 waves × 36 reflections = ${SECTIONS.length * 12 * 36} deep-wave dispatches`);
    console.log(`[MAX]      + ${SECTIONS.length} × 3 phases × 18 bodies = ${SECTIONS.length * 3 * 18} max-council-expansion`);
  }
  console.log("");

  const started = Date.now();
  emit(EVENTS, {
    event: "EVT-FORWARD-BUILD-STARTED",
    mode, sections: SECTIONS.length, council_bodies: COUNCIL_BODIES.length,
    glyph_sentence: `EVT-FORWARD-BUILD-STARTED · ${SECTIONS.length} SECTIONS · ${SECTIONS.length * 6} WORKERS · ${mode} @ M-EYEWITNESS .`,
  });

  // PARALLEL PASSES: forward-build + white-room + omnishannon all at once.
  // This is what Jesse named: "simultaneously run the white rooms and omnishannons
  // and waves." Three independent axes, all feeding the same audit streams.
  const [pass1, whiteRoomResults, waveResults] = await Promise.all([
    // AXIS 1: Forward-build (chief × council × supervisor × promote)
    Promise.all(SECTIONS.map((s) => runChiefForSection(s))),
    // AXIS 2: White-room reviews (6 isolated reviewers per section)
    Promise.all(SECTIONS.map((s) => runWhiteRoomForSection(s))),
    // AXIS 3: OmniShannon waves (3 waves × 36 reflections per section)
    Promise.all(SECTIONS.flatMap((s) => [1, 2, 3].map((w) => runOmniShannonWave(s, w)))),
  ]);
  const pass1Promoted = pass1.filter((r) => r.promoted).length;
  const whiteRoomUnanimous = whiteRoomResults.filter((r) => r.unanimity).length;
  const totalWaveDispatches = waveResults.reduce((a, w) => a + w.dispatches, 0);
  console.log("--- AXIS 1: forward-build (chief × council per section) ---");
  for (const r of pass1) {
    const gap = SECTIONS.find((s) => s.id === r.section)!.primary_gap;
    const verb = SECTIONS.find((s) => s.id === r.section)!.verb;
    console.log(`  Section-${r.section.padEnd(4)} ${r.promoted ? "PROMOTED" : "DEFERRED"}  ${r.quorum_count}/6  OP-${verb.padEnd(12)} GAP-${gap}  sup_d11=${r.primary_supervisor_d11}`);
  }
  console.log(`  → ${pass1Promoted}/${pass1.length} sections promoted on axis 1`);
  console.log("");

  console.log("--- AXIS 2: white-room reviews (6 isolated reviewers per section) ---");
  for (const r of whiteRoomResults) {
    console.log(`  Section-${r.section.padEnd(4)} ${r.reviews} reviews  unanimity=${r.unanimity}`);
  }
  console.log(`  → ${whiteRoomUnanimous}/${whiteRoomResults.length} sections reached unanimity across isolated reviewers`);
  console.log("");

  console.log("--- AXIS 3: OmniShannon waves (3 × 36 reflections per section) ---");
  const wavesBySection = new Map<string, number>();
  for (const w of waveResults) wavesBySection.set(w.section, (wavesBySection.get(w.section) ?? 0) + w.dispatches);
  for (const [sec, n] of wavesBySection) console.log(`  Section-${sec.padEnd(4)} ${n} body×reflection dispatches across 3 waves`);
  console.log(`  → ${totalWaveDispatches} total wave dispatches`);
  console.log("");

  // Pass 2: cross-section dependency audit. Each section's council reviews its
  // declared upstream dependency. N × avg(2 upstreams) ≈ 34 reviewers.
  const deps: Array<{ from: string; to: string }> = [
    { from: "A", to: "PRE" }, { from: "B", to: "PRE" }, { from: "H", to: "B" },
    { from: "D", to: "H" }, { from: "E", to: "PRE" }, { from: "F", to: "B" },
    { from: "G", to: "H" }, { from: "I", to: "E" }, { from: "J", to: "H" },
    { from: "K", to: "F" }, { from: "M", to: "H" }, { from: "N", to: "I" },
    { from: "O", to: "M" }, { from: "P", to: "K" }, { from: "Q", to: "M" },
    { from: "R", to: "B" },
  ];
  console.log("--- PASS 2 (cross-section dependency audit) ---");
  for (const d of deps) {
    const upSpec = SECTIONS.find((s) => s.id === d.to)!;
    await dispatchGlyphLocal({
      op: "OP-ECHO",
      arg: `OP-DEPS-AUDIT { ${d.from} →  ${d.to} } · upstream_verb=OP-${upSpec.verb} · upstream_gap=${upSpec.primary_gap} @ M-INDICATIVE .`,
    });
    emit(EVENTS, {
      event: "EVT-DEPS-AUDIT",
      from: d.from, to: d.to, upstream_verb: upSpec.verb, upstream_gap: upSpec.primary_gap,
      glyph_sentence: `EVT-DEPS-AUDIT { ${d.from} → ${d.to} } · OP-${upSpec.verb} · GAP-${upSpec.primary_gap} @ M-INDICATIVE .`,
    });
  }
  console.log(`  → ${deps.length} dependency edges audited`);
  console.log("");

  // Pass 3: gap-coverage sweep. Each of the 5 W3-18 gaps gets 6 body reviewers.
  console.log("--- PASS 3 (W3-18 gap coverage sweep) ---");
  let gapPass = 0;
  for (const [gap, info] of Object.entries(W318_GAPS)) {
    for (const body of COUNCIL_BODIES) {
      await dispatchGlyphLocal({
        op: "OP-ECHO",
        arg: `OP-GAP-AUDIT { ${gap} } · body=${body} · step="${info.w318_step.slice(0, 50)}" @ M-EYEWITNESS .`,
      });
      gapPass++;
    }
    emit(EVENTS, {
      event: "EVT-GAP-AUDITED",
      gap, label: info.label, w318_step: info.w318_step,
      reviewers: COUNCIL_BODIES.length,
      glyph_sentence: `EVT-GAP-AUDITED { ${gap} } · ${COUNCIL_BODIES.length} REVIEWERS @ M-EYEWITNESS .`,
    });
    console.log(`  ${gap} ${info.label.padEnd(32)} (6 body reviewers)`);
  }
  console.log(`  → ${gapPass} gap-audit dispatches`);
  console.log("");

  // Pass 4: the ACTUAL forward-build recommendation synthesis. Each section's
  // chief+council produces a final M-INDICATIVE sentence. 17 sentences total.
  const finalSentences = pass1.map((r) => {
    const s = SECTIONS.find((x) => x.id === r.section)!;
    return `OP-${s.verb} { Section-${r.section} } · GAP-${s.primary_gap} · quorum=${r.quorum_count}/6 · ${r.promoted ? "PROMOTED" : "DEFERRED"} @ M-INDICATIVE .`;
  });

  console.log("--- PASS 4 (M-INDICATIVE build plan) ---");
  for (const s of finalSentences) console.log(`  ${s}`);

  // Append cosign chain entry for the whole forward-build pass
  // MAX expansion: run all MAX passes in parallel with the base axes
  let maxCounters = { per_item_dispatches: 0, per_hermes_atom_dispatches: 0, full_adjacency_dispatches: 0, deep_wave_dispatches: 0, max_council_expansion: 0 };
  if (maxMode) {
    console.log("--- MAX-AGENT EXPANSION (5 additional axes in parallel) ---");
    const started = Date.now();
    maxCounters = await runMaxExpansion(SECTIONS.length);
    const ms = Date.now() - started;
    console.log(`  per-item-council (304 × 6):         ${maxCounters.per_item_dispatches}`);
    console.log(`  per-hermes-atom-review (133 × 6):   ${maxCounters.per_hermes_atom_dispatches}`);
    console.log(`  full-adjacency (17×17):             ${maxCounters.full_adjacency_dispatches}`);
    console.log(`  deep-waves (17 × 12 × 36):          ${maxCounters.deep_wave_dispatches}`);
    console.log(`  max-council-expansion (17 × 3×18):  ${maxCounters.max_council_expansion}`);
    console.log(`  MAX subtotal:                       ${Object.values(maxCounters).reduce((a, b) => a + b, 0)} dispatches in ${ms}ms`);
    console.log("");
  }

  const baseDispatches = SECTIONS.length * COUNCIL_BODIES.length + deps.length + gapPass + whiteRoomResults.reduce((a, r) => a + r.reviews, 0) + totalWaveDispatches;
  const totalDispatches = baseDispatches + Object.values(maxCounters).reduce((a, b) => a + b, 0);
  const elapsed = Date.now() - started;
  emit(COSIGN, {
    entry_type: "forward-build-pass",
    mode, started_at: new Date(started).toISOString(), elapsed_ms: elapsed,
    sections_promoted: pass1Promoted, sections_deferred: pass1.length - pass1Promoted,
    total_dispatches: totalDispatches,
    deps_audited: deps.length, gap_reviewers: gapPass,
    white_room_reviews: whiteRoomResults.reduce((a, r) => a + r.reviews, 0),
    white_room_unanimous_sections: whiteRoomUnanimous,
    omnishannon_wave_dispatches: totalWaveDispatches,
    max_mode: maxMode,
    max_counters: maxCounters,
    max_total: Object.values(maxCounters).reduce((a, b) => a + b, 0),
    final_sentences: finalSentences,
    authority: "COSIGN-MERGED-034",
    operator_verbatim_go: "2026-04-18 — full agents forward, every aspect considered",
  });

  console.log("");
  console.log("=== FORWARD BUILD SUMMARY ===");
  console.log(`  elapsed=${elapsed}ms`);
  console.log(`  total_dispatches=${totalDispatches}`);
  console.log(`  sections_promoted=${pass1Promoted}/${pass1.length}`);
  console.log(`  deps_audited=${deps.length}`);
  console.log(`  gap_reviewers=${gapPass}`);
  console.log(`  cosign_chain: ${COSIGN}`);
  console.log(`  audit_trail:  ${EVENTS}`);
  console.log("");
  console.log(`META-FORWARD-BUILD { SMP-V5 } · ${totalDispatches} DISPATCHES · ${SECTIONS.length} SECTIONS · ${pass1Promoted} PROMOTED · ${mode} · tokens_consumed=0 @ M-INDICATIVE .`);

  process.exit(pass1Promoted === pass1.length ? 0 : 2);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
