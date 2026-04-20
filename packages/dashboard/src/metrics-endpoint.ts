// packages/dashboard/src/metrics-endpoint.ts — N-005 prometheus metrics composer
//
// Composes multiple metric sources (pruner, firewall, federation) into a
// single prometheus-text surface served at /metrics. Pure — HTTP server
// wires the composition into its handler.
//
// Sources are injected as optional loaders so the endpoint never hard-fails
// when a source file is missing on a fresh install.

import { existsSync, readFileSync } from "node:fs";
import type { FederationSnapshot } from "./aggregator.ts";

export interface MetricsSources {
  pruner_metrics_path?: string;    // JSON from I-003 saveMetrics
  firewall_audit_path?: string;    // NDJSON from L-003
  federation_snapshot?: FederationSnapshot | null;
}

export interface RenderMetricsOptions {
  now?: string;
}

// Safe JSON-file read; returns null on any error so we emit partial metrics
function safeReadJson(path: string): any | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function countAuditLine(path: string): { total: number; allowed: number; denied: number; by_rule: Record<string, number> } {
  const out = { total: 0, allowed: 0, denied: 0, by_rule: {} as Record<string, number> };
  if (!existsSync(path)) return out;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      out.total++;
      if (e.allowed) out.allowed++; else out.denied++;
      if (e.blocking_rule_id) out.by_rule[e.blocking_rule_id] = (out.by_rule[e.blocking_rule_id] ?? 0) + 1;
    } catch { /* tolerate bad lines */ }
  }
  return out;
}

export function renderMetrics(sources: MetricsSources, opts: RenderMetricsOptions = {}): string {
  const lines: string[] = [];
  const at = opts.now ?? new Date().toISOString();
  lines.push(`# HELP asolaria_metrics_generated_at_seconds unix time of generation`);
  lines.push(`# TYPE asolaria_metrics_generated_at_seconds gauge`);
  lines.push(`asolaria_metrics_generated_at_seconds ${Math.round(Date.parse(at) / 1000)}`);

  // Pruner
  if (sources.pruner_metrics_path) {
    const m = safeReadJson(sources.pruner_metrics_path);
    if (m) {
      lines.push(`# HELP asolaria_pruner_runs_total total prune runs executed`);
      lines.push(`# TYPE asolaria_pruner_runs_total counter`);
      lines.push(`asolaria_pruner_runs_total ${m.total_runs ?? 0}`);
      lines.push(`# TYPE asolaria_pruner_entries_in_total counter`);
      lines.push(`asolaria_pruner_entries_in_total ${m.total_entries_in ?? 0}`);
      lines.push(`# TYPE asolaria_pruner_kept_total counter`);
      lines.push(`asolaria_pruner_kept_total ${m.total_kept ?? 0}`);
      lines.push(`# TYPE asolaria_pruner_archived_total counter`);
      lines.push(`asolaria_pruner_archived_total ${m.total_archived ?? 0}`);
      lines.push(`# TYPE asolaria_pruner_signed_preserved_total counter`);
      lines.push(`asolaria_pruner_signed_preserved_total ${m.total_signed_preserved ?? 0}`);
      lines.push(`# TYPE asolaria_pruner_heartbeats_archived_total counter`);
      lines.push(`asolaria_pruner_heartbeats_archived_total ${m.total_heartbeats_archived ?? 0}`);
    } else {
      lines.push(`# asolaria_pruner_metrics_missing ${sources.pruner_metrics_path}`);
    }
  }

  // Firewall audit (computed by counting the audit-trail NDJSON)
  if (sources.firewall_audit_path) {
    const fw = countAuditLine(sources.firewall_audit_path);
    lines.push(`# TYPE asolaria_firewall_inspections_total counter`);
    lines.push(`asolaria_firewall_inspections_total ${fw.total}`);
    lines.push(`# TYPE asolaria_firewall_allowed_total counter`);
    lines.push(`asolaria_firewall_allowed_total ${fw.allowed}`);
    lines.push(`# TYPE asolaria_firewall_denied_total counter`);
    lines.push(`asolaria_firewall_denied_total ${fw.denied}`);
    for (const [ruleId, count] of Object.entries(fw.by_rule)) {
      const safeId = ruleId.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`asolaria_firewall_denied_by_rule_total{rule_id="${safeId}"} ${count}`);
    }
  }

  // Federation (if snapshot provided)
  if (sources.federation_snapshot) {
    const s = sources.federation_snapshot;
    lines.push(`# TYPE asolaria_federation_peer_count gauge`);
    lines.push(`asolaria_federation_peer_count ${s.peer_count}`);
    lines.push(`# TYPE asolaria_federation_ok_count gauge`);
    lines.push(`asolaria_federation_ok_count ${s.ok_count}`);
    lines.push(`# TYPE asolaria_federation_fail_count gauge`);
    lines.push(`asolaria_federation_fail_count ${s.fail_count}`);
    lines.push(`# TYPE asolaria_federation_stale_count gauge`);
    lines.push(`asolaria_federation_stale_count ${s.stale_count}`);
    for (const p of s.peers) {
      const peerName = p.name.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`asolaria_peer_ok{peer="${peerName}"} ${p.ok ? 1 : 0}`);
      lines.push(`asolaria_peer_latency_ms{peer="${peerName}"} ${p.latency_ms}`);
      if (typeof p.uptime_s === "number") lines.push(`asolaria_peer_uptime_s{peer="${peerName}"} ${p.uptime_s}`);
    }
  }

  return lines.join("\n") + "\n";
}

export function metricsGlyph(sources: MetricsSources): string {
  const pm = sources.pruner_metrics_path ? safeReadJson(sources.pruner_metrics_path) : null;
  const fw = sources.firewall_audit_path ? countAuditLine(sources.firewall_audit_path) : null;
  const fed = sources.federation_snapshot;
  const parts: string[] = ["EVT-DASHBOARD-METRICS"];
  if (pm) parts.push(`pruner-runs=${pm.total_runs ?? 0}`);
  if (fw) parts.push(`fw=${fw.total}(${fw.denied}-denied)`);
  if (fed) parts.push(`fed=${fed.peer_count}/${fed.ok_count}-ok`);
  return parts.join(" · ") + " @ M-INDICATIVE .";
}
