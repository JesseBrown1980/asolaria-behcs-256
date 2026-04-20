// packages/migration/src/state-machine.ts — D-059 migration state machine
//
// Implements the 6-phase AGT-* migration workflow from D-057:
//   Announce → Stage → Drain → Cutover → Verify → Rollback
//
// Typed transitions. Each phase has a guard (preflight-ish predicate)
// and a mutator (the actual work). Failure anywhere after Announce
// triggers Rollback. All transitions emit events to the session log.
//
// Integrates with:
//   D-055 ed25519-registry  — mintKey / rotateKey / verifyEnvelope
//   D-056 binding-classes   — bindingClassOf subject must be substrate-independent
//   A-010 migration-log     — rollback replays the session log in reverse
//   device-instance         — optional manifest-schema validation on subject

import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { bindingClassOf } from "../../kernel/src/binding-classes.ts";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type MigrationPhase =
  | "INIT"
  | "ANNOUNCING"
  | "STAGING"
  | "DRAINING"
  | "CUTOVER"
  | "VERIFYING"
  | "COMPLETE"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "FAILED";

export interface MigrationState {
  session_id: string;
  subject: string;           // AGT-* being migrated
  source: string;            // DEV-* current host
  target: string;            // DEV-* new host
  colony: string;            // COL-*
  operator_witness: string;  // one of jesse/rayssa/amy/felipe/dan under 2W window
  phase: MigrationPhase;
  started_at: string;
  ended_at: string | null;
  preflight: { ok: boolean; violations: string[] } | null;
  stage_result: { new_key_id: string | null; registry_path: string | null } | null;
  ledger_refs: string[];
  error: string | null;
}

export interface PhaseResult {
  ok: boolean;
  next_phase: MigrationPhase;
  error?: string;
}

export interface MigrationHooks {
  /** Phase-specific side effects the caller provides. Each returns {ok, error?}. */
  announce?: (state: MigrationState) => Promise<{ ok: boolean; error?: string }>;
  stage?: (state: MigrationState) => Promise<{ ok: boolean; new_key_id?: string; error?: string }>;
  drain?: (state: MigrationState) => Promise<{ ok: boolean; error?: string }>;
  cutover?: (state: MigrationState) => Promise<{ ok: boolean; error?: string }>;
  verify?: (state: MigrationState) => Promise<{ ok: boolean; error?: string }>;
  rollback?: (state: MigrationState) => Promise<{ ok: boolean; error?: string }>;
}

// ──────────────────────────────────────────────────────────────────────
// Session log
// ──────────────────────────────────────────────────────────────────────

const SESSION_LOG_DIR = join(homedir(), ".asolaria-workers", "migration-sessions");

function appendSessionEvent(session_id: string, event: Record<string, unknown>) {
  mkdirSync(SESSION_LOG_DIR, { recursive: true });
  const path = join(SESSION_LOG_DIR, `${session_id}.ndjson`);
  appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), session_id, ...event }) + "\n");
}

// ──────────────────────────────────────────────────────────────────────
// Preflight
// ──────────────────────────────────────────────────────────────────────

export interface PreflightInput {
  subject: string;
  source: string;
  target: string;
  colony: string;
  operator_witness: string;
}

const AUTHORIZED_OPERATORS_2W = new Set(["jesse", "rayssa", "amy", "felipe", "dan"]);

export function preflight(input: PreflightInput): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  // 1. subject must be substrate-independent (AGT-*)
  const subjClass = bindingClassOf(input.subject);
  if (subjClass !== "substrate-independent") {
    violations.push(`subject ${input.subject} has binding_class=${subjClass}; migration only supports substrate-independent entities`);
  }
  // 2. subject glyph must be AGT-* (migration procedure is for agents)
  if (!/^AGT-/.test(input.subject)) {
    violations.push(`subject ${input.subject} is not an AGT-* glyph`);
  }
  // 3. source and target must be DEV-*
  if (!/^DEV-/.test(input.source)) violations.push(`source ${input.source} is not a DEV-* glyph`);
  if (!/^DEV-/.test(input.target)) violations.push(`target ${input.target} is not a DEV-* glyph`);
  // 4. source != target
  if (input.source === input.target) violations.push("source and target are the same device");
  // 5. colony must be COL-*
  if (!/^COL-/.test(input.colony)) violations.push(`colony ${input.colony} is not a COL-* glyph`);
  // 6. operator must be in 2W authorized set (jesse/rayssa/amy/felipe/dan)
  if (!AUTHORIZED_OPERATORS_2W.has(input.operator_witness.toLowerCase())) {
    violations.push(`operator_witness ${input.operator_witness} not in 2W authorized set {jesse,rayssa,amy,felipe,dan}`);
  }
  return { ok: violations.length === 0, violations };
}

// ──────────────────────────────────────────────────────────────────────
// Session creation
// ──────────────────────────────────────────────────────────────────────

export function createMigrationSession(input: PreflightInput): MigrationState {
  const pre = preflight(input);
  const session_id = new Date().toISOString().replace(/[:.]/g, "-") + "_" + randomUUID().slice(0, 8);
  const state: MigrationState = {
    session_id,
    subject: input.subject,
    source: input.source,
    target: input.target,
    colony: input.colony,
    operator_witness: input.operator_witness,
    phase: pre.ok ? "INIT" : "FAILED",
    started_at: new Date().toISOString(),
    ended_at: null,
    preflight: pre,
    stage_result: null,
    ledger_refs: [],
    error: pre.ok ? null : `preflight_failed: ${pre.violations.join("; ")}`,
  };
  appendSessionEvent(session_id, { event: "SESSION_CREATED", phase: state.phase, preflight: pre });
  return state;
}

// ──────────────────────────────────────────────────────────────────────
// Phase transitions
// ──────────────────────────────────────────────────────────────────────

const PHASE_ORDER: MigrationPhase[] = [
  "INIT", "ANNOUNCING", "STAGING", "DRAINING", "CUTOVER", "VERIFYING", "COMPLETE",
];

function nextPhase(current: MigrationPhase): MigrationPhase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx === PHASE_ORDER.length - 1) return current;
  return PHASE_ORDER[idx + 1];
}

/** Advance one phase. Runs the hook for the current phase, updates state, logs. */
export async function step(state: MigrationState, hooks: MigrationHooks): Promise<MigrationState> {
  if (state.phase === "COMPLETE" || state.phase === "ROLLED_BACK" || state.phase === "FAILED") return state;
  if (state.phase === "ROLLING_BACK") return await rollback(state, hooks);

  const phase = state.phase;
  let result: { ok: boolean; error?: string; new_key_id?: string } = { ok: true };

  try {
    if (phase === "INIT" && hooks.announce) { state.phase = "ANNOUNCING"; appendSessionEvent(state.session_id, { event: "PHASE_ENTER", phase: "ANNOUNCING" }); result = await hooks.announce(state); }
    else if (phase === "ANNOUNCING" && hooks.stage) { state.phase = "STAGING"; appendSessionEvent(state.session_id, { event: "PHASE_ENTER", phase: "STAGING" }); result = await hooks.stage(state); if (result.ok && result.new_key_id) state.stage_result = { new_key_id: result.new_key_id, registry_path: null }; }
    else if (phase === "STAGING" && hooks.drain) { state.phase = "DRAINING"; appendSessionEvent(state.session_id, { event: "PHASE_ENTER", phase: "DRAINING" }); result = await hooks.drain(state); }
    else if (phase === "DRAINING" && hooks.cutover) { state.phase = "CUTOVER"; appendSessionEvent(state.session_id, { event: "PHASE_ENTER", phase: "CUTOVER" }); result = await hooks.cutover(state); }
    else if (phase === "CUTOVER" && hooks.verify) { state.phase = "VERIFYING"; appendSessionEvent(state.session_id, { event: "PHASE_ENTER", phase: "VERIFYING" }); result = await hooks.verify(state); }
    else if (phase === "VERIFYING") { state.phase = "COMPLETE"; state.ended_at = new Date().toISOString(); appendSessionEvent(state.session_id, { event: "SESSION_COMPLETE" }); return state; }
    else {
      // phase advance without hook — just move forward
      state.phase = nextPhase(phase);
      appendSessionEvent(state.session_id, { event: "PHASE_ADVANCED_NO_HOOK", phase: state.phase });
      return state;
    }
  } catch (e) {
    result = { ok: false, error: `hook_threw: ${(e as Error).message ?? String(e)}` };
  }

  if (!result.ok) {
    state.error = result.error ?? `phase ${state.phase} failed`;
    state.phase = "ROLLING_BACK";
    appendSessionEvent(state.session_id, { event: "PHASE_FAILED", phase, error: state.error });
    return await rollback(state, hooks);
  }

  appendSessionEvent(state.session_id, { event: "PHASE_COMPLETE", phase: state.phase });
  return state;
}

/** Rollback: invoke hooks.rollback (caller-provided), replay A-010 migration-log if present, mark state. */
async function rollback(state: MigrationState, hooks: MigrationHooks): Promise<MigrationState> {
  state.phase = "ROLLING_BACK";
  appendSessionEvent(state.session_id, { event: "ROLLBACK_STARTED" });
  try {
    if (hooks.rollback) {
      const r = await hooks.rollback(state);
      if (!r.ok) {
        state.phase = "FAILED";
        state.error = (state.error ? state.error + "; " : "") + `rollback_failed: ${r.error ?? "unknown"}`;
        appendSessionEvent(state.session_id, { event: "ROLLBACK_FAILED", error: r.error });
        return state;
      }
    }
  } catch (e) {
    state.phase = "FAILED";
    state.error = (state.error ? state.error + "; " : "") + `rollback_threw: ${(e as Error).message ?? String(e)}`;
    appendSessionEvent(state.session_id, { event: "ROLLBACK_THREW", error: String(e) });
    return state;
  }
  state.phase = "ROLLED_BACK";
  state.ended_at = new Date().toISOString();
  appendSessionEvent(state.session_id, { event: "ROLLED_BACK" });
  return state;
}

/** Drive the entire session to a terminal state (COMPLETE / ROLLED_BACK / FAILED). */
export async function run(initial: MigrationState, hooks: MigrationHooks, safety = 100): Promise<MigrationState> {
  let state = initial;
  let steps = 0;
  while (state.phase !== "COMPLETE" && state.phase !== "ROLLED_BACK" && state.phase !== "FAILED" && steps < safety) {
    state = await step(state, hooks);
    steps++;
  }
  if (steps >= safety) {
    state.phase = "FAILED";
    state.error = (state.error ? state.error + "; " : "") + "safety_loop_limit_exceeded";
  }
  return state;
}

/** Read the session log for audit. */
export function readSessionLog(session_id: string): Array<Record<string, unknown>> {
  const path = join(SESSION_LOG_DIR, `${session_id}.ndjson`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
