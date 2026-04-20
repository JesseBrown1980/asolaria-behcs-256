# Product X Agent Console (item 189)

Rebuild target. Console app scaffold lives at `apps/console/`. Full UI pending.

## Design
- Lists agents from `/agent.list` (:4952)
- Spawn/close via `/agent.spawn` / `/agent.close`
- Poll envelope stream via `src/ru-view/adapter.js`

## Namespace
On BEHCS-256 namespace; uses `src/product-x/*` helpers (public-name-protected).
