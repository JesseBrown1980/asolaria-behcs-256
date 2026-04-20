# Item 089 · Cross-host-destination-authority on freeze review

## Rule
`freezeDevice` may only freeze the LOCAL host. No mechanism exists (or should exist) to remotely freeze another node.

## Code review
- `freeze.js` writes `~/.asolaria-freeze` — local filesystem only.
- No `fetch` / `http` call in `freeze.js`.
- No environment variable setting affecting other processes.
- `broadcast.js` tells OTHER nodes about drift; they decide themselves whether to freeze.

## Adversary thought
If a malicious drift envelope lands with `class: CRITICAL` for a spoofed `hw_pid`, the RECEIVING node only inspects its LOCAL fingerprint — it does not auto-freeze based on the envelope's claim alone.

## Verdict
**PASS** — authority to freeze is strictly local. Cross-host trigger is announce-only.
