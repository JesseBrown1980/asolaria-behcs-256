// packages/shannon-civ/src/l4-aggregator.ts — G-093 L4 evidence aggregator
//
// Single-scan L4 already runs in G-087. G-093 aggregates L4 results
// across a cohort of scans (e.g. all of today's recons, all scans of a
// given host) to detect systemic evidence gaps. Operators use this to
// find profiles or targets whose L4 evidence is chronically WEAK/
// INSUFFICIENT even when L0-L2 passes — a signal the profile needs
// better phase expectations.
//
// Pure — caller supplies the L4 records; we fold into a cohort view.

import type { L4Result, L4Evidence } from "./acer-dispatch.ts";

export interface L4CohortEntry {
  scan_id: string;
  profile_name: string;
  requesting_target: string;
  l4: L4Result;
  at: string;
}

export interface CohortDimension {
  name: string;                    // "profile", "target"
  total: number;
  evidence_counts: Record<L4Evidence, number>;
  strong_ratio: number;
  weak_or_insufficient_ratio: number;
  phase_expectation_met_ratio: number;
  l0_l2_ok_ratio: number;
  l3_accepted_ratio: number;
}

export interface L4CohortReport {
  built_at: string;
  total_scans: number;
  overall: CohortDimension;
  by_profile: Record<string, CohortDimension>;
  by_target: Record<string, CohortDimension>;
  weak_profiles: Array<{ profile: string; weak_or_insufficient_ratio: number; total: number }>;
  weak_targets: Array<{ target: string; weak_or_insufficient_ratio: number; total: number }>;
  glyph_sentence: string;
}

function emptyDim(name: string): CohortDimension {
  return {
    name, total: 0,
    evidence_counts: { STRONG: 0, WEAK: 0, INSUFFICIENT: 0, CONTRADICTORY: 0 },
    strong_ratio: 0, weak_or_insufficient_ratio: 0,
    phase_expectation_met_ratio: 0, l0_l2_ok_ratio: 0, l3_accepted_ratio: 0,
  };
}

function foldDim(dim: CohortDimension, entry: L4CohortEntry): CohortDimension {
  const total = dim.total + 1;
  const counts = { ...dim.evidence_counts };
  counts[entry.l4.evidence] = (counts[entry.l4.evidence] ?? 0) + 1;
  const weakOrInsuff = counts.WEAK + counts.INSUFFICIENT;
  const newStrongRatio = counts.STRONG / total;
  const newWeakRatio = weakOrInsuff / total;
  const prevPhaseMet = dim.phase_expectation_met_ratio * dim.total;
  const prevL0L2 = dim.l0_l2_ok_ratio * dim.total;
  const prevL3 = dim.l3_accepted_ratio * dim.total;
  return {
    name: dim.name,
    total,
    evidence_counts: counts,
    strong_ratio: newStrongRatio,
    weak_or_insufficient_ratio: newWeakRatio,
    phase_expectation_met_ratio: (prevPhaseMet + (entry.l4.phase_expectation_met ? 1 : 0)) / total,
    l0_l2_ok_ratio: (prevL0L2 + (entry.l4.l0_l2_all_ok ? 1 : 0)) / total,
    l3_accepted_ratio: (prevL3 + (entry.l4.l3_accepted ? 1 : 0)) / total,
  };
}

export function buildCohortReport(entries: L4CohortEntry[], weakThreshold: number = 0.3, minSamplesForFlag: number = 5): L4CohortReport {
  let overall = emptyDim("overall");
  const byProfile: Record<string, CohortDimension> = {};
  const byTarget: Record<string, CohortDimension> = {};

  for (const e of entries) {
    overall = foldDim(overall, e);
    if (!byProfile[e.profile_name]) byProfile[e.profile_name] = emptyDim(e.profile_name);
    byProfile[e.profile_name] = foldDim(byProfile[e.profile_name], e);
    if (!byTarget[e.requesting_target]) byTarget[e.requesting_target] = emptyDim(e.requesting_target);
    byTarget[e.requesting_target] = foldDim(byTarget[e.requesting_target], e);
  }

  const weakProfiles = Object.values(byProfile)
    .filter(d => d.total >= minSamplesForFlag && d.weak_or_insufficient_ratio >= weakThreshold)
    .map(d => ({ profile: d.name, weak_or_insufficient_ratio: d.weak_or_insufficient_ratio, total: d.total }))
    .sort((a, b) => b.weak_or_insufficient_ratio - a.weak_or_insufficient_ratio);

  const weakTargets = Object.values(byTarget)
    .filter(d => d.total >= minSamplesForFlag && d.weak_or_insufficient_ratio >= weakThreshold)
    .map(d => ({ target: d.name, weak_or_insufficient_ratio: d.weak_or_insufficient_ratio, total: d.total }))
    .sort((a, b) => b.weak_or_insufficient_ratio - a.weak_or_insufficient_ratio);

  return {
    built_at: new Date().toISOString(),
    total_scans: entries.length,
    overall,
    by_profile: byProfile,
    by_target: byTarget,
    weak_profiles: weakProfiles,
    weak_targets: weakTargets,
    glyph_sentence: `EVT-L4-COHORT-REPORT · scans=${entries.length} · profiles=${Object.keys(byProfile).length} · targets=${Object.keys(byTarget).length} · weak-profiles=${weakProfiles.length} · weak-targets=${weakTargets.length} @ M-INDICATIVE .`,
  };
}

export function renderCohortReport(r: L4CohortReport): string {
  const lines: string[] = [];
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  lines.push(`L4 COHORT REPORT · ${r.built_at} · scans=${r.total_scans}`);
  lines.push(`OVERALL: STRONG=${pct(r.overall.strong_ratio)} · WEAK/INSUFF=${pct(r.overall.weak_or_insufficient_ratio)} · phase-met=${pct(r.overall.phase_expectation_met_ratio)} · l0l2-ok=${pct(r.overall.l0_l2_ok_ratio)}`);
  lines.push("");
  if (r.weak_profiles.length > 0) {
    lines.push(`WEAK PROFILES (≥${r.weak_profiles[0] ? r.weak_profiles[0].total : 0} samples, ≥flagged threshold):`);
    for (const p of r.weak_profiles) lines.push(`  ${p.profile.padEnd(28)} weak=${pct(p.weak_or_insufficient_ratio)} (n=${p.total})`);
  }
  if (r.weak_targets.length > 0) {
    lines.push("");
    lines.push("WEAK TARGETS:");
    for (const t of r.weak_targets) lines.push(`  ${t.target.padEnd(28)} weak=${pct(t.weak_or_insufficient_ratio)} (n=${t.total})`);
  }
  lines.push("");
  lines.push(r.glyph_sentence);
  return lines.join("\n");
}
