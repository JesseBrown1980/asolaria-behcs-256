import { evaluatePeer, evaluateSLO, renderSLOReport, PERMISSIVE_DEFAULT, type SLOPolicy, type PeerSLO } from "../src/peer-slo.ts";
import type { PeerTrend } from "../src/peer-trend.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== N-007 peer SLO tests ===\n");

function mkTrend(overrides: Partial<PeerTrend> = {}): PeerTrend {
  return {
    name: "a", samples: 100, ok_count: 99, fail_count: 1,
    ok_ratio: 0.99, avg_latency_ms: 15, p95_latency_ms: 40, max_latency_ms: 60,
    flap_count: 0, restart_count: 0, last_state: "ok", last_seen_ts: "2026-04-19T05:00:00Z",
    trend_direction: "steady", timepoints: [],
    ...overrides,
  };
}

const strictSLO: PeerSLO = {
  min_ok_ratio: 0.99, max_avg_latency_ms: 20, max_p95_latency_ms: 50,
  max_flap_count: 2, max_restart_count: 1,
};

// T1: peer meeting SLO
console.log("T1: meeting SLO");
const r1 = evaluatePeer(mkTrend(), strictSLO);
assert(r1.meeting_slo === true, "meeting");
assert(r1.violations.length === 0, "no violations");
assert(r1.summary_line.includes("[OK]"), "OK summary");

// T2: peer with low ok_ratio
console.log("\nT2: low ok_ratio");
const r2 = evaluatePeer(mkTrend({ ok_ratio: 0.7 }), strictSLO);
assert(r2.meeting_slo === false, "violating");
assert(r2.violations.some(v => v.dimension === "ok_ratio"), "ok_ratio flagged");
const ok_v = r2.violations.find(v => v.dimension === "ok_ratio")!;
assert(ok_v.observed === 0.7, "observed");
assert(ok_v.threshold === 0.99, "threshold");

// T3: high avg latency
console.log("\nT3: high latency");
const r3 = evaluatePeer(mkTrend({ avg_latency_ms: 100 }), strictSLO);
assert(r3.violations.some(v => v.dimension === "avg_latency_ms"), "latency flagged");

// T4: high p95
console.log("\nT4: high p95");
const r4 = evaluatePeer(mkTrend({ p95_latency_ms: 500 }), strictSLO);
assert(r4.violations.some(v => v.dimension === "p95_latency_ms"), "p95 flagged");
const p95v = r4.violations.find(v => v.dimension === "p95_latency_ms")!;
assert(p95v.severity === "CRITICAL", "critical overshoot");

// T5: flap count
console.log("\nT5: flaps");
const r5 = evaluatePeer(mkTrend({ flap_count: 5 }), strictSLO);
assert(r5.violations.some(v => v.dimension === "flap_count"), "flaps flagged");

// T6: restart count
console.log("\nT6: restarts");
const r6 = evaluatePeer(mkTrend({ restart_count: 3 }), strictSLO);
assert(r6.violations.some(v => v.dimension === "restart_count"), "restarts flagged");

// T7: severity mapping
console.log("\nT7: severity");
// overshoot 20% → HIGH, 50% → CRITICAL
const mildLate = evaluatePeer(mkTrend({ avg_latency_ms: 21 }), strictSLO);  // small delta
const warnViol = mildLate.violations.find(v => v.dimension === "avg_latency_ms")!;
assert(warnViol.severity === "WARN", `mild → WARN (got ${warnViol.severity})`);
const extremeLate = evaluatePeer(mkTrend({ avg_latency_ms: 100 }), strictSLO);  // 400% over
const critViol = extremeLate.violations.find(v => v.dimension === "avg_latency_ms")!;
assert(critViol.severity === "CRITICAL", `extreme → CRITICAL (got ${critViol.severity})`);

// T8: full report evaluation
console.log("\nT8: evaluateSLO report");
const trends: PeerTrend[] = [
  mkTrend({ name: "good" }),
  mkTrend({ name: "late", avg_latency_ms: 2000 }),
  mkTrend({ name: "dead", ok_ratio: 0.3, avg_latency_ms: 10000 }),
];
const policy: SLOPolicy = { default: strictSLO, peer_overrides: {} };
const report = evaluateSLO(trends, policy);
assert(report.peer_count === 3, "3 peers");
assert(report.meeting === 1, "1 meeting");
assert(report.violating === 2, "2 violating");
assert(report.overall_color === "RED", "RED overall (dead has CRITICAL)");

// T9: per-peer override
console.log("\nT9: per-peer override");
const lax: PeerSLO = { ...PERMISSIVE_DEFAULT, max_avg_latency_ms: 3000 };
const overrides: SLOPolicy = { default: strictSLO, peer_overrides: { late: lax } };
const reportOver = evaluateSLO(trends, overrides);
const lateResult = reportOver.results.find(r => r.peer === "late")!;
assert(lateResult.meeting_slo === true, "late meets lax SLO");

// T10: yellow color when only WARN/HIGH violations
console.log("\nT10: yellow color");
const warnPolicy: SLOPolicy = {
  default: { min_ok_ratio: 0.99, max_avg_latency_ms: 20, max_p95_latency_ms: 50, max_flap_count: 2, max_restart_count: 1 },
  peer_overrides: {},
};
const trendsWarn: PeerTrend[] = [
  mkTrend({ name: "good" }),
  mkTrend({ name: "warn-only", avg_latency_ms: 22 }),  // just over threshold → WARN
];
const reportWarn = evaluateSLO(trendsWarn, warnPolicy);
assert(reportWarn.overall_color === "YELLOW", "YELLOW (warn but no critical)");

// T11: green when all meet
console.log("\nT11: green");
const reportGreen = evaluateSLO([mkTrend({ name: "g1" }), mkTrend({ name: "g2" })], policy);
assert(reportGreen.overall_color === "GREEN", "GREEN");
assert(reportGreen.violating === 0, "no violations");

// T12: render
console.log("\nT12: render");
const text = renderSLOReport(report);
assert(text.includes("PEER SLO REPORT"), "header");
assert(text.includes("overall=RED"), "overall shown");
assert(text.includes("dead"), "bad peer listed");
assert(text.includes("threshold="), "threshold detail");
assert(text.includes("EVT-PEER-SLO-REPORT"), "glyph");

// T13: glyph mood switch
console.log("\nT13: glyph mood");
assert(report.glyph_sentence.includes("M-EYEWITNESS"), "RED → EYEWITNESS");
assert(reportGreen.glyph_sentence.includes("M-INDICATIVE"), "GREEN → INDICATIVE");

// T14: empty trends
console.log("\nT14: empty");
const reportEmpty = evaluateSLO([], policy);
assert(reportEmpty.peer_count === 0, "0 peers");
assert(reportEmpty.overall_color === "GREEN", "empty is green");

// T15: delta computed correctly
console.log("\nT15: delta");
const r15 = evaluatePeer(mkTrend({ ok_ratio: 0.9 }), strictSLO);
const v15 = r15.violations[0];
assert(Math.abs(v15.delta - 0.09) < 0.001, "delta ≈ 0.09");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-007-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
