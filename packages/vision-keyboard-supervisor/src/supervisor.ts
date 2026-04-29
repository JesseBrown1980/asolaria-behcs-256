// supervisor.ts — main orchestrator. The ONLY entry point any caller should
// use to type to a peer. Never POSTs to /type unless the guard returns ok.
//
// Flow:
//   1. LOOK-PRE: probe /status, probe /windows, capture local screen (opt).
//   2. GUARD:    run pure guard (overlay-heuristics + ground-truth).
//   3. If HALT → emit EVT-HALT-VISION-MISMATCH + EVT-SUPERVISOR-ESCALATE →
//      return structured result. NEVER type. NEVER auto-retry.
//   4. If OK   → POST /type → emit EVT-OMNIKEYBOARD-TYPE → probe LOOK-POST →
//      emit EVT-POST-TYPE-STATE → EVT-LOOK-TYPE-VERIFIED.
//
// Why not wrap look-type-look-decide.ts from supervisor-registry?
//   Its THINK step trusts /status.foreground — which is exactly what lied in
//   the 2026-04-19 incident. Wiring through it would smuggle the bug back in.
//   We leave it unchanged (Frozen Polymorphism) as a lower-layer primitive:
//   callers that don't need vision can still use it directly, but anything
//   typing to a peer MUST go through this supervisor.

import http from "node:http";
import type { IncomingMessage } from "node:http";

import { guardTypeToPeer, type GuardResult, type OverlayRiskTolerance } from "./guard.ts";
import type {
  StatusSnapshot,
  WindowsSnapshot,
  VisionSignal,
} from "./foreground-ground-truth.ts";
import { attemptOverlayClear } from "./overlay-clear.ts";
import { emit, glyphSentence } from "./events.ts";

export interface SupervisorTransport {
  getStatus(endpoint: string, token: string, timeoutMs: number): Promise<StatusSnapshot>;
  getWindows(endpoint: string, token: string, timeoutMs: number): Promise<WindowsSnapshot>;
  postType(
    endpoint: string,
    token: string,
    body: { text: string; press_enter: boolean; window_title?: string; window_id?: number },
    timeoutMs: number,
  ): Promise<{ ok: boolean; status: number; body?: unknown; error?: string }>;
  captureVision?: (corr: string) => Promise<VisionSignal>;
}

export interface SupervisorInput {
  peer: string;
  peer_token: string;
  text: string;
  press_enter?: boolean;
  intended_target_substring: string;
  window_id?: number;
  window_title?: string;
  overlay_risk_tolerance?: OverlayRiskTolerance;
  expected_top_titles?: string[];
  transport?: SupervisorTransport;
  timeout_ms?: number;
  correlation_id?: string;
  /** Skip vision capture even if the transport supplies one. */
  skip_vision?: boolean;
}

export type SupervisorOutcome =
  | "typed-verified"
  | "typed-post-mismatch"
  | "halt-overlay"
  | "halt-ground-truth"
  | "halt-missing-peer-or-token"
  | "type-http-error";

export interface SupervisorResult {
  correlation_id: string;
  outcome: SupervisorOutcome;
  peer: string;
  guard: GuardResult;
  type_result?: { ok: boolean; status: number; body?: unknown; error?: string };
  post_state?: { status: StatusSnapshot; windows: WindowsSnapshot; vision?: VisionSignal };
  ms: number;
  escalation?: { required: boolean; reason: string };
}

function newCorr(): string {
  return `vks-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Default node:http transport — used when caller omits transport.
// ---------------------------------------------------------------------------
function parseUrl(endpointWithPath: string): { host: string; port: number; path: string } {
  const u = new URL(endpointWithPath);
  return { host: u.hostname, port: parseInt(u.port, 10) || 80, path: u.pathname + u.search };
}

function readBody(res: IncomingMessage): Promise<{ statusCode: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (c) => chunks.push(c as Buffer));
    res.on("end", () =>
      resolve({ statusCode: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString("utf-8") }),
    );
    res.on("error", reject);
  });
}

export const defaultTransport: SupervisorTransport = {
  async getStatus(endpoint, token, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const { host, port, path } = parseUrl(endpoint.replace(/\/+$/, "") + "/status");
        const req = http.request(
          { host, port, path, method: "GET", headers: { authorization: `Bearer ${token}` }, timeout: timeoutMs },
          (res) => {
            readBody(res).then(({ statusCode, raw }) => {
              if (statusCode < 200 || statusCode >= 300) {
                resolve({ ok: false, error: `http ${statusCode}` });
                return;
              }
              try {
                const j = JSON.parse(raw) as Partial<StatusSnapshot> & {
                  foreground?: string;
                  windows?: unknown;
                  targets?: unknown;
                  enabled?: boolean;
                };
                // Acer agent-keyboard ships {windows:string[], targets:object[]}.
                // Prefer targets[] (handle/process/title objects) over windows[] (titles).
                let windowsField: StatusSnapshot["windows"] | undefined;
                if (Array.isArray(j.targets)) {
                  windowsField = (j.targets as Array<Record<string, unknown>>).map((t) => ({
                    process: typeof t.process === "string" ? t.process : undefined,
                    title: typeof t.title === "string" ? t.title : undefined,
                    window_id: typeof t.handle === "number"
                      ? t.handle
                      : typeof t.window_id === "number"
                        ? t.window_id
                        : undefined,
                  }));
                } else if (Array.isArray(j.windows) && j.windows.every((x) => typeof x === "object")) {
                  windowsField = j.windows as StatusSnapshot["windows"];
                }
                resolve({
                  ok: true,
                  foreground: j.foreground,
                  windows: windowsField,
                  enabled: j.enabled,
                });
              } catch {
                resolve({ ok: false, error: "unparseable-status" });
              }
            });
          },
        );
        req.on("error", (e) => resolve({ ok: false, error: e.message }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
        req.end();
      } catch (e) {
        resolve({ ok: false, error: (e as Error).message });
      }
    });
  },

  async getWindows(endpoint, token, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const { host, port, path } = parseUrl(endpoint.replace(/\/+$/, "") + "/windows");
        const req = http.request(
          { host, port, path, method: "GET", headers: { authorization: `Bearer ${token}` }, timeout: timeoutMs },
          (res) => {
            readBody(res).then(({ statusCode, raw }) => {
              if (statusCode === 404) {
                // Peer doesn't expose /windows yet — honest unknown.
                resolve({ ok: false, error: "endpoint-absent-404" });
                return;
              }
              if (statusCode < 200 || statusCode >= 300) {
                resolve({ ok: false, error: `http ${statusCode}` });
                return;
              }
              try {
                const j = JSON.parse(raw) as { windows?: unknown; targets?: unknown };
                // Prefer targets[] (objects with handle/process/title) over
                // windows[] (which acer ships as string array).
                if (Array.isArray(j.targets)) {
                  const mapped = (j.targets as Array<Record<string, unknown>>).map((t) => ({
                    process: typeof t.process === "string" ? t.process : undefined,
                    title: typeof t.title === "string" ? t.title : undefined,
                    window_id: typeof t.handle === "number"
                      ? t.handle
                      : typeof t.window_id === "number"
                        ? t.window_id
                        : undefined,
                  }));
                  resolve({ ok: true, windows: mapped });
                } else if (
                  Array.isArray(j.windows) &&
                  j.windows.every((x) => typeof x === "object" && x !== null)
                ) {
                  resolve({ ok: true, windows: j.windows as WindowsSnapshot["windows"] });
                } else if (Array.isArray(j.windows)) {
                  // Strings-only — endpoint can't tell us object structure.
                  resolve({ ok: false, error: "endpoint-returns-string-only-windows" });
                } else {
                  resolve({ ok: false, error: "no-windows-array" });
                }
              } catch {
                resolve({ ok: false, error: "unparseable-windows" });
              }
            });
          },
        );
        req.on("error", (e) => resolve({ ok: false, error: e.message }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
        req.end();
      } catch (e) {
        resolve({ ok: false, error: (e as Error).message });
      }
    });
  },

  async postType(endpoint, token, body, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const { host, port, path } = parseUrl(endpoint.replace(/\/+$/, "") + "/type");
        const payload = JSON.stringify(body);
        const req = http.request(
          {
            host,
            port,
            path,
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload).toString(),
            },
            timeout: timeoutMs,
          },
          (res) => {
            readBody(res).then(({ statusCode, raw }) => {
              let parsed: unknown = raw;
              try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
              resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, body: parsed });
            });
          },
        );
        req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message }));
        req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
        req.write(payload);
        req.end();
      } catch (e) {
        resolve({ ok: false, status: 0, error: (e as Error).message });
      }
    });
  },
};

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * THE public API. Every liris→peer /type call goes through this.
 *
 * Guarantees:
 *  - Never calls postType when guard returns ok:false.
 *  - Never auto-retries on overlay HALT; returns with escalation required.
 *  - Always emits at least EVT-PRE-TYPE-STATE + one of
 *    {EVT-HALT-VISION-MISMATCH, EVT-OMNIKEYBOARD-TYPE}.
 */
export async function typeToPeerSupervised(input: SupervisorInput): Promise<SupervisorResult> {
  const corr = input.correlation_id ?? newCorr();
  const startedAt = Date.now();
  const transport = input.transport ?? defaultTransport;
  const timeout = input.timeout_ms ?? 5000;
  const tolerance = input.overlay_risk_tolerance ?? "low";

  // Pre-condition.
  if (!input.peer || !input.peer_token) {
    const stub: GuardResult = {
      ok: false,
      halt_reason: "missing-peer-or-token",
      overlay_offenders: [],
      recommended_action: "escalate-operator",
      overlay: { overlay_risk: "high", offenders: [], reason: "pre-flight", summary: "peer or token empty" },
      ground_truth: {
        consensus_foreground_matches_intended: false,
        per_source: [],
        overlay_offender_processes: [],
        overall: "unknown",
        saw_foreground_sentinel: false,
        summary: "not-probed",
      },
      summary: "GUARD-HALT · missing-peer-or-token",
    };
    return {
      correlation_id: corr,
      outcome: "halt-missing-peer-or-token",
      peer: input.peer,
      guard: stub,
      ms: Date.now() - startedAt,
      escalation: { required: true, reason: "missing-peer-or-token" },
    };
  }

  // STEP 1 — LOOK-PRE.
  const [status, windows, vision] = await Promise.all([
    transport.getStatus(input.peer, input.peer_token, timeout),
    transport.getWindows(input.peer, input.peer_token, timeout),
    input.skip_vision || !transport.captureVision
      ? Promise.resolve<VisionSignal>({ ok: false, error: "skipped-or-unavailable" })
      : transport.captureVision(corr + "-pre"),
  ]);

  emit({
    event: "EVT-PRE-TYPE-STATE",
    corr,
    peer: input.peer,
    intended_target_substring: input.intended_target_substring,
    foreground: status.foreground,
    window_count: windows.windows?.length ?? 0,
    vision_ok: vision.ok,
    glyph_sentence: glyphSentence(
      "EVT-PRE-TYPE-STATE",
      {
        corr,
        peer: input.peer,
        foreground: status.foreground ?? "?",
        windows: windows.windows?.length ?? 0,
        vision: vision.ok ? "ok" : "skip",
      },
      "EYEWITNESS",
    ),
  });

  // STEP 2 — GUARD.
  const guard = guardTypeToPeer({
    peer: input.peer,
    intended_target_substring: input.intended_target_substring,
    overlay_risk_tolerance: tolerance,
    expected_top_titles: input.expected_top_titles,
    intended_target_window_id: input.window_id,
    probes: {
      intended_target_substring: input.intended_target_substring,
      status,
      windows,
      vision,
      intended_target_window_id: input.window_id,
    },
  });

  if (!guard.ok) {
    emit({
      event: guard.overlay_offenders.length > 0 ? "EVT-OVERLAY-DETECTED" : "EVT-HALT-VISION-MISMATCH",
      corr,
      peer: input.peer,
      intended_target_substring: input.intended_target_substring,
      halt_reason: guard.halt_reason,
      offenders: guard.overlay_offenders.map((o) => ({
        process: o.process,
        title: o.title,
        window_id: o.window_id,
      })),
      overlay_risk: guard.overlay.overlay_risk,
      gt_overall: guard.ground_truth.overall,
      saw_foreground_sentinel: guard.ground_truth.saw_foreground_sentinel,
      recommended_action: guard.recommended_action,
      glyph_sentence: glyphSentence(
        "EVT-HALT-VISION-MISMATCH",
        {
          corr,
          peer: input.peer,
          reason: guard.halt_reason ?? "?",
          risk: guard.overlay.overlay_risk,
          action: guard.recommended_action,
        },
        "SUBJUNCTIVE",
      ),
    });

    // overlay-clear path if caller authorized and endpoint is ever available.
    if (guard.recommended_action === "minimize-overlays") {
      await attemptOverlayClear({
        corr,
        peer: input.peer,
        peer_token: input.peer_token,
        offenders: guard.overlay_offenders,
        endpoint_available: false, // today — always stub
      });
    }

    emit({
      event: "EVT-SUPERVISOR-ESCALATE",
      corr,
      peer: input.peer,
      reason: guard.halt_reason,
      recommendation: guard.recommended_action,
      glyph_sentence: glyphSentence(
        "EVT-SUPERVISOR-ESCALATE",
        { corr, peer: input.peer, reason: guard.halt_reason ?? "?", rec: guard.recommended_action },
        "SUBJUNCTIVE",
      ),
    });

    const outcome: SupervisorOutcome =
      guard.overlay_offenders.length > 0 ? "halt-overlay" : "halt-ground-truth";

    return {
      correlation_id: corr,
      outcome,
      peer: input.peer,
      guard,
      ms: Date.now() - startedAt,
      escalation: { required: true, reason: guard.halt_reason ?? "unknown" },
    };
  }

  // STEP 3 — TYPE. Guard green, call /type.
  // Acer agent-keyboard rate-limits per-IP at ~300ms across endpoints; the
  // pre-type LOOK-PRE probes (getStatus + getWindows) consume budget. Sleep
  // 400ms before posting so /type doesn't 429.
  await new Promise<void>((r) => setTimeout(r, 400));
  const typeResult = await transport.postType(
    input.peer,
    input.peer_token,
    {
      text: input.text,
      press_enter: input.press_enter ?? true,
      window_title: input.window_title,
      window_id: input.window_id,
    },
    timeout,
  );

  emit({
    event: "EVT-OMNIKEYBOARD-TYPE",
    corr,
    peer: input.peer,
    http_status: typeResult.status,
    ok: typeResult.ok,
    text_len: input.text.length,
    press_enter: input.press_enter ?? true,
    glyph_sentence: glyphSentence(
      "EVT-OMNIKEYBOARD-TYPE",
      {
        corr,
        peer: input.peer,
        http: typeResult.status,
        len: input.text.length,
        press_enter: input.press_enter ?? true,
      },
      typeResult.ok ? "EYEWITNESS" : "SUBJUNCTIVE",
    ),
  });

  // STEP 4 — LOOK-POST. Re-probe to verify target still aligned.
  const [postStatus, postWindows, postVision] = await Promise.all([
    transport.getStatus(input.peer, input.peer_token, timeout),
    transport.getWindows(input.peer, input.peer_token, timeout),
    input.skip_vision || !transport.captureVision
      ? Promise.resolve<VisionSignal>({ ok: false, error: "skipped-or-unavailable" })
      : transport.captureVision(corr + "-post"),
  ]);

  emit({
    event: "EVT-POST-TYPE-STATE",
    corr,
    peer: input.peer,
    post_foreground: postStatus.foreground,
    post_window_count: postWindows.windows?.length ?? 0,
    glyph_sentence: glyphSentence(
      "EVT-POST-TYPE-STATE",
      {
        corr,
        peer: input.peer,
        foreground: postStatus.foreground ?? "?",
        windows: postWindows.windows?.length ?? 0,
      },
      "EYEWITNESS",
    ),
  });

  // STEP 5 — DECIDE.
  let outcome: SupervisorOutcome;
  if (!typeResult.ok) {
    outcome = "type-http-error";
  } else {
    const postGuard = guardTypeToPeer({
      peer: input.peer,
      intended_target_substring: input.intended_target_substring,
      overlay_risk_tolerance: tolerance,
      expected_top_titles: input.expected_top_titles,
      intended_target_window_id: input.window_id,
      probes: {
        intended_target_substring: input.intended_target_substring,
        status: postStatus,
        windows: postWindows,
        vision: postVision,
        intended_target_window_id: input.window_id,
      },
    });
    outcome = postGuard.ok ? "typed-verified" : "typed-post-mismatch";
  }

  emit({
    event: "EVT-LOOK-TYPE-VERIFIED",
    corr,
    peer: input.peer,
    outcome,
    glyph_sentence: glyphSentence(
      "EVT-LOOK-TYPE-VERIFIED",
      { corr, peer: input.peer, outcome },
      outcome === "typed-verified" ? "INDICATIVE" : "SUBJUNCTIVE",
    ),
  });

  return {
    correlation_id: corr,
    outcome,
    peer: input.peer,
    guard,
    type_result: typeResult,
    post_state: { status: postStatus, windows: postWindows, vision: postVision },
    ms: Date.now() - startedAt,
    escalation:
      outcome === "typed-verified"
        ? undefined
        : { required: true, reason: `post-type outcome=${outcome}` },
  };
}
