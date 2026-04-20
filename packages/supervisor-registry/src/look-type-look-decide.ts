// look-type-look-decide.ts — LAW-012 cycle in BEHCS-256.
//
// Jesse 2026-04-18: "Omnikeyboard supervisor needs to work WITH omnivisual
// systems to see and type and verify and enter or correct. We already made
// this system ... but not with BEHCS 256."
//
// This wires the pre-existing agent-keyboard.js + behcs-screen-capture.ps1
// pair into a BEHCS-256-speaking cycle. Every phase emits a glyph sentence
// to omnikeyboard-events.ndjson + vision-events.ndjson (GC+Gulp covered):
//
//   1. LOOK-PRE   OP-CAPTURE-SCREEN · OP-PROBE-STATUS { acer }
//                 → EVT-PRE-TYPE-STATE · foreground=<title> · png=<path>
//   2. THINK      if foreground matches intended target → CONTINUE
//                 else → EVT-HALT · misaligned-target
//   3. TYPE       OP-TYPE { text, press_enter } via agent-keyboard
//                 → EVT-OMNIKEYBOARD-TYPE · http-status
//   4. LOOK-POST  same probes again
//                 → EVT-POST-TYPE-STATE · foreground=<title>
//   5. DECIDE     compare pre vs post + HTTP status
//                 → EVT-LOOK-TYPE-VERIFIED · outcome={ok | retry | correct}

import { execSync } from "node:child_process";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import http from "node:http";

const ASOLARIA_LEGACY = "C:/Users/rayss/Asolaria";
const CAPTURE_SCRIPT = join(ASOLARIA_LEGACY, "tools", "behcs-screen-capture.ps1");
const CAPTURES_DIR   = join(ASOLARIA_LEGACY, "logs", "captures");
const PEER_TOKENS    = join(ASOLARIA_LEGACY, "data", "vault", "owner", "agent-keyboard", "peer-tokens.json");

const EVENTS_ROOT = join(homedir(), ".asolaria-workers");
const VISION_EVENTS       = join(EVENTS_ROOT, "vision-events.ndjson");
const OMNIKEYBOARD_EVENTS = join(EVENTS_ROOT, "omnikeyboard-events.ndjson");
mkdirSync(EVENTS_ROOT, { recursive: true });

function emit(file: string, rec: Record<string, unknown>): void {
  try { appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n"); }
  catch { /* non-fatal */ }
}

function loadAcerPeer(): { endpoint: string; token: string } | null {
  if (!existsSync(PEER_TOKENS)) return null;
  try {
    const v = JSON.parse(readFileSync(PEER_TOKENS, "utf-8")) as { peers?: Record<string, { endpoint?: string; token?: string }> };
    const p = v.peers?.acer;
    if (!p?.endpoint || !p.token) return null;
    return { endpoint: p.endpoint, token: p.token };
  } catch { return null; }
}

// ── OP-CAPTURE-SCREEN (VISION) ──────────────────────────────────────────────
export function captureLocalScreen(tag: string): { ok: boolean; path: string | null; error?: string } {
  if (!existsSync(CAPTURE_SCRIPT)) {
    const rec = { event: "EVT-VISION-CAPTURE-FAILED", reason: "script-missing", tag, glyph_sentence: `EVT-VISION-CAPTURE-FAILED · script-missing · ${tag} @ M-SUBJUNCTIVE .` };
    emit(VISION_EVENTS, rec);
    return { ok: false, path: null, error: "capture script missing" };
  }
  mkdirSync(CAPTURES_DIR, { recursive: true });
  const outPath = join(CAPTURES_DIR, `behcs-${tag}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${CAPTURE_SCRIPT}" "${outPath}"`, { stdio: "ignore", timeout: 10_000 });
    const rec = { event: "EVT-VISION-CAPTURE", tag, path: outPath, glyph_sentence: `EVT-VISION-CAPTURE · ${tag} · ${outPath.replace(CAPTURES_DIR, "...")} @ M-EYEWITNESS .` };
    emit(VISION_EVENTS, rec);
    return { ok: true, path: outPath };
  } catch (e) {
    const rec = { event: "EVT-VISION-CAPTURE-FAILED", tag, error: (e as Error).message, glyph_sentence: `EVT-VISION-CAPTURE-FAILED · ${tag} · ${(e as Error).message.slice(0, 40)} @ M-SUBJUNCTIVE .` };
    emit(VISION_EVENTS, rec);
    return { ok: false, path: null, error: (e as Error).message };
  }
}

// ── OP-PROBE-STATUS (OMNIKEYBOARD) ──────────────────────────────────────────
export interface PeerStatus { ok: boolean; foreground?: string; windows?: string[]; enabled?: boolean; raw?: unknown; error?: string; }

export function probePeerStatus(endpoint: string, token: string): Promise<PeerStatus> {
  return new Promise((resolve) => {
    try {
      const u = new URL(endpoint + "/status");
      const req = http.request({
        host: u.hostname, port: parseInt(u.port, 10) || 80, path: u.pathname + u.search,
        method: "GET", headers: { "authorization": `Bearer ${token}` }, timeout: 3000,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            resolve({ ok: true, foreground: body.foreground, windows: body.windows, enabled: body.enabled, raw: body });
          } catch { resolve({ ok: false, error: "unparseable status body" }); }
        });
      });
      req.on("error", (e) => resolve({ ok: false, error: e.message }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: (e as Error).message }); }
  });
}

// ── OP-TYPE (OMNIKEYBOARD) ──────────────────────────────────────────────────
export function typeToPeer(endpoint: string, token: string, text: string, opts: { press_enter?: boolean; window_title?: string } = {}): Promise<{ ok: boolean; status: number; body?: unknown; error?: string }> {
  return new Promise((resolve) => {
    try {
      const u = new URL(endpoint + "/type");
      const payload = JSON.stringify({ text, press_enter: opts.press_enter ?? true, window_title: opts.window_title ?? "Claude Code" });
      const req = http.request({
        host: u.hostname, port: parseInt(u.port, 10) || 80, path: u.pathname + u.search,
        method: "POST", headers: { "authorization": `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(payload).toString() }, timeout: 5000,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let body: unknown = raw;
          try { body = JSON.parse(raw); } catch { /* keep raw */ }
          resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, body });
        });
      });
      req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
      req.write(payload); req.end();
    } catch (e) { resolve({ ok: false, status: 0, error: (e as Error).message }); }
  });
}

// ── OP-LOOK-TYPE-LOOK-DECIDE (full cycle) ───────────────────────────────────
export interface CycleInput {
  text: string;
  intended_window_title?: string;       // default "Claude Code"
  press_enter?: boolean;                // default true
  peer_endpoint_override?: string;      // default acer from vault
  peer_token_override?: string;         // default acer from vault
  skip_screen_capture?: boolean;        // default false
  correlation_id?: string;              // for cross-stream tracing
}

export interface CycleResult {
  correlation_id: string;
  steps: {
    look_pre:  { vision_path: string | null; peer_status: PeerStatus };
    think:    { foreground_aligned: boolean; intended: string; observed?: string };
    type:     { ok: boolean; status: number; error?: string };
    look_post: { vision_path: string | null; peer_status: PeerStatus };
    decide:   { outcome: "ok" | "retry" | "correct" | "halted-misaligned" | "error"; reason: string };
  };
  glyph_sentences: string[];
  ms: number;
}

export async function runLookTypeLookDecide(input: CycleInput): Promise<CycleResult> {
  const corr = input.correlation_id ?? `ltld-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const intended = input.intended_window_title ?? "Claude Code";

  // Resolve peer
  const vault = loadAcerPeer();
  const endpoint = input.peer_endpoint_override ?? vault?.endpoint ?? "http://192.168.100.1:4913";
  const token = input.peer_token_override ?? vault?.token ?? "";
  emit(OMNIKEYBOARD_EVENTS, {
    event: "EVT-CYCLE-STARTED", corr, endpoint, intended_window_title: intended, text_len: input.text.length,
    glyph_sentence: `EVT-CYCLE-STARTED { ${corr} } · LOOK-TYPE-LOOK-DECIDE · endpoint=${endpoint} · len=${input.text.length} @ M-INDICATIVE .`,
  });

  // STEP 1 — LOOK-PRE
  const preCapture = input.skip_screen_capture ? { ok: false, path: null } : captureLocalScreen(`${corr}-pre`);
  const preStatus = await probePeerStatus(endpoint, token);
  const sPre = `OP-LOOK-PRE · corr=${corr} · png=${preCapture.path ? "captured" : "skipped"} · foreground=${preStatus.foreground ?? "?"} @ M-EYEWITNESS .`;
  emit(OMNIKEYBOARD_EVENTS, { event: "EVT-PRE-TYPE-STATE", corr, vision_path: preCapture.path, peer_status: preStatus, glyph_sentence: sPre });

  // STEP 2 — THINK
  const observed = preStatus.foreground;
  const aligned = typeof observed === "string" && observed.toLowerCase().includes(intended.toLowerCase());
  const sThink = `OP-THINK · corr=${corr} · intended="${intended}" · observed="${observed ?? "?"}" · aligned=${aligned} @ M-${aligned ? "INDICATIVE" : "SUBJUNCTIVE"} .`;
  emit(OMNIKEYBOARD_EVENTS, { event: aligned ? "EVT-THINK-ALIGNED" : "EVT-THINK-MISALIGNED", corr, aligned, intended, observed, glyph_sentence: sThink });

  if (!aligned) {
    const sHalt = `EVT-HALT · corr=${corr} · misaligned-target · intended="${intended}" · observed="${observed ?? "?"}" @ M-SUBJUNCTIVE .`;
    emit(OMNIKEYBOARD_EVENTS, { event: "EVT-HALT-MISALIGNED-TARGET", corr, intended, observed, glyph_sentence: sHalt });
    return {
      correlation_id: corr,
      steps: {
        look_pre: { vision_path: preCapture.path, peer_status: preStatus },
        think: { foreground_aligned: false, intended, observed },
        type: { ok: false, status: 0, error: "halted-misaligned-target" },
        look_post: { vision_path: null, peer_status: { ok: false } },
        decide: { outcome: "halted-misaligned", reason: `foreground "${observed}" does not include "${intended}"` },
      },
      glyph_sentences: [sPre, sThink, sHalt],
      ms: Date.now() - startedAt,
    };
  }

  // STEP 3 — TYPE
  const typeResult = await typeToPeer(endpoint, token, input.text, { press_enter: input.press_enter ?? true, window_title: intended });
  const sType = `OP-TYPE · corr=${corr} · http=${typeResult.status} · press_enter=${input.press_enter ?? true} · window="${intended}" @ M-${typeResult.ok ? "EYEWITNESS" : "SUBJUNCTIVE"} .`;
  emit(OMNIKEYBOARD_EVENTS, { event: "EVT-OMNIKEYBOARD-TYPE", corr, ok: typeResult.ok, http_status: typeResult.status, body: typeResult.body, text_len: input.text.length, window_title: intended, glyph_sentence: sType });

  // STEP 4 — LOOK-POST
  const postCapture = input.skip_screen_capture ? { ok: false, path: null } : captureLocalScreen(`${corr}-post`);
  const postStatus = await probePeerStatus(endpoint, token);
  const sPost = `OP-LOOK-POST · corr=${corr} · png=${postCapture.path ? "captured" : "skipped"} · foreground=${postStatus.foreground ?? "?"} @ M-EYEWITNESS .`;
  emit(OMNIKEYBOARD_EVENTS, { event: "EVT-POST-TYPE-STATE", corr, vision_path: postCapture.path, peer_status: postStatus, glyph_sentence: sPost });

  // STEP 5 — DECIDE
  let outcome: CycleResult["steps"]["decide"]["outcome"] = "ok";
  let reason = "http OK + foreground still aligned";
  if (!typeResult.ok) { outcome = "error"; reason = `type failed http=${typeResult.status} err=${typeResult.error ?? "?"}`; }
  else if (typeof postStatus.foreground === "string" && !postStatus.foreground.toLowerCase().includes(intended.toLowerCase())) {
    outcome = "retry"; reason = `post-foreground shifted from "${observed}" to "${postStatus.foreground}"`;
  }
  const sDecide = `OP-DECIDE · corr=${corr} · outcome=${outcome} · reason="${reason.slice(0, 80)}" @ M-${outcome === "ok" ? "INDICATIVE" : "SUBJUNCTIVE"} .`;
  emit(OMNIKEYBOARD_EVENTS, { event: "EVT-LOOK-TYPE-VERIFIED", corr, outcome, reason, glyph_sentence: sDecide });

  return {
    correlation_id: corr,
    steps: {
      look_pre: { vision_path: preCapture.path, peer_status: preStatus },
      think: { foreground_aligned: true, intended, observed },
      type: { ok: typeResult.ok, status: typeResult.status, error: typeResult.error },
      look_post: { vision_path: postCapture.path, peer_status: postStatus },
      decide: { outcome, reason },
    },
    glyph_sentences: [sPre, sThink, sType, sPost, sDecide],
    ms: Date.now() - startedAt,
  };
}
