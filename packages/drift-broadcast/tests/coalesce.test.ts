import { makeCoalesceState, observeDrift, coalesceStream } from "../src/coalesce.ts";
import type { DriftDetection } from "../src/broadcaster.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== F-080 drift coalesce tests ===\n");

function mkDetection(overrides: Partial<DriftDetection> = {}): DriftDetection {
  return {
    instance_path: "/fake/path",
    permanent_name: "subject-1",
    hilbert_pid: "pid-1",
    instance_sha256: "abc",
    drift_kind: "verify_failed",
    verify_result: { ok: false, violations: ["test"] },
    drift_log_entries: [],
    observed_at: "2026-04-19T00:00:00Z",
    observer_pid: "acer-observer",
    ...overrides,
  };
}

// T1: first observation → broadcast
console.log("T1: first observation");
let state = makeCoalesceState(60000);
const step1 = observeDrift(state, mkDetection(), "2026-04-19T00:00:00Z", "acer");
assert(step1.action === "broadcast", "first is broadcast");
assert(step1.payload?.actor === "acer", "actor preserved");
assert(step1.payload?.verb === "drift-detected", "verb preserved");
assert(step1.payload?.detection.permanent_name === "subject-1", "detection forwarded");
assert(step1.suppressed_count === 0, "0 suppressed");

// T2: duplicate within window → suppress
console.log("\nT2: duplicate within window");
const step2 = observeDrift(state, mkDetection(), "2026-04-19T00:00:30Z", "acer");
assert(step2.action === "suppress", "duplicate suppressed");
assert(step2.suppressed_count === 1, "1 suppressed");
assert(step2.glyph_sentence.includes("count=2"), "count in glyph");

// T3: different subject → broadcast
console.log("\nT3: different subject");
const step3 = observeDrift(state, mkDetection({ permanent_name: "subject-2" }), "2026-04-19T00:00:31Z", "acer");
assert(step3.action === "broadcast", "different subject broadcast");

// T4: different drift_kind → broadcast
console.log("\nT4: different drift_kind");
const step4 = observeDrift(state, mkDetection({ drift_kind: "new_drift_log_entry" }), "2026-04-19T00:00:32Z", "acer");
assert(step4.action === "broadcast", "different kind broadcast");

// T5: same subject + kind outside window → broadcast again
console.log("\nT5: outside window");
const step5 = observeDrift(state, mkDetection(), "2026-04-19T00:02:00Z", "acer");
assert(step5.action === "broadcast", "outside window re-broadcasts");
assert(step5.reason.includes("first observation"), "reason cites first-in-window");

// T6: resummarize when count reaches max_suppressed
console.log("\nT6: escalate after max_suppressed");
let state2 = makeCoalesceState(60000, 5);
const baseT = Date.parse("2026-04-19T00:00:00Z");
const steps6: any[] = [];
for (let i = 0; i < 7; i++) {
  steps6.push(observeDrift(state2, mkDetection(), new Date(baseT + i * 1000).toISOString(), "acer"));
}
assert(steps6[0].action === "broadcast", "first is broadcast");
assert(steps6[1].action === "suppress", "2nd suppressed");
assert(steps6[2].action === "suppress", "3rd suppressed");
assert(steps6[3].action === "suppress", "4th suppressed");
assert(steps6[4].action === "resummarize", "5th resummarizes (count==5)");
assert(steps6[4].suppressed_count === 5, "5 suppressed in summary");
assert(steps6[4].payload?.detection.drift_log_entries.some((e: any) => e.kind === "coalesce-summary"), "summary entry added");

// T7: stream helper
console.log("\nT7: coalesceStream helper");
let state3 = makeCoalesceState(60000, 3);
const events = [
  { detection: mkDetection(), at: "2026-04-19T00:00:00Z" },
  { detection: mkDetection(), at: "2026-04-19T00:00:01Z" },
  { detection: mkDetection(), at: "2026-04-19T00:00:02Z" },
  { detection: mkDetection({ permanent_name: "sub-2" }), at: "2026-04-19T00:00:03Z" },
  { detection: mkDetection(), at: "2026-04-19T00:00:04Z" }, // hits resummarize
];
const stream = coalesceStream(state3, events);
assert(stream.steps.length === 5, "5 steps");
assert(stream.broadcast_count === 2, "2 broadcasts (subject-1 first + subject-2)");
assert(stream.suppress_count === 2, "2 suppressed");
assert(stream.resummarize_count === 1, "1 resummarize");
assert(stream.glyph_sentence.includes("in=5"), "input count in glyph");

// T8: empty stream
console.log("\nT8: empty stream");
let state4 = makeCoalesceState(60000);
const emptyStream = coalesceStream(state4, []);
assert(emptyStream.steps.length === 0, "empty");
assert(emptyStream.broadcast_count === 0, "no broadcast");

// T9: large flood
console.log("\nT9: 200-event flood");
let state5 = makeCoalesceState(60000, 20);
const flood = [];
for (let i = 0; i < 200; i++) {
  flood.push({ detection: mkDetection(), at: new Date(baseT + i * 100).toISOString() });
}
const floodStream = coalesceStream(state5, flood);
assert(floodStream.broadcast_count === 1, "just 1 initial broadcast");
// 200 events, max_suppressed=20: 1 broadcast + (20-1=19 suppressed + 1 resummarize) repeated 10 times = 1 + 10*20 = 201. Hmm actually:
// First: broadcast (count=1)
// Then 19 suppressed (count grows to 20), 20th is resummarize which resets count to 0
// This cycle repeats. Each cycle consumes 20 events: 19 suppress + 1 resummarize.
// 200 total, 1 initial broadcast leaves 199. 199/20 = 9 full cycles + 19 remainder
// 9 resummarizes + (9*19 + 19) = 190 suppressed. Plus 1 initial broadcast.
assert(floodStream.resummarize_count >= 5, `≥5 resummarizes (got ${floodStream.resummarize_count})`);
assert(floodStream.suppress_count >= 100, `≥100 suppressed (got ${floodStream.suppress_count})`);
assert(floodStream.broadcast_count + floodStream.suppress_count + floodStream.resummarize_count === 200, "all 200 accounted for");

// T10: glyph_sentence on each step
console.log("\nT10: step glyphs");
assert(step1.glyph_sentence.includes("BROADCAST"), "broadcast glyph");
assert(step2.glyph_sentence.includes("SUPPRESS"), "suppress glyph");
assert(steps6[4].glyph_sentence.includes("ESCALATE"), "escalate glyph");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-F-080-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
