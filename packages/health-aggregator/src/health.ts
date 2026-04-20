// packages/health-aggregator/src/health.ts — H-001 unified daemon health
//
// Combines G-090 staleness surface + federation snapshot (N-001) into a
// single status object dashboards can render as a 1-line colony health
// verdict ([GREEN]/[YELLOW]/[RED]) without having to composite the
// sources themselves.
//
// Pure — caller supplies the latest federation snapshot + optional
// per-daemon custom-check results. We compute overall status by the
// strictest rule (worst peer wins).

import type { FederationSnapshot, PeerHealth } from "../../dashboard/src/aggregator.ts";

export type HealthColor = "GREEN" | "YELLOW" | "RED";

export interface DaemonCheck {
  name: string;
  ok: boolean;
  note?: string;
  age_s?: number;        // seconds since last heartbeat
  color: HealthColor;
}

export interface HealthInput {
  federation: FederationSnapshot | null;
  daemons?: DaemonCheck[];         // custom probes (e.g. shannon-dispatch daemon, behcs-bus)
  stale_age_threshold_s?: number;  // when uptime_s is this old treat as YELLOW (default infinity)
  now?: string;
}

export interface HealthVerdict {
  color: HealthColor;
  peer_count: number;
  peer_ok: number;
  peer_fail: number;
  peer_stale: number;
  daemon_count: number;
  daemon_ok: number;
  daemon_red: number;
  reasons: string[];
  worst_peer: string | null;
  worst_daemon: string | null;
  one_liner: string;
  rendered_json: Record<string, any>;
  glyph_sentence: string;
  computed_at: string;
}

function peerColor(p: PeerHealth, threshold: number): HealthColor {
  if (!p.ok) return "RED";
  if (p.stale_vs_reference || p.uptime_exceeds_max) return "YELLOW";
  if (typeof p.uptime_s === "number" && p.uptime_s > threshold) return "YELLOW";
  return "GREEN";
}

function worst(colors: HealthColor[]): HealthColor {
  if (colors.includes("RED")) return "RED";
  if (colors.includes("YELLOW")) return "YELLOW";
  return "GREEN";
}

export function computeHealth(input: HealthInput): HealthVerdict {
  const now = input.now ?? new Date().toISOString();
  const threshold = input.stale_age_threshold_s ?? Number.POSITIVE_INFINITY;

  const peerColors: HealthColor[] = [];
  let peerOk = 0, peerFail = 0, peerStale = 0;
  let worstPeer: string | null = null;
  const reasons: string[] = [];

  if (input.federation) {
    for (const p of input.federation.peers) {
      const c = peerColor(p, threshold);
      peerColors.push(c);
      if (p.ok) peerOk++; else { peerFail++; if (!worstPeer || c === "RED") worstPeer = p.name; }
      if (p.stale_vs_reference) peerStale++;
      if (c === "RED") reasons.push(`peer ${p.name} DOWN (${p.error ?? "no error"})`);
      else if (c === "YELLOW") reasons.push(`peer ${p.name} stale/degraded`);
    }
  }

  const daemonColors: HealthColor[] = [];
  let daemonOk = 0, daemonRed = 0;
  let worstDaemon: string | null = null;
  for (const d of input.daemons ?? []) {
    daemonColors.push(d.color);
    if (d.ok) daemonOk++;
    if (d.color === "RED") { daemonRed++; worstDaemon = worstDaemon ?? d.name; reasons.push(`daemon ${d.name} RED${d.note ? ": " + d.note : ""}`); }
    else if (d.color === "YELLOW") reasons.push(`daemon ${d.name} YELLOW${d.note ? ": " + d.note : ""}`);
  }

  const allColors = [...peerColors, ...daemonColors];
  const color: HealthColor = allColors.length === 0 ? "GREEN" : worst(allColors);

  const one_liner = `[${color}] peers=${peerOk}/${(input.federation?.peer_count ?? 0)} ok · daemons=${daemonOk}/${(input.daemons?.length ?? 0)} ok${peerFail + daemonRed > 0 ? ` · ${peerFail + daemonRed} fail` : ""}`;

  return {
    color,
    peer_count: input.federation?.peer_count ?? 0,
    peer_ok: peerOk,
    peer_fail: peerFail,
    peer_stale: peerStale,
    daemon_count: input.daemons?.length ?? 0,
    daemon_ok: daemonOk,
    daemon_red: daemonRed,
    reasons,
    worst_peer: worstPeer,
    worst_daemon: worstDaemon,
    one_liner,
    rendered_json: {
      ok: color === "GREEN",
      color,
      peer_count: input.federation?.peer_count ?? 0,
      peer_ok: peerOk,
      peer_fail: peerFail,
      peer_stale: peerStale,
      daemon_count: input.daemons?.length ?? 0,
      daemon_ok: daemonOk,
      daemon_red: daemonRed,
      worst_peer: worstPeer,
      worst_daemon: worstDaemon,
      reasons,
      computed_at: now,
    },
    glyph_sentence: `EVT-HEALTH-UNIFIED · color=${color} · peers=${peerOk}/${input.federation?.peer_count ?? 0} · daemons=${daemonOk}/${input.daemons?.length ?? 0} · reasons=${reasons.length} @ M-${color === "GREEN" ? "INDICATIVE" : "EYEWITNESS"} .`,
    computed_at: now,
  };
}

// Render health to multi-line text (ops console style)
export function renderHealthReport(v: HealthVerdict): string {
  const lines: string[] = [];
  lines.push(`COLONY HEALTH · ${v.color} · ${v.computed_at}`);
  lines.push(`  peers:   ${v.peer_ok}/${v.peer_count} ok (${v.peer_fail} fail, ${v.peer_stale} stale)`);
  lines.push(`  daemons: ${v.daemon_ok}/${v.daemon_count} ok (${v.daemon_red} red)`);
  if (v.worst_peer) lines.push(`  worst peer:   ${v.worst_peer}`);
  if (v.worst_daemon) lines.push(`  worst daemon: ${v.worst_daemon}`);
  if (v.reasons.length > 0) {
    lines.push("  reasons:");
    for (const r of v.reasons.slice(0, 10)) lines.push(`    - ${r}`);
    if (v.reasons.length > 10) lines.push(`    (+${v.reasons.length - 10} more)`);
  }
  lines.push("");
  lines.push(v.glyph_sentence);
  return lines.join("\n");
}
