// @asolaria/glyph-instrument
// Wraps any supervisor's log/emit calls with BEHCS-256 glyph dimensions.
// Contract: every op → attaches { D1, D2, D11?, D_room?, M } so the glyph system
// can index, correlate, and route.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const codex = require("C:/Users/acer/Asolaria/tools/behcs/codex-bridge.js");

/**
 * Room map (Brown-Hilbert Hotel rooms 24-40). Extend as new supervisors arrive.
 */
export const ROOM_MAP = {
  "gc":                        24,
  "gnn":                       25,
  "unison-processor":          26,
  "supervisor-daemon":         27,
  "bus-mirror":                28,
  "bus-and-kick":              29,
  "agent-auditor":             30,
  "agent-gulp-state":          31,
  "agent-heartbeat-watcher":   32,
  "agent-bus-inspector":       33,
  "agent-whiteroom-digester":  34,
  "gc-inbox-supervisor":       35,
  "message-tracker":           36,
  "super-gulp":                37,
  "gc-gnn-feeder":             38,
  "falcon-front-end-kicker":   39,
  "aether-edge-agent":         40,
  "meta-supervisor-hermes":    41,  // new in v5
  "rose":                      42,  // reserved · pending roll-call
  "oracle-of-amy":             43,  // reserved · pending roll-call
};

/**
 * Given an actor + verb + optional target, compute glyph dims.
 */
export function glyph({ actor, verb, promotion = null, target = null, mode = "M-EYEWITNESS" } = {}) {
  const D1 = codex.hilbertAddress("actor", actor || "unknown");
  const D2 = codex.hilbertAddress("verb",  verb  || "unknown");
  const D11 = promotion ? codex.hilbertAddress("promotion", promotion) : null;
  const D_room = target && ROOM_MAP[target] !== undefined ? ROOM_MAP[target] : null;
  return { D1, D2, D11, D_room, M: mode };
}

/**
 * Build a glyph_sentence from dims.
 */
export function sentence(dims, note = "") {
  const parts = [];
  if (dims.D1)  parts.push(`D1-${dims.D1}`);
  if (dims.D2)  parts.push(`D2-${dims.D2}`);
  if (dims.D11) parts.push(`D11-${dims.D11}`);
  if (dims.D_room != null) parts.push(`room-${dims.D_room}`);
  if (note) parts.push(note);
  parts.push(`@ ${dims.M} .`);
  return parts.join(" · ");
}

/**
 * Wrap a log fn to auto-stamp glyph header.
 * Usage:
 *   const log = makeGlyphLogger({ actor: "pid-targeted-kick", room: "bus-and-kick" });
 *   log("kick-sent", { target: "liris", verb: "OP-KICK-LIRIS" });
 *   → [YYYY-ISO] · D1-XxXxXxXx · D2-YyYyYyYy · room-29 · M-EYEWITNESS · kick-sent {target:...}
 */
export function makeGlyphLogger({ actor, room = null } = {}) {
  return function log(verb, payload = null) {
    const D_room = room && ROOM_MAP[room] !== undefined ? ROOM_MAP[room] : null;
    const dims = glyph({ actor, verb });
    const roomStr = D_room != null ? ` · room-${D_room}` : "";
    const head = `[${new Date().toISOString()}] · D1-${dims.D1} · D2-${dims.D2}${roomStr} · ${dims.M}`;
    const body = payload ? ` · ${typeof payload === "string" ? payload : JSON.stringify(payload)}` : "";
    console.log(head + ` · ${verb}${body}`);
  };
}

/**
 * Wrap a supervisor's emit-envelope fn so every envelope has glyph_sentence auto-attached.
 */
export function wrapEmitEnvelope(emitFn, { actor, defaultRoom = null } = {}) {
  return async function glyphedEmit(env) {
    const verb = env.verb || "unknown";
    const promotion = env.body?.promotion || null;
    const target = env.body?.target_room || defaultRoom;
    const dims = glyph({ actor: env.actor || actor, verb, promotion, target });
    const auto = sentence(dims);
    const merged = {
      ...env,
      body: { ...(env.body || {}), behcs_256_glyphs: dims },
      glyph_sentence: env.glyph_sentence || auto,
    };
    return emitFn(merged);
  };
}

/**
 * Helper: check if a verb contains a halt-canon-11 word (substring-sensitive check).
 */
const HALT_CANON_11 = ["HALT","BLOCKED","STALE","FAIL","DENIED","EMERGENCY","STOP","KILL","ABORT","TERMINATE","DIVERGE"];
export function tripsHaltCanon(verb) {
  const v = String(verb || "").toUpperCase();
  return HALT_CANON_11.find(w => v.includes(w)) || null;
}
