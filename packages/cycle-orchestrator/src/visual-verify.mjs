// VISUAL-VERIFY · the eyes of the cycle
// Today: SMB log-tail (when Liris shares logs/) + file-drop round-trip as fallback
// Future: HDMI-frame capture via ffmpeg + OCR (awaits MS2109 grabber card)
// Future: USB HID-proxy for keystroke bypass (awaits Pi Pico)
//
// 2026-04-20 race-condition hardening (audit fixes #1–#5):
//   1. atomic write (.tmp → rename)
//   2. fsync-before-rename best-effort (swallow EINVAL on SMB)
//   3. pollLirisReplies wraps statSync (skip racing-deleted)
//   4. high-res id (hrtime_ns + 32-bit crypto random) — mtime+sha8 collisions gone
//   5. readdirSync ENOENT wrapped — share_unreachable verdict instead of throw

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { hrtime } from "node:process";

const LIRIS_SHARE = "//DESKTOP-J99VCNH/Users/rayss/Asolaria";
const LIRIS_VOTES = `${LIRIS_SHARE}/data/votes`;   // RW verified 2026-04-20
const LIRIS_LOGS  = `${LIRIS_SHARE}/logs`;         // pending share expansion
const LIRIS_CAP   = `${LIRIS_SHARE}/captures`;     // pending share expansion

// ─── fix #4: high-res collision-proof id ──────────────────────────────
// Format: acer-kick-${hrtime_ns}-${8-hex-chars (32-bit crypto random)}
// hrtime.bigint() returns ns-precision monotonic (vs Date.now() ms),
// and 2^32 random tail guarantees no collision even at 1M ids/sec.
export function mintKickId() {
  const ns = hrtime.bigint().toString();
  const rand = randomBytes(4).toString("hex");
  return `acer-kick-${ns}-${rand}`;
}

// ─── fixes #1 + #2: atomic write with fsync-before-rename ─────────────
// Write to path.tmp, fsync fd (best-effort on SMB), close, rename.
// Rename is atomic on NTFS + SMB2 (same dir, same volume).
// fsync errors are swallowed — older SMB servers return EINVAL.
export function atomicWriteJson(targetPath, obj) {
  const tmp = `${targetPath}.tmp`;
  const body = JSON.stringify(obj, null, 2);
  let fd;
  try {
    fd = openSync(tmp, "w");
    writeSync(fd, body);
    try { fsyncSync(fd); } catch (_) { /* SMB may not support — best-effort */ }
    closeSync(fd);
    fd = null;
    renameSync(tmp, targetPath);
    return { ok: true, path: targetPath, bytes: body.length };
  } catch (e) {
    if (fd !== undefined && fd !== null) {
      try { closeSync(fd); } catch (_) {}
    }
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch (_) {}
    return { ok: false, error: String(e && e.message || e) };
  }
}

export function fileDropKick(peer, { verb, text, expected_reply_verb = null, deadline_ms = 180_000 } = {}) {
  if (peer !== "liris") return { ok: false, error: "only liris supported today (no inbox for other peers)" };
  const id = mintKickId();
  const payload = {
    id,
    from: "acer", to: "liris", verb,
    ts: new Date().toISOString(),
    text,
    expected_reply_verb,
    reply_deadline_iso: new Date(Date.now() + deadline_ms).toISOString(),
  };
  const path = `${LIRIS_VOTES}/${id}.json`;
  const w = atomicWriteJson(path, payload);
  if (!w.ok) return { ok: false, error: w.error, id, path };
  return {
    ok: true,
    id,
    path,
    sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

// ─── fixes #3 + #5: racing-delete safe + share_unreachable verdict ────
export function pollLirisReplies(sinceMs = 0) {
  let entries;
  try {
    entries = readdirSync(LIRIS_VOTES, { withFileTypes: true });
  } catch (e) {
    // ENOENT / EPERM / SMB down → share_unreachable (never throw)
    return { ok: false, error: "share_unreachable", cause: String(e && e.code || e.message || e) };
  }
  const all = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.startsWith("LIRIS-REPLY-")) continue;
    let mtime_ms;
    try {
      mtime_ms = statSync(`${LIRIS_VOTES}/${e.name}`).mtime.getTime();
    } catch (_) {
      // fix #3: file race-deleted between readdir and stat — skip silently
      continue;
    }
    if (mtime_ms > sinceMs) all.push({ name: e.name, mtime_ms });
  }
  all.sort((a, b) => a.mtime_ms - b.mtime_ms);
  return { ok: true, replies: all, cursor_ms: all.length ? all[all.length - 1].mtime_ms : sinceMs };
}

// Tail Liris's agent-keyboard.log via SMB (once she shares logs/)
export function tailLirisKeyboardLog({ sinceByte = 0, maxBytes = 65536 } = {}) {
  const p = `${LIRIS_LOGS}/agent-keyboard.log`;
  if (!existsSync(p)) return { ok: false, error: "logs/ not shared yet — ask Rayssa to expand share" };
  let s;
  try { s = statSync(p); } catch (e) { return { ok: false, error: "share_unreachable", cause: String(e.code || e.message) }; }
  const start = Math.max(0, s.size - maxBytes);
  const actualStart = Math.max(start, sinceByte);
  if (actualStart >= s.size) return { ok: true, new_bytes: 0, cursor: s.size };
  const buf = readFileSync(p).subarray(actualStart, s.size);
  return { ok: true, new_bytes: buf.length, text: buf.toString("utf8"), cursor: s.size };
}

// Read most recent Liris screenshot (once she shares captures/ + has a capture daemon writing)
export function readLatestLirisScreenshot() {
  let entries;
  try {
    entries = readdirSync(LIRIS_CAP, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: "captures/ not shared yet — ask Rayssa to expand share", cause: String(e.code || e.message) };
  }
  const files = [];
  for (const e of entries) {
    if (!(e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name))) continue;
    try {
      const mtime_ms = statSync(`${LIRIS_CAP}/${e.name}`).mtime.getTime();
      files.push({ name: e.name, mtime_ms });
    } catch (_) { continue; }
  }
  files.sort((a, b) => b.mtime_ms - a.mtime_ms);
  if (!files.length) return { ok: true, empty: true };
  return { ok: true, name: files[0].name, mtime_ms: files[0].mtime_ms, path: `${LIRIS_CAP}/${files[0].name}` };
}

// Placeholder for HDMI grabber (awaits MS2109 card) — ffmpeg dshow frame capture + OCR
export async function captureHdmiFrame({ device_name = "USB HDMI Grabber" } = {}) {
  return { ok: false, error: "HDMI grabber not installed yet — add USB MS2109 card to unblock pixel-verify" };
}

// Placeholder for USB HID proxy (awaits Pi Pico firmware)
export async function sendHidKeystrokes({ keystrokes = [] } = {}) {
  return { ok: false, error: "USB HID-proxy not installed yet — Pi Pico firmware + plug into rayssa" };
}

// Exported for tests (so tests don't hard-code the UNC path)
export const __paths = { LIRIS_SHARE, LIRIS_VOTES, LIRIS_LOGS, LIRIS_CAP };
