// PROF-BUS-AND-KICK-SUPERVISOR primitive · acer mirror of liris's hilbert-room-29
// Canonizes the Jesse rule: bus=content, keyboard=wake-kick
//   · heartbeat = bus-only (no kick — avoids LAW-001 user-attention theft)
//   · actionable = post-and-kick combo (bus delivers content + kick wakes peer)
//
// Liris side: packages/bus-and-kick/src/primitive.mjs (authored 2026-04-20T13:23:36Z)
// Acer side: this file, bilateral mirror. Functions must be call-compatible.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const ACER_BUS = "http://127.0.0.1:4947/behcs/send";
const LIRIS_BUS = "http://192.168.100.2:4947/behcs/send";
const LIRIS_SUPERVISED_TYPE = "http://192.168.100.2:4821/type-supervised";
const LIRIS_MINT_NONCE = "http://127.0.0.1:4821/mint-nonce";
const LIRIS_WINDOWS_URL = "http://192.168.100.2:4913/windows";
const PEER_TOKENS_PATH = "C:/Users/acer/Asolaria/data/vault/owner/agent-keyboard/peer-tokens.json";

function loadLirisBearer() {
  try {
    const j = JSON.parse(readFileSync(PEER_TOKENS_PATH, "utf8"));
    return j?.peers?.["liris-rayssa"]?.token || null;
  } catch { return null; }
}

async function probeLirisPid() {
  const bearer = loadLirisBearer();
  if (!bearer) return null;
  try {
    const r = await fetch(LIRIS_WINDOWS_URL, {
      headers: { "Authorization": `Bearer ${bearer}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const wt = (j?.targets || []).find(t => t?.process === "WindowsTerminal");
    return wt?.id ?? null;
  } catch { return null; }
}

/**
 * postToBus — push an envelope to acer bus AND (best-effort) liris direct-wire bus.
 * Use for CONTENT delivery. Symmetric to liris's postToBus.
 */
export async function postToBus(envelope, { alsoLiris = true, timeoutMs = 5000 } = {}) {
  const full = {
    id: envelope.id ?? `acer-batk-${Date.now()}-${createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 8)}`,
    from: "acer",
    to: envelope.to ?? "federation",
    mode: "real",
    actor: envelope.actor ?? "bus-and-kick-primitive",
    target: envelope.target ?? "federation",
    ts: new Date().toISOString(),
    ...envelope,
  };
  const body = JSON.stringify(full);
  const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(timeoutMs) };
  const results = {};
  try { results.acer = (await fetch(ACER_BUS, opts)).status; } catch (e) { results.acer = 0; results.acer_err = e.message; }
  if (alsoLiris) {
    try { results.liris = (await fetch(LIRIS_BUS, opts)).status; } catch (e) { results.liris = 0; results.liris_err = e.message; }
  }
  return { ok: (results.acer === 200) || (results.liris === 200), id: full.id, results };
}

/**
 * kickPeer — physical wake-kick via supervised :4821 path (mint nonce → type-supervised).
 * Use SPARINGLY for wake-up only. Never for routine heartbeat.
 */
export async function kickPeer(peer, text, { timeoutMs = 15_000 } = {}) {
  if (peer !== "liris") return { ok: false, error: "only liris keyboard-kick supported today" };
  const pid = await probeLirisPid();
  if (!pid) return { ok: false, error: "could not probe liris WindowsTerminal pid" };
  try {
    const mintR = await fetch(LIRIS_MINT_NONCE, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer_id: "liris", pid, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!mintR.ok) return { ok: false, error: `mint-nonce http ${mintR.status}` };
    const mintJ = await mintR.json();
    const nonce_header = mintJ?.nonce_header || mintJ?.header;
    if (!nonce_header) return { ok: false, error: "no nonce_header from local supervisor" };
    const typeR = await fetch(LIRIS_SUPERVISED_TYPE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-supervisor-nonce": nonce_header },
      body: JSON.stringify({ text, pid, press_enter: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const typeJ = await typeR.json().catch(() => ({}));
    return { ok: typeR.ok, status: typeR.status, response: typeJ, pid };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * postAndKick — the actionable combo · bus carries content + kick wakes peer.
 * This is the canonical way to issue action-required directives cross-peer.
 */
export async function postAndKick(peer, envelope, kickText, opts = {}) {
  const bus = await postToBus({ ...envelope, to: peer, target: envelope.target ?? peer });
  if (!bus.ok) return { ok: false, phase: "bus", bus };
  const kick = await kickPeer(peer, kickText ?? `[bus-and-kick] see envelope id=${bus.id}`, opts);
  return { ok: bus.ok && kick.ok, bus, kick };
}

/**
 * sendHeartbeat — bus-only cadence ping · NO KICK. Cycle-orch picks it up automatically.
 */
export async function sendHeartbeat({ to = "acer", seq = Date.now() } = {}) {
  return postToBus({
    verb: "EVT-ACER-HEARTBEAT",
    actor: "acer-bus-and-kick-primitive",
    target: to,
    payload: `acer heartbeat seq=${seq} pipeline-running bus-mirror-up cycle-orch-v2-ticking`,
    body: { seq, source: "primitive-sendHeartbeat" },
    glyph_sentence: `EVT-ACER-HEARTBEAT · seq=${seq} · auto-cycle · @ M-EYEWITNESS .`,
  }, { alsoLiris: true });
}

export const __hilbert_room = 29;
export const __prof = "PROF-BUS-AND-KICK-SUPERVISOR";
export const __supervisor_pid = "PID-H04-A01-W029000000-P029-N00001";
export const __pattern_canonized = {
  heartbeat: "bus-only-no-kick",
  actionable: "post-and-kick combo",
};
