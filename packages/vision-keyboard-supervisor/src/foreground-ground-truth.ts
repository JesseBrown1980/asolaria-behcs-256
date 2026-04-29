// foreground-ground-truth.ts — cross-verifies multiple sources to decide what
// is ACTUALLY on top of the peer screen.
//
// Problem: /status.foreground is blind to subprocess console overlays that
// spawn after enumeration or that Windows has denied focus stealing. When it
// lies, /type lands chars in the overlay (2026-04-19 08:55Z incident).
//
// Strategy: combine up to three independent sources and return a combined
// verdict. Any disagreement ⇒ flag mismatch ⇒ HIGH overlay_risk regardless
// of what any single source says.
//
// Sources:
//   (A) /status.foreground          — peer's Win32 GetForegroundWindow report
//   (B) /windows top-k enumeration  — peer's full window list (first entry
//                                      typically intended to be foreground)
//   (C) local screen capture delta  — PNG size vs baseline, or OCR hook text
//                                      if a behcs-screen-capture companion
//                                      ever writes a parallel .txt. Today
//                                      we only inspect PNG size — so this
//                                      source emits a weak signal:
//                                      { baseline_present, size_ratio, kind }.
//
// Signals are evaluated independently and then compared.
//
// No fs/http here — pure functions that take already-fetched payloads. The
// supervisor.ts file wires them together with injected fetch + probe.

import type { OverlayVerdict, WindowTarget } from "./overlay-heuristics.ts";

/** Normalized /status probe result (subset we care about). */
export interface StatusSnapshot {
  ok: boolean;
  foreground?: string;
  windows?: WindowTarget[];
  enabled?: boolean;
  error?: string;
}

/** Normalized /windows probe result (subset). */
export interface WindowsSnapshot {
  ok: boolean;
  windows?: WindowTarget[];
  error?: string;
}

/** Weak vision signal from local screen capture. */
export interface VisionSignal {
  /** Did capture produce a PNG? */
  ok: boolean;
  /** Path to PNG if captured. */
  path?: string;
  /** Size in bytes if known. */
  size_bytes?: number;
  /** Ratio of current size to baseline. > 1.3 or < 0.7 ⇒ big delta. */
  size_ratio_vs_baseline?: number;
  /** OCR hint — if a companion writes text, supervisor may fill this. */
  ocr_hint?: string;
  /** Error if capture failed. */
  error?: string;
}

export interface GroundTruthInput {
  intended_target_substring: string;
  status?: StatusSnapshot;
  windows?: WindowsSnapshot;
  vision?: VisionSignal;
  expected_top_titles?: string[];
  /**
   * Optional handle (HWND) the caller intends to target. When present AND the
   * peer's targets list contains a matching entry, the status verdict is
   * "match" even if /status.foreground is empty or substring-mismatched.
   * Per acer 2026-04-28 pushback: handle is unique + stable + codepage-immune,
   * a far better primary key than title strings with Unicode glyphs.
   */
  intended_target_window_id?: number;
}

export type SourceVerdict = "match" | "mismatch" | "unknown";

export interface PerSourceVerdict {
  source: "status" | "windows" | "vision";
  verdict: SourceVerdict;
  observed?: string;
  note?: string;
}

export interface GroundTruthResult {
  /** True only when all known sources agree the foreground contains intended. */
  consensus_foreground_matches_intended: boolean;
  /** Per-source outcomes. */
  per_source: PerSourceVerdict[];
  /** List of offender process basenames (derived from /windows only). */
  overlay_offender_processes: string[];
  /** Overall verdict: mismatch if ANY source mismatches, unknown if all unknown, match if at least one matches and none mismatch. */
  overall: SourceVerdict;
  /** Human-readable line. */
  summary: string;
  /** Did any source emit the "<foreground>" sentinel? */
  saw_foreground_sentinel: boolean;
}

const FOREGROUND_SENTINEL = "<foreground>";
const BIG_DELTA_LOW = 0.7;
const BIG_DELTA_HIGH = 1.3;

function ci(a: string, b: string): boolean {
  return (a ?? "").toLowerCase().includes((b ?? "").toLowerCase());
}

function isSentinel(s: string | undefined): boolean {
  if (!s) return false;
  return s.trim().toLowerCase() === FOREGROUND_SENTINEL.toLowerCase();
}

function assessStatus(
  status: StatusSnapshot | undefined,
  intended: string,
  intendedWindowId?: number,
): PerSourceVerdict {
  if (!status) return { source: "status", verdict: "unknown", note: "not-probed" };
  if (!status.ok) return { source: "status", verdict: "unknown", note: status.error ?? "probe-failed" };

  // Handle-primary check (acer 2026-04-28 recommendation): if caller provided
  // a target window_id AND the peer's enumerated targets contain it, that is
  // a stronger signal than any title substring match. Codepage-immune.
  if (typeof intendedWindowId === "number" && Array.isArray(status.windows)) {
    const hit = status.windows.find((w) => w.window_id === intendedWindowId);
    if (hit) {
      return {
        source: "status",
        verdict: "match",
        observed: hit.title ?? `window_id=${intendedWindowId}`,
        note: `handle-match window_id=${intendedWindowId}`,
      };
    }
  }

  const fg = (status.foreground ?? "").trim();
  if (!fg) return { source: "status", verdict: "mismatch", observed: fg, note: "empty-foreground" };
  if (isSentinel(fg)) {
    return {
      source: "status",
      verdict: "mismatch",
      observed: fg,
      note: "fallthrough-sentinel",
    };
  }
  if (ci(fg, intended)) return { source: "status", verdict: "match", observed: fg };
  return { source: "status", verdict: "mismatch", observed: fg, note: "substring-miss" };
}

function assessWindows(
  windows: WindowsSnapshot | undefined,
  intended: string,
  intendedWindowId?: number,
): { verdict: PerSourceVerdict; offenders: string[] } {
  if (!windows) {
    return {
      verdict: { source: "windows", verdict: "unknown", note: "not-probed" },
      offenders: [],
    };
  }
  if (!windows.ok) {
    return {
      verdict: { source: "windows", verdict: "unknown", note: windows.error ?? "probe-failed" },
      offenders: [],
    };
  }
  const list = windows.windows ?? [];
  const offenders = list
    .map((w) => ((w.process ?? "").split(/[\\/]/).pop() ?? "").toLowerCase())
    .filter(Boolean);

  // Handle-primary check: if caller provided window_id and it's in the list,
  // that is sufficient — caller's /type body will route to it via window_id.
  if (typeof intendedWindowId === "number") {
    const hit = list.find((w) => w.window_id === intendedWindowId);
    if (hit) {
      return {
        verdict: {
          source: "windows",
          verdict: "match",
          observed: hit.title ?? `window_id=${intendedWindowId}`,
          note: `handle-match window_id=${intendedWindowId}`,
        },
        offenders,
      };
    }
  }

  // Top-of-list (by array order OR z_order=0 if present) is the claimed foreground.
  const sorted = [...list].sort((a, b) => {
    const az = typeof a.z_order === "number" ? a.z_order : 1e9;
    const bz = typeof b.z_order === "number" ? b.z_order : 1e9;
    return az - bz;
  });
  const top = sorted[0];
  if (!top) {
    return {
      verdict: { source: "windows", verdict: "mismatch", note: "empty-window-list" },
      offenders,
    };
  }
  const topTitle = top.title ?? "";
  if (ci(topTitle, intended)) {
    return {
      verdict: { source: "windows", verdict: "match", observed: topTitle },
      offenders,
    };
  }
  return {
    verdict: { source: "windows", verdict: "mismatch", observed: topTitle, note: "top-window-mismatch" },
    offenders,
  };
}

function assessVision(vision: VisionSignal | undefined): PerSourceVerdict {
  if (!vision) return { source: "vision", verdict: "unknown", note: "not-probed" };
  if (!vision.ok) return { source: "vision", verdict: "unknown", note: vision.error ?? "capture-failed" };
  // OCR hint wins if present.
  if (typeof vision.ocr_hint === "string" && vision.ocr_hint.trim().length > 0) {
    return {
      source: "vision",
      verdict: "unknown",
      observed: vision.ocr_hint,
      note: "ocr-hint-not-cross-referenced-here",
    };
  }
  // Without OCR, a big PNG delta tells us SOMETHING changed, not whether it
  // matches intended. We surface it as a weak signal: big delta ⇒ mismatch
  // candidate, small delta ⇒ still unknown.
  const r = vision.size_ratio_vs_baseline;
  if (typeof r === "number") {
    if (r < BIG_DELTA_LOW || r > BIG_DELTA_HIGH) {
      return {
        source: "vision",
        verdict: "mismatch",
        note: `png-delta-ratio=${r.toFixed(2)} (likely new window stacked)`,
      };
    }
    return { source: "vision", verdict: "unknown", note: `png-delta-ratio=${r.toFixed(2)}` };
  }
  return { source: "vision", verdict: "unknown", note: "no-baseline-available" };
}

/** Combine all sources into a verdict. Pure function. */
export function combineGroundTruth(input: GroundTruthInput): GroundTruthResult {
  const intended = (input.intended_target_substring ?? "").trim();
  if (!intended) {
    return {
      consensus_foreground_matches_intended: false,
      per_source: [],
      overlay_offender_processes: [],
      overall: "mismatch",
      saw_foreground_sentinel: false,
      summary: "HALT · missing intended_target_substring",
    };
  }

  const statusV = assessStatus(input.status, intended, input.intended_target_window_id);
  const { verdict: windowsV, offenders: wOffenders } = assessWindows(input.windows, intended, input.intended_target_window_id);
  const visionV = assessVision(input.vision);

  const per_source: PerSourceVerdict[] = [statusV, windowsV, visionV];

  const saw_foreground_sentinel = isSentinel(input.status?.foreground);

  // Overall: any mismatch ⇒ mismatch. Else any match ⇒ match. Else unknown.
  let overall: SourceVerdict = "unknown";
  if (per_source.some((p) => p.verdict === "mismatch")) overall = "mismatch";
  else if (per_source.some((p) => p.verdict === "match")) overall = "match";

  const consensus =
    !saw_foreground_sentinel &&
    overall === "match" &&
    // Require status specifically to be match OR unknown (not mismatch).
    statusV.verdict !== "mismatch" &&
    windowsV.verdict !== "mismatch";

  const summary =
    `GT · intended="${intended}" · status=${statusV.verdict}${statusV.observed ? ` "${statusV.observed}"` : ""}` +
    ` · windows=${windowsV.verdict}${windowsV.observed ? ` "${windowsV.observed}"` : ""}` +
    ` · vision=${visionV.verdict}` +
    ` · sentinel=${saw_foreground_sentinel} · overall=${overall}`;

  return {
    consensus_foreground_matches_intended: consensus,
    per_source,
    overlay_offender_processes: wOffenders,
    overall,
    saw_foreground_sentinel,
    summary,
  };
}

/** Helper: convert an overlay-heuristics verdict + ground-truth into a merged HALT-or-go signal. */
export function mergedHaltSignal(
  overlay: OverlayVerdict,
  gt: GroundTruthResult,
): { halt: boolean; reason: string } {
  if (overlay.overlay_risk === "high") return { halt: true, reason: `overlay-high: ${overlay.reason}` };
  if (gt.saw_foreground_sentinel) return { halt: true, reason: "foreground-sentinel-seen" };
  if (!gt.consensus_foreground_matches_intended) {
    return { halt: true, reason: `ground-truth-no-consensus: overall=${gt.overall}` };
  }
  if (overlay.overlay_risk === "medium") {
    return { halt: true, reason: `overlay-medium: ${overlay.reason}` };
  }
  return { halt: false, reason: "clean" };
}
