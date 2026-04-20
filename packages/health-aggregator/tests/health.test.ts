import { computeHealth, renderHealthReport, type DaemonCheck } from "../src/health.ts";
import type { FederationSnapshot } from "../../dashboard/src/aggregator.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== H-001 unified health tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkSnap(peers: any[] = [], overrides: Partial<FederationSnapshot> = {}): FederationSnapshot {
  const ok = peers.filter(p => p.ok).length;
  const fail = peers.length - ok;
  const stale = peers.filter(p => p.stale_vs_reference).length;
  return {
    polled_at: NOW,
    peer_count: peers.length,
    ok_count: ok,
    fail_count: fail,
    stale_count: stale,
    peers,
    by_commit: {},
    glyph_sentence: "EVT .",
    ...overrides,
  };
}

// T1: empty input → GREEN
console.log("T1: empty input");
const v1 = computeHealth({ federation: null, now: NOW });
assert(v1.color === "GREEN", "no peers no daemons → GREEN");
assert(v1.peer_count === 0, "0 peers");
assert(v1.daemon_count === 0, "0 daemons");
assert(v1.reasons.length === 0, "no reasons");

// T2: all peers ok → GREEN
console.log("\nT2: all peers ok");
const snap2 = mkSnap([
  { name: "a", url: "u", ok: true, http_status: 200, latency_ms: 5, stale_vs_reference: false, uptime_exceeds_max: false },
  { name: "b", url: "u", ok: true, http_status: 200, latency_ms: 7, stale_vs_reference: false, uptime_exceeds_max: false },
]);
const v2 = computeHealth({ federation: snap2, now: NOW });
assert(v2.color === "GREEN", "all-ok GREEN");
assert(v2.peer_ok === 2, "2 ok");
assert(v2.peer_fail === 0, "0 fail");

// T3: one peer down → RED
console.log("\nT3: one peer down");
const snap3 = mkSnap([
  { name: "a", url: "u", ok: true, http_status: 200, latency_ms: 5, stale_vs_reference: false, uptime_exceeds_max: false },
  { name: "b", url: "u", ok: false, http_status: 0, latency_ms: 5000, error: "timeout", stale_vs_reference: false, uptime_exceeds_max: false },
]);
const v3 = computeHealth({ federation: snap3, now: NOW });
assert(v3.color === "RED", "down peer RED");
assert(v3.peer_fail === 1, "1 fail");
assert(v3.worst_peer === "b", "b is worst");
assert(v3.reasons[0].includes("timeout"), "reason cites timeout");

// T4: stale peer → YELLOW
console.log("\nT4: stale peer");
const snap4 = mkSnap([
  { name: "a", url: "u", ok: true, http_status: 200, latency_ms: 5, stale_vs_reference: false, uptime_exceeds_max: false },
  { name: "b", url: "u", ok: true, http_status: 200, latency_ms: 8, stale_vs_reference: true, uptime_exceeds_max: false },
]);
const v4 = computeHealth({ federation: snap4, now: NOW });
assert(v4.color === "YELLOW", "stale → YELLOW");
assert(v4.peer_stale === 1, "1 stale");

// T5: one peer down + one stale → RED (RED wins)
console.log("\nT5: RED beats YELLOW");
const snap5 = mkSnap([
  { name: "a", url: "u", ok: false, http_status: 0, latency_ms: 5000, stale_vs_reference: false, uptime_exceeds_max: false },
  { name: "b", url: "u", ok: true, http_status: 200, latency_ms: 8, stale_vs_reference: true, uptime_exceeds_max: false },
]);
const v5 = computeHealth({ federation: snap5, now: NOW });
assert(v5.color === "RED", "RED wins");

// T6: daemon checks
console.log("\nT6: daemon checks");
const daemons: DaemonCheck[] = [
  { name: "shannon-dispatch", ok: true, color: "GREEN" },
  { name: "behcs-bus", ok: true, color: "GREEN" },
  { name: "orbital-relay", ok: false, color: "RED", note: "exit 137" },
];
const v6 = computeHealth({ federation: snap2, daemons, now: NOW });
assert(v6.color === "RED", "RED daemon poisons overall");
assert(v6.daemon_ok === 2, "2 daemons ok");
assert(v6.daemon_red === 1, "1 daemon red");
assert(v6.worst_daemon === "orbital-relay", "orbital-relay is worst");
assert(v6.reasons.some(r => r.includes("orbital-relay RED")), "daemon reason listed");

// T7: yellow daemon
console.log("\nT7: yellow daemon");
const daemons7: DaemonCheck[] = [{ name: "dashboard", ok: true, color: "YELLOW", note: "stale" }];
const v7 = computeHealth({ federation: snap2, daemons: daemons7, now: NOW });
assert(v7.color === "YELLOW", "yellow daemon → YELLOW overall");

// T8: uptime exceeds threshold → YELLOW
console.log("\nT8: uptime threshold");
const snap8 = mkSnap([
  { name: "a", url: "u", ok: true, http_status: 200, latency_ms: 5, uptime_s: 100000, stale_vs_reference: false, uptime_exceeds_max: false },
]);
const v8 = computeHealth({ federation: snap8, stale_age_threshold_s: 86400, now: NOW });
assert(v8.color === "YELLOW", "over threshold → YELLOW");

// T9: one-liner shape
console.log("\nT9: one-liner");
assert(v6.one_liner.startsWith("[RED]"), "RED prefix");
assert(v6.one_liner.includes("2/3 ok"), "daemon ok count");
assert(v2.one_liner.startsWith("[GREEN]"), "GREEN prefix");

// T10: render report
console.log("\nT10: render report");
const report = renderHealthReport(v6);
assert(report.includes("COLONY HEALTH · RED"), "header");
assert(report.includes("worst daemon: orbital-relay"), "worst daemon shown");
assert(report.includes("reasons:"), "reasons header");
assert(report.includes("EVT-HEALTH-UNIFIED"), "glyph");

// T11: rendered_json shape
console.log("\nT11: rendered_json");
assert(v6.rendered_json.ok === false, "ok=false when RED");
assert(v2.rendered_json.ok === true, "ok=true when GREEN");
assert(v6.rendered_json.color === "RED", "color echoed");
assert(v6.rendered_json.computed_at === NOW, "computed_at");

// T12: glyph mood by color
console.log("\nT12: glyph mood");
assert(v2.glyph_sentence.includes("M-INDICATIVE"), "GREEN indicative");
assert(v6.glyph_sentence.includes("M-EYEWITNESS"), "RED eyewitness");

// T13: huge reasons truncated at 10
console.log("\nT13: reason truncation in render");
const many: DaemonCheck[] = [];
for (let i = 0; i < 15; i++) many.push({ name: `d${i}`, ok: false, color: "RED" });
const vMany = computeHealth({ federation: null, daemons: many, now: NOW });
const rMany = renderHealthReport(vMany);
assert(rMany.includes("+5 more"), "truncation note shown");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-H-001-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
