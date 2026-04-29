# BEHCS-256 Grammar — Kernel Reference

Canonical grammar reference for the BEHCS-256 synthetic language. Machine-readable family registry lives at `kernel/glyph-families.json`. Zod validators live at `packages/kernel/src/grammar.ts`. Design rationale + worked examples live at `plans/section-R-3-grammar-specification.md`.

Status: DRAFT under week-override `COSIGN-MERGED-034`. All rules below are D11:ASSUMED until refined by R.2 Acer Class corpus extraction and validated by R.4 polymorphic runtime.

## Phoneme classes

- **Consonants** — identifier glyphs (dimensions, profiles, events, devices...). Cannot stand alone.
- **Vowels** — operator glyphs (`·`, `{ }`, `@`, `^`, `|>`). Bind consonants.
- **Tones** — mood + blast-radius markers. Attach to whole phrase.

Per-glyph classification is carried in `glyph-families.json`.

## Families (14, draft)

| Family | Prefix | Default blast |
|---|---|---|
| dimension | `D` | colony |
| proof | `PROOF` | colony |
| drift | `DRIFT` | colony |
| shannon | `SHANNON` | instance |
| op | `OP` | operation |
| profile | `PROF` | instance |
| law | `LAW` | colony |
| device | `DEV` | device |
| colony | `COL` | colony |
| portal | `PORT` | device |
| wave | `WAVE` | operation |
| event | `EVT` | colony |
| mood | `M` | n/a (tone) |
| meta | `META` | colony |

## Operators (precedence, tightest first)

1. `@` modification
2. `^` scope-lift
3. `{ ... }` nesting (lexical)
4. `|>` pipe
5. `·` concatenation
6. mood tone (sentence-terminal)

Ambiguities require explicit braces. The validator rejects multi-parse phrases.

## Blast radius

`@DEVICE | @INSTANCE | @OPERATION | @COLONY`. Family default applies when no tone is present. `@COLONY` on non-LAW, non-META glyphs requires `operator_witness`.

## Moods

| Mood | D11 level |
|---|---|
| `M-INDICATIVE` | PROVEN |
| `M-EYEWITNESS` | OBSERVED |
| `M-SUBJUNCTIVE` | ASSUMED (default) |

Exactly one mood per sentence.

## Self-reference

- `META-GRAMMAR-RULE{<phrase>}` — declares phrase is a grammar rule.
- `META-SELF-DESCRIBE` — resolves to this file at the active COSIGN tip.
- `META-PROOF-OF-CLOSURE` — grammar proves its own closure. Must parse under `M-INDICATIVE` for the grammar to be considered valid.

## Violation catalog

`unknown_glyph`, `family_ambiguity`, `arity_mismatch`, `requires_braces`, `double_mood`, `colony_lift_unwitnessed`, `cross_host_privesc`, `closure_broken`, `blast_too_narrow`, `mood_proof_mismatch`.

Each violation emits `EVT-GRAMMAR-VIOLATION` with subtype. `closure_broken` escalates to federation HALT. `cross_host_privesc` HALTs per the cross-host privesc rule.

## Minimal grammar in EBNF-ish

```
sentence    ::= phrase mood_tone? "."
phrase      ::= atom
              | phrase "·" phrase
              | "{" phrase "}"
              | phrase "@" tone
              | phrase "^"
              | phrase "|>" phrase
atom        ::= <glyph_id from glyph-families.json>
tone        ::= blast_tone | mood_tone | other_tone
blast_tone  ::= "@DEVICE" | "@INSTANCE" | "@OPERATION" | "@COLONY"
mood_tone   ::= "@M-INDICATIVE" | "@M-EYEWITNESS" | "@M-SUBJUNCTIVE"
```

Whitespace is insignificant between tokens. Dots terminate sentences; comments are not yet specified (deferred to R.2 refinement).

## Self-closure test

A grammar revision is accepted only when:

1. `glyph-families.json` validates against its own zod schema.
2. The zod validator in `packages/kernel/src/grammar.ts` passes its unit tests.
3. `META-PROOF-OF-CLOSURE @ M-INDICATIVE .` parses and its validator output is `{ ok: true, diagnostics: [] }` under the revised grammar.

If any fails, the revision is rejected and the prior COSIGN tip remains authoritative.

## Hot-reload

Validators watch the cosign chain; on new `META-GRAMMAR-RULE` rows, `glyph-families.json` and in-memory rule set reload. Parsing in flight completes under the prior grammar; new sentences use the new grammar. This keeps grammar changes append-only and tamper-evident.

## See also

- `plans/section-R-3-grammar-specification.md` — full specification with worked examples and violation walkthroughs
- `plans/section-R-behcs256-as-language-polymorphism.md` — the R-sections umbrella (R.1 through R.10)
- `kernel/D11-proof-levels.json` — existing proof-level catalog (PROOF family members)
- `memory/project_behcs256_as_super_intelligent_language_polymorphic_grammar.md` — Jesse 2026-04-17 rationale
