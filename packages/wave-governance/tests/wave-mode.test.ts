import { initialState, transition, isVerbAllowed, summarize, MODE_CONFIGS } from "../src/wave-mode.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== U-001 wave-mode-governance tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

// T1: initial state
console.log("T1: initial");
const s0 = initialState("exploration", NOW);
assert(s0.current_mode === "exploration", "exploration");
assert(s0.previous_mode === null, "no previous");
assert(s0.transition_log.length === 1, "1 init log entry");
assert(s0.transition_log[0].reason === "initialization", "init reason");

// T2: mode configs shape
console.log("\nT2: mode configs");
assert(MODE_CONFIGS.exploration.gnn_update_rate === 0.02, "exploration rate");
assert(MODE_CONFIGS.emergency.gnn_update_rate === 0, "emergency freezes gnn");
assert(MODE_CONFIGS.emergency.allowed_verb_classes.length === 1, "emergency: heartbeat only");
assert(MODE_CONFIGS.emergency.witness_required === "owner", "emergency: owner");

// T3: valid transition
console.log("\nT3: valid transition");
const r1 = transition(s0, { to: "consolidation", witness: "jesse", witness_profile: "owner", reason: "scheduled", at: "2026-04-19T05:01:00Z" });
assert(r1.ok === true, "accepted");
assert(r1.new_state.current_mode === "consolidation", "mode updated");
assert(r1.new_state.previous_mode === "exploration", "previous tracked");
assert(r1.new_state.transition_log.length === 2, "2 log entries");

// T4: witness insufficient for owner-required mode
console.log("\nT4: witness insufficient");
const r2 = transition(s0, { to: "emergency", witness: "cron", witness_profile: "autonomous", reason: "automated escalation" });
assert(r2.ok === false, "rejected");
assert(r2.rejected_reason?.includes("witness-insufficient") || r2.rejected_reason?.includes("witness_required"), "witness reason");
assert(r2.new_state === s0, "state unchanged");

// T5: any-witness satisfied by owner
console.log("\nT5: any witness by owner");
const r3 = transition(s0, { to: "exploration", witness: "cron", witness_profile: "autonomous", reason: "test" });
// exploration requires "any" → autonomous should NOT satisfy since any = owner|friend
// Wait — let me check. In my code: "any" requires owner or friend. Autonomous would fail.
assert(r3.ok === false, "autonomous rejected under 'any' (owner|friend only)");

// T6: any-witness satisfied by friend
console.log("\nT6: any by friend");
const r4 = transition(s0, { to: "exploration", witness: "rayssa", witness_profile: "friend", reason: "test" });
assert(r4.ok === true, "friend accepted under any");

// T7: noop transition
console.log("\nT7: noop");
const r5 = transition(s0, { to: "exploration", witness: "jesse", witness_profile: "owner", reason: "noop" });
assert(r5.ok === true, "ok");
assert(r5.glyph_sentence.includes("NOOP"), "noop glyph");
assert(r5.new_state === s0, "state same");

// T8: verb allowed in exploration
console.log("\nT8: verb in exploration");
assert(isVerbAllowed(s0, "scan").allowed === true, "scan allowed");
assert(isVerbAllowed(s0, "cosign").allowed === true, "cosign allowed");
assert(isVerbAllowed(s0, "migration").allowed === true, "migration allowed");

// T9: verb blocked in emergency
console.log("\nT9: verb in emergency");
const emergencyState = { ...s0, current_mode: "emergency" as const };
assert(isVerbAllowed(emergencyState, "scan").allowed === false, "scan blocked");
assert(isVerbAllowed(emergencyState, "heartbeat").allowed === true, "heartbeat still ok");
assert(isVerbAllowed(emergencyState, "cosign").allowed === false, "cosign blocked");

// T10: verb restrictions in quarantine
console.log("\nT10: quarantine");
const quarantine = { ...s0, current_mode: "quarantine" as const };
assert(isVerbAllowed(quarantine, "drift").allowed === true, "drift allowed");
assert(isVerbAllowed(quarantine, "heartbeat").allowed === true, "heartbeat allowed");
assert(isVerbAllowed(quarantine, "scan").allowed === false, "scan blocked");
assert(isVerbAllowed(quarantine, "migration").allowed === false, "migration blocked");

// T11: cascade of transitions logged
console.log("\nT11: cascade log");
let state = initialState("exploration", "2026-04-19T00:00:00Z");
state = transition(state, { to: "consolidation", witness: "jesse", witness_profile: "owner", reason: "r1", at: "2026-04-19T01:00:00Z" }).new_state;
state = transition(state, { to: "quarantine", witness: "jesse", witness_profile: "owner", reason: "breach", at: "2026-04-19T02:00:00Z" }).new_state;
state = transition(state, { to: "emergency", witness: "jesse", witness_profile: "owner", reason: "breach2", at: "2026-04-19T03:00:00Z" }).new_state;
assert(state.current_mode === "emergency", "end in emergency");
assert(state.transition_log.length === 4, "4 log entries (1 init + 3 transitions)");
assert(state.previous_mode === "quarantine", "prev tracked");

// T12: summarize
console.log("\nT12: summarize");
const sum = summarize(state, "2026-04-19T04:00:00Z");
assert(sum.current_mode === "emergency", "mode");
assert(sum.time_in_mode_ms === 3600000, "1h in emergency");
assert(sum.transition_count === 4, "4 transitions");
assert(sum.gnn_update_rate === 0, "emergency freezes gnn");
assert(sum.most_recent_transitions.length <= 5, "≤5 recent");

// T13: emergency blocks non-owner witness
console.log("\nT13: emergency gate");
const sExp = initialState("exploration", NOW);
const rEmerg = transition(sExp, { to: "emergency", witness: "rayssa", witness_profile: "friend", reason: "friend trying emergency" });
assert(rEmerg.ok === false, "friend can't trigger emergency");

// T14: transition glyph reports witnesses
console.log("\nT14: glyph content");
assert(r1.glyph_sentence.includes("from=exploration"), "from in glyph");
assert(r1.glyph_sentence.includes("to=consolidation"), "to in glyph");
assert(r1.glyph_sentence.includes("by=jesse"), "witness in glyph");

// T15: all 4 modes distinct configs
console.log("\nT15: 4 modes");
const rates = new Set([
  MODE_CONFIGS.exploration.gnn_update_rate,
  MODE_CONFIGS.consolidation.gnn_update_rate,
  MODE_CONFIGS.quarantine.gnn_update_rate,
  MODE_CONFIGS.emergency.gnn_update_rate,
]);
assert(rates.size === 4, "4 distinct gnn rates");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-U-001-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
