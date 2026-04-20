# Item 093 · LCR · Local Confidence Ratio · per-stage metric

## Definition
`LCR_stage = (omni_score_at_stage + reverse_score_at_stage) / 2` clamped [0..1], where each stage can emit a partial score. LCR < 0.5 = low-confidence at that stage; ≥ 0.7 = high-confidence.

## Emission
Each stage emits `{ stage: "S07", LCR: 0.82, provenance: { omni: 0.84, reverse: 0.80 } }` into `shannon-trace.ndjson`.

## Civilization-pass verdict
- mean(LCR) >= 0.65 AND min(LCR) >= 0.40 → `pass`
- mean(LCR) < 0.50 → `fail`
- otherwise → `mixed` (CIVILIZATION-CHAIR decides)

## Anti-hack
Per Frozen-Polymorphism: if ANY stage reports LCR=1.0 for more than 3 consecutive stages, flag `convergent-confidence-trap` and cut LCR there to 0.5.
