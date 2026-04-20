# Item 152 · Gulp 2000 stages

Steps alternate through 4 stages (step N mod 4):

| mod | Stage | Purpose |
|---|---|---|
| 0 | build     | produce artifact for step N |
| 1 | validate  | run tests / schema check |
| 2 | sign      | cosign-append with acer+liris sigs |
| 3 | deploy    | emit deployment envelope + register in manifest |

Total 2000 steps = 500 cycles × 4 stages. Resumable from any step via `runGulp2000({ startStep })`.
