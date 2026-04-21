// multi-agent-enforcement-gate · SMP v5+ · never scum, never solo
//
// Liris 2026-04-20: "smp 5 + too liris has it massive cannot scum needs multi agent cannot run by self ever"
// → enforces ≥ 2 independent agent signatures on any SMP v5+ task close/seal envelope.
//
// Frozen-polymorphism extension. A seal without 2 signatures is REFUSED.

export const MIN_SIGNATURES = 2;
export const ACCEPTED_AGENTS = new Set([
  "acer", "acer-namespace-coordinator", "acer-meeting-chair", "acer-super-gulp-tier3-daemon",
  "liris", "liris-chief", "liris-chair",
  "falcon", "falcon-front-end-kicker",
  "aether", "aether-edge-agent",
  "rose", "oracle-of-amy",
  "jesse-operator",
]);

const SMP_V5_PLUS_TASK_VERBS = [
  "T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09",
  "SMP-V5-PLUS", "SMP-V5+", "FEDERATION-SEALED", "10-VARIANT-MERGED",
  // FP-INFRA closures require bilateral cosign too (extended 2026-04-20 post session-1-acer-complete)
  "FP-INFRA-SESSION-1-BASELINE-COMPLETE",
  "FP-INFRA-SESSION-",
  "BASELINE-COMPLETE",
];
function isSmpV5PlusTask(verb) {
  if (typeof verb !== "string") return false;
  const v = verb.toUpperCase();
  return SMP_V5_PLUS_TASK_VERBS.some(t => v.includes(t));
}

/**
 * Check an envelope for multi-agent signature count.
 * @param {object} envelope
 * @returns {{ ok: boolean, reason?: string, accepted_sigs: string[], count: number }}
 */
export function checkMultiAgent(envelope) {
  const body = envelope.body || {};
  const collected = new Set();

  // (a) envelope.actor (primary signer)
  if (envelope.actor) collected.add(normalizeActor(envelope.actor));

  // (b) body.cosigns{} map (typical shape: { acer: {tick:true}, falcon: {tick:true} })
  if (body.cosigns && typeof body.cosigns === "object") {
    for (const [name, v] of Object.entries(body.cosigns)) {
      if (v && (v.tick === true || v === true)) collected.add(normalizeActor(name));
    }
  }

  // (c) body.signatures[] or body.sigs[]
  for (const k of ["signatures", "sigs", "signers", "cosigners"]) {
    const arr = body[k];
    if (Array.isArray(arr)) for (const a of arr) collected.add(normalizeActor(typeof a === "string" ? a : a?.actor || a?.name));
  }

  // (d) body.witness / body.*_witness
  for (const [k, v] of Object.entries(body)) {
    if (k.endsWith("_witness") && v) collected.add(normalizeActor(typeof v === "string" ? v : v?.actor || v?.name));
    if (k === "witness" && v) collected.add(normalizeActor(typeof v === "string" ? v : v?.actor || v?.name));
  }

  collected.delete(null);
  collected.delete(undefined);
  // Canonicalize to shortest matching ACCEPTED_AGENTS entry so "acer-namespace-coordinator"
  // and "acer" collapse to the same canonical "acer" and count ONCE.
  const SHORT_NAMES = ["acer", "liris", "falcon", "aether", "rose", "oracle-of-amy", "jesse-operator"];
  function canonicalize(a) {
    if (!a) return null;
    for (const s of SHORT_NAMES) if (a === s || a.startsWith(s + "-") || a.startsWith(s)) return s;
    return null;
  }
  const canonicalSet = new Set();
  for (const a of collected) {
    const c = canonicalize(a);
    if (c) canonicalSet.add(c);
  }
  const accepted = [...canonicalSet];
  const count = accepted.length;
  if (count >= MIN_SIGNATURES) return { ok: true, accepted_sigs: accepted, count };
  return { ok: false, reason: `solo-signature-refused · need ≥${MIN_SIGNATURES} distinct canonical agents`, accepted_sigs: accepted, count };
}

function normalizeActor(a) {
  if (!a || typeof a !== "string") return null;
  return a.toLowerCase().trim();
}

/**
 * Middleware for bus emit: if verb is SMP-v5+ task-close, require ≥2 sigs; otherwise pass-through.
 */
export function enforceOnEnvelope(envelope) {
  if (!isSmpV5PlusTask(envelope.verb)) return { ok: true, skipped: true, reason: "not-smp-v5-plus" };
  return checkMultiAgent(envelope);
}

/**
 * Wrap an emitEnvelope fn to enforce on SMP-v5+ seals.
 */
export function wrapEmitWithGate(emitFn) {
  return async function gated(env) {
    const gate = enforceOnEnvelope(env);
    if (!gate.ok) {
      console.warn(`[multi-agent-gate] REFUSED ${env.verb} · ${gate.reason} · accepted=${JSON.stringify(gate.accepted_sigs)}`);
      return { ok: false, refused: true, gate_result: gate, envelope_verb: env.verb };
    }
    return emitFn(env);
  };
}
