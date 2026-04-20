// packages/drift-broadcast/src/coalesce.ts — F-080 drift-broadcast dedupe + coalesce
//
// F-077/F-078/F-079 emits one drift-detected envelope per observation.
// Under sustained bad state the federation bus floods. F-080 collapses
// repeated drift events for the same (permanent_name, drift_kind) into
// a single rolling summary within a time window.
//
// Pure state machine — caller provides window_ms + inbound events; we
// return a list of envelopes to actually broadcast + the squash summary.

import type { DriftDetection, DriftBroadcastPayload } from "./broadcaster.ts";

export interface CoalesceState {
  // key = `${permanent_name}::${drift_kind}` → last-seen + seen-count
  seen: Record<string, { first_ts: string; last_ts: string; count: number; last_detection: DriftDetection }>;
  window_ms: number;
  max_suppressed: number;  // if count exceeds this we re-emit with a summary glyph
}

export interface CoalesceStep {
  action: "broadcast" | "suppress" | "resummarize";
  key: string;
  reason: string;
  payload?: DriftBroadcastPayload;           // filled on broadcast/resummarize
  suppressed_count?: number;                 // count we absorbed
  glyph_sentence: string;
}

export function makeCoalesceState(window_ms: number, max_suppressed: number = 50): CoalesceState {
  return { seen: {}, window_ms, max_suppressed };
}

function keyOf(d: DriftDetection): string { return `${d.permanent_name}::${d.drift_kind}`; }

export function observeDrift(state: CoalesceState, detection: DriftDetection, now: string, actor: string = "acer"): CoalesceStep {
  const k = keyOf(detection);
  const prior = state.seen[k];
  const nowMs = Date.parse(now);

  if (!prior || (nowMs - Date.parse(prior.last_ts)) > state.window_ms) {
    // First observation in this window — broadcast + start counter
    state.seen[k] = { first_ts: now, last_ts: now, count: 1, last_detection: detection };
    const payload: DriftBroadcastPayload = {
      actor,
      verb: "drift-detected",
      target: "federation",
      detection,
      ts: now,
    };
    return {
      action: "broadcast",
      key: k,
      reason: "first observation in window",
      payload,
      suppressed_count: 0,
      glyph_sentence: `EVT-DRIFT-COALESCE-BROADCAST · key=${k} · first-in-window @ M-EYEWITNESS .`,
    };
  }

  // Within window — increment count
  prior.count++;
  prior.last_ts = now;
  prior.last_detection = detection;

  if (prior.count >= state.max_suppressed) {
    // Too many — escalate with a resummarize broadcast
    const squashed = prior.count;
    prior.count = 0;
    prior.first_ts = now;
    const payload: DriftBroadcastPayload = {
      actor,
      verb: "drift-detected",
      target: "federation",
      detection: {
        ...detection,
        drift_log_entries: [...detection.drift_log_entries.slice(0, 3), {
          at: now, kind: "coalesce-summary" as any, detail: `suppressed ${squashed} identical drifts since ${prior.first_ts}`,
        } as any],
      },
      ts: now,
    };
    return {
      action: "resummarize",
      key: k,
      reason: `${squashed} suppressed; escalating summary`,
      payload,
      suppressed_count: squashed,
      glyph_sentence: `EVT-DRIFT-COALESCE-ESCALATE · key=${k} · suppressed=${squashed} · threshold=${state.max_suppressed} @ M-EYEWITNESS .`,
    };
  }

  return {
    action: "suppress",
    key: k,
    reason: `duplicate within ${state.window_ms}ms window (count=${prior.count})`,
    suppressed_count: 1,
    glyph_sentence: `EVT-DRIFT-COALESCE-SUPPRESS · key=${k} · count=${prior.count}/${state.max_suppressed} @ M-INDICATIVE .`,
  };
}

export interface CoalesceSummary {
  keys_tracked: number;
  total_events_seen: number;
  total_broadcasts: number;
  total_suppressed: number;
  total_resummarized: number;
}

export function summarize(state: CoalesceState): CoalesceSummary {
  let total = 0, tracked = 0;
  for (const k of Object.keys(state.seen)) {
    tracked++;
    total += state.seen[k].count;
  }
  return {
    keys_tracked: tracked,
    total_events_seen: total,
    total_broadcasts: 0,    // caller tallies from steps
    total_suppressed: 0,
    total_resummarized: 0,
  };
}

// Convenience: feed a stream of detections and return (broadcast list, stats)
export function coalesceStream(state: CoalesceState, detections: Array<{ detection: DriftDetection; at: string; actor?: string }>): {
  steps: CoalesceStep[];
  broadcast_count: number;
  suppress_count: number;
  resummarize_count: number;
  glyph_sentence: string;
} {
  const steps: CoalesceStep[] = [];
  let b = 0, s = 0, r = 0;
  for (const item of detections) {
    const step = observeDrift(state, item.detection, item.at, item.actor ?? "acer");
    steps.push(step);
    if (step.action === "broadcast") b++;
    else if (step.action === "suppress") s++;
    else if (step.action === "resummarize") r++;
  }
  return {
    steps, broadcast_count: b, suppress_count: s, resummarize_count: r,
    glyph_sentence: `EVT-DRIFT-COALESCE-STREAM · in=${detections.length} · broadcast=${b} · suppressed=${s} · resummarized=${r} @ M-INDICATIVE .`,
  };
}
