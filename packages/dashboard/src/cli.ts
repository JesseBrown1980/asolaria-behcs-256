// packages/dashboard/src/cli.ts — N-002 dashboard CLI renderer
//
// Takes a FederationSnapshot (from N-001 pollFederation) and renders a
// terminal-friendly table. Separate from the aggregator to keep N-001
// pure-data + N-002 presentation.
//
// Output is stable text so operators can `curl | render | grep`.

import type { FederationSnapshot, PeerHealth } from "./aggregator.ts";

export interface RenderOptions {
  show_commits?: boolean;   // default true
  show_timings?: boolean;   // default true
  ascii_only?: boolean;     // default false — use ✓/✗
  max_reason_chars?: number;
}

export function renderSnapshot(snap: FederationSnapshot, opts: RenderOptions = {}): string {
  const show_commits = opts.show_commits ?? true;
  const show_timings = opts.show_timings ?? true;
  const asciiOnly = opts.ascii_only ?? false;
  const maxReasonChars = opts.max_reason_chars ?? 60;

  const okSym = asciiOnly ? "OK " : "✓  ";
  const failSym = asciiOnly ? "FAIL" : "✗  ";
  const staleSym = asciiOnly ? "STALE" : "⚠";

  const lines: string[] = [];
  lines.push("═".repeat(80));
  lines.push(`FEDERATION HEALTH SNAPSHOT · ${snap.polled_at}`);
  lines.push("─".repeat(80));
  lines.push(`peers=${snap.peer_count}  ok=${snap.ok_count}  fail=${snap.fail_count}  stale=${snap.stale_count}  commits=${Object.keys(snap.by_commit).length}`);
  lines.push("─".repeat(80));

  // Peer table
  for (const p of snap.peers) {
    const status = p.ok ? okSym : failSym;
    const commit = show_commits ? ` [${(p.source_commit ?? "?").slice(0, 12)}]` : "";
    const timing = show_timings && typeof p.uptime_s === "number" ? ` up=${formatUptime(p.uptime_s)}` : "";
    const stale = p.stale_vs_reference || p.uptime_exceeds_max ? ` ${staleSym}` : "";
    const err = p.error ? ` err=${(p.error ?? "").slice(0, maxReasonChars)}` : "";
    const latency = show_timings ? ` (${p.latency_ms}ms)` : "";
    lines.push(`${status} ${p.name.padEnd(18)} ${p.url}${commit}${timing}${stale}${err}${latency}`);
  }

  // Commit roll-up
  if (show_commits && Object.keys(snap.by_commit).length > 1) {
    lines.push("─".repeat(80));
    lines.push("BY COMMIT:");
    for (const [commit, names] of Object.entries(snap.by_commit)) {
      const short = commit.slice(0, 12);
      lines.push(`  ${short.padEnd(14)} ${names.join(", ")}`);
    }
  }

  lines.push("─".repeat(80));
  lines.push(snap.glyph_sentence);
  lines.push("═".repeat(80));
  return lines.join("\n");
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
}

// Render a single-line summary suitable for status bars
export function renderOneLiner(snap: FederationSnapshot): string {
  const health = snap.fail_count === 0 && snap.stale_count === 0 ? "GREEN" : snap.fail_count > 0 ? "RED" : "YELLOW";
  return `[${health}] fed ${snap.ok_count}/${snap.peer_count} ok · ${snap.fail_count} fail · ${snap.stale_count} stale · ${Object.keys(snap.by_commit).length} commits`;
}
