---
ix: IX-767
name: PLAN — Omni consolidation cascade controller
type: plan
tags: [consolidation, automation, cascade, runtime, shadow, hyperlanguage, ACTIVE]
chain: [IX-766, IX-473, IX-477, IX-650]
pid: asolaria-20260410-omni-consolidation-cascade
profile: asolaria
createdBy: codex
agents: asolaria, liris, gaia, all
---

# IX-767 — Omni Consolidation Cascade Controller

## Objective

Turn the consolidation registry into a repeatable cascade that regenerates the map, appends a ledger tick, emits a packet, and keeps the next safe consolidation phases explicit.

## Phase law

1. regenerate registry truth
2. append ledger
3. emit cascade packet
4. preserve next safe phases

## Required next phases

1. `liris_remote_root_ingest`
2. `mirror_candidate_review`
3. `selective_c_to_e_materialization`
4. `startup_launcher_rebinding`

## Runtime law

- do not move or delete files during the automated registry phase
- keep `normal`, `runtime`, and `shadow` as parallel living languages
- treat `E:\runtime\omni-consolidation-registry` as the packetized controller root
