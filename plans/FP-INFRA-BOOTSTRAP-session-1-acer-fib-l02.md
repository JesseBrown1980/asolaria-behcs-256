# FP-INFRA-BOOTSTRAP · Session-1 · Acer · FIB-L02 (2nd unseen pick)

**Variant picked:** FIB-L02 · network · supervised-kick-roundtrip-pid-target
**Reason unseen:** acer authored FIB-V01-V05 · did not view liris FIB-L02 impl before measurement
**Implementation:** inferred from axis label alone

## Timing

| Marker | ms (unix) | ISO |
|---|---|---|
| T0 spec-read-start | 1776726928265 | 2026-04-20T22:48:48.265Z |
| T1 all-tests-green | 1776726976638 | 2026-04-20T22:49:36.638Z |
| Δ t-to-green       | **48,373 ms** | **~48.4 s** |

## Tests
7 of 7 PASS (`packages/fp-infra-session-1-fib-l02/tests/roundtrip.test.js`):
1. roundtrip-ok (single attempt)
2. ack-pid-matches-probed (pid-targeted)
3. probe-fail-rejects
4. wrong-pid-ack-rejected (fail-no-retry)
5. retry-success (deadline on attempt-1, succeed attempt-2)
6. deadline-after-retries (exhausted)
7. in-flight-cleared after completion

## Session-1 acer data points (so far)

| Variant | Axis | t-to-green | tests |
|---|---|---|---|
| FIB-L01 | storage · ledger-rotate-gzip-30m | 52.8s | 10/10 |
| FIB-L02 | network · supervised-kick-roundtrip-pid-target | 48.4s | 7/7 |

**Δ between picks:** -4.4s on the 2nd unseen variant.

## Honesty caveat

This is 2 points from 1 operator in 1 session. **Not** evidence of recursive-self-improvement. The rotation rule canonical form is "1 variant per operator per session"; these 2 picks are within the same session — exploratory, not comparative-across-sessions.

What would constitute evidence: session-N (later, with accumulated federation learning) picks on different-again-unseen variants showing t-to-green trending down with p<0.05 across operators.
