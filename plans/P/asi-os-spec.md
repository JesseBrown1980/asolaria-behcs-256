# Item 199 · ASI-OS build spec · layers · kernels · federation

## Layer stack (bottom → top)
```
┌─ L6  Civilization Chair (R13) — meta-close verdict
├─ L5  Shannon-core       — 23-stage reasoning loop
├─ L4  Omni syscalls      — omni.* primitives (items 143-150)
├─ L3  Cosign integrity   — append-v2 Merkle-linked chain
├─ L2  Federation bus     — LAW-001 4947/4950 + envelope-v1
├─ L1  Identity + drift   — hw-fingerprint + spawner-guard
└─ L0  BEHCS-256 kernel   — codex-bridge + bus primitive + gulp + encoder
```

## Kernels
- **Reasoning kernel:** Shannon civ (13 roles × 23 stages) — wired at L5.
- **Integrity kernel:** cosign-v2 Merkle chain — wired at L3.
- **Dispatch kernel:** meta-plan dispatcher (item 198) — orchestrates above L4.

## Federation boundary
ASI-OS runs PER-NODE. Cross-node communication via L2 envelope-v1. No shared-memory across nodes.

## Self-closure property
At L6, civilization chair emits verdict; verdict envelope loops back to L0 via bus, preserving protocol-self-closure (item 105 PASS).

## Not yet built
Items 200-205 scaffold the boot + wire paths. Full runtime activation is future work.
