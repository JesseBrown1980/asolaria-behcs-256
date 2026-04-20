// @asolaria/kernel — closure test
// D11:ASSUMED → attempts to lift itself to D11:OBSERVED (eyewitness) when
// this script runs green. R.3 acceptance criterion: `META-PROOF-OF-CLOSURE
// @ M-INDICATIVE .` must parse + validate with ok:true.

import { tokenize } from "./tokenizer.ts";
import { parseSentence } from "./parser.ts";
import { validate } from "./grammar.ts";
import { censusReport } from "./glyph-genesis.ts";

const CLOSURE_SENTENCE = "META-PROOF-OF-CLOSURE @ M-INDICATIVE .";

export function runClosure(): { ok: boolean; report: ReturnType<typeof censusReport>; diag: string[] } {
  const toks = tokenize(CLOSURE_SENTENCE);
  const sent = parseSentence(CLOSURE_SENTENCE, toks);
  const result = validate(sent);
  return {
    ok: result.ok,
    report: censusReport(),
    diag: result.diagnostics.map((d) => `${d.subtype}: ${d.message}`),
  };
}

// Allow direct node execution via tsx
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const r = runClosure();
  console.log(JSON.stringify({
    closure_sentence: CLOSURE_SENTENCE,
    ok: r.ok,
    census: r.report,
    diagnostics: r.diag,
    d11_claim: r.ok ? "M-EYEWITNESS: self-closure observed at kernel v0.1.0" : "M-SUBJUNCTIVE: closure failed",
  }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
