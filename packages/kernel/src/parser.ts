// @asolaria/kernel — parser
// D11:ASSUMED. Recursive-descent parser honoring R.3 precedence:
//   tightest → loosest:  @ (1) > ^ (2) > { } (3) > |> (4) > · (5) > mood-tone (6)
// Grammar (EBNF-ish):
//   sentence := phrase (AT mood)? PERIOD EOF
//   phrase   := concat
//   concat   := pipe (DOT pipe)*
//   pipe     := modified (PIPE modified)*
//   modified := primary ( (AT tone) | CARET )*
//   primary  := LBRACE phrase RBRACE | IDENT (LBRACE phrase RBRACE)?
//   tone     := IDENT | TONE_KV
//
// `IDENT LBRACE ... RBRACE` (juxtaposed) is treated as implicit concat
// `atom · {phrase}` per R.3 example 2 (OP-MORPH{PROF-NOVALUM @ DEVICE}).
//
// Mood tone recognition is two-phase: the parser first consumes all
// postfix `@tone` and `^` into `modified`, then at sentence end detects
// whether the outermost modify is a mood tone (M-INDICATIVE/M-EYEWITNESS/
// M-SUBJUNCTIVE) and lifts it to the Sentence.mood field.

import type { Token } from "./tokenizer.ts";
import { MOOD_IDS, type Mood } from "./glyph-genesis.ts";

export type Phrase =
  | { kind: "atom"; glyph: string }
  | { kind: "concat"; left: Phrase; right: Phrase }
  | { kind: "nest"; inner: Phrase }
  | { kind: "modify"; base: Phrase; tone: string }
  | { kind: "lift"; inner: Phrase }
  | { kind: "pipe"; src: Phrase; dst: Phrase };

export interface Sentence {
  phrase: Phrase;
  mood: Mood;
  tones: string[];         // all @tones accumulated (including mood)
  operator_witness?: string;
}

export interface ParseError {
  message: string;
  pos: number;
}

export class Parser {
  private i = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) { this.tokens = tokens; }

  parseSentence(): Sentence {
    const phrase = this.parsePhrase();
    // Strip outer modifies into tone stack. When the root is a concat whose
    // rightmost chain terminates in a modify carrying a mood or blast tone,
    // also lift that tone to the sentence-level stack — R.3 treats a trailing
    // mood tone as sentence-terminal even when it syntactically attaches to
    // the right concat leaf. We still KEEP the inner modify in place so the
    // `requires_braces` diagnostic can detect the mood-inside-concat case.
    const tones: string[] = [];
    let core = phrase;
    while (core.kind === "modify") {
      tones.unshift(core.tone);
      core = core.base;
    }
    if (phrase.kind === "concat") {
      const trailing = rightmostModifyTone(phrase);
      if (trailing) tones.push(trailing);
    }
    // Pick mood (last M-* tone wins but multiple = double_mood downstream)
    let mood: Mood = "M-SUBJUNCTIVE";
    const moodTones = tones.filter((t) => MOOD_IDS.has(t));
    if (moodTones.length >= 1) mood = moodTones[moodTones.length - 1] as Mood;
    // Find operator_witness=... key
    let operator_witness: string | undefined;
    for (const t of tones) {
      if (t.startsWith("operator_witness=")) {
        operator_witness = t.slice("operator_witness=".length);
      }
    }
    // Rebuild phrase with non-mood, non-witness tones retained
    const retainedTones = tones.filter((t) =>
      !MOOD_IDS.has(t) && !t.startsWith("operator_witness=")
    );
    let rebuilt = core;
    for (const t of retainedTones) {
      rebuilt = { kind: "modify", base: rebuilt, tone: t };
    }
    this.expect("PERIOD");
    this.expect("EOF");
    return {
      phrase: rebuilt,
      mood,
      tones,   // full original stack — validator checks double_mood here
      operator_witness,
    };
  }

  parsePhrase(): Phrase { return this.parseConcat(); }

  parseConcat(): Phrase {
    let left = this.parsePipe();
    while (this.peek().kind === "DOT") {
      this.advance();
      const right = this.parsePipe();
      left = { kind: "concat", left, right };
    }
    return left;
  }

  parsePipe(): Phrase {
    let left = this.parseModified();
    while (this.peek().kind === "PIPE") {
      this.advance();
      const right = this.parseModified();
      left = { kind: "pipe", src: left, dst: right };
    }
    return left;
  }

  parseModified(): Phrase {
    let node = this.parsePrimary();
    while (true) {
      const k = this.peek().kind;
      if (k === "AT") {
        this.advance();
        const toneTok = this.advance();
        if (toneTok.kind !== "IDENT" && toneTok.kind !== "TONE_KV") {
          throw new Error(`parser: expected IDENT or TONE_KV after @ at pos ${toneTok.pos}`);
        }
        node = { kind: "modify", base: node, tone: toneTok.value };
      } else if (k === "CARET") {
        this.advance();
        node = { kind: "lift", inner: node };
      } else {
        break;
      }
    }
    return node;
  }

  parsePrimary(): Phrase {
    const t = this.peek();
    if (t.kind === "LBRACE") {
      this.advance();
      const inner = this.parsePhrase();
      this.expect("RBRACE");
      return { kind: "nest", inner };
    }
    if (t.kind === "IDENT") {
      this.advance();
      const atom: Phrase = { kind: "atom", glyph: t.value };
      // Implicit concat: IDENT{phrase} → atom · nest(phrase)
      if (this.peek().kind === "LBRACE") {
        this.advance();
        const inner = this.parsePhrase();
        this.expect("RBRACE");
        return { kind: "concat", left: atom, right: { kind: "nest", inner } };
      }
      return atom;
    }
    throw new Error(`parser: unexpected token ${t.kind} '${t.value}' at pos ${t.pos}`);
  }

  private peek(): Token { return this.tokens[this.i]; }
  private advance(): Token { return this.tokens[this.i++]; }
  private expect(kind: Token["kind"]): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new Error(`parser: expected ${kind} but got ${t.kind} '${t.value}' at pos ${t.pos}`);
    }
    return this.advance();
  }
}

export function parseSentence(src: string, tokens: Token[]): Sentence {
  return new Parser(tokens).parseSentence();
}

function rightmostModifyTone(p: Phrase): string | null {
  // Walk rightward looking for a trailing `@tone` attached to the final atom.
  if (p.kind === "modify") return p.tone;
  if (p.kind === "concat") return rightmostModifyTone(p.right);
  if (p.kind === "pipe") return rightmostModifyTone(p.dst);
  return null;
}
