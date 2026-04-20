# Item 101 · Dry civilization pass against self · LCR trace

## Procedure
1. Feed a known envelope (e.g. the 200-step ship envelope `EVT-LIRIS-200-STEP-CANONICAL-REFIRE-FOR-META-HERMES-ROOM-41`) into `runStages(env, handlers)`.
2. Handlers default to `{LCR: 0.5}` for stages with no specific implementation yet.
3. Collect `trace`. Run `civilizationVerdict(trace)`.

## Recorded dry-run (this session)

- Stages exercised: 23
- Handlers implemented: default (LCR=0.5)
- Verdict: `mixed` (mean=0.5, min=0.5)
- Note: expected — with default handlers all LCRs are 0.5 by construction. Real pass happens once REVERSE + OMNI scorers are wired in.

## Next

Implement stage-specific handlers for S05 (reverse-gnn-score) + S06 (omni-gnn-score) using `services/gnn-sidecar/` pretrained models + `packages/stage-to-actual-converter/src/converter.mjs`.
