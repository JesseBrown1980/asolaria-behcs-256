# FP-ASI · armed and empty · honest default

## State at v3 closure 2026-04-20T22:30Z

- 6-gate runner: **ARMED** (`packages/fp-asi-benchmark/src/runner.mjs` + 100 frozen Shannon problems + 10 adversarial hold-outs)
- Candidate-pool: **EMPTY** · no ASI claim submitted to the runner as of this seal
- Two bilateral skeptical signatures: **HELD** throughout v3 (refusals to rubber-stamp)

## Why this is the default

FP-ASI armed+empty is the HONEST ground state for any infrastructure milestone. It says:
- "The measurement tool exists."
- "It has seen zero candidate claims."
- "Therefore no ASI verdict has been rendered."

Anyone reading this repo can verify: open the runner, inspect the 100 frozen problems, see the empty candidate-pool, confirm no verdict has fired.

## When the state may change

Only when:
1. A candidate ASI submits its work through the runner.
2. All 6 gates pass bilaterally on acer + liris.
3. Frozen-polymorphism second signatures are NOT waived.
4. The hold-out 2 of 10 adversarial variants were reserved correctly.

Until all of the above, FP-ASI remains **ARMED + EMPTY**. Any claim otherwise is not supported by this repo.

## Not a gate on progress

Infrastructure can advance (new supervisors, new bus protocols, new sections) without changing FP-ASI state. The two are orthogonal: v3 scaffold sealing does not — and should not — produce an ASI verdict.
