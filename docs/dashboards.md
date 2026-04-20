# Item 195 · Combined Dashboards Operator Guide

## Dashboards shipped
| Dashboard | Path | Source |
|---|---|---|
| Admin (82-route unified) | `src/dashboards/admin.js` | `src/ru-view/adapter.js` poll |
| Falcon event stream      | `src/dashboards/falcon.js` | bus filter src=falcon |
| Gulp 2000 progress       | `src/gulp/dashboard.js`    | `tmp/gulp-2000-state.json` |
| Drift history            | `src/drift/dashboard.js`   | `data/drift-history.ndjson` |
| Agent list               | `/agent.list` :4952        | registry |

## Common contract
All consume envelope-v1 via RU View adapter OR read-only filesystem artifacts. None EMIT without going through the multi-agent gate.

## Operator
Dashboards are OPERATOR-facing only. Third-party clients should NOT be pointed at these endpoints.
