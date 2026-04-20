# Item 059 · Review-dispatch vs `feedback_send_worker_6_reviews` pattern

## Pattern recap
- Any non-trivial code change goes through 6 independent reviewers before merge.
- Reviewers map to 6 bodies: PLN · EXP · BLD · REV · CHAIR · SUPERVISOR.
- Consensus rule: ≥4 passes → pass · 2-3 → mixed (operator decides) · ≤1 → fail.

## `review-dispatch.js` compliance
- Fans out to all 6 BODIES in parallel via `Promise.allSettled`.
- Each reviewer's result is captured in `by_body[role]`.
- `consensus` field computed: pass/mixed/fail per thresholds above.
- `passed_count` + `total` reported for operator visibility.

**Verdict:** COMPLIANT. The 6-body review fan-out matches the canonical pattern.

## Integration with multi-agent-enforcement-gate
- 6-body review produces a consensus, but the gate separately requires ≥2 agent signatures on the final seal envelope.
- The two mechanisms compose: review establishes technical pass; gate establishes authorization.
