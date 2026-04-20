# Item 102 · Convergent-confidence-trap false-positive review

## Trap criteria
3 consecutive stages reporting LCR >= 0.95.

## False-positive risks
1. A genuinely high-confidence sequence through 3 perception stages (S01-S03) — expected to score high.
2. Replay of deterministic content through stages S17-S19 (cosign request → multi-agent-gate → bilateral-sha) — these stages encode identity, near-perfect by design.

## Mitigation
- Trap check is ADVISORY (returns `tripped: true` + `recommendation`), not MANDATORY cap.
- Operator + CIVILIZATION-CHAIR (R13) decide whether to cap.
- Stages S17-S19 are ALLOWED to exceed the streak when `bilateral_sha_match === true` (gate bypass).

## Verdict
PASS with caveat: trap is a hint, not a hard block. Consumer decides.
