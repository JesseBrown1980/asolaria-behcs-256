// packages/drift-broadcast/src/severity.ts — F-082 drift severity scorer
//
// F-077 broadcasts drifts; F-080 coalesces them; F-081 attaches witness.
// F-082 computes a severity score per drift so peers can prioritize
// response (quarantine immediately vs. log and investigate later).
//
// Severity inputs:
//   - drift_kind: verify_failed > new_drift_log_entry > both (escalation)
//   - violations count + content (sig_broken > manifest_drift > loose_file)
//   - drift_log_entries count + recency
//   - witness mode (owner > friend > autonomous > unattended)
//   - recent federation consensus (if 3+ peers already detected, high)

import type { DriftDetection } from "./broadcaster.ts";
import type { WitnessedDriftPayload } from "./witness.ts";

export type SeverityBand = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface SeverityScore {
  band: SeverityBand;
  numeric_score: number;      // 0-100
  drivers: string[];           // explanations for the score
  recommended_action: string;
  glyph_sentence: string;
}

export interface SeverityInput {
  detection: DriftDetection;
  witness_mode?: "owner" | "autonomous" | "friend" | "unattended";
  federation_peers_detected?: number;  // how many peers also flagged this drift
}

function bandFromScore(score: number): SeverityBand {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "INFO";
}

export function scoreDrift(input: SeverityInput): SeverityScore {
  const d = input.detection;
  const drivers: string[] = [];
  let score = 0;

  // Drift kind base
  if (d.drift_kind === "both") { score += 40; drivers.push("drift_kind=both (+40)"); }
  else if (d.drift_kind === "verify_failed") { score += 30; drivers.push("verify_failed (+30)"); }
  else if (d.drift_kind === "new_drift_log_entry") { score += 15; drivers.push("new_drift_log_entry (+15)"); }

  // Verify violations
  const violations = d.verify_result?.violations ?? [];
  for (const v of violations) {
    if (/signature|sig_broken|tamper/i.test(v)) { score += 25; drivers.push(`sig-related violation (+25): ${v}`); }
    else if (/manifest|identity/i.test(v)) { score += 15; drivers.push(`manifest drift (+15): ${v}`); }
    else { score += 5; drivers.push(`generic violation (+5): ${v}`); }
  }
  if (violations.length > 3) {
    score += 10;
    drivers.push(`many violations (${violations.length}, +10)`);
  }

  // Drift log entries
  const logEntries = d.drift_log_entries.length;
  if (logEntries >= 5) { score += 15; drivers.push(`log entries ≥5 (${logEntries}, +15)`); }
  else if (logEntries >= 2) { score += 8; drivers.push(`log entries ≥2 (${logEntries}, +8)`); }

  // Federation consensus
  const peers = input.federation_peers_detected ?? 0;
  if (peers >= 3) { score += 15; drivers.push(`federation consensus ${peers} peers (+15)`); }
  else if (peers >= 1) { score += 5; drivers.push(`partial federation consensus ${peers} peer (+5)`); }

  // Witness attenuation (unattended bumps score up; owner damps)
  const witness = input.witness_mode ?? "unattended";
  if (witness === "unattended") { score += 10; drivers.push("unattended witness (+10)"); }
  else if (witness === "autonomous") { score += 5; drivers.push("autonomous witness (+5)"); }
  else if (witness === "owner") { score = Math.max(0, score - 5); drivers.push("owner witness (-5 dampening)"); }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const band = bandFromScore(score);
  const action = bandFromScore(score) === "CRITICAL" ? "quarantine subject immediately + notify owner"
    : band === "HIGH" ? "refuse new envelopes from subject + alert owner within 5 min"
    : band === "MEDIUM" ? "log to audit + notify owner asynchronously"
    : band === "LOW" ? "record to drift-log; investigate at next window"
    : "informational — no action required";

  return {
    band,
    numeric_score: score,
    drivers,
    recommended_action: action,
    glyph_sentence: `EVT-DRIFT-SEVERITY · subject=${d.permanent_name} · band=${band} · score=${score}/100 · drivers=${drivers.length} @ M-EYEWITNESS .`,
  };
}

// Score a witnessed payload (convenience that pulls witness from payload)
export function scoreWitnessedDrift(payload: WitnessedDriftPayload, federation_peers_detected?: number): SeverityScore {
  const w = payload.operator_witness as any;
  const witness_mode = "mode" in w && w.mode === "unattended" ? "unattended" : (w.profile as any) ?? "unattended";
  return scoreDrift({
    detection: payload.detection,
    witness_mode,
    federation_peers_detected,
  });
}

export interface SeverityCounts {
  total: number;
  by_band: Record<SeverityBand, number>;
  avg_score: number;
  top_drivers: Array<{ driver: string; count: number }>;
}

export function aggregateSeverity(scores: SeverityScore[]): SeverityCounts {
  const byBand: Record<SeverityBand, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const driverCount: Map<string, number> = new Map();
  let sum = 0;
  for (const s of scores) {
    byBand[s.band]++;
    sum += s.numeric_score;
    for (const d of s.drivers) {
      // canonicalize driver by stripping parenthetical numbers
      const canon = d.replace(/ \([^)]*\)/g, "").replace(/ -?\d+$/, "").trim();
      driverCount.set(canon, (driverCount.get(canon) ?? 0) + 1);
    }
  }
  const topDrivers = Array.from(driverCount.entries())
    .map(([driver, count]) => ({ driver, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  return {
    total: scores.length,
    by_band: byBand,
    avg_score: scores.length === 0 ? 0 : sum / scores.length,
    top_drivers: topDrivers,
  };
}
