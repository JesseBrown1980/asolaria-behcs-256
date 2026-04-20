# Item 191 · OpenCode / Codex 5.3 artifacts on liris

## Observed names
- `tools/omni/omni-request-processor.js` already handles codex dispatches.
- Multiple IX references to codex-bridge + codex-skill-catalog.
- liris-side instance may hold OpenCode Codex 5.3 cache at `C:/Users/rayss/Asolaria/tools/codex-5.3/` (not confirmed).

## Inventory request
`EVT-LIRIS-CODEX53-INVENTORY-REQUEST` to liris → expect `EVT-LIRIS-CODEX53-INVENTORY-REPLY` with file list + shas.

## Status
Pending liris reply; scaffold below assumes contract.
