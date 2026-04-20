# Item 121 · 5-scale GNN ramp

| Tier | Agents | Use | Expected walltime |
|---|---|---|---|
| 100M | 100,000,000  | smoke + calibration              | ~6 min |
| 1B   | 1,000,000,000 | baseline (completed 2026-04-19) | ~64 min |
| 10B  | 10,000,000,000 | soak                           | ~11 h  |
| 50B  | 50,000,000,000 | multi-day rig                  | ~55 h  |
| 100B | 100,000,000,000 | stress ceiling                | ~110 h |

## Input
Fanout seeds + fixed GNN weight manifest per-scale. Inputs deterministic; ts/throughput excluded from signed artifact (content-deterministic rule).

## Output
`data/gnn/<scale>-manifest.json` with sha256 over all intermediate batch-shards.

## Honesty clause
Per IX `feedback_300B_gnn_validation_was_false`: any claim beyond completed scale is UNPROVEN until manifest appears on disk with matching bilateral sha.
