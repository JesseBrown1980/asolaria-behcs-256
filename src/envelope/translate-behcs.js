// Item 025 · Translate legacy BEHCS envelope → v1
// Input shape: { id, from, to, mode, actor, target, verb, ts, payload, body, glyph_sentence, entry_sig? }
// Output shape: v1 (id, ts, src, dst, kind, body, actor, mode, payload, sig?, glyph_sentence?, cosigns?)

function translateBehcs(e) {
  if (!e || typeof e !== "object") throw new Error("translateBehcs: envelope must be object");
  const out = {
    id:   String(e.id || ""),
    ts:   e.ts || new Date().toISOString(),
    src:  String(e.from || e.actor || "unknown"),
    dst:  e.to || e.target || "federation",
    kind: String(e.verb || "EVT-UNKNOWN"),
    body: e.body && typeof e.body === "object" ? e.body : {},
  };
  if (e.actor) out.actor = e.actor;
  if (e.mode)  out.mode = e.mode;
  if (e.payload) out.payload = String(e.payload);
  if (e.glyph_sentence) out.glyph_sentence = String(e.glyph_sentence);
  if (e.entry_sig) out.sig = e.entry_sig;
  if (e.body && e.body.cosigns) out.cosigns = e.body.cosigns;
  return out;
}

module.exports = { translateBehcs };
