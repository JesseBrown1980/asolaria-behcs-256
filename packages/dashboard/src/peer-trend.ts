// packages/dashboard/src/peer-trend.ts — N-006 peer trend history
//
// N-001 aggregator gives a point-in-time federation snapshot. Operators
// also want trend: is peer X flapping? has latency spiked? is ok ratio
// sliding? N-006 ingests a series of snapshots, collapses into per-peer
// timeseries, and emits summary metrics the dashboard can render as a
// small sparkline without an external TSDB.
//
// Pure — caller feeds snapshots, we return trend objects.

import type { FederationSnapshot, PeerHealth } from "./aggregator.ts";

export interface PeerTimepoint {
  ts: string;
  ok: boolean;
  latency_ms: number;
  uptime_s: number | null;
  http_status: number | null;
  error?: string;
}

export interface PeerTrend {
  name: string;
  samples: number;
  ok_count: number;
  fail_count: number;
  ok_ratio: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  flap_count: number;           // ok → fail transitions
  restart_count: number;        // uptime_s decrease detected
  last_state: "ok" | "fail" | "unknown";
  last_seen_ts: string | null;
  trend_direction: "steady" | "improving" | "degrading";
  timepoints: PeerTimepoint[];
}

export interface TrendInput {
  snapshots: FederationSnapshot[];
  max_timepoints_per_peer?: number;  // cap retained samples per peer (default 100)
  degrading_threshold?: number;      // ok_ratio in last quartile below this → degrading (default 0.5)
}

export interface TrendReport {
  built_at: string;
  peer_count: number;
  snapshot_count: number;
  peers: PeerTrend[];
  glyph_sentence: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function classifyTrend(timepoints: PeerTimepoint[], threshold: number): "steady" | "improving" | "degrading" {
  if (timepoints.length < 4) return "steady";
  const q = Math.floor(timepoints.length / 4);
  const firstQ = timepoints.slice(0, q);
  const lastQ = timepoints.slice(-q);
  const firstRatio = firstQ.filter(t => t.ok).length / firstQ.length;
  const lastRatio = lastQ.filter(t => t.ok).length / lastQ.length;
  if (lastRatio < threshold && firstRatio >= threshold) return "degrading";
  if (lastRatio > firstRatio + 0.15) return "improving";
  if (firstRatio > lastRatio + 0.15) return "degrading";
  return "steady";
}

export function buildTrend(input: TrendInput): TrendReport {
  const cap = input.max_timepoints_per_peer ?? 100;
  const thresh = input.degrading_threshold ?? 0.5;

  const byPeer: Map<string, PeerTimepoint[]> = new Map();
  for (const snap of input.snapshots) {
    for (const p of snap.peers) {
      const existing = byPeer.get(p.name) ?? [];
      existing.push({
        ts: snap.polled_at,
        ok: p.ok,
        latency_ms: p.latency_ms,
        uptime_s: p.uptime_s ?? null,
        http_status: p.http_status,
        error: p.error,
      });
      byPeer.set(p.name, existing);
    }
  }

  const trends: PeerTrend[] = [];
  for (const [name, tpsRaw] of byPeer.entries()) {
    const tps = tpsRaw.slice(-cap);
    const ok = tps.filter(t => t.ok);
    const fail = tps.filter(t => !t.ok);
    const latencies = tps.map(t => t.latency_ms).sort((a, b) => a - b);
    const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    let flaps = 0;
    for (let i = 1; i < tps.length; i++) {
      if (tps[i - 1].ok && !tps[i].ok) flaps++;
    }

    let restarts = 0;
    for (let i = 1; i < tps.length; i++) {
      const prev = tps[i - 1].uptime_s;
      const cur = tps[i].uptime_s;
      if (prev != null && cur != null && cur < prev) restarts++;
    }

    const last = tps[tps.length - 1];
    trends.push({
      name,
      samples: tps.length,
      ok_count: ok.length,
      fail_count: fail.length,
      ok_ratio: tps.length ? ok.length / tps.length : 0,
      avg_latency_ms: Math.round(avg * 10) / 10,
      p95_latency_ms: percentile(latencies, 0.95),
      max_latency_ms: latencies[latencies.length - 1] ?? 0,
      flap_count: flaps,
      restart_count: restarts,
      last_state: last ? (last.ok ? "ok" : "fail") : "unknown",
      last_seen_ts: last?.ts ?? null,
      trend_direction: classifyTrend(tps, thresh),
      timepoints: tps,
    });
  }

  return {
    built_at: new Date().toISOString(),
    peer_count: byPeer.size,
    snapshot_count: input.snapshots.length,
    peers: trends.sort((a, b) => a.name.localeCompare(b.name)),
    glyph_sentence: `EVT-PEER-TREND · peers=${byPeer.size} · snapshots=${input.snapshots.length} · degrading=${trends.filter(t => t.trend_direction === "degrading").length} @ M-INDICATIVE .`,
  };
}

// Compact a peer trend into a tiny sparkline-friendly string for ASCII dashboards
export function peerSparkline(trend: PeerTrend): string {
  return trend.timepoints.map(t => (t.ok ? "▁" : "█")).join("");
}

export function renderTrendTable(report: TrendReport): string {
  const lines: string[] = [];
  lines.push(`PEER TREND · snapshots=${report.snapshot_count} · peers=${report.peer_count}`);
  lines.push(`name                        samples  ok%    avg(ms)  p95(ms)  flaps  restarts  trend         spark`);
  for (const p of report.peers) {
    lines.push(
      `${p.name.padEnd(28)}` +
      `${String(p.samples).padEnd(9)}` +
      `${(p.ok_ratio * 100).toFixed(1).padEnd(7)}` +
      `${String(p.avg_latency_ms).padEnd(9)}` +
      `${String(p.p95_latency_ms).padEnd(9)}` +
      `${String(p.flap_count).padEnd(7)}` +
      `${String(p.restart_count).padEnd(10)}` +
      `${p.trend_direction.padEnd(14)}` +
      peerSparkline(p)
    );
  }
  lines.push("");
  lines.push(report.glyph_sentence);
  return lines.join("\n");
}
