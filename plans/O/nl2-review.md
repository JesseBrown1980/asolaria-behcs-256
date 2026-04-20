# Item 194 · Codex-built NL2 dashboard · valuable-reuse review

## Prior Codex NL2 dashboard features
- Frame-by-frame NL2 event viewer
- Replay + scrub controls
- Cross-filter by device

## Reusable in BEHCS-256
- Event viewer shape (just bind to `src/ru-view/adapter.js` output)
- Replay primitive (bind to `data/shannon-trace.ndjson` or `data/drift-history.ndjson`)
- Filter pattern (group by `src` + `kind`)

## NOT reusable
- Any embedded device-brand imagery/strings (proprietary name protection)
- Any hard-coded proprietary API paths

## Verdict
**REUSE shape, not content.** Rebuild under `src/dashboards/nl2-viewer.js` using envelope-v1 data only, no Codex UI inherits proprietary labels.
