// packages/wave-governance/src/wave-mode.ts — U-001 wave-mode-governance
// mirror (aligned with Liris Section U)
//
// Waves run in modes (exploration, consolidation, quarantine, emergency).
// Mode determines which verb classes are allowed, which gates relax,
// how aggressively the GNN updates. This is the acer-side mirror so
// both colonies can ratify wave-mode transitions in lockstep.
//
// Pure state machine — no I/O.

export type WaveMode = "exploration" | "consolidation" | "quarantine" | "emergency";

export interface ModeConfig {
  mode: WaveMode;
  allowed_verb_classes: string[];
  l3_strictness: "strict" | "normal" | "relaxed";
  gnn_update_rate: number;        // edge-weight delta magnitude per observation
  max_concurrent_waves: number;
  witness_required: "owner" | "any" | "none";
  description: string;
}

export const MODE_CONFIGS: Record<WaveMode, ModeConfig> = {
  exploration: {
    mode: "exploration",
    allowed_verb_classes: ["scan", "drift", "cosign", "migration", "heartbeat"],
    l3_strictness: "normal",
    gnn_update_rate: 0.02,
    max_concurrent_waves: 12,
    witness_required: "any",
    description: "open exploration; all classes allowed; moderate learning rate",
  },
  consolidation: {
    mode: "consolidation",
    allowed_verb_classes: ["cosign", "heartbeat", "migration"],
    l3_strictness: "strict",
    gnn_update_rate: 0.01,
    max_concurrent_waves: 6,
    witness_required: "owner",
    description: "solidify gains; only safe classes; slow learning; owner witness required",
  },
  quarantine: {
    mode: "quarantine",
    allowed_verb_classes: ["drift", "heartbeat"],
    l3_strictness: "strict",
    gnn_update_rate: 0.005,
    max_concurrent_waves: 3,
    witness_required: "owner",
    description: "respond to breach; restrict classes; minimal learning to prevent drift",
  },
  emergency: {
    mode: "emergency",
    allowed_verb_classes: ["heartbeat"],
    l3_strictness: "strict",
    gnn_update_rate: 0,
    max_concurrent_waves: 1,
    witness_required: "owner",
    description: "halt all forward progress except heartbeat; freeze GNN; await operator",
  },
};

export interface WaveModeState {
  current_mode: WaveMode;
  previous_mode: WaveMode | null;
  entered_at: string;
  transition_log: Array<{
    from: WaveMode | null;
    to: WaveMode;
    at: string;
    by_witness: string;
    reason: string;
  }>;
}

export function initialState(initial: WaveMode = "exploration", now: string = new Date().toISOString()): WaveModeState {
  return {
    current_mode: initial,
    previous_mode: null,
    entered_at: now,
    transition_log: [{ from: null, to: initial, at: now, by_witness: "init", reason: "initialization" }],
  };
}

export interface TransitionInput {
  to: WaveMode;
  witness: string;               // gate identifier; must satisfy target mode's witness_required
  witness_profile: "owner" | "autonomous" | "friend";
  reason: string;
  at?: string;
}

export interface TransitionResult {
  ok: boolean;
  new_state: WaveModeState;
  rejected_reason?: string;
  glyph_sentence: string;
}

function witnessSatisfies(required: ModeConfig["witness_required"], profile: TransitionInput["witness_profile"]): boolean {
  if (required === "none") return true;
  if (required === "any") return profile === "owner" || profile === "friend";
  if (required === "owner") return profile === "owner";
  return false;
}

export function transition(state: WaveModeState, input: TransitionInput): TransitionResult {
  const now = input.at ?? new Date().toISOString();
  const targetConfig = MODE_CONFIGS[input.to];
  if (!witnessSatisfies(targetConfig.witness_required, input.witness_profile)) {
    return {
      ok: false,
      new_state: state,
      rejected_reason: `target mode ${input.to} requires witness_required=${targetConfig.witness_required}, got profile=${input.witness_profile}`,
      glyph_sentence: `EVT-WAVE-MODE-TRANSITION-REJECTED · from=${state.current_mode} · to=${input.to} · reason=witness-insufficient @ M-EYEWITNESS .`,
    };
  }
  if (input.to === state.current_mode) {
    return {
      ok: true,
      new_state: state,
      glyph_sentence: `EVT-WAVE-MODE-TRANSITION-NOOP · mode=${state.current_mode} @ M-INDICATIVE .`,
    };
  }
  const new_state: WaveModeState = {
    current_mode: input.to,
    previous_mode: state.current_mode,
    entered_at: now,
    transition_log: [...state.transition_log, {
      from: state.current_mode,
      to: input.to,
      at: now,
      by_witness: input.witness,
      reason: input.reason,
    }],
  };
  return {
    ok: true,
    new_state,
    glyph_sentence: `EVT-WAVE-MODE-TRANSITION · from=${state.current_mode} · to=${input.to} · by=${input.witness} @ M-EYEWITNESS .`,
  };
}

export interface VerbAllowCheck {
  allowed: boolean;
  mode: WaveMode;
  reason: string;
}

export function isVerbAllowed(state: WaveModeState, verbClass: string): VerbAllowCheck {
  const cfg = MODE_CONFIGS[state.current_mode];
  const allowed = cfg.allowed_verb_classes.includes(verbClass);
  return {
    allowed,
    mode: state.current_mode,
    reason: allowed
      ? `verb class '${verbClass}' allowed under ${state.current_mode}`
      : `verb class '${verbClass}' blocked under ${state.current_mode} (allowed: ${cfg.allowed_verb_classes.join(", ")})`,
  };
}

export interface WaveModeSummary {
  current_mode: WaveMode;
  time_in_mode_ms: number;
  transition_count: number;
  most_recent_transitions: Array<{ from: WaveMode | null; to: WaveMode; at: string; reason: string }>;
  gnn_update_rate: number;
  max_concurrent_waves: number;
  glyph_sentence: string;
}

export function summarize(state: WaveModeState, now: string = new Date().toISOString()): WaveModeSummary {
  const cfg = MODE_CONFIGS[state.current_mode];
  return {
    current_mode: state.current_mode,
    time_in_mode_ms: Date.parse(now) - Date.parse(state.entered_at),
    transition_count: state.transition_log.length,
    most_recent_transitions: state.transition_log.slice(-5),
    gnn_update_rate: cfg.gnn_update_rate,
    max_concurrent_waves: cfg.max_concurrent_waves,
    glyph_sentence: `EVT-WAVE-MODE-SUMMARY · mode=${state.current_mode} · transitions=${state.transition_log.length} · gnn-rate=${cfg.gnn_update_rate} @ M-INDICATIVE .`,
  };
}
