// packages/dashboard/src/peer-slo.ts — N-007 per-peer SLO tracker
//
// N-001 produces snapshots, N-006 builds per-peer trends. N-007 takes
// trend data + SLO targets per peer and computes whether each peer is
// meeting its agreement. Operators need a single "who is paging" view
// that translates latency/availability numbers into pass/fail gates.
//
// Pure — caller supplies PeerTrend[] + SLOPolicy; we emit a table.

import type { PeerTrend } from "./peer-trend.ts";

export interface SLOPolicy {
  // Per-peer overrides; default for any unlisted peer
  peer_overrides: Record<string, PeerSLO>;
  default: PeerSLO;
}

export interface PeerSLO {
  min_ok_ratio: number;           // e.g. 0.99
  max_avg_latency_ms: number;
  max_p95_latency_ms: number;
  max_flap_count: number;          // over trend window
  max_restart_count: number;
}

export const PERMISSIVE_DEFAULT: PeerSLO = {
  min_ok_ratio: 0.95,
  max_avg_latency_ms: 1000,
  max_p95_latency_ms: 5000,
  max_flap_count: 5,
  max_restart_count: 3,
};

export interface SLOViolation {
  dimension: "ok_ratio" | "avg_latency_ms" | "p95_latency_ms" | "flap_count" | "restart_count";
  observed: number;
  threshold: number;
  delta: number;               // how far over budget
  severity: "CRITICAL" | "HIGH" | "WARN";
}

export interface PeerSLOResult {
  peer: string;
  meeting_slo: boolean;
  violations: SLOViolation[];
  policy_applied: PeerSLO;
  summary_line: string;
}

export interface SLOReport {
  evaluated_at: string;
  peer_count: number;
  meeting: number;
  violating: number;
  results: PeerSLOResult[];
  overall_color: "GREEN" | "YELLOW" | "RED";
  glyph_sentence: string;
}

function severityOf(delta: number, threshold: number): "CRITICAL" | "HIGH" | "WARN" {
  // delta is how far past threshold
  const overshoot = threshold === 0 ? delta : delta / Math.max(threshold, 0.001);
  if (overshoot > 0.5) return "CRITICAL";
  if (overshoot > 0.2) return "HIGH";
  return "WARN";
}

export function evaluatePeer(trend: PeerTrend, policy: PeerSLO): PeerSLOResult {
  const violations: SLOViolation[] = [];

  if (trend.ok_ratio < policy.min_ok_ratio) {
    const delta = policy.min_ok_ratio - trend.ok_ratio;
    violations.push({ dimension: "ok_ratio", observed: trend.ok_ratio, threshold: policy.min_ok_ratio, delta, severity: severityOf(delta, policy.min_ok_ratio) });
  }
  if (trend.avg_latency_ms > policy.max_avg_latency_ms) {
    const delta = trend.avg_latency_ms - policy.max_avg_latency_ms;
    violations.push({ dimension: "avg_latency_ms", observed: trend.avg_latency_ms, threshold: policy.max_avg_latency_ms, delta, severity: severityOf(delta, policy.max_avg_latency_ms) });
  }
  if (trend.p95_latency_ms > policy.max_p95_latency_ms) {
    const delta = trend.p95_latency_ms - policy.max_p95_latency_ms;
    violations.push({ dimension: "p95_latency_ms", observed: trend.p95_latency_ms, threshold: policy.max_p95_latency_ms, delta, severity: severityOf(delta, policy.max_p95_latency_ms) });
  }
  if (trend.flap_count > policy.max_flap_count) {
    const delta = trend.flap_count - policy.max_flap_count;
    violations.push({ dimension: "flap_count", observed: trend.flap_count, threshold: policy.max_flap_count, delta, severity: severityOf(delta, policy.max_flap_count) });
  }
  if (trend.restart_count > policy.max_restart_count) {
    const delta = trend.restart_count - policy.max_restart_count;
    violations.push({ dimension: "restart_count", observed: trend.restart_count, threshold: policy.max_restart_count, delta, severity: severityOf(delta, policy.max_restart_count) });
  }

  const meeting = violations.length === 0;
  const summary = meeting
    ? `[OK] ${trend.name} meeting SLO`
    : `[${violations.some(v => v.severity === "CRITICAL") ? "CRIT" : violations.some(v => v.severity === "HIGH") ? "HIGH" : "WARN"}] ${trend.name} violates ${violations.length} dim(s): ${violations.map(v => v.dimension).join(",")}`;

  return { peer: trend.name, meeting_slo: meeting, violations, policy_applied: policy, summary_line: summary };
}

export function evaluateSLO(trends: PeerTrend[], policy: SLOPolicy): SLOReport {
  const results: PeerSLOResult[] = [];
  for (const t of trends) {
    const p = policy.peer_overrides[t.name] ?? policy.default;
    results.push(evaluatePeer(t, p));
  }
  const meeting = results.filter(r => r.meeting_slo).length;
  const violating = results.length - meeting;

  let overall: "GREEN" | "YELLOW" | "RED" = "GREEN";
  if (results.some(r => r.violations.some(v => v.severity === "CRITICAL"))) overall = "RED";
  else if (violating > 0) overall = "YELLOW";

  return {
    evaluated_at: new Date().toISOString(),
    peer_count: results.length,
    meeting,
    violating,
    results,
    overall_color: overall,
    glyph_sentence: `EVT-PEER-SLO-REPORT · peers=${results.length} · meeting=${meeting} · violating=${violating} · overall=${overall} @ M-${overall === "GREEN" ? "INDICATIVE" : "EYEWITNESS"} .`,
  };
}

export function renderSLOReport(r: SLOReport): string {
  const lines: string[] = [];
  lines.push(`PEER SLO REPORT · ${r.evaluated_at} · overall=${r.overall_color}`);
  lines.push(`peers=${r.peer_count} · meeting=${r.meeting} · violating=${r.violating}`);
  lines.push("");
  for (const res of r.results.filter(x => !x.meeting_slo).sort((a, b) => b.violations.length - a.violations.length)) {
    lines.push(`  ${res.summary_line}`);
    for (const v of res.violations) {
      lines.push(`    - ${v.dimension}: observed=${v.observed} threshold=${v.threshold} delta=+${v.delta.toFixed(2)} (${v.severity})`);
    }
  }
  for (const res of r.results.filter(x => x.meeting_slo)) {
    lines.push(`  ${res.summary_line}`);
  }
  lines.push("");
  lines.push(r.glyph_sentence);
  return lines.join("\n");
}
