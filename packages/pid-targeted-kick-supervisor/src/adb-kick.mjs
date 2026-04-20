// Canonical adb input text + screencap verify + pid-survival check
// Anti-patterns guarded: termux-toast (notify-only), foreground-steal (pid verified before+after)
// Proven on Falcon pid 3474 (WO-F2) and Aether pid 10646

import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

export const NODES = {
  falcon: { serial: "R5CXA4MGQXV", model: "SM-S721U1", room: 39, prof: "PROF-FALCON-FRONT-END-KICKER" },
  aether: { serial: "R9QY205KAKJ", model: "SM-A065M",  room: 40, prof: "PROF-AETHER-EDGE-AGENT" },
};

const SAFE_REPLACE = { " ": "_", "'": "", "\"": "", "`": "", "$": "", ";": "_", "&": "_and_", "|": "_" };

export function sanitizeForAdbInputText(msg) {
  return String(msg)
    .split("")
    .map(c => (SAFE_REPLACE[c] !== undefined ? SAFE_REPLACE[c] : c))
    .join("")
    .replace(/[^\x20-\x7E_]/g, "");
}

function runAdb(args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const cp = spawn("adb", args, { shell: false, windowsHide: true,
      env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
    let out = "", err = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, code: -1, out, err: err + "\nTIMEOUT" }); }, timeoutMs);
    cp.stdout.on("data", d => out += d.toString());
    cp.stderr.on("data", d => err += d.toString());
    cp.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }); });
    cp.on("error", e => { clearTimeout(t); resolve({ ok: false, code: -1, out, err: e.message }); });
  });
}

export async function listAuthorizedDevices() {
  const r = await runAdb(["devices", "-l"]);
  return (r.out || "").split("\n").slice(1).map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    return { serial: parts[0], state: parts[1] || "unknown", attrs: parts.slice(2).join(" ") };
  });
}

export async function probeTermuxPid(serial) {
  const r = await runAdb(["-s", serial, "shell", "pidof com.termux || true"]);
  const pids = (r.out || "").trim().split(/\s+/).filter(Boolean);
  return pids[0] || null;
}

/**
 * Canonical adb kick + verify pattern.
 *   1. pid-probe BEFORE
 *   2. input text + keyevent 66
 *   3. screencap -p + pull
 *   4. pid-probe AFTER (focus-steal / restart detection)
 *   5. return { verdict, sha256, bytes, pid_survived, ... }
 *
 * @param {"falcon"|"aether"|string} nodeOrSerial
 * @param {string} text
 * @param {object} opts { outDir, captureOnly = false, sanitize = true, deadline_ms = 20000 }
 */
export async function kickNode(nodeOrSerial, text, opts = {}) {
  const node = NODES[nodeOrSerial];
  const serial = node ? node.serial : nodeOrSerial;
  const outDir = opts.outDir || "C:/asolaria-acer/tmp/pid-targeted-kick-supervisor";
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const deadline_ms = opts.deadline_ms || 20_000;

  const pidBefore = await probeTermuxPid(serial);
  if (!pidBefore) return { ok: false, phase: "pid-probe-before", reason: "no_termux_pid", serial };

  const sanitized = opts.sanitize === false ? String(text) : sanitizeForAdbInputText(text);

  let typeRes = { ok: true, skipped: true };
  if (!opts.captureOnly) {
    typeRes = await runAdb(["-s", serial, "shell", `input text '${sanitized}' && input keyevent 66`], deadline_ms);
    if (!typeRes.ok) return { ok: false, phase: "type", serial, pidBefore, sanitized, err: typeRes.err };
  }

  const devPng = `/sdcard/Documents/kick-verify-${Date.now()}.png`;
  const cap = await runAdb(["-s", serial, "shell", `screencap -p ${devPng}`], deadline_ms);
  if (!cap.ok) return { ok: false, phase: "screencap", serial, pidBefore, sanitized, err: cap.err };

  const localPng = `${outDir}/${nodeOrSerial}-${Date.now()}.png`;
  const dir = dirname(localPng);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pull = await runAdb(["-s", serial, "pull", devPng, localPng], deadline_ms);
  if (!pull.ok) return { ok: false, phase: "pull", serial, pidBefore, sanitized, err: pull.err };

  let sha256 = null, bytes = 0;
  if (existsSync(localPng)) {
    const buf = readFileSync(localPng);
    bytes = buf.length;
    sha256 = createHash("sha256").update(buf).digest("hex");
  }

  const pidAfter = await probeTermuxPid(serial);
  const pid_survived = pidBefore && pidBefore === pidAfter;

  return {
    ok: true,
    node: node ? nodeOrSerial : "custom",
    serial,
    model: node?.model,
    room: node?.room,
    prof: node?.prof,
    sanitized,
    typed_chars: sanitized.length,
    pid_before: pidBefore,
    pid_after: pidAfter,
    pid_survived,
    screencap: { device_path: devPng, local_path: localPng, bytes, sha256 },
    verdict: (typeRes.ok && pid_survived && bytes > 0) ? "PASS" : "INVESTIGATE",
    anti_patterns_guarded: ["termux-toast (notify-only)", "focus-steal (pid verified before+after)"],
  };
}

// Pid-targeted probe WITHOUT kick (for location/survival testing)
export async function findPidLocation(pid, nodeNames = ["falcon", "aether"]) {
  const results = {};
  for (const name of nodeNames) {
    const node = NODES[name];
    if (!node) continue;
    const r = await runAdb(["-s", node.serial, "shell",
      `if [ -d /proc/${pid} ]; then echo PRESENT; cat /proc/${pid}/cmdline | tr '\\000' ' '; echo; else echo ABSENT; fi`]);
    const out = (r.out || "");
    // Match whole-word PRESENT only (avoid NOT_FOUND trap of naive substring)
    const present = /(^|\s)PRESENT(\s|$)/.test(out);
    results[name] = { serial: node.serial, pid_exists: present, raw: out.trim() };
  }
  return results;
}
