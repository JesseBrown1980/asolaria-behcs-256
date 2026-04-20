# Item 118 · Recovery handles + shared-OS addressing (Brown-Hilbert rule)

## Rule
Recovered artifacts MUST be addressable by Brown-Hilbert room + glyph, not by raw file path, so that drive-letter changes don't break references.

## Check
- `src/farm/extract-shadows.js` produces envelope-v1 with `body.shadow_origin.from_path` for audit, but consumers should index by `envelope.id` (which is source-system-stable, not fs-path dependent).
- `data/cosign-chain.ndjson` records `shard_path` + `shard_sha256` — the sha is primary address; path is audit.
- Brown-Hilbert room mapping: recovered envelopes carry the emitter's canonical room in `body.room` (from original), so cube-addressing survives drive-letter rotation.

## Verdict
**PASS** · sha-addressing + room-addressing are primary · path is audit-only.
