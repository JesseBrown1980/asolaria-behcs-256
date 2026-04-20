# Item 073 · USB-move rejection test

## Procedure
1. On acer, write identity to a USB drive at `E:/_asolaria_identity.json` with acer's fingerprint.
2. Move USB to liris.
3. Liris boots Asolaria with USB mounted; `guardSpawn({ identityPath: "E:/_asolaria_identity.json" })` must REJECT.

## Expected
```
{ ok: false, reason: "identity-mismatch", expected: "sha256:<acer-fp>", current: "sha256:<liris-fp>", action: "REFUSE-SPAWN · emit EVT-IDENTITY-MISMATCH · operator must re-anchor" }
```

## Why it matters
Prevents the USB-transplant-clone scenario. Identity is bound to hardware; moving the JSON alone does not transfer the identity.

**Status:** test-plan-only (requires physical USB move). Covered by unit-test on the reject path once `tests/identity/*.js` is added.
