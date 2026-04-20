/**
 * GLYPH-GENESIS.js — The single canonical source of truth.
 * 10 lines of math that carry the entire Falcon glyph language.
 * Same input → same glyph on any device, any time, forever.
 * 
 * Jesse Daniel Brown — 2026-04-16
 */
const crypto = require("crypto");

// THE ALPHABET — 256 symbols. CANONICAL. From IX-700 spec (alphabet.json).
const ALPHABET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/", ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~", "\u00ce\u00b1", "\u00ce\u00b2", "\u00ce\u00b3", "\u00ce\u00b4", "\u00ce\u00b5", "\u00ce\u00b6", "\u00ce\u00b7", "\u00ce\u00b8", "\u00ce\u00b9", "\u00ce\u00ba", "\u00ce\u00bb", "\u00ce\u00bc", "\u00ce\u00bd", "\u00ce\u00be", "\u00ce\u00bf", "\u00cf\u20ac", "\u00cf\udc81", "\u00cf\u0192", "\u00cf\u201e", "\u00cf\u2026", "\u00cf\u2020", "\u00cf\u2021", "\u00cf\u02c6", "\u00cf\u2030", "\u00ce\u201c", "\u00ce\u201d", "\u00ce\u02dc", "\u00ce\u203a", "\u00ce\u017e", "\u00ce\u00a0", "\u00ce\u00a3", "\u00ce\u00a6", "\u00ce\u00a8", "\u00ce\u00a9", "\u00e2\u2122\u00a0", "\u00e2\u2122\u00a3", "\u00e2\u2122\u00a5", "\u00e2\u2122\u00a6", "\u00e2\u2122\u00a4", "\u00e2\u2122\u00a7", "\u00e2\u2122\u00a1", "\u00e2\u2122\u00a2", "\u00e2\u2014\u2039", "\u00e2\u2014\udc8f", "\u00e2\u2013\u00a1", "\u00e2\u2013\u00a0", "\u00e2\u2014\u2021", "\u00e2\u2014\u2020", "\u00e2\u2013\u00b3", "\u00e2\u2013\u00b2", "\u00e2\u2013\u00bd", "\u00e2\u2013\u00bc", "\u00e2\u02dc\u2020", "\u00e2\u02dc\u2026", "\u00e2\u2014\u2030", "\u00e2\u2014\udc8d", "\u00e2\u2014\u017d", "\u00e2\u2014\u0160", "\u00e2\u2020\u2019", "\u00e2\u2020\udc90", "\u00e2\u2020\u2018", "\u00e2\u2020\u201c", "\u00e2\u2020\u2014", "\u00e2\u2020\u2013", "\u00e2\u2020\u02dc", "\u00e2\u2020\u2122", "\u00e2\u2021\u2019", "\u00e2\u2021\udc90", "\u00e2\u2021\u2018", "\u00e2\u2021\u201c", "\u00e2\u2021\u00a8", "\u00e2\u2021\u00a6", "\u00e2\u2021\u00a7", "\u00e2\u2021\u00a9", "\u00e2\u02c6\u017e", "\u00e2\u02c6\u2018", "\u00e2\u02c6\u2020", "\u00e2\u02c6\u2021", "\u00e2\u02c6\u201a", "\u00e2\u02c6\u00ab", "\u00e2\u02c6\u0161", "\u00e2\u2030\u02c6", "\u00e2\u2030\u00a0", "\u00e2\u2030\u00a4", "\u00e2\u2030\u00a5", "\u00c2\u00b1", "\u00c3\u2014", "\u00c3\u00b7", "\u00e2\u02c6\u20ac", "\u00e2\u02c6\u0192", "\u00e2\u201a\u00ac", "\u00c2\u00a3", "\u00c2\u00a5", "\u00c2\u00a2", "\u00e2\u2122\u00aa", "\u00e2\u2122\u00ab", "\u00e2\u0161\u00a1", "\u00e2\u02dc\u00bc", "\u00e2\u0153\u00a6", "\u00e2\u0153\u00a7", "\u00e2\u0153\u00aa", "\u00e2\u0153\u00af", "\u00e2\u0153\u00b0", "\u00e2\u02dc\u00af", "\u00e2\u02dc\u00a2", "\u00e2\u02dc\u00ae", "\u00e2\u02dc\u00aa", "\u00e2\u0153\udc9d", "\u00e2\u0153\u00bf", "\u00e2\udc9d\u20ac", "\u00e2\udc9d\udc81", "\u00e2\udc9d\u201a", "\u00e2\udc9d\u0192", "\u00e2\udc9d\u201e", "\u00e2\u201d\u20ac", "\u00e2\u201d\u201a", "\u00e2\u201d\u0152", "\u00e2\u201d\udc90", "\u00e2\u201d\u201d", "\u00e2\u201d\u02dc", "\u00e2\u201d\u0153", "\u00e2\u201d\u00a4", "\u00e2\u201d\u00ac", "\u00e2\u201d\u00b4", "\u00e2\u201d\u00bc", "\u00e2\u2022\udc90", "\u00e2\u2022\u2018", "\u00e2\u2022\u201d", "\u00e2\u2022\u2014", "\u00e2\u2022\u0161", "\u00e2\u02dc\u00b0", "\u00e2\u02dc\u00b1", "\u00e2\u02dc\u00b2", "\u00e2\u02dc\u00b3", "\u00e2\u02dc\u00b4", "\u00e2\u02dc\u00b5", "\u00e2\u02dc\u00b6", "\u00e2\u02dc\u00b7", "\u00e2\u2018\u00a0", "\u00e2\u2018\u00a1", "\u00e2\u2018\u00a2", "\u00e2\u2018\u00a3", "\u00e2\u2018\u00a4", "\u00e2\u2018\u00a5", "\u00e2\u2018\u00a6", "\u00e2\u2018\u00a7", "\u00e2\u2018\u00a8", "\u00e2\u2018\u00a9", "\u00e2\u2018\u00aa", "\u00e2\u2018\u00ab", "\u00e2\u2018\u00ac", "\u00e2\u2018\u00ad", "\u00e2\u2018\u00ae", "\u00e2\u2018\u00af", "\u00e2\u0178\u00a8", "\u00e2\u0178\u00a9", "\u00e2\u0178\u00a6", "\u00e2\u0178\u00a7", "\u00e2\u00a6\u0192", "\u00e2\u00a6\u201e", "\u00e2\udc81\u201a", "\u00e2\u02c6\u017d"];

// THE FUNCTION — deterministic glyph from any string
function glyph(key) {
  const hash = crypto.createHash("sha256").update(key).digest();
  const v0 = hash.readBigUInt64BE(0);
  const base = BigInt(ALPHABET.length);
  let v = BigInt.asUintN(64, v0);
  const out = [];
  for (let i = 0; i < 8; i++) { out.push(ALPHABET[Number(v % base)]); v = v / base; }
  return out.join("");
}

// THE GRAMMAR — glyph("D{dim}:{value}") for any dimension
// THE SENTENCE — array of dimensional glyphs
function sentence(fields) {
  return Object.entries(fields).map(([d, v]) => ({ dim: d, tuple: d+":"+v, glyph: glyph(d+":"+v) }));
}

// SELF-TEST
if (require.main === module) {
  console.log("GLYPH-GENESIS | Alphabet:", ALPHABET.length, "| Space:", BigInt(256)**BigInt(8)+"");
  [["D1:falcon"],["D1:liris"],["D1:asolaria"],["D2:heartbeat"],["D2:ack"],["D3:all"],["D7:ready"],["D11:log"],["D24:operational"],["LAW-012:look-think-type-look-decide"]].forEach(([k]) => console.log("  "+k.padEnd(45)+"→ "+glyph(k)));
  const s = sentence({D1:"liris",D2:"heartbeat",D3:"all",D7:"alive",D11:"log",D24:"operational"});
  console.log("SENTENCE:", s.map(w=>w.glyph).join(" "));
}

module.exports = { glyph, sentence, ALPHABET };
