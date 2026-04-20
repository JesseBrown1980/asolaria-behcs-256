// @asolaria/kernel — public surface
// D11:ASSUMED. The language kernel: parse, validate, self-describe.

export * from "./glyph-genesis.ts";
export * from "./tokenizer.ts";
export * from "./parser.ts";
export * from "./grammar.ts";
export { runClosure } from "./closure-test.ts";

import { tokenize } from "./tokenizer.ts";
import { parseSentence } from "./parser.ts";
import { validate, type ValidationResult } from "./grammar.ts";

export function parseAndValidate(src: string): { parsed: ReturnType<typeof parseSentence>; result: ValidationResult } {
  const tokens = tokenize(src);
  const parsed = parseSentence(src, tokens);
  const result = validate(parsed);
  return { parsed, result };
}
