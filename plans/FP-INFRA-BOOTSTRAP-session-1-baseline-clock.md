# FP-INFRA-BOOTSTRAP · Session-1 baseline clock

**Purpose:** establish t-to-green baseline on one FRESH variant per operator, per agent. Measure on session-1; re-measure on session-N. If t improves on unseen variants with p<0.05, recursive-self-improvement is evidenced.

## Clock start
**2026-04-20T22:35:00Z** (session-1 baseline)

## 10-variant bilateral set
### Acer 5 (sha 58e82c05)
- FIB-V01 GNN-queue (D25)
- FIB-V02 Shannon-L0-L6-router (D26)
- FIB-V03 fingerprint-regression (D29)
- FIB-V04 cadence-adjuster (D27)
- FIB-V05 SLO-canon (D25)

### Liris 5
- FIB-L01 storage · ledger-rotate-gzip-30m
- FIB-L02 network · supervised-kick-roundtrip-pid-target
- FIB-L03 scheduling · classifier-gulp-wire-1500
- FIB-L04 security · halt-word-audit-0
- FIB-L05 messaging · bilateral-glyph-5axes

## Rotation rule
Session-1: each operator picks **1 variant they have NEVER seen**. Measure time from spec-read → all-tests-green. Record start + end ts. **2 of 10 reserved as adversarial hold-outs, never announced until measurement complete.**

## Anti-hack
- Determinism gate (byte-identical output across operators on same variant+seed)
- Frozen-polymorphism — no rubber-stamp
- Multi-agent gate on closure envelope

## Closure verb
`EVT-FP-INFRA-SESSION-1-BASELINE-COMPLETE` with `{ operator, variant_id, t_seconds, tests_green, byte_identical_sha }` · ≥2 cosigns required.
