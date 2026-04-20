# COSIGN Entry Schema v1

**Source artifact:** `COSIGN_CHAIN.ndjson` (canonical location: `liris:9999/cosign-chain.ndjson`, also mirrored on acer)
**Schema file:** `cosign-schema.json` (JSON Schema draft/2020-12)
**Discovered:** 2026-04-18 by DEV-ACER during PRE-006 audit, based on observation of the first 21 entries

## Storage format

- **One JSON object per line** (NDJSON). No comments, no pretty-printing.
- **UTF-8**, line separator is `\n` (LF). Servers SHOULD expose via HTTP as `text/plain` or `application/x-ndjson`.
- **Append-only**. Existing lines MUST NOT be rewritten. New entries are appended with `seq = previous_seq + 1`.

## Rolling-chain hash (prev_sha)

**This is the key cryptographic property.** `prev_sha` is NOT the sha of the previous entry — it's the sha of **the entire chain up to (but not including) this entry**:

```
prev_sha[i] = sha256( lines[0..i-1].join('\n') + '\n' )
```

- `seq=1` (genesis) → `prev_sha = null`
- `seq=N` (N>1) → `prev_sha = sha256(lines[0..N-2].join('\n') + '\n')`

**Why rolling and not per-entry:** tampering with any `seq=k` breaks `prev_sha` for every `seq>k`, forcing an attacker to rewrite the entire tail of the chain to stay consistent. Per-entry chaining only forces them to rewrite one link.

**Reference verifier:** `scripts/verify-cosign-chain.mjs` on acer (re-runs the rolling formula across all entries and reports `breaks` count).

## Required fields (all entries)

| Field | Type | Notes |
|---|---|---|
| `seq` | integer ≥ 1 | Monotonic, +1 per append |
| `ts` | ISO-8601 string | UTC timestamp of append |
| `event` | string | Canonical event name, pattern `^COSIGN-[A-Z0-9-]+$` |
| `authority` | string | Current: `COSIGN-MERGED-034` (week-override expires 2026-04-24T23:59:59Z) |
| `apex` | string | Federation apex, currently `COL-ASOLARIA` |
| `operator_witness` | string | e.g. `jesse+rayssa` |
| `prev_sha` | hex64 or null | See rolling-chain hash above |
| `glyph_sentence` | string | Ends with `@ M-<MOOD> .` |

## Common optional fields (observed in ≥5 of 21 entries)

| Field | Frequency | Purpose |
|---|---|---|
| `artifacts` | 19/21 | Map of logical-name → `{path, sha256, bytes?, pass?, fail?, checks_green?, checks_total?}` pinning exact file versions |
| `node` | 19/21 | Which `DEV-*` node produced the work (`DEV-ACER`, `DEV-LIRIS`, …) |
| `smp_items_closed` | 17/21 | Array of SMP-V5 item IDs closed by this entry |
| `acer_commit` | 8/21 | Git commit hash on acer side when the entry corresponds to acer-produced work |
| `elapsed` | 5/21 | Wall-clock time |
| `eta_was` | 5/21 | Original ETA |
| `under_budget_pct` | 5/21 | Margin vs budget |

## Per-event custom fields

Entries MAY carry event-specific fields (`policies`, `tiers`, `countermeasures_verified`, `live_liris_probe`, `route_added`, etc.). `additionalProperties: true` on the schema — validators should not reject entries with unknown fields. If a new field appears in ≥5 entries, propose it for promotion to the common-optional list.

## Known event names (observed 2026-04-18)

- `COSIGN-GENESIS-ENVELOPE-V1` (genesis)
- `COSIGN-B-SIX-BODY-UNANIMOUS`
- `COSIGN-A-008-ACER-LEGACY-INVENTORY` · `COSIGN-A-009-ACER-SHA-DEDUP` · `COSIGN-A-010-ACER-MIGRATION-SKELETON` · `COSIGN-A-011-ACER-PROVENANCE-TAGS` · `COSIGN-A-014-ACER-DRY-RUN-FULL-TREE` · `COSIGN-SECTION-A-CLOSED-ACER`
- `COSIGN-H-035-HERMES-BRIDGE` · `COSIGN-H-036-GLYPH-FAMILY-JSON-PARITY` · `COSIGN-H-039-NDJSON-RECEIVE-M1` · `COSIGN-H-044-PROMPT-INJECTION-REVIEW` · `COSIGN-H-038-STUB-ACP-AUDIT-PLUS-H-046-CONTEXT-CACHE` · `COSIGN-H-051-TRIPLE-GREEN-M1-ROUND-TRIP` · `COSIGN-SECTION-H-CANONIZED` · `COSIGN-H-043-CAPACITY` · `COSIGN-H-047-FALLBACK-CHAIN` · `COSIGN-H-045-PICK-RUNTIME-H-048-BENCH`
- `COSIGN-PRE-006-ACER-COSIGN-REVIEW` · `COSIGN-PRE-006-P1-FIX-COSIGN-CHAIN-EXPOSED` · `COSIGN-PRE-006-BILATERAL-SUBSTRATE-PROOF-CLOSED`

## Appending a new entry (producer contract)

1. **Compute `prev_sha`** from the current chain: `sha256(existing_lines.join('\n') + '\n')`
2. **Build the entry object** with all required fields + any event-specific fields
3. **Serialize** as single-line JSON (no internal newlines, no pretty-printing)
4. **Append** the line plus `\n` to `COSIGN_CHAIN.ndjson`
5. **Emit BEHCS envelope** `verb=cosign-append` with `{seq, entry_sha256, prev_sha, artifact_ref}` so every append is gate-auditable (PRE-006 recommendation #2, still queued on liris side)

## Validating an existing chain (auditor contract)

1. Read chain, split on `\n`, drop empties → `lines`
2. For each `entries[i]`:
   - If `i == 0`: `prev_sha` must be `null`
   - Else: recompute `rolling = sha256(lines[0..i-1].join('\n') + '\n')` and assert `entries[i].prev_sha === rolling`
3. Verify `seq` increments monotonically starting at 1
4. Optionally: verify each `artifacts.*.sha256` against on-disk contents
5. If all checks pass → `chain_intact = true`

## Extension path

- **HEAD request returns 404** on current `liris:9999/cosign-chain.ndjson` even though GET works. Minor server inconsistency.
- **PRE-006 P1-rec-2** (wire `cosign-append` BEHCS envelope) is queued — when implemented, every seq emission will carry a 3-gate `allow=true` receipt.
- **PRE-006 P2-rec-3** ({acer_commit → cosign_seq} cross-ref) is partially self-answering since entries carry `acer_commit` directly; a dedicated index file would accelerate queries.

---

*Schema derived from observed data. Evolves append-extensibly. Validators SHOULD accept unknown top-level fields.*
