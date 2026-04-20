// Bus fire with liris-timeout retry
// Observed: ~5-of-12 acer→liris envelopes time out; acer side always 200
// Strategy: fire once; if liris=0 and not acer=0, wait + retry up to N times

import { postToBus } from "../../bus-and-kick/src/primitive.mjs";

export async function fireWithRetry(envelope, opts = {}) {
  const max_retries = opts.max_retries ?? 2;
  const base_delay_ms = opts.base_delay_ms ?? 5000;
  const attempts = [];
  let last;
  for (let i = 0; i <= max_retries; i++) {
    const env = i === 0 ? envelope : { ...envelope, verb: envelope.verb + (i === 1 ? "-RETRY" : `-RETRY${i}`) };
    const r = await postToBus(env);
    attempts.push({ attempt: i, results: r.results });
    last = r;
    const acerOk = r.results.acer === 200;
    const lirisOk = r.results.liris === 200;
    if (acerOk && lirisOk) return { ok: true, results: r.results, attempts };
    if (!acerOk) return { ok: false, reason: "acer-not-200", results: r.results, attempts };
    if (i < max_retries) await new Promise(r => setTimeout(r, base_delay_ms * (i + 1)));
  }
  return { ok: false, reason: "liris-persistent-timeout", results: last.results, attempts };
}

// Convenience: fire a verb with auto-manifest + glyph sentence
export async function emitEnvelope({ verb, actor = "acer-namespace-coordinator", target = "federation", payload, body, glyph_sentence, retry = true }) {
  const env = {
    to: target,
    verb,
    actor,
    target,
    payload,
    body: body || {},
    glyph_sentence: glyph_sentence || `${verb} @ M-EYEWITNESS .`,
  };
  if (!retry) {
    const r = await postToBus(env);
    return { ok: r.results.acer === 200 && r.results.liris === 200, results: r.results, attempts: [{ attempt: 0, results: r.results }] };
  }
  return fireWithRetry(env);
}
