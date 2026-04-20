import { ingestSamples, sampleFromCheck, daemonSparkline, renderTimelineTable, type DaemonSample } from "../src/uptime-timeline.ts";
import type { DaemonCheck } from "../src/health.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== H-002 uptime timeline tests ===\n");

function samp(name: string, ok: boolean, ts: string, color?: "GREEN" | "YELLOW" | "RED"): DaemonSample {
  return { name, ok, ts, color: color ?? (ok ? "GREEN" : "RED") };
}

// T1: empty history
console.log("T1: empty");
const r1 = ingestSamples({ history: [] });
assert(r1.daemon_count === 0, "0 daemons");
assert(r1.slo_violations.length === 0, "no violations");

// T2: single daemon all-ok
console.log("\nT2: all ok");
const ts0 = "2026-04-19T05:00:00Z";
const history2: DaemonSample[] = [];
for (let i = 0; i < 10; i++) history2.push(samp("a", true, new Date(Date.parse(ts0) + i * 60000).toISOString()));
const r2 = ingestSamples({ history: history2 });
assert(r2.daemon_count === 1, "1 daemon");
assert(r2.daemons[0].total_samples === 10, "10 samples");
assert(r2.daemons[0].availability_ratio === 1, "100%");
assert(r2.daemons[0].longest_ok_streak === 10, "streak=10");
assert(r2.daemons[0].current_streak_kind === "ok", "streak ok");
assert(r2.daemons[0].current_streak_length === 10, "current 10");
assert(r2.slo_violations.length === 0, "no SLO violations");

// T3: intermittent failures
console.log("\nT3: flapping");
const pattern: boolean[] = [true, true, false, true, true, true, false, false, true];
const history3 = pattern.map((ok, i) => samp("b", ok, new Date(Date.parse(ts0) + i * 60000).toISOString()));
const r3 = ingestSamples({ history: history3 });
const d3 = r3.daemons[0];
assert(d3.total_samples === 9, "9");
assert(d3.ok_samples === 6, "6 ok");
assert(Math.abs(d3.availability_ratio - (6 / 9)) < 0.01, "66.7% ratio");
assert(d3.longest_ok_streak === 3, "longest ok=3");
assert(d3.longest_fail_streak === 2, "longest fail=2");
assert(d3.current_streak_kind === "ok", "ends on ok");

// T4: SLO violation detected
console.log("\nT4: SLO violation");
const r4 = ingestSamples({ history: history3, slo_target: 0.9 });
assert(r4.slo_violations.length === 1, "1 violation");
assert(r4.slo_violations[0].name === "b", "daemon flagged");
assert(r4.slo_violations[0].target === 0.9, "target echoed");

// T5: last_flip_at captured
console.log("\nT5: last_flip_at");
assert(d3.last_flip_at !== null, "flip captured");

// T6: multi-daemon
console.log("\nT6: multi-daemon");
const multi: DaemonSample[] = [
  samp("x", true, ts0),
  samp("y", false, ts0),
  samp("x", true, "2026-04-19T05:01:00Z"),
  samp("y", true, "2026-04-19T05:01:00Z"),
];
const r6 = ingestSamples({ history: multi });
assert(r6.daemon_count === 2, "2 daemons");
assert(r6.daemons[0].name === "x", "sorted by name");
assert(r6.daemons[1].name === "y", "y second");

// T7: cap max_samples_per_daemon
console.log("\nT7: cap");
const many: DaemonSample[] = [];
for (let i = 0; i < 200; i++) many.push(samp("c", i % 2 === 0, new Date(Date.parse(ts0) + i * 1000).toISOString()));
const r7 = ingestSamples({ history: many, max_samples_per_daemon: 50 });
assert(r7.daemons[0].total_samples === 50, "capped at 50");

// T8: current_streak on failing tail
console.log("\nT8: current fail streak");
const failTail: DaemonSample[] = [
  samp("d", true, "2026-04-19T05:00:00Z"),
  samp("d", true, "2026-04-19T05:01:00Z"),
  samp("d", false, "2026-04-19T05:02:00Z"),
  samp("d", false, "2026-04-19T05:03:00Z"),
  samp("d", false, "2026-04-19T05:04:00Z"),
];
const r8 = ingestSamples({ history: failTail });
assert(r8.daemons[0].current_streak_kind === "fail", "ends fail");
assert(r8.daemons[0].current_streak_length === 3, "3-long fail streak");

// T9: sampleFromCheck
console.log("\nT9: sampleFromCheck");
const check: DaemonCheck = { name: "e", ok: true, color: "GREEN", note: "fine" };
const s = sampleFromCheck(check, ts0);
assert(s.name === "e", "name preserved");
assert(s.ts === ts0, "ts preserved");
assert(s.color === "GREEN", "color preserved");
assert(s.note === "fine", "note preserved");

// T10: sparkline
console.log("\nT10: sparkline");
const mixedSamples: DaemonSample[] = [
  samp("f", true, "2026-04-19T05:00:00Z", "GREEN"),
  samp("f", false, "2026-04-19T05:01:00Z", "YELLOW"),
  samp("f", false, "2026-04-19T05:02:00Z", "RED"),
];
const r10 = ingestSamples({ history: mixedSamples });
const spark = daemonSparkline(r10.daemons[0]);
assert(spark.length === 3, "3 chars");
assert(spark.includes("▁"), "has green char");
assert(spark.includes("▄"), "has yellow char");
assert(spark.includes("█"), "has red char");

// T11: render report
console.log("\nT11: render");
const text = renderTimelineTable(r4);
assert(text.includes("DAEMON UPTIME TIMELINE"), "header");
assert(text.includes("SLO VIOLATIONS"), "SLO note");
assert(text.includes("avail="), "avail column");
assert(text.includes("EVT-UPTIME-TIMELINE"), "glyph");

// T12: sort SLO violations worst first
console.log("\nT12: violation sort");
const multiFail: DaemonSample[] = [
  samp("fails-lots", false, "2026-04-19T05:00:00Z"),
  samp("fails-lots", false, "2026-04-19T05:01:00Z"),
  samp("fails-lots", false, "2026-04-19T05:02:00Z"),
  samp("fails-some", true, "2026-04-19T05:00:00Z"),
  samp("fails-some", false, "2026-04-19T05:01:00Z"),
  samp("fails-some", true, "2026-04-19T05:02:00Z"),
];
const r12 = ingestSamples({ history: multiFail, slo_target: 0.9 });
assert(r12.slo_violations[0].name === "fails-lots", "worst first");

// T13: glyph counts
console.log("\nT13: glyph");
assert(r4.glyph_sentence.includes("slo-violations=1"), "violations count");
assert(r4.glyph_sentence.includes("samples=9"), "samples count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-H-002-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
