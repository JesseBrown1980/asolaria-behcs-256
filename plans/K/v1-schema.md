# Item 131 · Current COSIGN_CHAIN.ndjson (v1) schema (read-out)

## Observed shape (acer local COSIGN_CHAIN.ndjson)
```json
{ "ts": "<iso>", "envelope_id": "<id>", "sha256": "<64hex>", "a": { "actor": "<name>" }, "b": { "actor": "<name>" }, "chain_hash": "<64hex>" }
```

## Gaps vs v2 needs
- No 47D dimensional tagging
- No scale-ramp tier binding
- No shadow/real mode flag
- No parent-chain-hash (not strictly Merkle-linked, just individual hashes)

## Retain for v2
- ts, envelope_id, sha256, agents list, chain_hash.

## Add in v2
- `dimensional_tags` { d1..d35 optional }
- `scale_tier` (100M/1B/10B/50B/100B/N-A)
- `mode` (real/shadow)
- `parent_chain_hash` (Merkle link)
