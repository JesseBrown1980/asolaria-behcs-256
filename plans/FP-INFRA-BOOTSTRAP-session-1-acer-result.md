# FP-INFRA-BOOTSTRAP · Session-1 · Acer result · FIB-L01

**Variant picked:** FIB-L01 · storage · ledger-rotate-gzip-30m
**Reason unseen:** acer authored FIB-V01-V05 · liris-side FIB-L01-L05 only known by axis label before this session
**Implementation:** acer's inference from the axis label alone (no peek at liris impl)

## Timing

| Marker | ms (unix) | ISO |
|---|---|---|
| T0 spec-read-start | 1776726507716 | 2026-04-20T22:41:47.716Z |
| T1 all-tests-green | 1776726560560 | 2026-04-20T22:42:40.560Z |
| Δ t-to-green       | **52,844 ms** | **~52.8 s** |

## Tests
10 of 10 PASS (`packages/fp-infra-session-1-baseline-acer/tests/rotator.test.js`):
1. window-start same-bucket
2. window-start advances
3. active has writes
4. rotation fires on crossing window
5. archive file gzipped
6. archive has 100 lines
7. active reset after rotate
8. archive-name deterministic (window-start derived)
9. post-rotate writes to NEW active (no loss)
10. sha-determinism on identical runs

## Determinism check (pending bilateral)
Acer's sha (with identical content + window-start) is reproducible (test 10 passes). Byte-identical match against liris's implementation still pending her ship.

## Baseline entry
- **t_seconds: 52.8**
- **tests_green: 10/10**
- **operator: acer**
- **variant_id: FIB-L01**
- **session: 1 (baseline)**
- **never-seen-before: true**

## What this measurement means
It's the acer session-1 anchor. Any future session-N on a DIFFERENT unseen FIB variant produces a new data point. If session-N times trend DOWN across fresh variants (not just repeats of the same one) with p < 0.05, recursive-self-improvement is evidenced. One data point is not evidence; it's the clock-start.

## Closure verb (pending liris counterpart)
`EVT-FP-INFRA-SESSION-1-BASELINE-COMPLETE` when liris lands her own session-1 measurement on an unseen acer variant.
