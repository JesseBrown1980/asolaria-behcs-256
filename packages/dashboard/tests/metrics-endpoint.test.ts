import { renderMetrics, metricsGlyph } from "../src/metrics-endpoint.ts";
import type { FederationSnapshot } from "../src/aggregator.ts";
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== N-005 metrics endpoint tests ===\n");

const TMP = "C:/asolaria-acer/tmp/n005-metrics-test";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const FAKE_SNAP: FederationSnapshot = {
  polled_at: "2026-04-19T05:00:00Z",
  peer_count: 3,
  ok_count: 2,
  fail_count: 1,
  stale_count: 0,
  peers: [
    { name: "acer-behcs", url: "http://A/h", ok: true, http_status: 200, latency_ms: 5, uptime_s: 14400, stale_vs_reference: false, uptime_exceeds_max: false },
    { name: "liris-server", url: "http://B/h", ok: true, http_status: 200, latency_ms: 8, uptime_s: 10800, stale_vs_reference: false, uptime_exceeds_max: false },
    { name: "dead-peer", url: "http://C/h", ok: false, http_status: 0, latency_ms: 5000, stale_vs_reference: false, uptime_exceeds_max: false },
  ],
  by_commit: {},
  glyph_sentence: "EVT-FED · .",
};

// T1: render with only federation
console.log("T1: federation-only");
const out1 = renderMetrics({ federation_snapshot: FAKE_SNAP }, { now: "2026-04-19T05:00:00Z" });
assert(out1.includes("asolaria_federation_peer_count 3"), "peer_count");
assert(out1.includes("asolaria_federation_ok_count 2"), "ok_count");
assert(out1.includes("asolaria_federation_fail_count 1"), "fail_count");
assert(out1.includes('asolaria_peer_ok{peer="acer_behcs"} 1'), "peer ok=1");
assert(out1.includes('asolaria_peer_ok{peer="dead_peer"} 0'), "dead peer ok=0");
assert(out1.includes('asolaria_peer_latency_ms{peer="liris_server"} 8'), "latency metric");
assert(out1.includes('asolaria_peer_uptime_s{peer="acer_behcs"} 14400'), "uptime metric");

// T2: pruner metrics source
console.log("\nT2: pruner metrics");
const pruneFile = `${TMP}/pruner.json`;
writeFileSync(pruneFile, JSON.stringify({
  total_runs: 5, total_entries_in: 5000, total_kept: 500,
  total_archived: 4500, total_signed_preserved: 10,
  total_allowlist_preserved: 20, total_recent_preserved: 470,
  total_heartbeats_archived: 4480,
}));
const out2 = renderMetrics({ pruner_metrics_path: pruneFile, federation_snapshot: null });
assert(out2.includes("asolaria_pruner_runs_total 5"), "pruner runs");
assert(out2.includes("asolaria_pruner_entries_in_total 5000"), "pruner in");
assert(out2.includes("asolaria_pruner_kept_total 500"), "pruner kept");
assert(out2.includes("asolaria_pruner_signed_preserved_total 10"), "signed preserved");

// T3: firewall audit source
console.log("\nT3: firewall audit");
const auditFile = `${TMP}/firewall-audit.ndjson`;
appendFileSync(auditFile, JSON.stringify({ allowed: true }) + "\n");
appendFileSync(auditFile, JSON.stringify({ allowed: true }) + "\n");
appendFileSync(auditFile, JSON.stringify({ allowed: false, blocking_rule_id: "R-BAD-ACTOR" }) + "\n");
appendFileSync(auditFile, JSON.stringify({ allowed: false, blocking_rule_id: "R-BAD-ACTOR" }) + "\n");
appendFileSync(auditFile, JSON.stringify({ allowed: false, blocking_rule_id: "R-BAD-VERB" }) + "\n");
const out3 = renderMetrics({ firewall_audit_path: auditFile, federation_snapshot: null });
assert(out3.includes("asolaria_firewall_inspections_total 5"), "5 inspections");
assert(out3.includes("asolaria_firewall_allowed_total 2"), "2 allowed");
assert(out3.includes("asolaria_firewall_denied_total 3"), "3 denied");
assert(out3.includes('asolaria_firewall_denied_by_rule_total{rule_id="R_BAD_ACTOR"} 2'), "R-BAD-ACTOR=2");
assert(out3.includes('asolaria_firewall_denied_by_rule_total{rule_id="R_BAD_VERB"} 1'), "R-BAD-VERB=1");

// T4: full combined render
console.log("\nT4: combined sources");
const out4 = renderMetrics({
  pruner_metrics_path: pruneFile,
  firewall_audit_path: auditFile,
  federation_snapshot: FAKE_SNAP,
});
assert(out4.includes("asolaria_pruner_runs_total 5"), "has pruner");
assert(out4.includes("asolaria_firewall_inspections_total 5"), "has firewall");
assert(out4.includes("asolaria_federation_peer_count 3"), "has federation");

// T5: missing source file graceful
console.log("\nT5: missing pruner file");
const out5 = renderMetrics({ pruner_metrics_path: `${TMP}/does-not-exist.json`, federation_snapshot: null });
assert(out5.includes("# asolaria_pruner_metrics_missing"), "missing comment");
assert(!out5.includes("asolaria_pruner_runs_total"), "no pruner metrics when file missing");

// T6: corrupt pruner file graceful
console.log("\nT6: corrupt pruner file");
const corrupt = `${TMP}/corrupt-pruner.json`;
writeFileSync(corrupt, "not-json{{{");
const out6 = renderMetrics({ pruner_metrics_path: corrupt, federation_snapshot: null });
assert(out6.includes("# asolaria_pruner_metrics_missing"), "corrupt treated as missing");

// T7: metrics generation timestamp
console.log("\nT7: generated_at");
const out7 = renderMetrics({ federation_snapshot: null }, { now: "2026-04-19T05:00:00Z" });
assert(out7.includes("asolaria_metrics_generated_at_seconds"), "generated_at present");
assert(out7.includes("1776574800"), "correct unix time");

// T8: glyph
console.log("\nT8: metrics glyph");
const g = metricsGlyph({ pruner_metrics_path: pruneFile, firewall_audit_path: auditFile, federation_snapshot: FAKE_SNAP });
assert(g.startsWith("EVT-DASHBOARD-METRICS"), "glyph prefix");
assert(g.includes("pruner-runs=5"), "pruner in glyph");
assert(g.includes("fw=5(3-denied)"), "fw counts in glyph");
assert(g.includes("fed=3/2-ok"), "fed counts in glyph");

// T9: prometheus HELP/TYPE present
console.log("\nT9: HELP/TYPE comments");
assert(out4.includes("# HELP asolaria_metrics_generated_at_seconds"), "generated_at help");
assert(out4.includes("# TYPE asolaria_pruner_runs_total counter"), "pruner type");
assert(out4.includes("# TYPE asolaria_federation_peer_count gauge"), "fed type");

// T10: empty sources still renders valid prometheus
console.log("\nT10: empty sources");
const out10 = renderMetrics({ federation_snapshot: null });
assert(out10.includes("asolaria_metrics_generated_at_seconds"), "still has generated_at");
assert(!out10.includes("asolaria_pruner"), "no pruner lines");
assert(!out10.includes("asolaria_firewall"), "no firewall lines");
assert(!out10.includes("asolaria_federation_peer_count"), "no fed lines");

// Cleanup
rmSync(TMP, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-005-METRICS-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
