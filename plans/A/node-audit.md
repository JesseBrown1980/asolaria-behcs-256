# Item 011 · node_modules audit

Scan across all 42 packages + legacy-import + services.

## Current state (post-v2 cleanup)

| Package | node_modules size | action |
|---|---|---|
| packages/ocr-bridge | **removed in v2** (was 51 MB tesseract.js) | re-install via `npm i` if OCR needed |
| all other packages | **none checked in** | regenerated on install |

Repo-wide grep: `find . -name node_modules -type d` returns **0** hits inside `asolaria-behcs-256/`.

## Rule

`.gitignore` already bars `node_modules/`. Pre-commit hook (item 010) blocks new additions. No action required.

## Flag

`packages/ocr-bridge/eng.traineddata` (5 MB tesseract training data) was also removed in v2. If ocr-bridge is re-activated, fetch from tesseract.js releases in runtime not via git.
