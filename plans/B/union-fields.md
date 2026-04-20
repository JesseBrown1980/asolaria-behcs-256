# Item 019 · Union field set (BEHCS × DroidSwarm × OP_DISPATCH)

## Required (all 3 schemas converge)
- `id` (string) — unique envelope ID
- `ts` (ISO string or unix-ms) — event timestamp
- `src` (string) — source agent/node (BEHCS=`from`, DroidSwarm=`src`, OP_DISPATCH=`issued_by`)
- `kind` (string) — event class (BEHCS=`verb`, DroidSwarm=`kind`, OP_DISPATCH=`op`)
- `body` (object) — domain-specific payload (BEHCS=`body`, DroidSwarm=`data`, OP_DISPATCH=`args`)

## Optional (subset of schemas)
- `dst` (string) — BEHCS=`to`/`target`; others imply federation
- `actor` (string) — BEHCS only; canonical named-agent
- `mode` (`real`/`shadow`) — BEHCS only
- `payload` (string) — BEHCS human-readable; others omit
- `sig` (object) — ed25519 signature block; BEHCS only (`entry_sig`)
- `glyph_sentence` (string) — BEHCS only; Brown-Hilbert glyph stamp
- `cosigns` (object) — BEHCS only; multi-agent gate signatures

## Reserved for extension
- `d1..d35` — BEHCS-256 dimensional tagging (item 022)
- `d47_ext` — 47D extension block (item 023)

## Law-001/008/012 compliance
- `id` must be unique per envelope (LAW-012)
- `ts` must be strictly increasing within a src (LAW-008)
- no halt-canon-11 word in `kind` unless intentional halt (LAW-001 port 4947/4950 never-close rule · halt doesn't close ports)
