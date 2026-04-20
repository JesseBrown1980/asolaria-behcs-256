// Liris frontend kick: /windows probe + /type with explicit pid (HARD RULE: re-probe every kick)
// Config loaded from act-supervisor/config.json (shared source of truth for peer bearer)

import { readFileSync } from "node:fs";

const DEFAULT_CONFIG = "C:/asolaria-acer/packages/act-supervisor/config.json";

export function loadLirisConfig(path = DEFAULT_CONFIG) {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (!cfg.peers || !cfg.peers.liris) throw new Error("liris peer missing from config");
  return cfg.peers.liris;
}

// SendKeys sanitization: strip { } + ^ % ~ ( ) — Windows SendKeys syntax chars
export function sanitizeSendKeys(s) {
  return String(s).replace(/[{}]/g, "").replace(/[+^%~()]/g, "");
}

export async function probeLirisWindows(peer, timeoutMs = 5000) {
  try {
    const r = await fetch(`http://${peer.ip}:${peer.port}/windows`, {
      headers: { "Authorization": `Bearer ${peer.bearer}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await r.json();
    const wt = (j.targets || []).find(t => t.process === "WindowsTerminal");
    return { ok: r.ok, status: r.status, pid: wt?.id || null, title: wt?.title || null, handle: wt?.handle || null, all_targets: j.targets || [] };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

/**
 * Kick liris frontend with mandatory pid re-probe.
 * @param {string} text
 * @param {object} opts { press_enter = true, timeout_ms = 30000, configPath, peerOverride }
 */
export async function kickLiris(text, opts = {}) {
  const peer = opts.peerOverride || loadLirisConfig(opts.configPath);
  const probe = await probeLirisWindows(peer);
  if (!probe.ok || !probe.pid) {
    return { ok: false, phase: "probe", error: probe.error || "no-WindowsTerminal-target", probe };
  }
  const sanitized = sanitizeSendKeys(text);
  try {
    const r = await fetch(`http://${peer.ip}:${peer.port}/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${peer.bearer}` },
      body: JSON.stringify({ text: sanitized, press_enter: opts.press_enter !== false, pid: probe.pid }),
      signal: AbortSignal.timeout(opts.timeout_ms || 30_000),
    });
    const j = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      status: r.status,
      response: j,
      typed_chars: j.typed || sanitized.length,
      pid_used: probe.pid,
      title: probe.title,
      foreground_flag: j.window_id === null && j.window_title === "<foreground>",
    };
  } catch (e) {
    return { ok: false, phase: "type", error: String(e.message || e), pid: probe.pid };
  }
}
