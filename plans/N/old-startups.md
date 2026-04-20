# Item 163 · Cross-reference acer findings vs old Asolaria startups

## Old startups (pre-BEHCS-256)
Lived at `C:/Users/acer/Asolaria/`: `Gaia.cmd` · `Start-Asolaria-*.cmd` · `Install-Jesse-SuperAdminTerminal.cmd` etc. Inventory at 162.

## New BEHCS-256 path
`asolaria-behcs-256` (this repo) · daemons started via `node packages/<name>/bin/daemon.mjs`.

## Cross-ref notes
- Old `Start-Asolaria-Core.cmd` ≈ new `node packages/pid-targeted-kick-supervisor/bin/daemon.mjs` + `new-applicant-onboarding-supervisor` + `meta-supervisor-hermes`.
- Old `Gaia.cmd` ≈ new `one-button` boot sequence TBD (Section O or operator-wrapper).
- Old `Start-Omnispindle.cmd` ≈ `packages/omnispindle-spawn-acer/` (v2 shipped).

## Migration policy
Operators keep old .cmd launchers until `one-button` wrapper shipped. No file deletion.
