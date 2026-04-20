# FP-INFRA-BOOTSTRAP · Session-1 · Acer · FIB-L03 (3rd unseen pick)

**Variant:** FIB-L03 · scheduling · classifier-gulp-wire-1500
**Unseen:** no peek at liris impl
**Impl:** inferred — verb→bucket classifier + cap/watermark flush + dupe-guard

## Timing

| Marker | ms (unix) | ISO |
|---|---|---|
| T0 spec-read-start | 1776727237249 | 2026-04-20T22:53:57.249Z |
| T1 all-tests-green | 1776727314237 | 2026-04-20T22:55:14.237Z |
| Δ t-to-green       | **76,988 ms** | **~77.0 s** |

## Debug cycle (honest record)
First run: **12/14 PASS · 2 FAIL** — classifier order bug: `EVT-FAIL` matched `EVT-` prefix BEFORE the HALT check, routing to "event" instead of "halt".
Fix: reorder `classifyVerb` — halt/fail check FIRST, then heartbeat, then event/op prefixes.
Second run: **14/14 PASS**.
**Debug iteration counted in t-to-green.**

## Tests (14/14)
1-6. classifyVerb: event / op / heartbeat / halt / other / unknown
7. dupe-id rejected
8. cap-based flush fires + 9. correct count
10. watermark-based flush (time-deadline)
11. bucket-keys multi-class
12. missing-id rejected
13-14. stats pending + seen

## Session-1 acer running totals

| Pick | Axis | t-to-green | tests | notes |
|---|---|---|---|---|
| FIB-L01 | storage  | 52.8s | 10/10 | first pass |
| FIB-L02 | network  | 48.4s | 7/7   | first pass |
| FIB-L03 | scheduling | 77.0s | 14/14 | 1 debug cycle (classifier-order bug) |

Mean so far: 59.4s · median 52.8s · spread 28.6s.

## Honesty clause (still holds)
3 points, same session, same operator → NOT evidence of recursive-self-improvement. Pattern visible: first-pass easier variants land faster; a variant with a subtle ordering bug takes a debug loop. This is normal and measured.
