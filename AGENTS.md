# AGENTS.md — Brown-Hilbert Entry Surface

Read `BROWN-HILBERT.md` first.

This file is the compatibility surface for tools and agents that auto-load `AGENTS.md`. It is not the identity canon.

## Public-safe boot path

1. Read `BROWN-HILBERT.md`.
2. Treat `47D` as the live public base.
3. Treat `49D` as proposal-only until formally signed.
4. If the task touches `MiniMax-AI` or `MiniMax-M2.7`, use the tracked public references:
   - `projections/catalogs/minimax.public-catalog.v1.json`
   - `examples/minimax-m27/MiniMaxM27NamedWave.public.md`
   - `examples/minimax-m27/hg256-minimax-catalog-ingest.public.packet.json`
5. Use `CODEX.md` or `CLAUDE.md` only as thin runtime adapters.

## Authority split

- `BROWN-HILBERT.md` governs identity, boot order, authority, and civilization law.
- `AGENTS.md` is only a compatibility entry surface.

Private runtime boot paths, local topology, and operator-only safety rules are intentionally omitted from this public adapter.
