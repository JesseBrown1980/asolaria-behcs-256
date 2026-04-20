// Canonical ADB input + screencap verify pattern · proven on Falcon 2026-04-20.
// Never use the termux-toast :4913 path for typing into Claude Code — only NOTIFIES, doesn't TYPE.
// adb shell input text lands in the foreground app (Termux Claude Code) directly.

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const SAFE_REPLACE = { " ": "_", "'": "", "\"": "", "`": "", "$": "", ";": "_", "&": "_and_", "|": "_" };

export function sanitizeForAdbInputText(msg) {
  // adb shell input text splits on spaces + is shell-evaluated; replace unsafe chars
  return String(msg)
    .split("")
    .map(c => (SAFE_REPLACE[c] !== undefined ? SAFE_REPLACE[c] : c))
    .join("")
    .replace(/[^\x20-\x7E_]/g, ""); // strip non-ASCII
}

function runAdb(args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const cp = spawn("adb", args, { shell: false, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
    let out = "", err = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, code: -1, out, err: err + "\nTIMEOUT" }); }, timeoutMs);
    cp.stdout.on("data", d => out += d.toString());
    cp.stderr.on("data", d => err += d.toString());
    cp.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }); });
    cp.on("error", e => { clearTimeout(t); resolve({ ok: false, code: -1, out, err: e.message }); });
  });
}

/**
 * Type a message into the foreground Claude Code session of a phone, press Enter, then screencap for visual verify.
 * @param {string} serial - adb device serial (e.g. "R5CXA4MGQXV")
 * @param {string} text   - raw text; will be sanitized (spaces→underscores, unsafe chars stripped)
 * @param {string} outPngPath - where to save the verify screencap
 * @returns {{ok, typed, sanitized, verify_png_path, err}}
 */
export async function adbKickAndVerify(serial, text, outPngPath) {
  const sanitized = sanitizeForAdbInputText(text);
  // 1. Type text + Enter in one shell invocation
  const typeRes = await runAdb(["-s", serial, "shell", `input text '${sanitized}' && input keyevent 66`]);
  if (!typeRes.ok) return { ok: false, phase: "type", typed: sanitized.length, sanitized, err: typeRes.err };

  // 2. Screencap on device to fixed path
  const capRes = await runAdb(["-s", serial, "shell", "screencap -p > /sdcard/Documents/verify.png"]);
  if (!capRes.ok) return { ok: false, phase: "screencap", typed: sanitized.length, sanitized, err: capRes.err };

  // 3. Pull to local
  if (outPngPath) {
    const dir = dirname(outPngPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const pullRes = await runAdb(["-s", serial, "pull", "/sdcard/Documents/verify.png", outPngPath]);
    if (!pullRes.ok) return { ok: false, phase: "pull", typed: sanitized.length, sanitized, err: pullRes.err };
  }

  return { ok: true, phase: "done", typed: sanitized.length, sanitized, verify_png_path: outPngPath };
}

/**
 * List currently adb-authorized devices
 */
export async function listAdbDevices() {
  const r = await runAdb(["devices", "-l"]);
  const lines = (r.out || "").split("\n").slice(1).map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(/\s+/);
    return { serial: parts[0], state: parts[1] || "unknown", attrs: parts.slice(2).join(" ") };
  });
}
