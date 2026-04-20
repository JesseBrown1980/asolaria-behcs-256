// packages/health-aggregator/src/uptime-timeline.ts — H-002 daemon uptime timeline
//
// H-001 gave a point-in-time color; H-002 records per-daemon uptime across
// time so operators can distinguish "flapping daemon" from "long-lived
// stable daemon that just crashed once" — different ops response.
//
// Pure state machine — caller feeds HealthVerdict-like snapshots; we
// maintain per-daemon timeline windows + compute availability SLO.

import type { DaemonCheck } from "./health.ts";

export interface DaemonSample {
  ts: string;
  name: string;
  ok: boolean;
  color: "GREEN" | "YELLOW" | "RED";
  age_s?: number;
  note?: string;
}

export interface DaemonTimeline {
  name: string;
  samples: DaemonSample[];
  total_samples: number;
  ok_samples: number;
  availability_ratio: number;
  longest_ok_streak: number;
  longest_fail_streak: number;
  current_streak_kind: "ok" | "fail" | "unknown";
  current_streak_length: number;
  last_flip_at: string | null;
}

export interface TimelineInput {
  history: DaemonSample[];
  max_samples_per_daemon?: number;   // default 500
  slo_target?: number;                // e.g. 0.99 = 99% availability target
}

export interface TimelineReport {
  built_at: string;
  total_samples: number;
  daemon_count: number;
  daemons: DaemonTimeline[];
  slo_violations: Array<{ name: string; availability_ratio: number; target: number }>;
  glyph_sentence: string;
}

export function ingestSamples(input: TimelineInput): TimelineReport {
  const cap = input.max_samples_per_daemon ?? 500;
  const slo = input.slo_target ?? 0.99;

  const byDaemon: Map<string, DaemonSample[]> = new Map();
  for (const s of input.history) {
    (byDaemon.get(s.name) ?? byDaemon.set(s.name, []).get(s.name))!.push(s);
  }

  const timelines: DaemonTimeline[] = [];
  const violations: TimelineReport["slo_violations"] = [];

  for (const [name, rawSamples] of byDaemon) {
    const sorted = rawSamples.slice().sort((a, b) => a.ts.localeCompare(b.ts)).slice(-cap);
    const okCount = sorted.filter(s => s.ok).length;

    let longestOk = 0, longestFail = 0;
    let curOk = 0, curFail = 0;
    let lastFlipAt: string | null = null;
    let prev: boolean | null = null;

    for (const s of sorted) {
      if (s.ok) {
        if (prev === false) lastFlipAt = s.ts;
        curOk++; curFail = 0;
        if (curOk > longestOk) longestOk = curOk;
      } else {
        if (prev === true) lastFlipAt = s.ts;
        curFail++; curOk = 0;
        if (curFail > longestFail) longestFail = curFail;
      }
      prev = s.ok;
    }

    const last = sorted[sorted.length - 1];
    const currentStreakKind = last ? (last.ok ? "ok" : "fail") : "unknown";
    const currentStreakLength = last ? (last.ok ? curOk : curFail) : 0;
    const availability = sorted.length > 0 ? okCount / sorted.length : 0;

    const timeline: DaemonTimeline = {
      name,
      samples: sorted,
      total_samples: sorted.length,
      ok_samples: okCount,
      availability_ratio: availability,
      longest_ok_streak: longestOk,
      longest_fail_streak: longestFail,
      current_streak_kind: currentStreakKind,
      current_streak_length: currentStreakLength,
      last_flip_at: lastFlipAt,
    };
    timelines.push(timeline);
    if (availability < slo) {
      violations.push({ name, availability_ratio: availability, target: slo });
    }
  }

  timelines.sort((a, b) => a.name.localeCompare(b.name));
  violations.sort((a, b) => a.availability_ratio - b.availability_ratio);

  return {
    built_at: new Date().toISOString(),
    total_samples: input.history.length,
    daemon_count: byDaemon.size,
    daemons: timelines,
    slo_violations: violations,
    glyph_sentence: `EVT-UPTIME-TIMELINE · daemons=${byDaemon.size} · samples=${input.history.length} · slo-violations=${violations.length} · slo=${(slo * 100).toFixed(1)}% @ M-INDICATIVE .`,
  };
}

export function sampleFromCheck(check: DaemonCheck, ts: string): DaemonSample {
  return {
    ts,
    name: check.name,
    ok: check.ok,
    color: check.color,
    age_s: check.age_s,
    note: check.note,
  };
}

// Convert samples into a simple sparkline for ops consoles
export function daemonSparkline(t: DaemonTimeline): string {
  return t.samples.map(s => (s.color === "GREEN" ? "▁" : s.color === "YELLOW" ? "▄" : "█")).join("");
}

export function renderTimelineTable(r: TimelineReport): string {
  const lines: string[] = [];
  lines.push(`DAEMON UPTIME TIMELINE · ${r.built_at} · daemons=${r.daemon_count} · samples=${r.total_samples}`);
  if (r.slo_violations.length > 0) {
    lines.push(`!! SLO VIOLATIONS: ${r.slo_violations.map(v => `${v.name}(${(v.availability_ratio * 100).toFixed(1)}%)`).join(", ")}`);
  }
  lines.push("");
  for (const d of r.daemons) {
    lines.push(
      `${d.name.padEnd(28)} avail=${(d.availability_ratio * 100).toFixed(1)}%  ` +
      `longest-ok=${d.longest_ok_streak}  longest-fail=${d.longest_fail_streak}  ` +
      `streak=${d.current_streak_kind}/${d.current_streak_length}  ` +
      daemonSparkline(d)
    );
  }
  lines.push("");
  lines.push(r.glyph_sentence);
  return lines.join("\n");
}
