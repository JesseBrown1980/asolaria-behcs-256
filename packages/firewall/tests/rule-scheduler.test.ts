import { schedule, tick, applyTick, summarize, type SchedulerState } from "../src/rule-scheduler.ts";
import type { RuleProposal } from "../src/rule-proposals.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== L-005 rule-scheduler tests ===\n");

const NOW = "2026-04-19T05:00:00Z";
const HOUR = 3600_000;

function mkProp(overrides: Partial<RuleProposal> = {}): RuleProposal {
  return {
    kind: "actor-block",
    subject: "attacker",
    rationale: "test",
    seen_count: 25,
    first_seen: "2026-04-19T04:00:00Z",
    last_seen: NOW,
    suggested_rule_id: "R-AUTO-ATTACKER",
    suggested_reason: "25 denials",
    ...overrides,
  };
}

// T1: immediate activation
console.log("T1: immediate");
const r1 = schedule(mkProp(), { now: NOW });
assert(r1.status === "active", "active immediately");
assert(r1.rule_id === "R-AUTO-ATTACKER", "rule_id");
assert(r1.scope === "actor", "actor scope");
assert(Date.parse(r1.activates_at) === Date.parse(NOW), "activates now");

// T2: delayed activation
console.log("\nT2: delayed");
const r2 = schedule(mkProp(), { now: NOW, activate_after_ms: 300_000 });
assert(r2.status === "pending", "pending");
assert(Date.parse(r2.activates_at) === Date.parse(NOW) + 300_000, "activates 5min later");

// T3: scope mapping
console.log("\nT3: scope mapping");
const rVerb = schedule(mkProp({ kind: "verb-block", subject: "bad-verb" }), { now: NOW });
assert(rVerb.scope === "envelope", "verb → envelope scope");
const rSubj = schedule(mkProp({ kind: "subject-block", subject: "scan-1" }), { now: NOW });
assert(rSubj.scope === "subject", "subject → subject scope");

// T4: tick with active rule emits ActiveBlock
console.log("\nT4: tick active");
const state1: SchedulerState = { scheduled: [r1], now: NOW };
const t1 = tick(state1);
assert(t1.active_blocks.length === 1, "1 block");
assert(t1.active_blocks[0].rule_id === "R-AUTO-ATTACKER", "rule_id echoed");
assert(t1.active_blocks[0].scope === "actor", "scope echoed");

// T5: tick before activation → stays pending
console.log("\nT5: pending before activation");
const state2: SchedulerState = { scheduled: [r2], now: NOW };
const t2 = tick(state2);
assert(t2.still_pending.length === 1, "still pending");
assert(t2.active_blocks.length === 0, "no active blocks");

// T6: tick at/after activation promotes pending
console.log("\nT6: promote pending");
const state3: SchedulerState = { scheduled: [r2], now: new Date(Date.parse(NOW) + 400_000).toISOString() };
const t3 = tick(state3);
assert(t3.promoted_to_active.length === 1, "1 promoted");
assert(t3.active_blocks.length === 1, "1 active");

// T7: tick past expiry without renew → expired
console.log("\nT7: expired");
const r7 = schedule(mkProp(), { now: NOW, duration_ms: HOUR });
const state7: SchedulerState = { scheduled: [r7], now: new Date(Date.parse(NOW) + 2 * HOUR).toISOString() };
const t7 = tick(state7);
assert(t7.newly_expired.length === 1, "1 expired");
assert(t7.active_blocks.length === 0, "no active");

// T8: auto-renew-fixed
console.log("\nT8: auto-renew-fixed");
const r8 = schedule(mkProp(), { now: NOW, duration_ms: HOUR, renew_policy: "auto-renew-fixed", renew_duration_ms: HOUR });
const state8: SchedulerState = { scheduled: [r8], now: new Date(Date.parse(NOW) + 2 * HOUR).toISOString() };
const t8 = tick(state8);
assert(t8.newly_renewed.length === 1, "renewed");
assert(t8.active_blocks.length === 1, "active block from renewed");
assert(t8.newly_expired.length === 0, "not expired");
const newExp = Date.parse(t8.newly_renewed[0].expires_at);
const expected = Date.parse(state8.now) + HOUR;
assert(Math.abs(newExp - expected) < 1000, "renewal pushes expiry forward");

// T9: auto-renew-if-still-offending (offender active)
console.log("\nT9: conditional renew (still offending)");
const r9 = schedule(mkProp({ subject: "offender" }), { now: NOW, duration_ms: HOUR, renew_policy: "auto-renew-if-still-offending" });
const state9: SchedulerState = { scheduled: [r9], now: new Date(Date.parse(NOW) + 2 * HOUR).toISOString() };
const t9 = tick(state9, (subject) => subject === "offender");
assert(t9.newly_renewed.length === 1, "renewed because still offending");

// T10: auto-renew-if-still-offending (offender cleared)
console.log("\nT10: conditional renew (cleared)");
const t10 = tick(state9, () => false);
assert(t10.newly_expired.length === 1, "expired because not offending");
assert(t10.newly_renewed.length === 0, "no renewal");

// T11: applyTick drops expired, keeps pending + promoted + renewed
console.log("\nT11: applyTick");
const multi: SchedulerState = {
  scheduled: [
    schedule(mkProp({ subject: "keep-pending", suggested_rule_id: "R-KEEP-PENDING" }), { now: NOW, activate_after_ms: HOUR }),
    schedule(mkProp({ subject: "keep-active", suggested_rule_id: "R-KEEP-ACTIVE" }), { now: NOW }),
    schedule(mkProp({ subject: "will-expire", suggested_rule_id: "R-WILL-EXPIRE" }), { now: "2026-04-19T03:00:00Z", duration_ms: HOUR }),
  ],
  now: NOW,
};
const tMulti = tick(multi);
const after = applyTick(multi, tMulti);
assert(after.scheduled.length === 2, "2 remain (expired dropped)");
assert(after.scheduled.some(r => r.subject === "keep-pending"), "pending kept");
assert(after.scheduled.some(r => r.subject === "keep-active"), "active kept");
assert(!after.scheduled.some(r => r.subject === "will-expire"), "expired dropped");

// T12: summary
console.log("\nT12: summary");
const sum = summarize(multi, tMulti);
assert(sum.total === 3, "3 total");
assert(sum.pending === 1, "1 pending");
assert(sum.active === 2, "2 active in state (keep-active + will-expire has active status until tick ejects)");
assert(sum.expired_this_tick === 1, "1 expired");

// T13: empty scheduler
console.log("\nT13: empty");
const tEmpty = tick({ scheduled: [], now: NOW });
assert(tEmpty.active_blocks.length === 0, "none");
assert(tEmpty.glyph_sentence.includes("active=0"), "glyph active=0");

// T14: glyph content
console.log("\nT14: glyph");
assert(tMulti.glyph_sentence.includes("promoted="), "promoted in glyph");
assert(tMulti.glyph_sentence.includes("expired="), "expired in glyph");

// T15: multiple rules active simultaneously
console.log("\nT15: many active");
const many: SchedulerState = {
  scheduled: Array.from({ length: 10 }, (_, i) =>
    schedule(mkProp({ subject: `attacker-${i}`, suggested_rule_id: `R-AUTO-A${i}` }), { now: NOW })),
  now: NOW,
};
const tMany = tick(many);
assert(tMany.active_blocks.length === 10, "10 active blocks");
const ids = new Set(tMany.active_blocks.map(b => b.rule_id));
assert(ids.size === 10, "10 distinct rule_ids");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L-005-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
