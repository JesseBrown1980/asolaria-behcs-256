# Item 075 · LAW-008 · Filesystem-as-mirror review

## LAW-008
The filesystem itself acts as a passive mirror of the federation state. Any observer reading an agent's local fs can reconstruct the agent's view.

## Identity module compliance
- `writer.js` writes atomically (`.tmp` + rename) — readers never see partial JSON.
- `reader.js` fallback-searches standard paths — consistent across agents.
- `provenance.js` preserves origin + ts — fs captures full history.
- `stable-subspace.js` makes paths portable — no drive-letter surprises across agents.

## Verdict
**PASS** — identity module respects fs-as-mirror. No hidden state in memory that can't be reconstructed from disk.
