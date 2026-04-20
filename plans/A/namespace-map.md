# Section A · Item 002 · Namespace Map — Old Asolaria → BEHCS-256

Maps directory names in `C:/Users/rayss/Asolaria/` (liris local) + `C:/Users/acer/Asolaria/` (acer local) to their canonical BEHCS-256 locations in the public repo `asolaria-behcs-256`.

## Canonical namespace

```
asolaria-behcs-256/
├── packages/                 ES-module Node packages (supervisors + core loop + systems + infra + scale)
├── packages-legacy-import/   legacy JS/config from pre-modularization (src/, routes/, lib/, middleware/, services/, skills/, config/)
├── tools/                    shell-runnable tools (behcs/, crypto/, cube/, omni/, keyboard/, shannon-consensus/, validate/, swarm-jobs/, pentest/, drive-pid/, exists-after/, asolaria-legacy/)
├── data/                     static-ish data assets (behcs/codex/alphabet+catalogs, agent-index/)
├── services/                 long-running services (gnn-sidecar/)
├── src/connectors/           subsystem connectors (phone mirror, program absorption)
├── brown-hilbert/            canonical identity docs (01-identity through 10-private-internet)
├── projections/              hb/ + crypto/ projections
├── packets/                  signed capsule packets (crypto/)
├── schemas/                  capsule/contract JSON schemas
├── docs/                     specs/ (crypto/) + BEHCS-OMNIDIRECTIONAL-MIRROR.md
├── plans/                    SMP + section-A plans + deep-wave + smp-v5-plus/
├── .githooks/                pre-commit + pre-push hooks
└── root/                     README.md · LICENSE · .gitignore · AGENTS.md · BROWN-HILBERT.md · CLAUDE.md · CODEX.md · REFERENCES.md · GLYPH-GENESIS.js
```

## Old-dir → canonical mapping

| Old (Asolaria local) | Canonical (asolaria-behcs-256) | Notes |
|---|---|---|
| `Asolaria/tools/behcs/*.js` | `tools/behcs/` | BEHCS-256 runtime · 23 files |
| `Asolaria/tools/crypto/*` | `tools/crypto/` | ed25519 keypair + sign + verify + capsule.js |
| `Asolaria/tools/cube/*` | `tools/cube/` | cube + omni-processor |
| `Asolaria/tools/omni/*` | `tools/omni/` | omni-processor-stage1 + omni-request-processor + omni-vision-liris |
| `Asolaria/tools/keyboard/*` | `tools/keyboard/` | keyboard for agents |
| `Asolaria/tools/shannon-consensus/*` | `tools/shannon-consensus/` | shannon-consensus + shannon-types + smoke-test-waves |
| `Asolaria/tools/validate/*` | `tools/validate/` | Invoke-CryptoCapsule-Validate |
| `Asolaria/tools/swarm-jobs/*` | `tools/swarm-jobs/` | packet scripts |
| `Asolaria/tools/pentest/*.py` | `tools/pentest/` | snmp-probe (public subset only) |
| `Asolaria/tools/drive-pid/*` | `tools/drive-pid/` | drive-pid supervisor |
| `Asolaria/tools/exists-after/*` | `tools/exists-after/` | liveness probes |
| `Asolaria/tools/*.js` (root) | `tools/asolaria-legacy/` | 36 root-level JS tools |
| `Asolaria/data/behcs/codex/` | `data/behcs/codex/` | alphabet + catalogs + generators |
| `Asolaria/data/agent-index/` | `data/agent-index/` | CHAINS + XREF + mistakes + patterns + plans + references + bridge |
| `Asolaria/services/gnn-sidecar/` | `services/gnn-sidecar/` | 5 GNN models + trainers |
| `Asolaria/src/connectors/phone*Mirror*.js` | `src/connectors/` | ship only mirror + absorption (not abacus/anthropic/cursor/etc which would pull secrets) |
| `Asolaria/src/programAbsorption.js` | `src/connectors/programAbsorption.js` | Open Claude absorption |
| `Asolaria/brown-hilbert/` | `brown-hilbert/` | 10 canonical identity docs |
| `Asolaria/packets/crypto/` | `packets/crypto/` | signed packets |
| `Asolaria/projections/` | `projections/` | hb + crypto projections |
| `Asolaria/schemas/crypto/` | `schemas/crypto/` | capsule schema |
| `Asolaria/docs/specs/crypto/` | `docs/specs/crypto/` | CRYPTO_CAPSULE_V1.md |
| `Asolaria/docs/BEHCS-OMNIDIRECTIONAL-MIRROR.md` | `docs/` | aerial/mirror spec |
| `Asolaria/*.md` (root canonical) | `/` (root) | BROWN-HILBERT.md · CLAUDE.md · CODEX.md · AGENTS.md · REFERENCES.md |
| `asolaria-acer/packages/*` | `packages/` | 42 packages (19 v1 + 20 v2 + 3 v5) |
| `asolaria-acer/packages-legacy-import/*` | `packages-legacy-import/` | src + routes + lib + middleware + services + skills + config |
| `asolaria-acer/plans/smp-v5-plus/` | `plans/smp-v5-plus/` | SUPER-MASTER-PLAN-v3-200-items.md (sha 74ff9106) |

## Dirs explicitly NOT shipped (reason column)

| Old path | Reason |
|---|---|
| `vault/` | SECRETS (ed25519 private keys) |
| `captures/` | PII (screenshots of private sessions) |
| `backups/safe-mode-*` | Large + transient + PII risk |
| `archives/worktree-*` | Large + historic |
| `logs/` | Runtime logs, transient |
| `node_modules/` | `.gitignore` |
| `dist/` | Regeneratable |
| `sovereignty/research/gnn-patterns/` | 1.4 GB training data + .pt model binaries (too large, regeneratable) |
| `sovereignty/data/falcon-dump/` | USB-extracted user content |
| `reports/pentest-192.168.0.1/` | Pentest findings (internal) |
| `.agent/`, `.claude/`, `.playwright-cli/` | Tool-specific runtime state |

## Rule

Any file added in a future ship MUST respect this table. PRs that introduce files into the "NOT shipped" categories require explicit operator note.
