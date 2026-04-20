# Item 179 · Acer archaeology operator procedure

## Tools
- Windows: `$Recycle.Bin` · VSS (`vssadmin list shadows` + `mklink /d snapshot \\?\GLOBALROOT\...`)
- File History (Control Panel → Restore personal files)
- OneDrive recycle bin (if synced)
- `git reflog` for deleted branches

## Rule
1. Run recoveries ONLY with operator authorization (never auto).
2. Land recovered files at `D:/Asolaria-RECOVERED/<ts>/` first — do NOT overwrite production.
3. Review each file per `plans/N/provenance-review.md`.
4. Multi-agent cosign before any public-repo ship.

## Incident reference
2026-03-30: USB diskpart-clean incident lost IX-486→493. Never-wipe rule canonized. Recovery procedures are the counter-measure.
