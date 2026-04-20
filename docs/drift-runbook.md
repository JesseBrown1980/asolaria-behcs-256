# Item 090 · Drift Operator Runbook

## Alert shapes
- `EVT-DRIFT-SOFT-ANNOUNCE`  — hostname/NIC changed; no action required; log and observe.
- `EVT-DRIFT-HARD-ANNOUNCE`  — 1 tuple item changed; operator re-anchor per `docs/identity-recovery.md`.
- `EVT-DRIFT-CRITICAL-ANNOUNCE` — wrong-machine; local writes are FROZEN; operator investigates immediately.

## On CRITICAL
1. Identify source surface from envelope `body.surface` and `hw_pid`.
2. Verify with the operator on that surface (WhatsApp / SMS / keyboard) that the drift is expected (e.g. intentional host migration) vs unexpected (USB-theft, clone).
3. If UNEXPECTED: leave frozen. Quarantine. Investigate via `reports/` + `data/drift-history.ndjson`.
4. If EXPECTED: run identity recovery (`docs/identity-recovery.md`), then `unfreezeDevice("JESSE-UNFREEZE-AUTHORIZED")`.

## Freeze effect
- `~/.asolaria-freeze` marker file exists → all writers check `isFrozen()` before writing.
- Incoming bus connections are PRESERVED (LAW-001) — frozen node still receives, just doesn't emit state-modifying writes.

## Never
- Never unfreeze without operator token.
- Never edit `_asolaria_identity.json` manually during an active CRITICAL.
- Never broadcast-on-behalf of another surface.
