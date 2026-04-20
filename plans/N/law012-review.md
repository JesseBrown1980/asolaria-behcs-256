# Item 175 · RU View vs LAW-012 look-think-type-look-decide

## LAW-012 sequence
1. **look** — observe state
2. **think** — plan
3. **type** — propose an action (envelope)
4. **look** — verify proposal landed + world responded
5. **decide** — act or recompute

## RU View role in each step
| Step | RU View role |
|---|---|
| look (1) | **PRIMARY** — the view IS the look |
| think    | N/A (agent-side) |
| type     | N/A (action path) |
| look (4) | **PRIMARY** — verify via fresh poll |
| decide   | N/A (operator or agent) |

## Compliance check
- `src/ru-view/adapter.js` `poll()` is read-only — supports step 1 + step 4.
- Does NOT expose a POST/write endpoint by default — cannot violate the "type" step from the view itself.
- Opt-in to actor role requires multi-agent gate at the action path.

## Verdict
**PASS** — RU View respects look-only contract; action goes through separate agent path.
