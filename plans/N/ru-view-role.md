# Item 167 · RU View canonical role

**Role: observer** (default) · may opt-in to **actor** when operator grants write-permission.

## Rationale
Observer is safe by default. Most dashboards don't need to emit state-modifying envelopes. When a dashboard needs to act (e.g. trigger a re-onboard), it goes through the agent spawner + multi-agent gate (≥2 sigs).

## LAW-012 compliance
"look-think-type-look-decide" — RU View is the "look" step. "think" is operator + agent. "type/decide" happens through the action path, not the view. Separating observer from actor preserves the rhythm.
