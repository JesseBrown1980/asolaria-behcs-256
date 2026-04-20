# Item 120 · USB farming vs never-wipe-live-disk law

## Law recap
Per incident 2026-03-30 (IX-486 → IX-493): never run `diskpart clean` / `format` / destructive disk op on live sovereignty data. Canonized as ABSOLUTE RULE.

## Code review
- `src/farm/extract-shadows.js` · READS only. No write to source disk.
- `src/farm/cosign-append.js` · appends to `data/cosign-chain.ndjson` on the LOCAL working repo, never on the USB.
- `src/farm/provenance.js` · READS only (sha-hashing a file doesn't modify it).
- `plans/I/rotation-schedule.md` · explicitly bans `diskpart clean` and raw shard publication.

## Adversary thought
A bug in a consumer could pass the USB path as an output_path. Mitigation: `extractShadows` splits input/output; callers control. Recommend a `--dry-run` flag on operator-facing wrapper.

## Verdict
**PASS** · farming module does not write to source USB under any code path. Rule preserved.
