import { buildTrend, peerSparkline, renderTrendTable } from "../src/peer-trend.ts";
import type { FederationSnapshot, PeerHealth } from "../src/aggregator.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== N-006 peer trend tests ===\n");

function mkSnap(ts: string, peers: PeerHealth[]): FederationSnapshot {
  const ok = peers.filter(p => p.ok).length;
  return {
    polled_at: ts,
    peer_count: peers.length, ok_count: ok, fail_count: peers.length - ok,
    stale_count: 0, peers, by_commit: {}, glyph_sentence: "EVT .",
  };
}

function mkPeer(name: string, ok: boolean, latency_ms: number, uptime_s?: number, error?: string): PeerHealth {
  return {
    name, url: "http://x/health", ok, http_status: ok ? 200 : 0,
    latency_ms, uptime_s, error,
    stale_vs_reference: false, uptime_exceeds_max: false,
  };
}

// T1: empty snapshots
console.log("T1: empty snapshots");
const r1 = buildTrend({ snapshots: [] });
assert(r1.peer_count === 0, "no peers");
assert(r1.peers.length === 0, "no trends");

// T2: single snapshot single peer
console.log("\nT2: single sample");
const r2 = buildTrend({ snapshots: [mkSnap("2026-04-19T05:00:00Z", [mkPeer("a", true, 10, 100)])] });
assert(r2.peer_count === 1, "1 peer");
assert(r2.peers[0].samples === 1, "1 sample");
assert(r2.peers[0].ok_count === 1, "1 ok");
assert(r2.peers[0].fail_count === 0, "0 fail");
assert(r2.peers[0].last_state === "ok", "last=ok");

// T3: ok_ratio computation
console.log("\nT3: ok_ratio");
const snaps3: FederationSnapshot[] = [];
for (let i = 0; i < 10; i++) {
  snaps3.push(mkSnap(`2026-04-19T05:0${i}:00Z`, [mkPeer("a", i < 7, 10)]));  // 7 ok, 3 fail
}
const r3 = buildTrend({ snapshots: snaps3 });
assert(r3.peers[0].samples === 10, "10 samples");
assert(r3.peers[0].ok_count === 7, "7 ok");
assert(r3.peers[0].fail_count === 3, "3 fail");
assert(r3.peers[0].ok_ratio === 0.7, "70% ok");

// T4: latency percentiles
console.log("\nT4: latency percentiles");
const latencies = [5, 10, 15, 20, 25, 30, 35, 40, 100, 1000];
const snaps4: FederationSnapshot[] = latencies.map((l, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", true, l)]));
const r4 = buildTrend({ snapshots: snaps4 });
assert(r4.peers[0].max_latency_ms === 1000, "max=1000");
assert(r4.peers[0].avg_latency_ms === 128, "avg=128");
assert(r4.peers[0].p95_latency_ms >= 100, "p95 >= 100");

// T5: flap count (ok→fail transitions)
console.log("\nT5: flap count");
const flapPattern = [true, true, false, true, false, true, false, false, true];
const snaps5 = flapPattern.map((ok, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", ok, 10)]));
const r5 = buildTrend({ snapshots: snaps5 });
// Transitions ok→fail: indices 1→2, 3→4, 6→7 = 3
assert(r5.peers[0].flap_count === 3, `flap=3 (got ${r5.peers[0].flap_count})`);

// T6: restart detection (uptime decrease)
console.log("\nT6: restart");
const uptimes = [100, 200, 300, 50, 150, 250, 20, 120];  // 2 restarts at 300→50, 250→20
const snaps6 = uptimes.map((u, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", true, 10, u)]));
const r6 = buildTrend({ snapshots: snaps6 });
assert(r6.peers[0].restart_count === 2, `2 restarts (got ${r6.peers[0].restart_count})`);

// T7: trend classification degrading
console.log("\nT7: degrading trend");
const degrading = [...Array(5).fill(true), ...Array(5).fill(false)];  // 100% → 0%
const snaps7 = degrading.map((ok, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", ok, 10)]));
const r7 = buildTrend({ snapshots: snaps7, degrading_threshold: 0.5 });
assert(r7.peers[0].trend_direction === "degrading", "degrading detected");

// T8: trend classification improving
console.log("\nT8: improving trend");
const improving = [...Array(5).fill(false), ...Array(5).fill(true)];  // 0% → 100%
const snaps8 = improving.map((ok, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", ok, 10)]));
const r8 = buildTrend({ snapshots: snaps8 });
assert(r8.peers[0].trend_direction === "improving", "improving detected");

// T9: steady trend
console.log("\nT9: steady");
const steady = Array(10).fill(true);
const snaps9 = steady.map((ok, i) =>
  mkSnap(`2026-04-19T05:${String(i).padStart(2, "0")}:00Z`, [mkPeer("a", ok, 10)]));
const r9 = buildTrend({ snapshots: snaps9 });
assert(r9.peers[0].trend_direction === "steady", "steady detected");

// T10: cap max_timepoints_per_peer
console.log("\nT10: cap timepoints");
const many: FederationSnapshot[] = [];
for (let i = 0; i < 200; i++) {
  many.push(mkSnap(`2026-04-19T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`, [mkPeer("a", true, 10)]));
}
const r10 = buildTrend({ snapshots: many, max_timepoints_per_peer: 50 });
assert(r10.peers[0].timepoints.length === 50, "capped at 50");
assert(r10.peers[0].samples === 50, "samples capped");

// T11: multi-peer
console.log("\nT11: multi-peer");
const snaps11 = [
  mkSnap("2026-04-19T05:00:00Z", [mkPeer("a", true, 5), mkPeer("b", true, 10)]),
  mkSnap("2026-04-19T05:01:00Z", [mkPeer("a", false, 5000, undefined, "timeout"), mkPeer("b", true, 12)]),
];
const r11 = buildTrend({ snapshots: snaps11 });
assert(r11.peer_count === 2, "2 peers");
assert(r11.peers[0].name === "a", "sorted by name");
assert(r11.peers[0].fail_count === 1, "a has 1 fail");
assert(r11.peers[1].fail_count === 0, "b has 0 fail");

// T12: sparkline
console.log("\nT12: sparkline");
const spark = peerSparkline(r11.peers[0]);
assert(spark.length === 2, "2 chars");
assert(spark.includes("▁") && spark.includes("█"), "contains both glyphs");

// T13: renderTrendTable
console.log("\nT13: render table");
const table = renderTrendTable(r11);
assert(table.includes("PEER TREND"), "header");
assert(table.includes("a "), "a row");
assert(table.includes("b "), "b row");
assert(table.includes("EVT-PEER-TREND"), "glyph at bottom");

// T14: glyph counts degrading peers
console.log("\nT14: glyph");
const multi = [...snaps7];
const r14 = buildTrend({ snapshots: multi });
assert(r14.glyph_sentence.includes("degrading="), "glyph has degrading count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-006-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
