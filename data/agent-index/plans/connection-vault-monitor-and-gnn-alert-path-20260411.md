# Connection vault monitor + GNN alert path

## Goal
- Record every observed connection and every watch/remote/capture surface into the vault.
- Compare each run against the previous snapshot.
- Emit a machine-readable alert when a new connection appears.

## Implemented rule
1. Snapshot active connections and listeners.
2. Classify public endpoints vs local/private routes.
3. Index AnyDesk, Chrome Remote Desktop, Zoom, system capture surfaces, and local Asolaria connectors.
4. Store redacted secret-bearing config metadata only.
5. Append new-connection alerts into both the vault NDJSON stream and the hook-events feed.

## Current result
- GNN alert state: triggered
- New connections this run: 5
- Hook alert event emitted: true

## Next actions
1. Re-run this monitor after any major software or route change.
2. If AnyDesk or Chrome Remote Desktop becomes running unexpectedly, investigate immediately.
3. If new public endpoints appear under unknown processes, treat them as suspicious until classified.

