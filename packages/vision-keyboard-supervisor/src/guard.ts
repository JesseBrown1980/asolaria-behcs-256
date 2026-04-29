// guard.ts — pure gate. Given already-fetched probe snapshots, decide whether
// it is safe to proceed to /type. Never fetches. Never writes. Never types.
//
// `guardTypeToPeer` takes assembled probe results and returns a GuardResult.
// The supervisor.ts orchestrator is responsible for calling /status, /windows
// and local capture first, then feeding them into this function.

import {
  assessOverlayRisk,
  type OverlayRisk,
  type OverlayVerdict,
  type WindowTarget,
} from "./overlay-heuristics.ts";
import {
  combineGroundTruth,
  mergedHaltSignal,
  type GroundTruthInput,
  type GroundTruthResult,
} from "./foreground-ground-truth.ts";

export type OverlayRiskTolerance = "low" | "medium" | "high";

export type RecommendedAction =
  | "minimize-overlays"
  | "escalate-operator"
  | "retry-in-N-ms"
  | "proceed";

export interface GuardInput {
  /** Peer endpoint (e.g., "http://192.168.100.1:4913"). */
  peer: string;
  /** Substring the caller intends to be foreground. */
  intended_target_substring: string;
  /** Maximum tolerated overlay risk. Default "low" — any medium/high HALTs. */
  overlay_risk_tolerance?: OverlayRiskTolerance;
  /** Already-fetched probe snapshots + vision signal. */
  probes: GroundTruthInput;
  /** Expected terminal-host titles to downgrade from overlay. */
  expected_top_titles?: string[];
  /** Handle (HWND) the caller intends to target. Codepage-immune match key. */
  intended_target_window_id?: number;
}

export interface GuardResult {
  ok: boolean;
  halt_reason?: string;
  /** Process basenames of known overlay offenders (e.g., ["node.exe"]). */
  overlay_offenders: WindowTarget[];
  /** What the caller should do next. */
  recommended_action: RecommendedAction;
  /** Retry delay in ms (only meaningful when recommended_action="retry-in-N-ms"). */
  retry_in_ms?: number;
  /** Breakdown of the two sub-verdicts for logging. */
  overlay: OverlayVerdict;
  ground_truth: GroundTruthResult;
  /** Single-line summary for the cosign chain. */
  summary: string;
}

const TOLERANCE_ORDER: Record<OverlayRiskTolerance, number> = { low: 0, medium: 1, high: 2 };
const RISK_ORDER: Record<OverlayRisk, number> = { low: 0, medium: 1, high: 2 };

/**
 * Pure gate. Returns ok:true ONLY when:
 *   - overlay risk <= tolerance, AND
 *   - ground truth consensus says foreground matches intended, AND
 *   - no foreground sentinel was observed.
 *
 * Otherwise returns ok:false with a structured halt_reason and a
 * recommended_action the caller can act on.
 */
export function guardTypeToPeer(input: GuardInput): GuardResult {
  const tolerance = input.overlay_risk_tolerance ?? "low";

  const overlay = assessOverlayRisk({
    intended_target_substring: input.intended_target_substring,
    foreground: input.probes.status?.foreground,
    targets: input.probes.windows?.windows ?? input.probes.status?.windows ?? [],
    expected_top_titles: input.expected_top_titles,
    intended_target_window_id: input.intended_target_window_id,
  });

  const gt = combineGroundTruth({
    intended_target_substring: input.intended_target_substring,
    status: input.probes.status,
    windows: input.probes.windows,
    vision: input.probes.vision,
    expected_top_titles: input.expected_top_titles,
    intended_target_window_id: input.intended_target_window_id,
  });

  const merged = mergedHaltSignal(overlay, gt);

  // Does overlay risk exceed tolerance?
  const overBudget = RISK_ORDER[overlay.overlay_risk] > TOLERANCE_ORDER[tolerance];

  let ok = true;
  let halt_reason: string | undefined;
  let recommended_action: RecommendedAction = "proceed";
  let retry_in_ms: number | undefined;

  // mergedHaltSignal halts on medium-overlay as a conservative default. The
  // guard respects the caller's explicit tolerance: if the ONLY reason for
  // halt is "overlay-medium" AND tolerance >= medium AND ground truth has
  // consensus AND no sentinel, we override and proceed. HIGH overlay and
  // any ground-truth/sentinel halt are non-negotiable.
  const mergedIsMediumOverlayOnly =
    merged.halt &&
    /^overlay-medium/.test(merged.reason) &&
    overlay.overlay_risk === "medium" &&
    !gt.saw_foreground_sentinel &&
    gt.consensus_foreground_matches_intended;

  if (merged.halt && !(mergedIsMediumOverlayOnly && TOLERANCE_ORDER[tolerance] >= RISK_ORDER.medium)) {
    ok = false;
    halt_reason = merged.reason;
  }
  if (overBudget) {
    ok = false;
    halt_reason = halt_reason
      ? `${halt_reason}; overlay-risk-${overlay.overlay_risk}-exceeds-tolerance-${tolerance}`
      : `overlay-risk-${overlay.overlay_risk}-exceeds-tolerance-${tolerance}`;
  }

  if (!ok) {
    if (overlay.offenders.length > 0 && !gt.saw_foreground_sentinel) {
      recommended_action = "minimize-overlays";
    } else if (gt.saw_foreground_sentinel) {
      recommended_action = "escalate-operator";
    } else if (
      overlay.overlay_risk === "low" &&
      gt.overall === "unknown"
    ) {
      recommended_action = "retry-in-N-ms";
      retry_in_ms = 1500;
    } else {
      recommended_action = "escalate-operator";
    }
  }

  const summary = ok
    ? `GUARD-OK · peer=${input.peer} · intended="${input.intended_target_substring}" · risk=${overlay.overlay_risk}`
    : `GUARD-HALT · peer=${input.peer} · intended="${input.intended_target_substring}" · risk=${overlay.overlay_risk} · reason="${halt_reason}" · action=${recommended_action}`;

  return {
    ok,
    halt_reason,
    overlay_offenders: overlay.offenders,
    recommended_action,
    retry_in_ms,
    overlay,
    ground_truth: gt,
    summary,
  };
}
