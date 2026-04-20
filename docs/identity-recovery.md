# Item 074 · Identity recovery procedure

## When to use
- `guardSpawn` returns `identity-mismatch` after legitimate hardware change (disk replacement, motherboard repair, etc).
- `drift-detect` returns CRITICAL after operator-authorized move.

## Recovery steps
1. Operator (Jesse) authorizes re-anchor in writing.
2. `node -e "const {fingerprint,writeIdentity}=require('asolaria-behcs-256/src/identity');fingerprint().then(f=>writeIdentity('C:/Users/<user>/Asolaria-BEHCS-256/_asolaria_identity.json',{hw_pid:'PID-COL-<COLONY>-H04-A01-W027000000-P027-N00001',surface:'<name>',parent:null,stable_tuple:f.stable_tuple,shape_fingerprint:f.shape_fingerprint,provenance:{origin:'jesse-re-anchor',ts:new Date().toISOString()}}))"`
3. Fire `EVT-IDENTITY-RE-ANCHORED` on bus with cosigns (multi-agent gate).
4. Restart `meta-supervisor-hermes` so it re-enumerates against new identity.

## Never
- Never copy an `_asolaria_identity.json` from another machine.
- Never manually edit `shape_fingerprint` — regenerate from live hardware.
