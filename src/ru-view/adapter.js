// Item 168 · RU View → envelope-v1 event stream adapter

const { validate } = require("../envelope/validate.js");

// Read-only stream builder: pulls bus envelopes and shapes for consumer UI.
// Does NOT emit. Pure projection.

function project(envelope) {
  const v = validate(envelope);
  if (!v.ok) return null;
  return {
    id: envelope.id,
    ts: envelope.ts,
    src: envelope.src,
    dst: envelope.dst || "federation",
    kind: envelope.kind,
    summary: (envelope.payload || "").slice(0, 140),
    room: envelope.body?.room || null,
    D_room: envelope.body?.D_room || null,
    glyph_sentence: envelope.glyph_sentence || null,
    cosigns: envelope.cosigns || null,
    mode: envelope.mode || "real",
  };
}

async function poll({ busUrl = "http://127.0.0.1:4947", since = null, limit = 50 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (since) qs.set("since", since);
  const r = await fetch(`${busUrl}/behcs/inbox?${qs}`, { signal: AbortSignal.timeout(5000) });
  const j = await r.json();
  const projected = (j.messages || []).map(project).filter(Boolean);
  return { ok: true, count: projected.length, items: projected };
}

module.exports = { project, poll };
