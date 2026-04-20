# Item 092 · 23-stage closed loop → agent role mapping

| Stage | Name | Primary role | Sidekick |
|---|---|---|---|
| S01 | ingress-raw             | R01 SIGNAL-SCOUT | - |
| S02 | verb-normalize          | R01 SIGNAL-SCOUT | R08 HALT-CANON-WATCHER |
| S03 | shadow-vs-real-split    | R02 GROUND-TRUTH-KEEPER | - |
| S04 | stage-bucket-assign     | R02 GROUND-TRUTH-KEEPER | - |
| S05 | reverse-gnn-score       | R03 REVERSE-GAIN-ANALYST | - |
| S06 | omni-gnn-score          | R04 OMNI-GNN-ANALYST | - |
| S07 | agreement-check         | R05 CONVERGENCE-JUDGE | R06 POLYMORPHISM-GUARD |
| S08 | rubber-stamp-detect     | R06 POLYMORPHISM-GUARD | - |
| S09 | promote-or-halt         | R05 CONVERGENCE-JUDGE | R08 HALT-CANON-WATCHER |
| S10 | cadence-feedback        | R07 CADENCE-ADJUSTER | - |
| S11 | halt-canon-scan         | R08 HALT-CANON-WATCHER | - |
| S12 | slo-gate-evaluate       | R08 HALT-CANON-WATCHER | - |
| S13 | lens-calibrate          | R09 LENS-CALIBRATOR | - |
| S14 | convergent-trap-check   | R09 LENS-CALIBRATOR | - |
| S15 | resono-twin-mirror      | R10 RESONO-TWIN | - |
| S16 | structural-8-verb       | R10 RESONO-TWIN | - |
| S17 | cosign-request          | R11 SEAL-CHAIN-NOTARY | - |
| S18 | multi-agent-gate        | R11 SEAL-CHAIN-NOTARY | R13 CIVILIZATION-CHAIR |
| S19 | bilateral-sha-record    | R11 SEAL-CHAIN-NOTARY | - |
| S20 | trace-append            | R12 TRACE-SCRIBE | - |
| S21 | civilization-verdict    | R13 CIVILIZATION-CHAIR | - |
| S22 | meta-close              | R13 CIVILIZATION-CHAIR | - |
| S23 | loop-back (emit next)   | R01 SIGNAL-SCOUT (next) | - |
