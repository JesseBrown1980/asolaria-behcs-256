# Item 135 · Migrator integrity review

## Check
1. `migrate-v1-v2` reads v1 line-by-line, walks parent-chain-hash forward per entry.
2. Each v2 entry's chain_hash = sha256(canonical JSON of {ts, envelope_id, sha256, agents-sorted, parent_chain_hash}).
3. `verifyChain` recomputes the same function and catches any tampered entry OR broken parent link.

## Property: tamper-evidence
If ANY entry's `sha256` / `envelope_id` / `agents` is modified, `chain_hash` no longer matches. Recomputation at verify-time catches it.

## Property: append-only
Chain grows monotonically. Past entries never rewrite; `parent_chain_hash` pins ordering.

## Property: preserves v1 content
All v1 fields (ts, envelope_id, sha256, agents) survive into v2 intact; v2 only ADDS.

## Verdict
**PASS** · migrator preserves integrity, `verifyChain` gates replay + tamper.
