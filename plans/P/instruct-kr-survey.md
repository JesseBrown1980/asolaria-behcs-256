# Item 196 · Instruct-KR artifacts · survey + applicability

## Instruct-KR
Meta-instruction framework for plan-of-plans dispatch. A plan generates sub-plans; sub-plans dispatch actions; actions mint receipts.

## Artifacts observed (acer-side memory + agent-index references)
- `data/agent-index/references/IX-090.md` references Hive-AI + meta-learning lineage.
- `data/agent-index/references/IX-091.md` through `IX-115.md` reference methodology research lineage.
- `packages-legacy-import/src/taskLedgerStore.js` + `taskLeaseLedgerStore.js` — existing task tracking primitives.

## Applicability to ASI-OS
Instruct-KR provides the SHAPE of how ASI-OS consumes SUPER-MASTER-PLAN-v3-200-items.md:
1. Read plan → extract items with deps
2. Topologically sort by deps
3. Dispatch ready items to agents matched by role
4. Collect receipts → update plan state → repeat

Items 197-198 define the spec + executor.
