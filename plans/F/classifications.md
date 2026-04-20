# Item 077 · Drift classifications

| Class | Trigger | Action |
|---|---|---|
| SOFT     | hostname change, NIC replaced (mac differs), nothing hw-level touched | `EVT-DRIFT-SOFT-ANNOUNCE` on bus · no freeze |
| HARD     | 1 of 3 stable-tuple items differs (disk swap, mobo replace) | `EVT-DRIFT-HARD-ANNOUNCE` · operator required to re-anchor |
| CRITICAL | all/most tuple items differ (wrong machine entirely) | `EVT-DRIFT-CRITICAL-ANNOUNCE` + `freezeDevice()` on self within 2s |

## Mapping to spawner-guard
- SOFT → spawner still allows (warn)
- HARD → spawner refuses until re-anchor
- CRITICAL → spawner refuses + freeze writes
