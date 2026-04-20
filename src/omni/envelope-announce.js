// Item 144 · omni.envelope.announce · publish envelope-v1 to federation bus with glyph stamp

const { validate } = require("../envelope/validate.js");

async function omniEnvelopeAnnounce(envelope, { busUrl = "http://127.0.0.1:4947/behcs/send" } = {}) {
  const v = validate(envelope);
  if (!v.ok) return { ok: false, reason: "envelope-invalid", errors: v.errors };
  try {
    const r = await fetch(busUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, response: j };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { omniEnvelopeAnnounce };
