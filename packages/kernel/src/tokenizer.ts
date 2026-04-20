// @asolaria/kernel — tokenizer
// D11:ASSUMED. Lexes BEHCS-256 source text into tokens.
// Recognized tokens: IDENT, TONE_KV (operator_witness=jesse), @ ^ |> · { } .
// Whitespace is insignificant. Comments deferred to R.2 refinement.

export type TokenKind =
  | "IDENT"
  | "TONE_KV"   // key=value tone payload (e.g., operator_witness=jesse)
  | "AT"         // @
  | "CARET"      // ^
  | "PIPE"       // |>
  | "DOT"        // ·  (concat)
  | "LBRACE"     // {
  | "RBRACE"     // }
  | "PERIOD"     // .  sentence terminator
  | "EOF";

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_-]*/;

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "@") { tokens.push({ kind: "AT", value: "@", pos: i }); i++; continue; }
    if (c === "^") { tokens.push({ kind: "CARET", value: "^", pos: i }); i++; continue; }
    if (c === "|" && src[i + 1] === ">") { tokens.push({ kind: "PIPE", value: "|>", pos: i }); i += 2; continue; }
    if (c === "·") { tokens.push({ kind: "DOT", value: "·", pos: i }); i++; continue; }
    if (c === "{") { tokens.push({ kind: "LBRACE", value: "{", pos: i }); i++; continue; }
    if (c === "}") { tokens.push({ kind: "RBRACE", value: "}", pos: i }); i++; continue; }
    if (c === ".") { tokens.push({ kind: "PERIOD", value: ".", pos: i }); i++; continue; }
    const rest = src.slice(i);
    const m = rest.match(IDENT_RE);
    if (m) {
      const ident = m[0];
      i += ident.length;
      // key=value tone (e.g., operator_witness=jesse)
      if (src[i] === "=") {
        const rest2 = src.slice(i + 1);
        const m2 = rest2.match(IDENT_RE);
        if (m2) {
          tokens.push({ kind: "TONE_KV", value: `${ident}=${m2[0]}`, pos: i - ident.length });
          i += 1 + m2[0].length;
          continue;
        }
      }
      tokens.push({ kind: "IDENT", value: ident, pos: i - ident.length });
      continue;
    }
    throw new Error(`tokenizer: unexpected character '${c}' at pos ${i}`);
  }
  tokens.push({ kind: "EOF", value: "", pos: src.length });
  return tokens;
}
