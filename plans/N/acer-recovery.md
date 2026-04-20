# Item 176 · Acer archaeology · recover deleted files

## Sources
- `$Recycle.Bin` (already observed at repo root per gitStatus)
- Volume Shadow Copy Service (VSS): `vssadmin list shadows`
- File History / OneDrive Recycle / Git reflog

## Recovery priority
1. Any file referencing `asolaria`, `behcs`, `brown-hilbert`, `shannon` — P0.
2. Any `_asolaria_identity.json` drafts — P0.
3. Any plan-N (batch, cascade) artifacts — P1.
4. Old `.cmd` launchers (may diff vs current canonical set) — P2.

## Rule
Recovered files land at `D:/Asolaria-RECOVERED/` (liris-side per prior incident). Shipping to public repo requires provenance review (item 178).

## Status
Procedure documented. Live recovery runs OPERATOR-side, not auto-dispatched.
