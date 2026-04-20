// Remote-Control Claude Supervisor
// Whiteroomed from observed aether-remote-control HTTP bridge (:8765)
// Observed routes: / /health /proc (open) · /exec /write /read /ls (bearer auth)
// Auth: Bearer token read from device-local path or env/config

import { readFileSync, existsSync } from "node:fs";
import { emitEnvelope } from "../../pid-targeted-kick-supervisor/src/bus-fire-with-retry.mjs";

// Known nodes (extend as new remote-control bridges come online)
export const BRIDGES = {
  aether: {
    name: "aether",
    base_url: "http://192.168.1.7:8765",
    device: "SM-A065M (A06)",
    colony: "COL-FELIPE",
    room: 40,
    prof: "PROF-AETHER-EDGE-AGENT",
    token_path_device: "/sdcard/aether-remote.token",
    token_env: "AETHER_REMOTE_CONTROL_TOKEN",
  },
};

// Token loader: env first, then local cache file (filled by relay from Jesse), else null
function loadToken(bridgeKey, opts = {}) {
  const b = BRIDGES[bridgeKey] || {};
  if (opts.token) return opts.token;
  if (b.token_env && process.env[b.token_env]) return process.env[b.token_env];
  const cache = opts.token_cache_path || `C:/Users/acer/.asolaria-workers/tokens/${bridgeKey}-remote.token`;
  if (existsSync(cache)) return readFileSync(cache, "utf8").trim();
  return null;
}

async function call(bridgeKey, path, { method = "GET", body = null, token = null, timeoutMs = 15_000 } = {}) {
  const b = BRIDGES[bridgeKey];
  if (!b) throw new Error(`unknown bridge: ${bridgeKey}`);
  const url = `${b.base_url}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const r = await fetch(url, {
      method, headers,
      body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ct = r.headers.get("content-type") || "";
    const out = ct.includes("application/json") ? await r.json().catch(() => ({})) : await r.text();
    return { ok: r.ok, status: r.status, body: out };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

// Public API (open / no auth needed)
export async function health(bridgeKey) { return call(bridgeKey, "/health"); }
export async function dashboard(bridgeKey) { return call(bridgeKey, "/"); }
export async function proc(bridgeKey) { return call(bridgeKey, "/proc"); }

// Auth-gated surface
export async function exec(bridgeKey, cmd, opts = {}) {
  const token = loadToken(bridgeKey, opts);
  if (!token) return { ok: false, status: 401, error: "no-token-available", hint: `set ${BRIDGES[bridgeKey]?.token_env || "TOKEN"} or request jesse relay` };
  const r = await call(bridgeKey, "/exec", { method: "POST", body: { cmd }, token });
  if (opts.bus_announce !== false) {
    await emitEnvelope({
      verb: "EVT-REMOTE-CONTROL-EXEC",
      payload: `remote exec on ${bridgeKey} · cmd=${cmd.slice(0,80)} · status=${r.status}`,
      body: { bridge: bridgeKey, cmd, status: r.status, truncated_stdout: (typeof r.body === "object" ? (r.body.stdout || "").slice(0,400) : "") },
      retry: false,
    });
  }
  return r;
}

export async function writeFile(bridgeKey, path, content, opts = {}) {
  const token = loadToken(bridgeKey, opts);
  if (!token) return { ok: false, status: 401, error: "no-token-available" };
  return call(bridgeKey, "/write", { method: "POST", body: { path, content }, token });
}

export async function readFileRemote(bridgeKey, path, opts = {}) {
  const token = loadToken(bridgeKey, opts);
  if (!token) return { ok: false, status: 401, error: "no-token-available" };
  return call(bridgeKey, "/read", { method: "POST", body: { path }, token });
}

export async function lsRemote(bridgeKey, path, opts = {}) {
  const token = loadToken(bridgeKey, opts);
  if (!token) return { ok: false, status: 401, error: "no-token-available" };
  return call(bridgeKey, "/ls", { method: "POST", body: { path }, token });
}

// High-level helpers
export async function probeBridge(bridgeKey) {
  const h = await health(bridgeKey);
  const p = await proc(bridgeKey);
  const procList = (p.body && p.body.procs) || [];
  return {
    ok: h.ok && p.ok,
    health: h.body,
    proc_count: procList.length,
    claude_code_detected: procList.some(line => /claude|codex|node.*asolaria/i.test(line)),
    termux_ncat_portals_detected: procList.filter(l => /ncat -lk/.test(l)).length,
    aether_remote_control_running: procList.some(l => /aether-remote-control/.test(l)),
    raw_proc_top: procList.slice(0, 10),
  };
}

export async function tokenAvailable(bridgeKey) {
  return loadToken(bridgeKey) !== null;
}

// Accept a jesse-relayed token and cache it locally
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function cacheToken(bridgeKey, token) {
  const path = `C:/Users/acer/.asolaria-workers/tokens/${bridgeKey}-remote.token`;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, token);
  return { ok: true, path };
}
