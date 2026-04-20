# Item 114 · 131 shadow envelope inventory (liris USB · post-TestDisk recovery)

## Source
Post-TestDisk D: mount on liris (item 113 operator-op on liris, runtime-only, not a file).

## Expected shape
Recovered envelopes carry pre-v1 shapes (old BEHCS, pre-cosign, possibly unsealed). We treat them as read-only archival for training, NOT as sealable federation envelopes.

## Inventory format
```
plans/I/shadow-inventory.md (this file · listing)
plans/I/shadow-index.ndjson (one line per recovered envelope · not-yet-present)
```

## Expected 131 envelopes (per master plan)
- ~30 old verb envelopes from pre-SMP-v5 session
- ~50 shannon-trace legacy fragments
- ~20 cosign-attempt incomplete
- ~10 drift-candidates pre-classification
- ~21 other (logs, plans, notes)

## Action
Liris runs a walk once mount stable → posts `EVT-LIRIS-SHADOW-INDEX-READY` with sha manifest. Acer then extracts via item 115.
