// FIB-L05 · messaging · bilateral-glyph-5axes
// My inference (no peek):
//   - 5-axis glyph envelope: { D1 actor, D2 verb, D3 target, D4 mode, D5 promotion }
//   - "bilateral" = both sides independently compute the glyph 5-tuple from the same envelope
//     and agree byte-for-byte (this is the gate)
//   - produces a bilateral_sha over the 5-tuple for chain-seal
//   - deterministic: same envelope → same 5-tuple → same sha, forever

const crypto = require("node:crypto");

const AXES = Object.freeze(["D1","D2","D3","D4","D5"]);

// Deterministic axis extractor: pure function of envelope.
function extractAxes(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("envelope required");
  const D1 = String(envelope.src || envelope.actor || "");
  const D2 = String(envelope.kind || envelope.verb || "");
  const D3 = String(envelope.dst || envelope.target || "");
  const D4 = String(envelope.mode || "real");
  const D5 = String(envelope.body && envelope.body.promotion || "");
  return { D1, D2, D3, D4, D5 };
}

function toGlyph(value) {
  // 8-char sha-slice per axis (deterministic, no timestamp involved)
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
}

function stamp(envelope) {
  const axes = extractAxes(envelope);
  const glyphs = {};
  for (const a of AXES) glyphs[a] = toGlyph(axes[a]);
  const fiveTuple = AXES.map(a => glyphs[a]).join(":");
  const bilateral_sha = crypto.createHash("sha256").update(fiveTuple).digest("hex");
  return { axes, glyphs, five_tuple: fiveTuple, bilateral_sha };
}

function agree(stampA, stampB) {
  if (!stampA || !stampB) return { ok: false, reason: "missing-stamp" };
  if (stampA.bilateral_sha !== stampB.bilateral_sha) return { ok: false, reason: "sha-diverge", a: stampA.bilateral_sha, b: stampB.bilateral_sha };
  for (const a of AXES) {
    if (stampA.glyphs[a] !== stampB.glyphs[a]) return { ok: false, reason: "axis-diverge", axis: a };
  }
  return { ok: true, bilateral_sha: stampA.bilateral_sha };
}

module.exports = { AXES, extractAxes, toGlyph, stamp, agree };
