// packages/inbox-pruner/src/metrics.ts — I-003 prune-metrics surface
//
// Converts I-001 PruneResult(s) into a time-series compatible counter
// bag so the N-005 dashboard `/metrics` endpoint can scrape them and
// operators can graph prune activity over time.
//
// Two shapes exposed:
//   - cumulative counters (append-only, survive restart via NDJSON write)
//   - Prometheus-text rendering (no external dep)

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PruneResult } from "./pruner.ts";

export interface PruneMetricsSnapshot {
  total_runs: number;
  total_entries_in: number;
  total_kept: number;
  total_archived: number;
  total_signed_preserved: number;
  total_allowlist_preserved: number;
  total_recent_preserved: number;
  total_heartbeats_archived: number;
  last_run_at: string | null;
  last_result_glyph: string | null;
}

export function emptyMetrics(): PruneMetricsSnapshot {
  return {
    total_runs: 0,
    total_entries_in: 0,
    total_kept: 0,
    total_archived: 0,
    total_signed_preserved: 0,
    total_allowlist_preserved: 0,
    total_recent_preserved: 0,
    total_heartbeats_archived: 0,
    last_run_at: null,
    last_result_glyph: null,
  };
}

export function foldRun(base: PruneMetricsSnapshot, r: PruneResult, at?: string): PruneMetricsSnapshot {
  const archived_total = Object.values(r.archived_by_day).reduce((a, b) => a + b, 0);
  return {
    total_runs: base.total_runs + 1,
    total_entries_in: base.total_entries_in + r.total_in,
    total_kept: base.total_kept + r.kept,
    total_archived: base.total_archived + archived_total,
    total_signed_preserved: base.total_signed_preserved + r.signed_preserved,
    total_allowlist_preserved: base.total_allowlist_preserved + r.allowlist_preserved,
    total_recent_preserved: base.total_recent_preserved + r.recent_preserved,
    total_heartbeats_archived: base.total_heartbeats_archived + r.heartbeats_archived,
    last_run_at: at ?? new Date().toISOString(),
    last_result_glyph: r.glyph_sentence,
  };
}

// Persist metrics as a single-line JSON file (atomic-ish). Callers that
// care about concurrency can wrap their own lock.
export function saveMetrics(path: string, m: PruneMetricsSnapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(m, null, 2));
}

export function loadMetrics(path: string): PruneMetricsSnapshot {
  if (!existsSync(path)) return emptyMetrics();
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return emptyMetrics(); }
}

// Append each run to an NDJSON trail for historical graphs
export function appendRunEvent(path: string, r: PruneResult, at?: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({
    ts: at ?? new Date().toISOString(),
    total_in: r.total_in,
    kept: r.kept,
    archived_by_day: r.archived_by_day,
    signed_preserved: r.signed_preserved,
    allowlist_preserved: r.allowlist_preserved,
    recent_preserved: r.recent_preserved,
    heartbeats_archived: r.heartbeats_archived,
    glyph: r.glyph_sentence,
  }) + "\n");
}

// Render prometheus-compatible text. N-005 ingests this.
export function renderPrometheus(m: PruneMetricsSnapshot): string {
  const lines: string[] = [];
  const metric = (name: string, help: string, val: number) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${val}`);
  };
  metric("asolaria_pruner_runs_total", "total prune runs executed", m.total_runs);
  metric("asolaria_pruner_entries_in_total", "cumulative entries processed across runs", m.total_entries_in);
  metric("asolaria_pruner_kept_total", "cumulative entries kept in active inbox", m.total_kept);
  metric("asolaria_pruner_archived_total", "cumulative entries moved to archive", m.total_archived);
  metric("asolaria_pruner_signed_preserved_total", "signed envelopes never pruned", m.total_signed_preserved);
  metric("asolaria_pruner_allowlist_preserved_total", "allowlist-verb envelopes preserved", m.total_allowlist_preserved);
  metric("asolaria_pruner_heartbeats_archived_total", "heartbeat entries archived", m.total_heartbeats_archived);
  if (m.last_run_at) lines.push(`# last_run_at ${m.last_run_at}`);
  if (m.last_result_glyph) lines.push(`# last_glyph ${m.last_result_glyph}`);
  return lines.join("\n") + "\n";
}

export function renderGlyph(m: PruneMetricsSnapshot): string {
  return `EVT-PRUNER-METRICS · runs=${m.total_runs} · in=${m.total_entries_in} · kept=${m.total_kept} · archived=${m.total_archived} · signed-preserved=${m.total_signed_preserved} @ M-INDICATIVE .`;
}
