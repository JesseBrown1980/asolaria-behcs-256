// overlay-heuristics.ts — pure logic. No I/O, no fetch, no fs.
//
// Jesse 2026-04-19 incident anchor: acer's agent-keyboard reports
// foreground="? Connect to Liris on Rayssa computer" (the terminal tab in
// Claude Code) but a blue node-subprocess console overlay visually covers
// the terminal. 681 chars landed in the overlay, not in Claude Code.
//
// The /status + /windows enumeration is blind to subprocess consoles that
// spawn after the last enumeration, or to consoles Windows has denied focus
// stealing across process boundaries. We cannot trust /status alone — we
// must combine:
//
//   (a) process-name heuristic — if ANY known overlay-capable process
//       (node.exe, node, cmd.exe, python.exe, powershell.exe, conhost.exe)
//       appears in the /windows targets AND is NOT one of the expected
//       top-k terminal targets, treat as overlay-suspect.
//
//   (b) foreground substring check — if /status reports foreground that
//       does NOT include the intended_target_substring, that alone is
//       enough to raise risk. `<foreground>` is a sentinel string that
//       agent-keyboard returns when AppActivate silently fell through —
//       we treat it as HIGH unconditionally.
//
// Risk escalation:
//   LOW    = no overlay processes in targets AND foreground matches intended.
//   MEDIUM = overlay processes present BUT not on top (foreground still matches).
//   HIGH   = (overlay processes present AND foreground mismatch) OR
//            foreground sentinel "<foreground>" OR
//            empty/missing foreground string.
//
// Exported purely: inputs in → verdict out. Every branch is unit-testable.

/** Process basenames that are known to spawn console overlays that can steal z-order. */
export const OVERLAY_CAPABLE_PROCESSES = new Set<string>([
  "node.exe",
  "node",
  "cmd.exe",
  "cmd",
  "python.exe",
  "python",
  "powershell.exe",
  "powershell",
  "pwsh.exe",
  "pwsh",
  "conhost.exe",
  "conhost",
]);

/** Agent-keyboard fallthrough sentinel — treat as HALT, not success. */
export const FOREGROUND_FALLTHROUGH_SENTINEL = "<foreground>";

export type OverlayRisk = "low" | "medium" | "high";

/** One enumerated window target from peer `/windows` or `/status.windows`. */
export interface WindowTarget {
  /** Process basename as reported by peer (e.g., "node.exe", "conhost.exe"). */
  process?: string;
  /** Window title as reported by peer. */
  title?: string;
  /** Win32 HWND or stable window id. */
  window_id?: number;
  /** z-order index if reported (0 = top). Optional; peers may not supply this. */
  z_order?: number;
}

export interface OverlayInput {
  /** The substring the caller intends to be foreground (e.g., "Claude Code", "Connect to Liris"). */
  intended_target_substring: string;
  /** /status.foreground string. May be empty, "<foreground>" sentinel, or a real title. */
  foreground?: string;
  /** Top-k expected titles that are safe to consider non-overlay (e.g., ["Claude Code", "Windows Terminal"]). */
  expected_top_titles?: string[];
  /** All window targets from /windows (or /status.windows). Order is caller-defined; z_order preferred. */
  targets?: WindowTarget[];
  /**
   * Optional handle (HWND) the caller intends to target. When this matches an
   * entry in `targets`, the foreground-substring check is satisfied even if
   * /status.foreground is empty or has a different title (codepage drift,
   * Unicode glyph in title, focus-loss between probes, etc.).
   * Per acer 2026-04-28 pushback.
   */
  intended_target_window_id?: number;
}

export interface OverlayVerdict {
  overlay_risk: OverlayRisk;
  offenders: WindowTarget[];
  /** Short machine-readable reason codes, joined with "; ". */
  reason: string;
  /** Human-readable sentence for logs. */
  summary: string;
}

function basename(p: string | undefined): string {
  if (!p) return "";
  // Strip any path prefix, windows or posix.
  const parts = p.split(/[\\/]/);
  return (parts[parts.length - 1] ?? p).toLowerCase();
}

function includesCI(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Decide overlay risk. Pure, deterministic, side-effect free. */
export function assessOverlayRisk(input: OverlayInput): OverlayVerdict {
  const intended = (input.intended_target_substring ?? "").trim();
  const foreground = (input.foreground ?? "").trim();
  const targets = Array.isArray(input.targets) ? input.targets : [];
  const expected = new Set(
    (input.expected_top_titles ?? []).map((t) => (t ?? "").toLowerCase()),
  );

  const reasons: string[] = [];

  // Guard 1 — missing intended substring is a programming error, not an
  // overlay event. We still return HIGH so nothing types.
  if (!intended) {
    return {
      overlay_risk: "high",
      offenders: [],
      reason: "missing-intended-target-substring",
      summary: "HALT · intended_target_substring was empty — refusing to assess.",
    };
  }

  // Handle-primary satisfaction (acer 2026-04-28): if the caller's
  // intended_target_window_id is enumerated in targets, we have a stable HWND
  // route — codepage-immune and stronger than any title-substring match.
  const handleRouteAvailable =
    typeof input.intended_target_window_id === "number" &&
    targets.some((t) => t.window_id === input.intended_target_window_id);

  // Guard 2 — agent-keyboard sentinel or empty foreground ⇒ HIGH (unless
  // handle route is available — then the empty-foreground is an acer-side
  // GetForegroundWindow blip that doesn't matter because /type targets HWND).
  if (foreground.toLowerCase() === FOREGROUND_FALLTHROUGH_SENTINEL.toLowerCase()) {
    reasons.push("foreground-fallthrough-sentinel");
  } else if (!foreground && !handleRouteAvailable) {
    reasons.push("foreground-empty");
  }

  // Identify overlay-capable offenders (any target whose process basename
  // matches the overlay-capable set).
  const offenders: WindowTarget[] = [];
  for (const t of targets) {
    const proc = basename(t.process);
    if (!proc) continue;
    if (!OVERLAY_CAPABLE_PROCESSES.has(proc)) continue;
    // If the title is an expected top title, downgrade — it's a known
    // legitimate terminal host, not an overlay.
    const title = (t.title ?? "").toLowerCase();
    if (title && expected.has(title)) continue;
    offenders.push(t);
  }

  // Foreground-substring check (or handle-route satisfaction).
  const foregroundMatches = foreground
    ? includesCI(foreground, intended)
    : false;
  const intendedSatisfied = foregroundMatches || handleRouteAvailable;

  // Escalate.
  if (!intendedSatisfied) reasons.push("foreground-substring-mismatch");
  if (offenders.length > 0) reasons.push("overlay-capable-processes-present");

  let overlay_risk: OverlayRisk;
  if (
    reasons.includes("foreground-fallthrough-sentinel") ||
    reasons.includes("foreground-empty") ||
    (offenders.length > 0 && !intendedSatisfied)
  ) {
    overlay_risk = "high";
  } else if (offenders.length > 0 && intendedSatisfied) {
    overlay_risk = "medium";
  } else if (!intendedSatisfied) {
    overlay_risk = "high";
  } else {
    overlay_risk = "low";
  }

  const reason = reasons.length === 0 ? "clean" : reasons.join("; ");
  const summary =
    overlay_risk === "low"
      ? `OVERLAY-RISK-LOW · foreground="${foreground}" matches "${intended}" · no overlay processes.`
      : `OVERLAY-RISK-${overlay_risk.toUpperCase()} · foreground="${foreground}" · offenders=${offenders
          .map((o) => `${basename(o.process)}${o.window_id ? `#${o.window_id}` : ""}`)
          .join(",") || "none"} · intended="${intended}" · reason=${reason}`;

  return { overlay_risk, offenders, reason, summary };
}
