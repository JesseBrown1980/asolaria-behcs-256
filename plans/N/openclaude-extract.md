# Item 164 · OpenClaude (OpenClaw twin) code artifact extraction

## Background
"OpenClaude" = internal name for an open-source-style Claude-like shell that mirrors federation primitives. The "OpenClaw" branch referenced in older IX entries was the lineage; current naming is OpenClaude.

## Artifacts observed
- Absorption map at `data/agent-index/` references OpenClaude concepts.
- `packages/hermes-absorption/` carries Hermes integration that parallels OpenClaude's concept of self-absorption.
- Prior sessions referenced a 3rd-party clone called "Cursor/Cline/Codex" comparisons.

## Extraction policy
- **Do NOT** publish any upstream proprietary shell source.
- **DO** publish our own `src/openclaude/twin-map.js` — OUR mapping of 8-verb structural twin (item 165).
- Keep the conceptual mapping (8-verb twin binding) in docs; keep concrete third-party source out.
