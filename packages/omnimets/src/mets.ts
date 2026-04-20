// mets.ts — per-lane health + policy telemetry collector (Section M.3).
// In-memory counters per (lane, event-kind) that any producer increments via
// `bumpMets(lane, kind)`. Readers call `snapshot()` for current state. NDJSON
// persistence per-sample for GC+Gulp auto-rollup.

import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const EVENTS = join(homedir(), ".asolaria-workers", "omnimets-events.ndjson");
mkdirSync(dirname(EVENTS), { recursive: true });

export type Lane = "muscular" | "skeletal" | "nervous" | "circulatory" | "endocrine" | "digestive" | "cross";

interface LaneState { dispatches: number; promotions: number; deferrals: number; halts: number; errors: number; latency_sum_ms: number; samples: number; }

const state: Record<Lane, LaneState> = {
  muscular:    { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  skeletal:    { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  nervous:     { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  circulatory: { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  endocrine:   { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  digestive:   { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
  cross:       { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 },
};

export function bumpMets(lane: Lane, kind: "dispatch" | "promote" | "defer" | "halt" | "error", latency_ms = 0): void {
  const s = state[lane];
  if (kind === "dispatch") s.dispatches++;
  if (kind === "promote") s.promotions++;
  if (kind === "defer") s.deferrals++;
  if (kind === "halt") s.halts++;
  if (kind === "error") s.errors++;
  if (latency_ms > 0) { s.latency_sum_ms += latency_ms; s.samples++; }
  try {
    appendFileSync(EVENTS, JSON.stringify({
      ts: new Date().toISOString(),
      event: `EVT-METS-${kind.toUpperCase()}`,
      lane, latency_ms,
      glyph_sentence: `EVT-METS-${kind.toUpperCase()} { ${lane} } @ M-EYEWITNESS .`,
    }) + "\n");
  } catch { /* non-fatal */ }
}

export interface MetsSnapshot {
  captured_at: string;
  per_lane: Record<Lane, LaneState & { avg_latency_ms: number }>;
  totals: LaneState & { avg_latency_ms: number };
}

export function snapshot(): MetsSnapshot {
  const per_lane: Record<string, LaneState & { avg_latency_ms: number }> = {};
  const totals: LaneState = { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 };
  for (const lane of Object.keys(state) as Lane[]) {
    const s = state[lane];
    per_lane[lane] = { ...s, avg_latency_ms: s.samples > 0 ? s.latency_sum_ms / s.samples : 0 };
    totals.dispatches += s.dispatches; totals.promotions += s.promotions; totals.deferrals += s.deferrals;
    totals.halts += s.halts; totals.errors += s.errors; totals.latency_sum_ms += s.latency_sum_ms; totals.samples += s.samples;
  }
  return {
    captured_at: new Date().toISOString(),
    per_lane: per_lane as Record<Lane, LaneState & { avg_latency_ms: number }>,
    totals: { ...totals, avg_latency_ms: totals.samples > 0 ? totals.latency_sum_ms / totals.samples : 0 },
  };
}

export function reset(): void {
  for (const lane of Object.keys(state) as Lane[]) {
    state[lane] = { dispatches: 0, promotions: 0, deferrals: 0, halts: 0, errors: 0, latency_sum_ms: 0, samples: 0 };
  }
}
