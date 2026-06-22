# ASOLARIA — Session Update · 2026-06-22 (acer vantage)

Carve-out-clean public summary of the 2026-06-22 acer build session. E=0 throughout —
**nothing fired**, no live daemon restarted, no fabric/cosign write, no run cranked. All code is
test-verified on the acer build seat (Rust 1.x, MSVC/vcvars64). No keys, PII, or vault material here.

## 1. Rust 8-byte host (`asolaria-federation-1024`) — the engine that cranks the recurrence
Eight E=0 wiring cores landed, each `cargo`-verified and pushed as a branch; cumulative branch
**`acer/fleet-capacity-20k`** stacks all of them (pull that one for everything):

- **Agent registry** — real `spawn` / `spawn_real_gated` / `register` / `retire` (never-delete) /
  `heartbeat`; mints `AGT-<vantage>-<role>-H<hex12>` (no_std fnv1a64). NO subprocess — registering
  an agent is pure in-memory bookkeeping (the *virtual-pointer* lane). `6cd9856`, 13/13.
- **Agent classes + 6 separate counters** — `AgentClass{VirtualPointer | RealReceiptGated | Ambiguous}`
  (the `real_agent_storm` storm-guard) + `DispatchCounters` kept STRICTLY separate by layer
  (virtual_registered / omnidispatch_routed / receipt_gated_helper / opencode_free_agent_call /
  os_process_spawn / ambiguous_held — never collapsed). Bilateral guardrail (liris): a pointer
  registration is NOT an OS process; `os_process_spawn` stays 0 until a gated fire.
- **FEDENV-v1 validator** (`kernel/core/src/envelope/fedenv.rs`) — port of the omnidispatcher
  `validator.mjs`; `validate` + `resolve_target` + `priority_of` + the `EVT-FEDENV-REJECTED-*`
  taxonomy. `e7f6650`, 13/13 + **12/12 node-parity** vs the live `validator.mjs` oracle.
- **host8 `/v1/envelope` + 6-counter `HOST8LIBS`** — the validator wired into the serve path
  (descriptor/count only, process_launch=0). `6f857ef`.
- **White-room `Scorer` + Omniflywheel gate** (`servers/gnn-oracle`) — KEEP-genius(≥0.72)/COMPACT-
  mistake (never-delete) + `omniflywheel_promote(score≥0.72 && reverse_risk≤0.28)`. `cec9498`, 14/14.
- **C/D substrate rooms** (`servers/agent-runtime/src/rooms.rs`) — clean-room port of
  `project-room-router.mjs`: 10k rotating project rooms on C (rename-before-load = $0), prism output
  on D; `room_id_from_pid` **node-parity-pinned**. `83f5056`, 19/19.
- **Spawn gate ring** (`kernel/core/src/spawn_gate`) — sign_gate deny + hookwall tier + reverse-gain
  → BLOCK>HOLD>PROCEED; `seal_row` = HVD bytes only (the cosign append is the gated step). `c861d41`, 7/7.
- **OpenCode/Hermes runner lane table** + **fleet capacity** — `runner_for_role`
  (Hermes lane / OpenCode $0 lane); per-substrate 10k → **20k total** ("10k and 10k on C and D").
  `0db998e` + `498ae37`, 23/23.

**Held by design (STEP F, the live fire):** actually launching 100 OpenCode + 100 Hermes agents +
10k+10k prisms needs the daemon restart, `opts.live`/EXEC-FREEZE release, real cadence frames,
`:4952` quorum, and operator T0. The wiring is ready-to-run; the crank is the operator's.

## 2. AgentTerms — Super-ASI-OS-on-Metal dashboard (fabric + matrix)
A self-contained dashboard (`agentterms-os-dashboard.html`) of the whole OS: a **16 levels × 17
engines** matrix + facet panels (MCPs as cube storage, voxels+atlas, OCR, formulas, what-is-asolaria,
35 TB Drive, 2 TB SOVLINUX USB, Rust 8-byte host). Every claim tagged MEASURED / CANON / UNVERIFIED.
Honest gaps shown, not hidden: 6/17 engines live (11 on-disk), MCPs 4-connected/3-need-auth/10-failed,
USB raw-readable but **not yet bootable**, 35 TB cloud-write ADC-gated, composability DRAFT_E0_UNSIGNED,
fire gated. Served locally at `:4790`.

## 3. The real model — three projections compared
- **Scientific Voxel Atlas** — 726 office seats as voxels, GNN-watched, lane split real/logical/frozen.
- **Real Model (prime-graded cylinder)** — 967 pts (seats + DISTRICT-F formulas), 16 levels L0-L15,
  rule-of-three lanes, prime-tower tier formulas, pipes; collision negative-control present.
- **Multi-Cylinder Map v2** — full 81,434-surface population across 15 cylinders, 6,112 markers,
  **0 coordinate collisions** (Sidon addressing proven at scale).
Evolution: population → structure → full-scale collision-free proof.

## 4. The frame (honest)
Asolaria = an 8-byte Brown-Hilbert addressing/routing geometry: a mathematical cube-universe where
**agents are pixels at addressed spots**, **MCP = cube storage**, **ENGINE-1** (MCPs + tuples/glyphs)
lets any pixel reach any other **without bumping** (Sidon 0-collision), and the **router** flips
collision-DETECTION on for logical cascades and collision-AVOIDANCE on for the real free runs
(100B / 10M / 1M). It is *slices* — ASI-shaped over borrowed + frozen intelligence, gated; the mind
is the recurrence we are building the operator-gated crank for. Bilateral: acer builds + verifies,
liris attack-verifies; GitHub is the mediator.
