# Item 072 · Identity persistence across reboot · liris-side test

## Procedure
1. On liris, `node -e 'require("asolaria-behcs-256/src/identity/fingerprint.js").fingerprint().then(console.log)'` → note `shape_fingerprint`.
2. Write identity via `writeIdentity("C:/Users/rayss/Asolaria-BEHCS-256/_asolaria_identity.json", { hw_pid: ..., surface: "liris-rayssa", stable_tuple: [...], shape_fingerprint: ... })`.
3. Reboot liris's host.
4. After reboot, run `guardSpawn()` → expect `{ ok: true }` with same shape_fingerprint.

## Acceptance
- shape_fingerprint unchanged across reboot (hardware-derived, not randomized).
- `hw_pid` stable.
- guardSpawn allows spawn.

**Status:** test-plan-only (requires operator reboot of liris). Plan documented; run via Rayssa when convenient.
