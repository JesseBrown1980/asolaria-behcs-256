// packages/shannon-civ/src/twenty-three-stage-loop.ts — Shannon 23-stage
// loop mirror (aligned with Liris mega-batch-6)
//
// The existing L0-L6 pipeline is 7 stages. Liris shipped a 23-stage loop
// that expands into pre-staging, per-layer gates, and post-verdict
// cascade. This acer-side mirror emits the same 23 stages as plain-data
// scaffolding so we can align envelope shape across the bilateral
// pipeline.
//
// Pure — caller steps through the enum or pipes through each stage.

export const STAGES = [
  "S00_ingress",
  "S01_sig_check",
  "S02_schema_check",
  "S03_witness_extract",
  "S04_L0_rate_scope",
  "S05_L1_witness_profile",
  "S06_L2_self_patterns",
  "S07_L2_5_cross_check",         // acer-added: mid-pipeline consensus check
  "S08_L3_profile_classify",
  "S09_L3_5_registry_salt",       // acer-added: registry-commit stamp
  "S10_L4_evidence",
  "S11_L4_5_gnn_score",           // acer-added: GNN edge score fold
  "S12_L5_verdict",
  "S13_L5_cache_check",
  "S14_L5_cache_store",
  "S15_L6_finalize",
  "S16_cosign_prev_sha",
  "S17_cosign_sign",
  "S18_cosign_append",
  "S19_federation_broadcast",
  "S20_receipt_expect",
  "S21_divergence_record",
  "S22_outcome_commit",
] as const;

export type StageName = typeof STAGES[number];

export interface StageOutcome {
  stage: StageName;
  ok: boolean;
  detail: string;
  at: string;
}

export interface LoopState {
  started_at: string;
  current_stage: number;            // index into STAGES
  completed: StageOutcome[];
  terminated: boolean;
  terminal_reason: string | null;
}

export function initLoop(now: string = new Date().toISOString()): LoopState {
  return {
    started_at: now,
    current_stage: 0,
    completed: [],
    terminated: false,
    terminal_reason: null,
  };
}

export interface StepInput {
  state: LoopState;
  ok: boolean;
  detail?: string;
  at?: string;
  terminate?: boolean;
  terminate_reason?: string;
}

export interface StepResult {
  state: LoopState;
  stage_advanced: boolean;
  glyph_sentence: string;
}

export function step(input: StepInput): StepResult {
  const now = input.at ?? new Date().toISOString();
  const s = input.state;
  if (s.terminated) {
    return {
      state: s,
      stage_advanced: false,
      glyph_sentence: `EVT-23-LOOP-ALREADY-TERMINATED · reason=${s.terminal_reason} @ M-INDICATIVE .`,
    };
  }
  if (s.current_stage >= STAGES.length) {
    return {
      state: { ...s, terminated: true, terminal_reason: "all-stages-complete" },
      stage_advanced: false,
      glyph_sentence: `EVT-23-LOOP-COMPLETE · stages=${STAGES.length} @ M-EYEWITNESS .`,
    };
  }
  const stageName = STAGES[s.current_stage];
  const outcome: StageOutcome = {
    stage: stageName,
    ok: input.ok,
    detail: input.detail ?? "",
    at: now,
  };
  const newCompleted = [...s.completed, outcome];
  const terminate = input.terminate || !input.ok;
  const newState: LoopState = {
    ...s,
    current_stage: s.current_stage + 1,
    completed: newCompleted,
    terminated: terminate,
    terminal_reason: terminate ? (input.terminate_reason ?? (input.ok ? null : `stage-failed: ${stageName}`)) : null,
  };
  return {
    state: newState,
    stage_advanced: true,
    glyph_sentence: terminate
      ? `EVT-23-LOOP-TERMINATED · stage=${stageName} · ok=${input.ok} · reason=${newState.terminal_reason} @ M-EYEWITNESS .`
      : `EVT-23-LOOP-STEP · stage=${stageName} · ok=${input.ok} · progress=${s.current_stage + 1}/${STAGES.length} @ M-INDICATIVE .`,
  };
}

export interface LoopSummary {
  started_at: string;
  total_stages: number;
  completed_count: number;
  terminated: boolean;
  terminal_reason: string | null;
  all_passed: boolean;
  by_stage: Record<StageName, StageOutcome | null>;
  glyph_sentence: string;
}

export function summarize(state: LoopState): LoopSummary {
  const byStage: Record<string, StageOutcome | null> = {};
  for (const s of STAGES) byStage[s] = null;
  for (const o of state.completed) byStage[o.stage] = o;
  const allPassed = state.completed.length === STAGES.length && state.completed.every(o => o.ok);
  return {
    started_at: state.started_at,
    total_stages: STAGES.length,
    completed_count: state.completed.length,
    terminated: state.terminated,
    terminal_reason: state.terminal_reason,
    all_passed: allPassed,
    by_stage: byStage as any,
    glyph_sentence: `EVT-23-LOOP-SUMMARY · completed=${state.completed.length}/${STAGES.length} · all-pass=${allPassed} · terminated=${state.terminated} @ M-${allPassed ? "EYEWITNESS" : "INDICATIVE"} .`,
  };
}

// Run all 23 stages with a caller-supplied oracle for each (useful for tests + cascade runs)
export function runFullLoop(oracle: (stage: StageName, index: number) => { ok: boolean; detail?: string; terminate?: boolean }, now: string = new Date().toISOString()): LoopState {
  let state = initLoop(now);
  for (let i = 0; i < STAGES.length && !state.terminated; i++) {
    const o = oracle(STAGES[i], i);
    state = step({ state, ok: o.ok, detail: o.detail, at: now, terminate: o.terminate }).state;
  }
  return state;
}
