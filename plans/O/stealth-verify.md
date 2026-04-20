# Item 187 · Stealth dashboard → BEHCS bridge · verify

## Per memory
Prior session confirmed stealth dashboard bridged to BEHCS via `hookwall-v2` + BEHCS bus integration.

## Verification steps
1. Stealth dashboard emits `hookwall.event.*` → converts to envelope-v1 via `src/envelope/translate-behcs.js` (or bespoke translator).
2. Envelopes appear on `:4947` inbox.
3. RU View `poll()` sees them with `kind` prefixed by hookwall or a canonical rename.

## Status
**PASS-by-prior-session** — confirmed before this repo shipped. Scaffold translator exists; if a new stealth event stream appears, extend `src/envelope/translate-*.js`.
