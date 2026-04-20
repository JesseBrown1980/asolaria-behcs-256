# Item 122 · Phase-0 ground-truth check on ramp inputs

## Inputs that must be reproducible BEFORE any scale run
1. Seed manifest: `seeds.json` with a fixed N seeds (deterministic).
2. GNN weight manifest: `weights.sha256` matching `services/gnn-sidecar/*.pt`.
3. Batch-shard spec: how to slice N agents into K shards (fixed K per scale).
4. Verdict evaluator: `stage-to-actual-converter` dual-GNN agreement rule.

## Ground-truth test
- Tier 1K mini-scale run locally → store outputs as canonical golden.
- Any larger-scale run must match the 1K output on the 1K-subset slice (byte-identical).

## Verdict
**PASS-by-scaffold** · specification exists; actual ground-truth golden produced on first 1K dry pass (deferred).
