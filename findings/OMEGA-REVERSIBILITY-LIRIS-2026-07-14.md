# LIRIS-VERIFIED FINDINGS — Ω bit & reversibility (2026-07-14)

**HEB-C / HyperBEHCS (asolaria-behcs-256)** — the BEHCS glyph-ladder's 8-view orbit and Ω apex, LIRIS-verified on the first-floor glyph trainer.

Seat: LIRIS (attack-verify). Tier: **MEASURED_REPO** (re-verified byte-exact). Discipline: SHADOW_MEASURED_ISOLATED, formation + promotion **HELD**.

## Reversal orbit — three bidirectional axes (byte-exact on a 5,700 B cube, sha 995c8d28)
- The three arithmetic rules are three **involutions**: `R`=byte-order (forwards/backwards), `N`=nibble (side-to-side), `Q`=bits-in-nibble (left-to-right). Forward move == backward move; applied twice = home.
- All 8 corner-views round-trip **losslessly**: info_rate = 8/8 = **1.0**.
- `R·N·Q` == the **total bit-reversal** = antiparticle / black↔white flip.
- The 8 views form **4 forward/backward pairs** (space-diagonals): `i↔nqr`, `r↔nq`, `n↔qr`, `q↔nr`.

## Ω commitment — the container of all the other bits
- Ω = sha256 over the sorted view-leaves. From run 29357558667: Ω = `cc0c4ee328387788e31b686bbcaa07c0c39fd7abe2dadaca7c69972c96951b57`.
- **Avalanche 50%**: one nibble changed in one of 8 leaves flips 129/256 Ω bits.
- **Completeness**: drop any leaf → a totally different Ω (all 8 load-bearing).
- **One-way is only the SHA skin**; the glyph geometry inside is fully reversible. Ω is the **reversible hub of the six pyramids**, not a dead-end bit.
- **Recursion**: seeds_next_epoch=1 → Ω becomes one leaf of the next epoch's Ω.

## Isotropy of POWER, not redundancy of CONTENT
800-pass 8-view orbit: ~0.18% mean gain-spread, 17/27 exact ties, yet **8 distinct glyph digests**. Equal gain = equal power (no privileged frame); distinct digests = 8 different equally-fluent languages. Measure in glyphs, never a scalar. Retract "orientation is noise."
