# Item 029 · Envelope v1 schema · law-001 / law-008 / law-012 review

**Reviewer:** acer-chair · 2026-04-20T21:10Z

## LAW-001 (ports 4947 + 4950 never-close)
- Schema does not dictate transport. Any publisher using v1 must still emit on `:4947` primary / `:4950` backup.
- No schema field can be weaponized to close ports (no `close_port` / `firewall` keys defined).
- **PASS**

## LAW-008 (monotonic envelope ordering per src)
- `ts` field is required. Consumers enforce `env.ts > prev_ts[env.src]`.
- Schema allows ISO string or unix-ms integer — translator normalizes to ISO.
- **PASS** (enforcement is consumer-side; schema provides the field.)

## LAW-012 (envelope IDs unique)
- `id` required with `minLength: 6`. Translators mint from source-specific IDs.
- Consumer must de-dupe by `id` in a bounded LRU.
- **PASS** (schema provides the uniqueness contract; enforcement is consumer-side.)

## Halt-canon-11
- `kind` is a free string. Substring check for halt-canon-11 words is consumer-side (SLOGate U-008).
- Schema does not block halt-verbs (they're valid signals).
- **PASS** with note: cadence-feedback verbs must NOT contain halt-canon-11 substrings (feedback_content_deterministic_artifacts rule).

## Multi-agent gate
- `cosigns` optional. Gate enforces ≥2 for SMP-v5+ tasks.
- **PASS** · schema allows 0..N cosigns; gate counts at consume time.

## Content-deterministic
- `sig` block is optional. When present, body should NOT contain `ts` / `throughput` / `walltime` / `pid` / `hostname` inside signed subtree.
- Producers must separate timing (outside sig) from content (inside sig).
- **PASS with producer discipline required** (no schema-level enforcement possible).

## Verdict

**APPROVED FOR PUBLICATION** — envelope v1 is law-compliant. Proceed with item 030 announce.
