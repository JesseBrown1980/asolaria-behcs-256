// packages/shannon-civ/src/l6-latency.ts — G-094 L6 latency histogram
//
// G-091 tracks verdicts + computes avg latency across L0-L6 round-trips.
// G-094 adds distribution: histogram buckets + percentiles + detection of
// latency regressions. Operators use the bucket view to tell "most scans
// are fast, few are slow" vs. "all scans are slow now".
//
// Pure — caller feeds latency samples, we return histogram + summary.

export interface LatencySample {
  scan_id: string;
  latency_ms: number;
  at: string;
  profile_name?: string;
}

export interface HistogramBucket {
  upper_bound_ms: number;        // inclusive
  count: number;
}

export interface LatencyHistogram {
  total_samples: number;
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  buckets: HistogramBucket[];
  glyph_sentence: string;
}

// Default buckets cover typical Shannon end-to-end L0-L6 range (ms scale)
export const DEFAULT_BUCKETS_MS = [10, 50, 100, 500, 1000, 5000, 10000, 30000, Infinity];

export function buildHistogram(samples: LatencySample[], bucketBounds: number[] = DEFAULT_BUCKETS_MS): LatencyHistogram {
  if (samples.length === 0) {
    return {
      total_samples: 0, min_ms: 0, max_ms: 0, avg_ms: 0,
      median_ms: 0, p95_ms: 0, p99_ms: 0,
      buckets: bucketBounds.map(b => ({ upper_bound_ms: b, count: 0 })),
      glyph_sentence: "EVT-L6-LATENCY-HIST · samples=0 @ M-INDICATIVE .",
    };
  }

  const sorted = samples.map(s => s.latency_ms).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  const buckets: HistogramBucket[] = bucketBounds.map(b => ({ upper_bound_ms: b, count: 0 }));
  for (const v of sorted) {
    for (const b of buckets) {
      if (v <= b.upper_bound_ms) { b.count++; break; }
    }
  }

  return {
    total_samples: sorted.length,
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
    avg_ms: Math.round(avg * 100) / 100,
    median_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    p99_ms: percentile(0.99),
    buckets,
    glyph_sentence: `EVT-L6-LATENCY-HIST · samples=${sorted.length} · p95=${percentile(0.95)}ms · p99=${percentile(0.99)}ms · max=${sorted[sorted.length - 1]}ms @ M-INDICATIVE .`,
  };
}

export interface RegressionCheck {
  regression_detected: boolean;
  old_p95: number;
  new_p95: number;
  delta_percent: number;
  reason: string;
  glyph_sentence: string;
}

// Compare two histograms; flag regression if new p95 is ≥ threshold% worse
export function detectRegression(old: LatencyHistogram, current: LatencyHistogram, threshold_percent: number = 25): RegressionCheck {
  if (old.total_samples < 10 || current.total_samples < 10) {
    return {
      regression_detected: false,
      old_p95: old.p95_ms, new_p95: current.p95_ms, delta_percent: 0,
      reason: "insufficient samples (need ≥10 each)",
      glyph_sentence: `EVT-L6-LATENCY-REGRESS · insufficient-samples · old=${old.total_samples} · new=${current.total_samples} @ M-INDICATIVE .`,
    };
  }
  const delta = old.p95_ms === 0 ? 0 : ((current.p95_ms - old.p95_ms) / old.p95_ms) * 100;
  const detected = delta >= threshold_percent;
  return {
    regression_detected: detected,
    old_p95: old.p95_ms,
    new_p95: current.p95_ms,
    delta_percent: Math.round(delta * 100) / 100,
    reason: detected
      ? `p95 regressed from ${old.p95_ms}ms to ${current.p95_ms}ms (+${delta.toFixed(1)}%)`
      : `p95 within threshold (delta ${delta.toFixed(1)}% < ${threshold_percent}%)`,
    glyph_sentence: detected
      ? `EVT-L6-LATENCY-REGRESS-DETECTED · old-p95=${old.p95_ms} · new-p95=${current.p95_ms} · delta=+${delta.toFixed(1)}% @ M-EYEWITNESS .`
      : `EVT-L6-LATENCY-REGRESS-OK · delta=${delta.toFixed(1)}% @ M-INDICATIVE .`,
  };
}

export function renderHistogram(h: LatencyHistogram): string {
  const lines: string[] = [];
  lines.push(`L6 LATENCY HISTOGRAM · samples=${h.total_samples}`);
  lines.push(`min=${h.min_ms}ms  max=${h.max_ms}ms  avg=${h.avg_ms}ms`);
  lines.push(`median=${h.median_ms}ms  p95=${h.p95_ms}ms  p99=${h.p99_ms}ms`);
  lines.push("");
  const maxCount = Math.max(...h.buckets.map(b => b.count));
  for (const b of h.buckets) {
    const barLen = maxCount === 0 ? 0 : Math.round(40 * (b.count / maxCount));
    const bar = "█".repeat(barLen);
    const label = b.upper_bound_ms === Infinity ? "∞" : `≤${b.upper_bound_ms}ms`;
    lines.push(`  ${label.padEnd(12)} ${String(b.count).padEnd(6)} ${bar}`);
  }
  lines.push("");
  lines.push(h.glyph_sentence);
  return lines.join("\n");
}
