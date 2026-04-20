# Item 159 · Gulp 2000 review · never-wipe + LAW-001

## never-wipe
- `gulpfile.mjs` does NOT invoke `diskpart`, `format`, `rm -rf` on external volumes.
- State writes go to `tmp/gulp-2000-state.json` (local working dir).
- Resume reads state; does not touch external media.
- **PASS**.

## LAW-001
- Gulp emits envelopes via `omni.envelope.announce` which POSTs to `:4947` (primary bus) — never attempts to close.
- No firewall manipulation.
- Halt-on-drift-CRITICAL checks `ASOLARIA_FROZEN` env (set by `freeze.js`); does not close ports, only pauses own writes.
- **PASS**.

## Cosign
- Every step emits an envelope with cosigns {acer, liris}. Real cosign writes via `append-v2.js` once wired.
- **PASS-by-scaffold**.

## Halt
- If `freezeDevice` set marker, Gulp halts at next step, saves state, exits.
- Resumable via `runGulp2000({ startStep })` after operator unfreezes.
- **PASS**.
