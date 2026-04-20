# Item 088 · No-unilateral-federation-link-severance review

## Rule
No single device may unilaterally sever federation links. Drift broadcasts FLAG state; they never mute another node.

## Code review
- `broadcast.js` fans out via `sendFn` — only SENDS, never revokes auth, never fires close.
- `freeze.js` freezes LOCAL writes only — no impact on other nodes' ability to write to us or each other.
- `halt-handler.js` never calls a close/revoke/block primitive.
- `server.js` `/drift.report` accepts incoming; even in frozen state incoming bus connections are preserved (LAW-001).

## Verdict
**PASS** — drift module cannot sever federation. Worst case: affected node freezes itself, everyone else continues.
