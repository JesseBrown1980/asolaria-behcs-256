# Item 180 · LAW-008 fs-as-mirror · applied to recovered set

## Law recap
Filesystem is a passive mirror of state. Any observer with fs access can reconstruct the agent's view.

## Recovered artifact compliance
- Recovered files land at `D:/Asolaria-RECOVERED/<ts>/` — readable by operator + inspectors.
- No hidden/encrypted in-memory state bypasses fs.
- Provenance review (item 178) records sha + source + classification — all fs-visible.

## Verdict
**PASS** — archaeology pipeline preserves fs-as-mirror. Nothing hides.
