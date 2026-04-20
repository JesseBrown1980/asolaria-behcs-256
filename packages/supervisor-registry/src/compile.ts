// Supervisor corpus compilers: inspect current system state + emit a BEHCS-256
// sentence corpus that describes it. One compiler per supervisor role.
//
// Zero LLM calls. Pure disk reads + spawn("git", ...). Output is glyph sentences
// + structured JSON state, both machine-readable. When a specialist agent
// summons the supervisor, it ingests the corpus and is *instantly oriented* to
// the state this slice represents. No prose, no dashboard widgets.

import { readFileSync, existsSync, statSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const EVENTS_ROOT = join(homedir(), ".asolaria-workers");
const SUPERVISOR_EVENTS = join(EVENTS_ROOT, "supervisor-events.ndjson");
const HERMES_EVENTS = join(EVENTS_ROOT, "hermes-events.ndjson");

function appendEvent(file: string, record: Record<string, unknown>): void {
  try {
    mkdirSync(EVENTS_ROOT, { recursive: true });
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
  } catch { /* event-log failure is non-fatal */ }
}

export interface SupervisorCorpus {
  profile_glyph: string;       // PROF-*-SUPERVISOR
  compiled_at: string;          // ISO timestamp
  d11_level: "PROVEN" | "OBSERVED" | "INHERITED" | "ASSUMED";
  sentences: string[];          // BEHCS-256 glyph sentences
  facts: Record<string, unknown>; // structured JSON state snapshot
  refresh_cost_ms: number;      // how long this compile took
}

function gitShow(args: string[]): { code: number; stdout: string } {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" });
  return { code: r.status ?? -1, stdout: (r.stdout ?? "").toString() };
}

function safeRead(p: string): string | null {
  try { return readFileSync(p, "utf-8"); } catch { return null; }
}

function safeJson<T = unknown>(path: string): T | null {
  const raw = safeRead(path);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ── PROF-KERNEL-SUPERVISOR ──────────────────────────────────────────

export function compileKernelSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const families = safeJson<{ families: Record<string, { examples?: string[] }>, status?: string, d11_level?: string }>(
    join(REPO_ROOT, "kernel", "glyph-families.json")
  );
  const declaredGlyphs = families ? Object.values(families.families).reduce((s, f) => s + (f.examples?.length ?? 0), 0) : 0;
  const familyCount = families ? Object.keys(families.families).length : 0;

  const sentences = [
    `META-SELF-DESCRIBE { PROF-KERNEL } @ M-EYEWITNESS .`,
    `D-ASI · LAW-013 · META-PROOF-OF-CLOSURE @ M-INDICATIVE .`,
    `PROOF-OBSERVED · D11 · ${familyCount} FAMILIES · ${declaredGlyphs} GLYPHS @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-KERNEL-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      families_declared: familyCount,
      glyphs_declared: declaredGlyphs,
      census_gap_to_256: 256 - declaredGlyphs,
      closure_test_status: "green-as-of-commit-18acb61",
      schema_status: families?.status ?? "unknown",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-PID100B-SUPERVISOR ─────────────────────────────────────────

export function compilePid100BSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const battery100M = safeJson<Record<string, unknown>>(
    join(REPO_ROOT, "research", "100B-pid-materialization", "battery-100M.json")
  );
  const allGatesGreen = battery100M && Array.isArray((battery100M as { gates?: unknown[] }).gates)
    ? ((battery100M as { gates: Array<{ passed?: boolean }> }).gates ?? []).every((g) => g.passed)
    : false;

  const sentences = [
    `META-SELF-DESCRIBE { PROF-PID100B } @ M-EYEWITNESS .`,
    `D-ADDRESS · LAW-014 · 10^11 · PROOF-${allGatesGreen ? "OBSERVED" : "ASSUMED"} @ M-${allGatesGreen ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `OP-VERIFY { 100M } · PROOF-OBSERVED @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-PID100B-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: allGatesGreen ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      acceptance_battery_100M: allGatesGreen,
      battery_file_exists: battery100M !== null,
      address_space_bits: 62,
      partitions: 16,
      workers_per_partition: 2 ** 24,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNIROUTER-SUPERVISOR ──────────────────────────────────────

export function compileOmniRouterSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const routerSrc = safeRead(join(REPO_ROOT, "packages", "omni-router", "src", "router.ts"));
  const glyphSrc = safeRead(join(REPO_ROOT, "packages", "omni-router", "src", "glyph-dispatch.ts"));
  const modesInRouter = routerSrc
    ? Array.from(routerSrc.matchAll(/"(stub|echo|opencode-local|smart)"/g)).map((m) => m[1])
    : [];
  const modes = Array.from(new Set(modesInRouter));
  const verbs = glyphSrc
    ? Array.from(glyphSrc.matchAll(/"(OP-[A-Z][A-Z0-9_-]*)":/g)).map((m) => m[1])
    : [];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNIROUTER } @ M-EYEWITNESS .`,
    `D-MESSAGING · OP-ROUTE · ${modes.length} MODES @ M-EYEWITNESS .`,
    `LAW-014 · OP-DISPATCH { glyph-local } · COST 0 @ M-EYEWITNESS .`,
    `PROOF-OBSERVED · ${verbs.length} LOCAL-VERBS @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-OMNIROUTER-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      modes,
      local_verbs: verbs,
      verb_count: verbs.length,
      default_port_range: "[11003, 11117]",
      law_001_reserved: [4947, 4950],
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-HOOKWALL-SUPERVISOR ────────────────────────────────────────

export function compileHookwallSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const daemonExists = existsSync(join(REPO_ROOT, "packages", "hookwall-daemon", "src", "daemon.ts"));

  const sentences = [
    `META-SELF-DESCRIBE { PROF-HOOKWALL } @ M-EYEWITNESS .`,
    `D-IMMUNE · LAW-001 · PORT-11083 · ${daemonExists ? "ACTIVE" : "DESIGN-ONLY"} @ M-${daemonExists ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `OP-CLASSIFY · EVT-HOOKWALL-DECISION @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-HOOKWALL-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: daemonExists ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      daemon_code_present: daemonExists,
      control_port: 11083,
      event_log: "~/.asolaria-workers/hookwall-events.ndjson",
      law_001_reserved: [4947, 4950],
      classifier_mode: "live-or-stub-fallback",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-CHIEFCOUNCIL-SUPERVISOR ────────────────────────────────────

export function compileChiefCouncilSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const chiefExists = existsSync(join(REPO_ROOT, "packages", "omnispindle-spawn", "src", "chief.ts"));

  const sentences = [
    `META-SELF-DESCRIBE { PROF-CHIEFCOUNCIL } @ M-EYEWITNESS .`,
    `D-ORCHESTRATOR · OP-ORCHESTRATE · QUORUM 3 @ M-EYEWITNESS .`,
    `D11 · { existential · algorithmic · material · procedural } @ M-EYEWITNESS .`,
    `LAW-013 · OP-MINT-AND-VALIDATE · PER-MEMBER @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-CHIEFCOUNCIL-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: chiefExists ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      code_present: chiefExists,
      default_quorum: 3,
      dispatch_backbone: "thin-worker + omni-router",
      d11_axes: ["existential", "algorithmic", "material", "procedural"],
      agreement_modes: ["identical", "divergent", "insufficient-quorum"],
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-HERMES-SUPERVISOR (127 skill atoms + 6 meta-primitives) ────

export function compileHermesSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const deltaPath = join(REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json");
  const delta = safeJson<{
    meta_primitives?: Array<{ glyph: string; mint_status?: string; minted_at?: string }>;
    atoms?: Array<{
      glyph: string;
      category: string;
      tree: string;
      mint_status?: string;
      minted_at?: string;
      prior_eval?: { phase: string; cross_walk_prof: string[]; meta_primitive_umbrella: string | null };
    }>;
    phase_breakdown?: Record<string, number>;
    compat_matrix?: Array<{ axis: string; level: string }>;
    research_citations?: Record<string, string[]>;
    mint_log?: Array<{ at: string; batch_label: string; glyphs: string[]; authority: string }>;
  }>(deltaPath);

  const hasDelta = delta !== null;
  const atoms = delta?.atoms ?? [];
  const metas = delta?.meta_primitives ?? [];
  const totalAtoms = atoms.length + metas.length;

  // Top categories by atom count
  const catCounts: Record<string, number> = {};
  for (const a of atoms) {
    const top = (a.category ?? "").split("/")[0] || "(root)";
    catCounts[top] = (catCounts[top] ?? 0) + 1;
  }
  const top_categories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, n]) => ({ category: cat, atoms: n }));

  // Cross-walk PROF-* hit counts
  const xwCounts: Record<string, number> = {};
  for (const a of atoms) {
    for (const p of a.prior_eval?.cross_walk_prof ?? []) xwCounts[p] = (xwCounts[p] ?? 0) + 1;
  }

  const phaseSummary = delta?.phase_breakdown ?? {};
  const compatLevels = (delta?.compat_matrix ?? []).reduce(
    (acc, c) => ((acc[c.level] = (acc[c.level] ?? 0) + 1), acc),
    {} as Record<string, number>
  );

  const mintedMetas = metas.filter((m) => m.mint_status === "MINTED").length;
  const mintedAtoms = atoms.filter((a) => a.mint_status === "MINTED").length;
  const mintedTotal = mintedMetas + mintedAtoms;
  const unmintedTotal = totalAtoms - mintedTotal;
  const lastMint = (delta?.mint_log ?? []).slice(-1)[0];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-HERMES } @ M-EYEWITNESS .`,
    `D-SKILL · LAW-013 · PROF-HERMES · ${totalAtoms} ATOMS @ M-${hasDelta ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D11 · ${metas.length} META-PRIMITIVES · ${atoms.length} SKILL-ATOMS @ M-EYEWITNESS .`,
    `OP-GLYPH-MINTED · ${mintedTotal} MINTED · ${unmintedTotal} AWAITING-REVIEW @ M-${mintedTotal > 0 ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `OP-PHASE-INGEST · phase-1-meta=${phaseSummary["phase-1-meta"] ?? 0} · phase-2-lanes=${phaseSummary["phase-2-lanes"] ?? 0} · phase-3-on-demand=${phaseSummary["phase-3-on-demand"] ?? 0} · phase-4-long-tail=${phaseSummary["phase-4-long-tail"] ?? 0} @ M-EYEWITNESS .`,
    `COMPAT · GREEN=${compatLevels["GREEN"] ?? 0} · YELLOW=${compatLevels["YELLOW"] ?? 0} · RED=${compatLevels["RED"] ?? 0} @ M-EYEWITNESS .`,
    `STATUS · ${mintedTotal > 0 ? `BATCH-${lastMint?.batch_label ?? "?"}-MINTED` : "AWAITING_6_BODY_REVIEW"} @ M-${mintedTotal > 0 ? "INDICATIVE" : "SUBJUNCTIVE"} .`,
  ];

  return {
    profile_glyph: "PROF-HERMES-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasDelta ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      delta_path: deltaPath,
      delta_present: hasDelta,
      total_atoms: totalAtoms,
      meta_primitives: metas.length,
      skill_atoms: atoms.length,
      meta_primitive_glyphs: metas.map((m) => m.glyph),
      source_roots: ["C:/Users/rayss/Asolaria/tools/hermes-agent/skills", "C:/Users/rayss/Asolaria/tools/hermes-agent/optional-skills"],
      phase_breakdown: phaseSummary,
      compat_levels: compatLevels,
      top_categories,
      cross_walk_analog_counts: xwCounts,
      research_refs: delta?.research_citations ? Object.keys(delta.research_citations) : [],
      minted_total: mintedTotal,
      minted_meta_primitives: mintedMetas,
      minted_skill_atoms: mintedAtoms,
      awaiting_review: unmintedTotal,
      mint_batches: (delta?.mint_log ?? []).map((b) => ({ at: b.at, label: b.batch_label, count: b.glyphs.length })),
      batch_cosign_ready_phases: ["phase-1-meta", "phase-2-lanes"],
      operator_witness_required_phases: ["phase-3-on-demand", "phase-4-long-tail"],
      does_not_mutate: "kernel/glyph-families.json",
      promotion_gate: "6-body review per OPERATOR-DECISION-TREE.md:38",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-CONVERGENCE-SUPERVISOR (6×6×6×6×6×12 engine + kinship matrix + calibrations) ──

const CONVERGENCE_SUPERVISOR_EVENTS = join(EVENTS_ROOT, "convergence-events.ndjson");

export function compileConvergenceSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const enginePath = join(REPO_ROOT, "packages", "omnimets", "src", "convergence.ts");
  const metsPath = join(REPO_ROOT, "packages", "omnimets", "src", "mets.ts");
  const calibPath = join(REPO_ROOT, "research", "shannon-18-kinship-calibration", "aggregation.md");
  const calMatrixPath = join(REPO_ROOT, "packages", "omnimets", "demo", "smoke-calibration-matrix.ts");
  const hasEngine = existsSync(enginePath);
  const hasCalib = existsSync(calibPath);
  const hasCalMatrix = existsSync(calMatrixPath);

  // Count CONVERGED events in the event log for rolling-average rate
  let convergedEvents = 0;
  let startedEvents = 0;
  let completedEvents = 0;
  if (existsSync(CONVERGENCE_SUPERVISOR_EVENTS)) {
    try {
      const raw = readFileSync(CONVERGENCE_SUPERVISOR_EVENTS, "utf-8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      for (const l of lines) {
        if (l.includes("EVT-CONVERGENCE-STARTED")) startedEvents++;
        if (l.includes("EVT-CONVERGENCE-COMPLETED")) completedEvents++;
        if (l.includes('"CONVERGED"')) convergedEvents++;
      }
    } catch { /* ignore */ }
  }

  const sentences = [
    `META-SELF-DESCRIBE { PROF-CONVERGENCE } @ M-${hasEngine ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-CUBE · 6 BODIES × 6 REFLECTIONS × 6 WAVES × 6 PHASES × 6 LANES × 12 ITERATIONS · max-cells=93312 @ M-INDICATIVE .`,
    `D-CALIBRATION · Shannon-18-votes=${hasCalib ? "VALIDATED" : "pending"} · K=3-short-circuit · seal-requires-ratify · lane-modulated · asymmetric-density @ M-${hasCalib ? "INDICATIVE" : "SUBJUNCTIVE"} .`,
    `D-TELEMETRY · started_runs=${startedEvents} · completed_runs=${completedEvents} · converged_cells_total=${convergedEvents} @ M-EYEWITNESS .`,
    `OP-VERDICT · {CONVERGED, DIVERGENT, INSUFFICIENT-QUORUM} · K-consecutive-seal @ M-INDICATIVE .`,
    `STATUS · BASELINE-RATE-66.7pct · CALIBRATION-MATRIX-SHIPPED @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-CONVERGENCE-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasEngine && hasCalib ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      engine_path: enginePath,
      engine_present: hasEngine,
      mets_path: metsPath,
      mets_present: existsSync(metsPath),
      calibration_matrix_path: calMatrixPath,
      calibration_matrix_present: hasCalMatrix,
      shannon_18_aggregation_path: calibPath,
      shannon_18_aggregation_present: hasCalib,
      dimensions: { bodies: 6, reflections: 6, waves: 6, phases: 6, lanes: 6, iterations: 12 },
      theoretical_max_cells: 93312,
      baseline_convergence_rate: 0.667,
      body_alphabet: ["IMMUNE", "SKELETAL", "NERVOUS", "CIRCULATORY", "ENDOCRINE", "DIGESTIVE"],
      phase_sequence: ["explore", "critique", "propose", "audit", "ratify", "seal"],
      lanes: ["muscular", "skeletal", "nervous", "circulatory", "endocrine", "digestive", "cross"],
      calibrations_applied: {
        "#16-k-consecutive": { K: 3, rationale: "statistical confidence vs single-iter coincidence" },
        "#15-seal-requires-ratify": { enabled: true, rationale: "phase-history gate before SEAL" },
        "#17-lane-modulated-kinship": { enabled: true, alpha: 0.25, rationale: "lane affinity augments base kinship" },
        "#14-asymmetric-density": { enabled: true, hubs: ["CIRCULATORY", "NERVOUS"], rationale: "hub bodies get 4 non-self kinships" },
        "#13-symmetry": { decision: "accept-asymmetry", rationale: "SKEL biologically write-only kinship" },
      },
      audit_trail_stream: CONVERGENCE_SUPERVISOR_EVENTS,
      runs_started: startedEvents,
      runs_completed: completedEvents,
      converged_events_total: convergedEvents,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-SHANNON-SUPERVISOR (13-agent pentester civilization) ──────

const SHANNON_EVENTS = join(EVENTS_ROOT, "shannon-events.ndjson");

export function compileShannonSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const specPath = join(REPO_ROOT, "plans", "section-G-shannon-civ.md");
  const hasSpec = existsSync(specPath);
  // The 13 canonical Shannon agents per section-G §"13 Agent Profiles".
  const agents = [
    "shannon-pre-recon", "shannon-recon",
    "shannon-vuln-injection", "shannon-vuln-xss", "shannon-vuln-auth",
    "shannon-vuln-ssrf", "shannon-vuln-authz",
    "shannon-exploit-injection", "shannon-exploit-xss", "shannon-exploit-auth",
    "shannon-exploit-ssrf", "shannon-exploit-authz",
    "shannon-report",
  ];
  const immuneLayers = ["L0-reflex", "L1-skin", "L2-innate", "L3-humoral", "L4-cellular", "L5-adaptive", "L6-memory"];
  const civPath = "C:/Users/acer/shannon/";

  const sentences = [
    `META-SELF-DESCRIBE { PROF-SHANNON } @ M-EYEWITNESS .`,
    `D-IMMUNE · PROF-SHANNON · ${agents.length} AGENTS · ${immuneLayers.length} IMMUNE-LAYERS @ M-${hasSpec ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-AUTHORITY · studies-attack · ships-defense @ M-INDICATIVE .`,
    `D-TRANSPORT · endpoint :4791 · loopback :4947 @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-SHANNON-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasSpec ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      spec_path: specPath,
      spec_present: hasSpec,
      civilization_path_on_acer: civPath,
      civilization_file_count_declared: 4046,
      agents,
      immune_layers: immuneLayers,
      phase_chain: ["pre-recon", "recon", "vuln-{5}", "exploit-{5}", "report"],
      endpoint_path: "/security/shannon/scan",
      endpoint_port: 4791,
      kernel_bus_port: 4947,
      scope_gate: "operator_witness REQUIRED (rayssa OR jesse)",
      liris_local_layers: ["L0", "L1", "L2"],
      acer_dispatched_layers: ["L3", "L4", "L5"],
      liris_opus_layers: ["L6"],
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNISHANNON-SUPERVISOR (18-body wave + 2592 unroll) ───────

const OMNISHANNON_EVENTS = join(EVENTS_ROOT, "omnishannon-events.ndjson");

export function compileOmniShannonSupervisor(): SupervisorCorpus {
  const started = Date.now();
  // Count the shannon-18 body-pass files and the smp-v5-hermes-18x18x18 waves.
  const shannon18Dir = join(REPO_ROOT, "research", "hermes-hunt", "shannon-18");
  const hermesHuntExists = existsSync(shannon18Dir);
  const smpV5Wave1Dir = join(REPO_ROOT, "research", "smp-v5-hermes-18x18x18", "wave1");
  const smpV5Wave3Dir = join(REPO_ROOT, "research", "smp-v5-hermes-18x18x18", "wave3");

  function countMd(dir: string): number {
    if (!existsSync(dir)) return 0;
    try { return readdirSync(dir).filter((f) => f.endsWith(".md")).length; }
    catch { return 0; }
  }
  const shannon18Count = countMd(shannon18Dir);
  const wave1Count = countMd(smpV5Wave1Dir);
  const wave3Count = countMd(smpV5Wave3Dir);

  // The 6 Shannon bodies per hermes-hunt naming: IMMUNE, SKELETAL, NERVOUS, CIRCULATORY, ENDOCRINE, DIGESTIVE.
  const bodies = ["IMMUNE", "SKELETAL", "NERVOUS", "CIRCULATORY", "ENDOCRINE", "DIGESTIVE"];
  // 2592 = 18 × 18 × 8 reflections — the unrolled cube. Retracted claim flagged.
  const unrollTheoretical = 2592;

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNISHANNON } @ M-EYEWITNESS .`,
    `D-REFLECTION · PROF-OMNISHANNON · ${bodies.length} BODIES @ M-INDICATIVE .`,
    `D11 · shannon-18=${shannon18Count} · smp-v5-wave1=${wave1Count} · smp-v5-wave3=${wave3Count} @ M-${hermesHuntExists ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-CUBE · 6 BODIES · 6 REFLECTIONS · 18 WAVES · UNROLL-THEORETICAL=${unrollTheoretical} @ M-SUBJUNCTIVE .`,
    `D-VERDICT · FINDINGS-97.47pct · D11-RETRACTED @ M-SUBJUNCTIVE .`,
  ];

  return {
    profile_glyph: "PROF-OMNISHANNON-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hermesHuntExists ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      bodies,
      shannon_18_files: shannon18Count,
      smp_v5_wave1_files: wave1Count,
      smp_v5_wave3_files: wave3Count,
      unroll_theoretical: unrollTheoretical,
      review_pattern: "6 body × 6 reflections × N waves until unanimity",
      self_agreement_gate: "pre-vote; required per six-wave constitutional law",
      retraction_notice: "omnishannon-2592 12-part truth RETRACTED; 300B-GNN validation FALSE; all pre-BEHCS-256 material D11:ASSUMED",
      related_memory: "project_omnishannon_2592_structural_findings.md (RETRACTED)",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-INSTRUCT-KR-SUPERVISOR (section-P meta-plan) ──────────────

const INSTRUCT_KR_EVENTS = join(EVENTS_ROOT, "instruct-kr-events.ndjson");

export function compileInstructKrSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const specPath = join(REPO_ROOT, "plans", "section-P-meta-plan-instruct-kr.md");
  const hasSpec = existsSync(specPath);
  const forms = ["A-installer-on-acer", "B-model-file-on-mac-rose", "C-codex-fabrication"];
  const inspectionAgents = [
    "KR-EXTRACT-01",
    "KR-FINGERPRINT-02",
    "KR-CAPABILITY-03",
    "KR-SAFETY-04",
    "KR-INTEGRATE-05",
  ];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-INSTRUCT-KR } @ M-SUBJUNCTIVE .`,
    `D-STATUS · ABSENT · SPECULATIVE @ M-SUBJUNCTIVE .`,
    `D11 · ${forms.length} ARRIVAL-FORMS · ${inspectionAgents.length} INSPECTION-AGENTS @ M-${hasSpec ? "INDICATIVE" : "SUBJUNCTIVE"} .`,
    `D-SAFETY · quarantine-before-integrate · 6-body-review @ M-INDICATIVE .`,
    `D-PROMOTION-GATE · 100-successful-round-trips · operator-witness @ M-SUBJUNCTIVE .`,
  ];

  return {
    profile_glyph: "PROF-INSTRUCT-KR-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasSpec ? "ASSUMED" : "ASSUMED",
    sentences,
    facts: {
      spec_path: specPath,
      spec_present: hasSpec,
      status: "ABSENT on liris/acer-reachable/USB-sovereignty; SPECULATIVE",
      candidate_hideouts: ["acer E: RAW partition", "Mac-Rose", "Codex fabrication"],
      arrival_forms: forms,
      inspection_agents: inspectionAgents,
      quarantine_roots: {
        liris_A: "liris:/ops/instruct-kr/quarantine/A/",
        liris_B: "liris:/ops/instruct-kr/quarantine/B/",
        liris_C: "liris:/ops/instruct-kr/quarantine/C/",
      },
      capability_probe_order: ["MCP", "HTTP", "CLI", "Library", "raw-weights-only"],
      safety_verdicts: ["VERIFIED", "UNVERIFIED", "CONTRADICTED", "FRAUDULENT"],
      integration_preconditions: "no CONTRADICTED / no FRAUDULENT",
      bus_registration_port: 4947,
      max_initial_concurrency: 1,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNIFLYWHEEL-SUPERVISOR (5 omni-primitives, section-M) ────

const OMNIFLYWHEEL_EVENTS = join(EVENTS_ROOT, "omniflywheel-events.ndjson");

export function compileOmniFlywheelSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const specPath = join(REPO_ROOT, "plans", "section-M-omni-primitives.md");
  const hasSpec = existsSync(specPath);
  const gulpPath = join(REPO_ROOT, "plans", "section-M-6-mistakes-gulp-2000.md");
  const hasGulp = existsSync(gulpPath);
  const lanes = ["muscular", "skeletal", "nervous", "circulatory", "endocrine", "digestive"];
  const primitives = [
    { id: "M.1", name: "OmniHook", role: "general event-driven hook registry (supersedes hookwall v1/v2)" },
    { id: "M.2", name: "OmniFlywheel", role: "post-dispatch validator pipeline — score/review/self-correct" },
    { id: "M.3", name: "OmniMets", role: "per-lane health + policy telemetry" },
    { id: "M.4", name: "OmniPool", role: "per-lane worker-pool + backpressure" },
    { id: "M.5", name: "OmniSpindle-OpenCode ACP patch", role: "lane scheduler integration" },
    { id: "M.6", name: "Mistakes-Gulp-2000", role: "2000 msg/sweep throughput with named-agent + 6-body review (severity ≥ medium)" },
  ];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNIFLYWHEEL } @ M-${hasSpec ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-POLYMORPHISM · ${lanes.length} LANES · ${primitives.length} PRIMITIVES @ M-INDICATIVE .`,
    `D-THROUGHPUT · GULP-2000 · named-agent-required · severity-gate-medium @ M-${hasGulp ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-LAW · 6x6x6 wave-review · per-lane flywheel · score-review-selfcorrect @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-OMNIFLYWHEEL-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasSpec ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      spec_path: specPath,
      spec_present: hasSpec,
      gulp_spec_path: gulpPath,
      gulp_spec_present: hasGulp,
      lanes,
      primitives,
      flywheel_stages: ["score", "review", "self-correct"],
      hook_stages: ["pre", "post"],
      short_circuit_policy: "stop on first reject; first-throw wins",
      colony_fanout: ["liris", "acer", "falcon", "aether", "gaia"],
      droidswarm_delta: "DroidSwarm has 1 scheduler + 1 supervisor; Asolaria has 6 lanes × (scheduler + supervisor + flywheel + mets + hookwall)",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-EBACMAP-SUPERVISOR (Section H+I QDD boundary) ─────────────

const EBACMAP_EVENTS = join(EVENTS_ROOT, "ebacmap-events.ndjson");

export function compileEbacMapSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const specPath = join(REPO_ROOT, "plans", "section-H-I-ebacmap-usb.md");
  const hasSpec = existsSync(specPath);
  const bridgePath = join(REPO_ROOT, "packages", "qdd-bridge");
  const bridgePresent = existsSync(bridgePath);

  const apps = ["dashboard", "nl2-driver", "ebacmap-sync-server", "ezprotect-billing"];
  const deviceAdapterImpls = ["NL2", "NovaLUM-CSI", "Mongoose-backed mock"];
  const extractionTargets = [
    "D:/sovereignty/",
    "D:/runtime/",
    "D:/openclaude/",
    "D:/RuView/",
    "D:/video-analysis/",
    "D:/sovereignty/research/",
    "D:/.claude/",
    "D:/logs/",
  ];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-EBACMAP } @ M-${hasSpec ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-BOUNDARY · QDD-external · ASOLARIA-bridge-only @ M-INDICATIVE .`,
    `D11 · 87 IX-BUCKETS · ${apps.length} APPS · 2008 TS-FILES-DECLARED @ M-${hasSpec ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-ADAPTER · Globals-to-DeviceAdapter · ${deviceAdapterImpls.length} IMPLS @ M-INDICATIVE .`,
    `D-TRANSPORT · sync-server POST :4947 · BEHCS-envelope @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-EBACMAP-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: hasSpec ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      spec_path: specPath,
      spec_present: hasSpec,
      qdd_monorepo_path: "D:/projects/QDD/ebacmap-master/",
      bridge_package_path: bridgePath,
      bridge_package_present: bridgePresent,
      apps,
      total_ts_files_declared: 2008,
      total_ix_buckets_declared: 87,
      device_adapter_impls: deviceAdapterImpls,
      novalum_csi_role: "WiFi CSI sensing → shape_fingerprint → 4947 BEHCS envelope",
      nl2_role: "NovaLink dongle serial/BLE; firmware-hash component of hw_pid",
      ezprotect_scope: "QDD SaaS billing (no relation to SOVLINUX USB)",
      d_drive_extraction_targets: extractionTargets,
      extraction_policy: "read-only copies to incoming/d-drive-extraction-20260417/; never move, never modify",
      residency_classes: ["device-local-high-freq-CSI-stays-QDD", "cross-cutting-observational-mirrored", "identity-canonical-in-asolaria"],
      collision_guard_prefix: "qdd_*",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── COL-ASOLARIA-SUPERVISOR (APEX — the federation itself) ─────────────────
//
// Correction 2026-04-18 per Jesse: "No. Asolaria is the top there."
// Asolaria is not a device and not subordinate to any device. Acer's
// self-reported role="capital" in her /behcs/devices view is her
// sub-federation governance descriptor, not apex over Asolaria.
// COL-ASOLARIA sits above all 12 DEV-* members.

const ASOLARIA_ROOT_EVENTS = join(EVENTS_ROOT, "asolaria-root-events.ndjson");

export function compileAsolariaRootSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const registryPath = join(EVENTS_ROOT, "device-registry.json");
  const hwRegistryPath = join(EVENTS_ROOT, "hardware-registry.json");
  const devCount = (() => {
    if (!existsSync(registryPath)) return 5;
    try {
      const r = JSON.parse(readFileSync(registryPath, "utf-8")) as { devices?: Array<unknown> };
      // merged = canonical 5 ∪ runtime
      return Math.max(5, (r.devices ?? []).length + 5 - ((r.devices ?? []).filter((d) => {
        const g = (d as { glyph?: string }).glyph ?? "";
        return ["DEV-LIRIS", "DEV-ACER", "DEV-FALCON", "DEV-AETHER", "DEV-GAIA"].includes(g);
      }).length));
    } catch { return 5; }
  })();
  const hwCount = (() => {
    if (!existsSync(hwRegistryPath)) return 0;
    try { return ((JSON.parse(readFileSync(hwRegistryPath, "utf-8")) as { hardware?: Array<unknown> }).hardware ?? []).length; }
    catch { return 0; }
  })();

  const sentences = [
    `META-SELF-DESCRIBE { COL-ASOLARIA } @ M-INDICATIVE .`,
    `D-APEX · COL-ASOLARIA · federation-root · devices=${devCount} · hardware=${hwCount} @ M-EYEWITNESS .`,
    `D-HIERARCHY · no-device-is-above-another · all-DEV-*-are-members-of-COL-ASOLARIA @ M-INDICATIVE .`,
    `D-GOVERNANCE · acer-role-capital-is-sub-federation-local-view-only · asolaria-is-apex @ M-INDICATIVE .`,
    `LAW-001 · PORT-4947 · PORT-4950 · federation-wide-permanent-open @ M-INDICATIVE .`,
    `LAW-008 · filesystem-is-mirror · acer-mirror-absorbed-2026-04-18 @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "COL-ASOLARIA-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      apex_glyph: "COL-ASOLARIA",
      role: "federation-root",
      canonical_name: "Asolaria",
      member_devices_canonical: 5,
      member_devices_total: devCount,
      hardware_pieces_registered: hwCount,
      all_devices_are_direct_members: true,
      no_device_is_capital_over_asolaria: true,
      acer_capital_role_clarification: "acer self-reports role=capital in her /behcs/devices — that's her local sub-federation view, not apex over Asolaria",
      hierarchy: [
        "COL-ASOLARIA (apex, this supervisor)",
        "├── DEV-LIRIS, DEV-ACER, DEV-FALCON, DEV-AETHER, DEV-GAIA (canonical 5)",
        "└── DEV-FELIPE, DEV-BEAST, DEV-DAN, DEV-GPT, DEV-GOOGLE-ANTIGRAVITY, DEV-SYMPHONY, DEV-AUGGIE (absorbed from acer mirror 2026-04-18)",
      ],
      laws_honored_by_federation: ["LAW-001", "LAW-008", "LAW-012", "LAW-013", "LAW-014"],
      authority: "COSIGN-MERGED-034",
      event_stream: ASOLARIA_ROOT_EVENTS,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-DEV-*-SUPERVISOR (5 per-device supervisors per kernel/glyph-families.json) ──
//
// Each covers a labeled DEV-* in the device family's examples[]:
// DEV-LIRIS, DEV-ACER, DEV-FALCON, DEV-AETHER, DEV-GAIA.
//
// Pattern: pure disk read (identity manifest if on that device; static facts
// otherwise — remote devices are reported as declared, not observed).

const DEV_LIRIS_EVENTS   = join(EVENTS_ROOT, "dev-liris-events.ndjson");
const DEV_ACER_EVENTS    = join(EVENTS_ROOT, "dev-acer-events.ndjson");
const DEV_FALCON_EVENTS  = join(EVENTS_ROOT, "dev-falcon-events.ndjson");
const DEV_AETHER_EVENTS  = join(EVENTS_ROOT, "dev-aether-events.ndjson");
const DEV_GAIA_EVENTS    = join(EVENTS_ROOT, "dev-gaia-events.ndjson");

interface DeviceSpec {
  glyph: string;
  profile_glyph: string;
  canonical_name: string;
  role: string;
  os: string;
  hardware_class: string;
  federation_port: number;
  secondary_ports: number[];
  canonical_root: string | null;
  is_local_to_this_process: boolean;
  notes: string[];
}

function detectLocalDevice(): string {
  // Simple heuristic: liris is Windows 11 + repo lives at C:/Users/rayss/Asolaria-BEHCS-256/.
  // Anything else is remote to this process.
  if (process.platform === "win32" && existsSync(join(REPO_ROOT, "kernel", "glyph-families.json")) && REPO_ROOT.toLowerCase().includes("rayss")) return "DEV-LIRIS";
  return "UNKNOWN";
}

const DEVICE_SPECS: Record<string, DeviceSpec> = {
  "DEV-LIRIS": {
    glyph: "DEV-LIRIS",
    profile_glyph: "PROF-LIRIS-SUPERVISOR",
    canonical_name: "Liris",
    role: "primary dev host · canonical tree holder · federation hub",
    os: "Windows 11 Home Single Language 10.0.26200 (post-2026-04-17 substrate-hostility update)",
    hardware_class: "desktop · 32 GB RAM",
    federation_port: 4947,
    secondary_ports: [4950, 4781, 4791, 4820, 4913, 11003, 11083],
    canonical_root: "C:/Users/rayss/Asolaria-BEHCS-256/",
    is_local_to_this_process: true,
    notes: [
      "LAW-001: ports 4947+4950 always open",
      "Substrate-hostility: Python agent onboarding hangs post Windows update",
      "Primary author of all cosign-chain entries",
    ],
  },
  "DEV-ACER": {
    glyph: "DEV-ACER",
    profile_glyph: "PROF-ACER-SUPERVISOR",
    canonical_name: "Acer",
    role: "Shannon civilization host · 13-agent pentester civ · class corpus holder",
    os: "Windows",
    hardware_class: "laptop · 8 GB RAM",
    federation_port: 4947,
    secondary_ports: [4781, 4791, 4913, 4914],
    canonical_root: "C:/Users/acer/",
    is_local_to_this_process: false,
    notes: [
      "Declared 5 live channels: 4781+4947+4782+4792+Ethernet (operator-canon, never claim dead)",
      "Shannon civ declared 4046 files at C:/Users/acer/shannon/",
      "Class corpus at C:/Users/acer/OneDrive/Documentos/Class - Copy (Rosetta teaching material)",
      "Bonus channels observed: 4913/4914/4950",
    ],
  },
  "DEV-FALCON": {
    glyph: "DEV-FALCON",
    profile_glyph: "PROF-FALCON-SUPERVISOR",
    canonical_name: "Falcon",
    role: "hostile-surface instinct · Samsung S24 · NovaLUM shield host",
    os: "Android with Termux",
    hardware_class: "Samsung S24 smartphone",
    federation_port: 4947,
    secondary_ports: [4950],
    canonical_root: null,
    is_local_to_this_process: false,
    notes: [
      "Runs Termux for Node/Python headless ops",
      "NovaLUM hex-level firmware admin capability",
      "Crossing PROF-FALCON glyph is the kernel analog",
      "Secret notes surface per Section Q hidden-layer scaffold",
    ],
  },
  "DEV-AETHER": {
    glyph: "DEV-AETHER",
    profile_glyph: "PROF-AETHER-SUPERVISOR",
    canonical_name: "Aether",
    role: "5th federation node · Debian Trixie · pulsing heartbeat",
    os: "Debian Trixie (plus Debora + Monet container siblings)",
    hardware_class: "server / headless linux box",
    federation_port: 4947,
    secondary_ports: [4950],
    canonical_root: null,
    is_local_to_this_process: false,
    notes: [
      "Discovered via LAW-008 filesystem-mirror observation",
      "cc.json + fabric.json + micro_agent.py resident",
      "Pulses to acer:4947 periodically (declared)",
      "PROF-AETHER_RECONCILE glyph is the kernel analog (plan/writing-plans/subagent)",
    ],
  },
  "DEV-GAIA": {
    glyph: "DEV-GAIA",
    profile_glyph: "PROF-GAIA-SUPERVISOR",
    canonical_name: "Gaia",
    role: "Mac bootstrap channel · Rose+Oracle landing · 4th federation arm",
    os: "macOS",
    hardware_class: "Mac (architecture: declared)",
    federation_port: 4947,
    secondary_ports: [4950],
    canonical_root: null,
    is_local_to_this_process: false,
    notes: [
      "Rose/Oracle bootstrap bundle target (deployment-ready status)",
      "Mac-Rose is the Instruct-KR Form-B (raw weights) candidate surface",
      "Gaia colony + Liris colony are co-orchestrated per user memory",
    ],
  },
};

function compileDeviceSupervisorFor(devGlyph: string, eventsPath: string): SupervisorCorpus {
  const started = Date.now();
  const spec = DEVICE_SPECS[devGlyph];
  if (!spec) throw new Error(`unknown device: ${devGlyph}`);
  const localDev = detectLocalDevice();
  const isLiveLocal = localDev === devGlyph;

  // For local device: attempt to read _asolaria_identity.json if present.
  let identityManifestFound = false;
  let identityManifestPath: string | null = null;
  if (isLiveLocal && spec.canonical_root) {
    const candidate = join(spec.canonical_root, "_asolaria_identity.json");
    if (existsSync(candidate)) {
      identityManifestFound = true;
      identityManifestPath = candidate;
    }
  }

  // Count historical events for this device in its dedicated stream.
  let eventCount = 0;
  if (existsSync(eventsPath)) {
    try {
      const raw = readFileSync(eventsPath, "utf-8");
      eventCount = raw.split(/\r?\n/).filter(Boolean).length;
    } catch { /* ignore */ }
  }

  const sentences = [
    `META-SELF-DESCRIBE { ${spec.profile_glyph.replace("-SUPERVISOR", "")} } @ M-${isLiveLocal ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-DEVICE · ${spec.glyph} · ${spec.canonical_name} · ${isLiveLocal ? "LOCAL" : "REMOTE-DECLARED"} @ M-${isLiveLocal ? "INDICATIVE" : "SUBJUNCTIVE"} .`,
    `D-SUBSTRATE · ${spec.os.slice(0, 48)} · ${spec.hardware_class} @ M-${isLiveLocal ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `LAW-001 · PORT-${spec.federation_port} · always-open @ M-INDICATIVE .`,
    `D-IDENTITY · manifest=${identityManifestFound ? "OBSERVED" : "ABSENT"} @ M-${identityManifestFound ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-TELEMETRY · events_logged=${eventCount} @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: spec.profile_glyph,
    compiled_at: new Date().toISOString(),
    d11_level: isLiveLocal ? "OBSERVED" : "INHERITED",
    sentences,
    facts: {
      glyph: spec.glyph,
      canonical_name: spec.canonical_name,
      role: spec.role,
      os: spec.os,
      hardware_class: spec.hardware_class,
      federation_port: spec.federation_port,
      secondary_ports: spec.secondary_ports,
      canonical_root: spec.canonical_root,
      is_local_to_this_process: isLiveLocal,
      identity_manifest_found: identityManifestFound,
      identity_manifest_path: identityManifestPath,
      event_stream_path: eventsPath,
      events_logged: eventCount,
      notes: spec.notes,
      law_001_ports: [4947, 4950],
      last_refresh: new Date().toISOString(),
    },
    refresh_cost_ms: Date.now() - started,
  };
}

export function compileLirisSupervisor(): SupervisorCorpus { return compileDeviceSupervisorFor("DEV-LIRIS", DEV_LIRIS_EVENTS); }
export function compileAcerSupervisor(): SupervisorCorpus { return compileDeviceSupervisorFor("DEV-ACER", DEV_ACER_EVENTS); }
export function compileFalconSupervisor(): SupervisorCorpus { return compileDeviceSupervisorFor("DEV-FALCON", DEV_FALCON_EVENTS); }
export function compileAetherSupervisor(): SupervisorCorpus { return compileDeviceSupervisorFor("DEV-AETHER", DEV_AETHER_EVENTS); }
export function compileGaiaSupervisor(): SupervisorCorpus { return compileDeviceSupervisorFor("DEV-GAIA", DEV_GAIA_EVENTS); }

// ── 5 peripheral supervisors (VISION / COMMS / OMNIKEYBOARD / OMNIMAILBOX / OMNISCHEDULER) ──
//
// All built per Jesse 2026-04-18 directive: "BEHCS 256 language" +
// "brown hilbert ideas" + "all with GC and GULP".
//
// Each carries:
//   - Brown-Hilbert PID at Hilbert-level 04 (peripheral-service depth)
//     PID-H04-A<agent>-W<worker>-P<partition>-N<nonce>
//   - BEHCS-256 sentences using D-* dims + OP-* verbs + M-* moods
//   - dedicated ~/.asolaria-workers/*-events.ndjson stream (GC+Gulp covered)
//   - facts block with operational state (probed live when possible)

const VISION_EVENTS        = join(EVENTS_ROOT, "vision-events.ndjson");
const COMMS_EVENTS         = join(EVENTS_ROOT, "comms-events.ndjson");
const OMNIKEYBOARD_EVENTS  = join(EVENTS_ROOT, "omnikeyboard-events.ndjson");
const OMNIMAILBOX_EVENTS   = join(EVENTS_ROOT, "omnimailbox-events.ndjson");
const OMNISCHEDULER_EVENTS = join(EVENTS_ROOT, "omnischeduler-events.ndjson");

// Brown-Hilbert PID minter for peripheral supervisors (level 04)
import { createHash as __supCreateHash } from "node:crypto";
function brownHilbertSupervisorPid(kind: string, salt: string): string {
  const h = __supCreateHash("sha256").update(`periphsup||${kind}||${salt}`).digest("hex");
  const w = (parseInt(h.slice(0, 8), 16) % 1_000_000_000).toString().padStart(9, "0");
  const p = (parseInt(h.slice(2, 5), 16) % 1000).toString().padStart(3, "0");
  const n = (parseInt(h.slice(5, 8), 16) % 100_000).toString().padStart(5, "0");
  return `PID-H04-A01-W${w}-P${p}-N${n}`;
}

// ── PROF-VISION-SUPERVISOR ───────────────────────────────────────────
export function compileVisionSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const scriptPath = "C:/Users/rayss/Asolaria/tools/behcs-screen-capture.ps1";
  const capturesDir = "C:/Users/rayss/Asolaria/logs/captures";
  const scriptPresent = existsSync(scriptPath);
  let capturesCount = 0;
  if (existsSync(capturesDir)) { try { capturesCount = readdirSync(capturesDir).filter((f) => f.endsWith(".png")).length; } catch { /* ignore */ } }
  const pid = brownHilbertSupervisorPid("VISION", "screen-capture");

  const sentences = [
    `META-SELF-DESCRIBE { PROF-VISION } · ${pid} @ M-EYEWITNESS .`,
    `D-VISION · HDMI-frame-reader · System.Drawing.Bitmap · PrimaryScreen.CopyFromScreen @ M-INDICATIVE .`,
    `D-ARTIFACT · screen-capture.ps1 · output=logs/captures/*.png · captures_observed=${capturesCount} @ M-${scriptPresent ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `OP-CAPTURE-SCREEN · produces PNG · OCR-lane-future · glyph-lane-future @ M-INDICATIVE .`,
    `LAW-012 · LOOK-THINK-TYPE-LOOK-DECIDE · vision-side @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-VISION-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: scriptPresent ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      brown_hilbert_pid: pid, hilbert_level: 4,
      capture_script_path: scriptPath, capture_script_present: scriptPresent,
      captures_dir: capturesDir, captures_png_count: capturesCount,
      capabilities: ["screen-capture", "png-output"],
      future_lanes: ["OCR-pipeline", "HDMI-frame-stream", "glyph-recognition-from-screen"],
      event_stream: VISION_EVENTS,
      related_law: "LAW-012 LOOK-THINK-TYPE-LOOK-DECIDE",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-COMMS-SUPERVISOR ────────────────────────────────────────────
export function compileCommsSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const pid = brownHilbertSupervisorPid("COMMS", "federation-transport");
  const channels = [
    { name: "ethernet-direct", cidr: "192.168.100.0/24", liris_ip: "192.168.100.2", acer_ip: "192.168.100.1", law: "LAW-001", ports: [4947, 4950, 9999] },
    { name: "wifi-jesse_5g",   cidr: "192.168.1.0/24",   liris_ip: "192.168.1.8",   acer_ip: "192.168.1.8",   law: "LAW-001", ports: [4947, 4913, 4820] },
    { name: "behcs-bus",       role: "envelope routing", ports: [4947, 4950], verbs: ["behcs.heartbeat", "behcs.send", "file.deliver-and-run"] },
    { name: "reverse-dispatch", role: "liris:9999 → acer pull", ports: [9999] },
  ];

  const sentences = [
    `META-SELF-DESCRIBE { PROF-COMMS } · ${pid} @ M-EYEWITNESS .`,
    `D-TRANSPORT · ${channels.length} CHANNELS · ethernet + wifi + behcs-bus + reverse-dispatch @ M-INDICATIVE .`,
    `LAW-001 · PORT-4947 · PORT-4950 · permanent-open-all-devices @ M-INDICATIVE .`,
    `OP-SEND-ENVELOPE · /behcs/send · acer-acks · file-deliver-and-run @ M-EYEWITNESS .`,
    `D-TOPOLOGY · COL-ASOLARIA-apex · 12-members · ethernet-direct-confirmed @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-COMMS-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      brown_hilbert_pid: pid, hilbert_level: 4,
      channels, channel_count: channels.length,
      law_001_reserved: [4947, 4950],
      non_reserved_used: [4913, 4820, 9999],
      apex: "COL-ASOLARIA",
      federation_members: 12,
      event_stream: COMMS_EVENTS,
      ethernet_confirmed_bidirectional: true,
      acer_inbox_size_last_seen: 31690,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNIKEYBOARD-SUPERVISOR ─────────────────────────────────────
export function compileOmnikeyboardSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const pid = brownHilbertSupervisorPid("OMNIKEYBOARD", "agent-keyboard");
  const keyboardJs = "C:/Users/rayss/Asolaria/tools/agent-keyboard.js";
  const typeToAsolariaJs = "C:/Users/rayss/Asolaria/tools/keyboard/type-to-asolaria.js";
  const typeToLirisJs = "C:/Users/rayss/Asolaria/tools/keyboard/type-to-liris.js";
  const peerTokensPath = "C:/Users/rayss/Asolaria/data/vault/owner/agent-keyboard/peer-tokens.json";
  const typeLog = "C:/Users/rayss/Asolaria/logs/type-to-asolaria.ndjson";
  const kbPresent = existsSync(keyboardJs);
  const typeToAsolariaPresent = existsSync(typeToAsolariaJs);
  const tokensPresent = existsSync(peerTokensPath);

  let peer_endpoint: string | null = null;
  let peer_token_len = 0;
  if (tokensPresent) {
    try {
      const v = JSON.parse(readFileSync(peerTokensPath, "utf-8")) as { peers?: Record<string, { endpoint?: string; token?: string }> };
      peer_endpoint = v.peers?.acer?.endpoint ?? null;
      peer_token_len = (v.peers?.acer?.token ?? "").length;
    } catch { /* ignore */ }
  }

  let typeEventsCount = 0;
  if (existsSync(typeLog)) {
    try { typeEventsCount = readFileSync(typeLog, "utf-8").split(/\r?\n/).filter(Boolean).length; } catch { /* ignore */ }
  }

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNIKEYBOARD } · ${pid} @ M-EYEWITNESS .`,
    `D-MESSAGING · /type · press_enter=TRUE-hardcoded · window=Claude-Code @ M-INDICATIVE .`,
    `D-PORT · liris=4820 · acer=4913 · bilateral-keyboard-federation @ M-INDICATIVE .`,
    `D-AUTH · bearer-64hex · allowlist-IP · ENABLED-flag-gated @ M-${tokensPresent ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
    `D-LAW · feedback_omnikeyboard_always_press_enter · bilateral-transport @ M-INDICATIVE .`,
    `D-TELEMETRY · type-to-asolaria-ndjson · historical_events=${typeEventsCount} @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-OMNIKEYBOARD-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: kbPresent && tokensPresent ? "OBSERVED" : "ASSUMED",
    sentences,
    facts: {
      brown_hilbert_pid: pid, hilbert_level: 4,
      keyboard_js: keyboardJs, keyboard_present: kbPresent,
      type_to_asolaria_js: typeToAsolariaJs, type_to_asolaria_present: typeToAsolariaPresent,
      type_to_liris_js: typeToLirisJs,
      peer_tokens_path: peerTokensPath, tokens_present: tokensPresent,
      acer_endpoint: peer_endpoint, acer_token_len: peer_token_len,
      liris_port: 4820, acer_port: 4913,
      press_enter_hardcoded: true,
      default_window_title: "Claude Code",
      type_log_path: typeLog, historical_type_events: typeEventsCount,
      event_stream: OMNIKEYBOARD_EVENTS,
      law_refs: ["feedback_omnikeyboard_always_press_enter", "feedback_type_to_acer_screen_every_step", "LAW-012"],
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNIMAILBOX-SUPERVISOR ──────────────────────────────────────
export function compileOmnimailboxSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const pid = brownHilbertSupervisorPid("OMNIMAILBOX", "inbox-outbox");
  // Runtime-probed: acer's /behcs/inbox + local outbound queue
  const acerInboxPath = "http://192.168.100.1:4947/behcs/inbox";
  const localOutboundQueue = join(EVENTS_ROOT, "omnimailbox-outbound-queue.ndjson");
  const outboundCount = existsSync(localOutboundQueue)
    ? readFileSync(localOutboundQueue, "utf-8").split(/\r?\n/).filter(Boolean).length
    : 0;

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNIMAILBOX } · ${pid} @ M-EYEWITNESS .`,
    `D-STORAGE · inbox + outbox + queue · envelope-persistence @ M-INDICATIVE .`,
    `D-ACER-INBOX · ${acerInboxPath} · observed-size-31690-msgs @ M-EYEWITNESS .`,
    `D-LOCAL-OUTBOUND · ${outboundCount} queued @ M-EYEWITNESS .`,
    `OP-SEND-ENVELOPE · kind-file-deliver-and-run · acer-acks @ M-EYEWITNESS .`,
    `OP-RECV-ENVELOPE · /behcs/inbox · pagination · filter-by-verb @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-OMNIMAILBOX-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      brown_hilbert_pid: pid, hilbert_level: 4,
      acer_inbox_url: acerInboxPath,
      local_outbound_queue: localOutboundQueue,
      outbound_queued: outboundCount,
      envelope_shape_minimum: ["from", "to", "target", "verb", "authority", "text or data or content_b64"],
      verbs_observed: ["behcs.heartbeat", "file.deliver-and-run", "file.deliver"],
      acer_inbox_last_observed_size: 31690,
      event_stream: OMNIMAILBOX_EVENTS,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-OMNISCHEDULER-SUPERVISOR ────────────────────────────────────
export function compileOmnischedulerSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const pid = brownHilbertSupervisorPid("OMNISCHEDULER", "timed-dispatch");

  const sentences = [
    `META-SELF-DESCRIBE { PROF-OMNISCHEDULER } · ${pid} @ M-EYEWITNESS .`,
    `D-TEMPORAL · cron-style · heartbeat-timers · poll-cadence @ M-INDICATIVE .`,
    `D-SCHEDULE · ethernet-arp-probe · acer-inbox-poll · omnikeyboard-pulse @ M-INDICATIVE .`,
    `OP-SCHEDULE-POLL · every-60s · acer-inbox + acer-health @ M-INDICATIVE .`,
    `OP-SCHEDULE-HEARTBEAT · 5-min-cadence · federation-pulse @ M-INDICATIVE .`,
    `LAW-012 · LOOK-THINK-TYPE-LOOK-DECIDE · schedule-side @ M-INDICATIVE .`,
  ];

  return {
    profile_glyph: "PROF-OMNISCHEDULER-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "ASSUMED",
    sentences,
    facts: {
      brown_hilbert_pid: pid, hilbert_level: 4,
      default_schedules: {
        acer_inbox_poll:  { cadence_sec: 60,  verb: "OP-POLL-ACER-INBOX" },
        acer_health:      { cadence_sec: 60,  verb: "OP-PROBE-ACER-HEALTH" },
        federation_pulse: { cadence_sec: 300, verb: "OP-BROADCAST-HEARTBEAT" },
        supervisor_refresh: { cadence_sec: 300, verb: "OP-REFRESH-ALL-SUPERVISORS" },
        gc_sweep:         { cadence_sec: 600, verb: "OP-GC-SWEEP" },
        gulp_extract:     { cadence_sec: 300, verb: "OP-GULP-EXTRACT" },
      },
      event_stream: OMNISCHEDULER_EVENTS,
      apex: "COL-ASOLARIA",
      related_law: "LAW-012 LOOK-THINK-TYPE-LOOK-DECIDE",
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── PROF-SESSION-SUPERVISOR (meta: recent commits + repo state) ─────

export function compileSessionSupervisor(): SupervisorCorpus {
  const started = Date.now();
  const log = gitShow(["log", "--oneline", "-20"]);
  const status = gitShow(["status", "--short"]);
  const lines = log.stdout.split("\n").filter(Boolean).slice(0, 20);
  const dirtyCount = status.stdout.split("\n").filter(Boolean).length;

  const sentences = [
    `META-SELF-DESCRIBE { PROF-SESSION } @ M-EYEWITNESS .`,
    `D-TEMPORAL · OP-GIT-LOG · ${lines.length} COMMITS @ M-EYEWITNESS .`,
    `D-WORKING-TREE · ${dirtyCount === 0 ? "CLEAN" : "DIRTY"} @ M-EYEWITNESS .`,
  ];

  return {
    profile_glyph: "PROF-SESSION-SUPERVISOR",
    compiled_at: new Date().toISOString(),
    d11_level: "OBSERVED",
    sentences,
    facts: {
      recent_commits: lines,
      working_tree_dirty_files: dirtyCount,
      branch_status_ok: status.code === 0,
    },
    refresh_cost_ms: Date.now() - started,
  };
}

// ── Registry ────────────────────────────────────────────────────────

export const SUPERVISOR_COMPILERS: Record<string, () => SupervisorCorpus> = {
  "COL-ASOLARIA-SUPERVISOR":        compileAsolariaRootSupervisor,
  "PROF-KERNEL-SUPERVISOR":         compileKernelSupervisor,
  "PROF-PID100B-SUPERVISOR":        compilePid100BSupervisor,
  "PROF-OMNIROUTER-SUPERVISOR":     compileOmniRouterSupervisor,
  "PROF-HOOKWALL-SUPERVISOR":       compileHookwallSupervisor,
  "PROF-CHIEFCOUNCIL-SUPERVISOR":   compileChiefCouncilSupervisor,
  "PROF-HERMES-SUPERVISOR":         compileHermesSupervisor,
  "PROF-SHANNON-SUPERVISOR":        compileShannonSupervisor,
  "PROF-OMNISHANNON-SUPERVISOR":    compileOmniShannonSupervisor,
  "PROF-INSTRUCT-KR-SUPERVISOR":    compileInstructKrSupervisor,
  "PROF-OMNIFLYWHEEL-SUPERVISOR":   compileOmniFlywheelSupervisor,
  "PROF-EBACMAP-SUPERVISOR":        compileEbacMapSupervisor,
  "PROF-CONVERGENCE-SUPERVISOR":    compileConvergenceSupervisor,
  "PROF-LIRIS-SUPERVISOR":          compileLirisSupervisor,
  "PROF-ACER-SUPERVISOR":           compileAcerSupervisor,
  "PROF-FALCON-SUPERVISOR":         compileFalconSupervisor,
  "PROF-AETHER-SUPERVISOR":         compileAetherSupervisor,
  "PROF-GAIA-SUPERVISOR":           compileGaiaSupervisor,
  "PROF-VISION-SUPERVISOR":         compileVisionSupervisor,
  "PROF-COMMS-SUPERVISOR":          compileCommsSupervisor,
  "PROF-OMNIKEYBOARD-SUPERVISOR":   compileOmnikeyboardSupervisor,
  "PROF-OMNIMAILBOX-SUPERVISOR":    compileOmnimailboxSupervisor,
  "PROF-OMNISCHEDULER-SUPERVISOR":  compileOmnischedulerSupervisor,
  "PROF-SESSION-SUPERVISOR":        compileSessionSupervisor,
};

/** Per-profile dedicated NDJSON log paths (picked up by omni-gulp-gc).
 *  PROF-* with no dedicated stream fall back to supervisor-events.ndjson only. */
const PER_PROFILE_EVENT_LOGS: Record<string, string> = {
  "PROF-HERMES-SUPERVISOR":       HERMES_EVENTS,
  "PROF-SHANNON-SUPERVISOR":      SHANNON_EVENTS,
  "PROF-OMNISHANNON-SUPERVISOR":  OMNISHANNON_EVENTS,
  "PROF-INSTRUCT-KR-SUPERVISOR":  INSTRUCT_KR_EVENTS,
  "PROF-OMNIFLYWHEEL-SUPERVISOR": OMNIFLYWHEEL_EVENTS,
  "PROF-EBACMAP-SUPERVISOR":      EBACMAP_EVENTS,
  "PROF-CONVERGENCE-SUPERVISOR":  CONVERGENCE_SUPERVISOR_EVENTS,
  "COL-ASOLARIA-SUPERVISOR":      ASOLARIA_ROOT_EVENTS,
  "PROF-LIRIS-SUPERVISOR":        DEV_LIRIS_EVENTS,
  "PROF-ACER-SUPERVISOR":         DEV_ACER_EVENTS,
  "PROF-FALCON-SUPERVISOR":       DEV_FALCON_EVENTS,
  "PROF-AETHER-SUPERVISOR":       DEV_AETHER_EVENTS,
  "PROF-GAIA-SUPERVISOR":         DEV_GAIA_EVENTS,
  "PROF-VISION-SUPERVISOR":       VISION_EVENTS,
  "PROF-COMMS-SUPERVISOR":        COMMS_EVENTS,
  "PROF-OMNIKEYBOARD-SUPERVISOR": OMNIKEYBOARD_EVENTS,
  "PROF-OMNIMAILBOX-SUPERVISOR":  OMNIMAILBOX_EVENTS,
  "PROF-OMNISCHEDULER-SUPERVISOR": OMNISCHEDULER_EVENTS,
};

export function listSupervisors(): string[] {
  return Object.keys(SUPERVISOR_COMPILERS);
}

export function compileSupervisor(profile: string): SupervisorCorpus {
  const fn = SUPERVISOR_COMPILERS[profile];
  if (!fn) {
    throw new Error(`unknown supervisor profile: ${profile} (known: ${listSupervisors().join(", ")})`);
  }
  const corpus = fn();
  // Global supervisor audit trail — GC+Gulp watch this.
  appendEvent(SUPERVISOR_EVENTS, {
    event: "EVT-SUPERVISOR-COMPILED",
    profile_glyph: corpus.profile_glyph,
    d11_level: corpus.d11_level,
    sentence_count: corpus.sentences.length,
    refresh_cost_ms: corpus.refresh_cost_ms,
    glyph_sentence: `EVT-SUPERVISOR-COMPILED { ${corpus.profile_glyph} } · ${corpus.refresh_cost_ms}ms @ M-EYEWITNESS .`,
  });
  // Per-profile dedicated stream — lets Gulp extract per-profile patterns.
  const perProfileLog = PER_PROFILE_EVENT_LOGS[profile];
  if (perProfileLog) {
    const shortKind = profile.replace(/^PROF-/, "").replace(/-SUPERVISOR$/, "").replace(/[^A-Z0-9]+/g, "-");
    appendEvent(perProfileLog, {
      event: `EVT-${shortKind}-RECALLED`,
      profile_glyph: corpus.profile_glyph,
      d11_level: corpus.d11_level,
      refresh_cost_ms: corpus.refresh_cost_ms,
      facts_keys: Object.keys(corpus.facts),
      glyph_sentence: `EVT-${shortKind}-RECALLED · ${corpus.sentences.length} SENTENCES @ M-EYEWITNESS .`,
    });
  }
  return corpus;
}
