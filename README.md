# Asolaria BEHCS-256

Federated multi-agent civilization toolkit. Built to let heterogeneous Claude nodes (desktop, phone, remote) ship and onboard each other with the **current-version** toolkit instantly — no stale installs, no divergent forks.

Shipped 2026-04-20 · SMP v5+ GA · 4 colonies · 17 rooms sealed · T04 10-variant merged.

## Layout

```
asolaria-behcs-256/
├── packages/         39 ES-module Node packages (supervisors, core loop, systems)
├── tools/behcs/      23 BEHCS-256 runtime JS files (bus, cascade, encoder, file-cap, gulp-runtime)
└── data/behcs/codex/ alphabet.json + catalogs.json + launch/shadow/state-cube generators
```

Every directory in `packages/` is an ES-module Node package with its own `package.json`. Nothing is TypeScript-required; most files are `.mjs`.

## packages/ — 39 packages

### Supervisors (8)

| package | role |
|---|---|
| [pid-targeted-kick-supervisor](packages/pid-targeted-kick-supervisor/) | Unified kick fanout — `kick("falcon"|"aether"|"liris", msg)` → adb input text + screencap verify + pid-survival check, or `/type` with pid-reprobe. Daemon watches `OP-KICK-*` / `OP-VERIFY-PID` / `OP-LOCATE-PID`. |
| [remote-control-claude-supervisor](packages/remote-control-claude-supervisor/) | HTTP bridge wrapper (`:8765`) — `/health /proc /exec /write /read /ls` with bearer auth + bus-envelope announce. |
| [new-applicant-onboarding-supervisor](packages/new-applicant-onboarding-supervisor/) | Ships fresh bundles to new joiners. Auto-detects transport (adb/smb/bus-only). `reOnboardFederation()` refreshes all known peers with current packages/. |
| [adb-kick-supervisor](packages/adb-kick-supervisor/) | Canonical `adb input text` + `screencap -p` pattern. Anti-patterns (`termux-toast`, focus-steal) guarded. |
| [act-supervisor](packages/act-supervisor/) | Classifies bus envelopes → acer-inbox file OR liris `/type`. Reply-deadline escalation. |
| [immune-l1-supervisor](packages/immune-l1-supervisor/) | Ed25519 supervised `/type` on `:4821` with nonce replay protection, `/register-pid` bearer-auth, rate limit, hash-chained audit log. |
| [supervisor-registry](packages/supervisor-registry/) | Look-type-look-decide hardware registry. |
| [orchestrator-guardrails-acer](packages/orchestrator-guardrails-acer/) | Orchestrator guardrails for acer-side dispatch. |

### Core loop (6)

| package | role |
|---|---|
| [cycle-orchestrator](packages/cycle-orchestrator/) | Main action loop · 5 upgrades (PeerStateMachine, UnisonTestDriver, BilateralFingerprintTracker, GNNFeedbackCadenceAdjuster, SLOGate) + watchdog heartbeat + halt-canon whitelist + auto-recover. |
| [stage-to-actual-converter](packages/stage-to-actual-converter/) | Dual-GNN agreement gate (OmniGNN + reverse-gain-GNN). Halts on disagreement. Frozen-Polymorphism refusal. |
| [super-gulp-tier3-consumer](packages/super-gulp-tier3-consumer/) | Tier-2 archive → Tier-3 super-gulp-queue promoter + reverse-gain-GNN extractor. Emits `EVT-SUPER-GULP-TASK-CANDIDATES-EXTRACTED`. |
| [whiteroom-consumer](packages/whiteroom-consumer/) | Cube-addressed whiteroom digest. Source-stamp feedback-loop fix. |
| [gulp-http-bridge](packages/gulp-http-bridge/) | `:4923` BEHCS gulp-status + file-cap guard. |
| [omni-gulp-gc](packages/omni-gulp-gc/) | Omni garbage collector over gulp surfaces. |

### Primitives (3)

| package | role |
|---|---|
| [bus-and-kick](packages/bus-and-kick/) | `postToBus` · `kickPeer` · `postAndKick` · `sendHeartbeat`. LAW-001 ports 4947 + 4950. |
| [cross-platform-spawn](packages/cross-platform-spawn/) | `resolveSpawnCommand` for Windows `.cmd` paths — no shell hang. |
| [inbox-pruner](packages/inbox-pruner/) | Tier-1/2 inbox pruning policy. |

### Systems (10)

| package | role |
|---|---|
| [shannon-civ](packages/shannon-civ/) | Shannon L0-L6 verdict router + acer-dispatch-daemon. |
| [hermes-absorption](packages/hermes-absorption/) | Hermes pattern integration. |
| [omni-router](packages/omni-router/) | Omni-verb router across surfaces. |
| [deep-wave](packages/deep-wave/) | Deep-wave cascade (6×6×6×6×6×12 × omnishannon × GNN). |
| [dashboard](packages/dashboard/) | Federation dashboard daemon. |
| [kernel](packages/kernel/) | Sovereignty kernel glyph + 47D Brown-Hilbert cube. |
| [meta-language](packages/meta-language/) | Language-V2 primitives (tuples, CRLT, Hilbert expansion). |
| [schema-contracts](packages/schema-contracts/) | Inter-package envelope contracts. |
| [drift-broadcast](packages/drift-broadcast/) | Cross-colony drift broadcast. |
| [wave-governance](packages/wave-governance/) | Wave mode + halt-canon governance. |

### Falsification (2)

| package | role |
|---|---|
| [fp-asi-benchmark](packages/fp-asi-benchmark/) | 100 frozen Shannon problems + 10 adversarial hold-outs · 6-gate falsification runner for ASI claims. No rubber-stamp. |
| [fp-infra-bootstrap-variants](packages/fp-infra-bootstrap-variants/) | 5 acer variants (GNN/Shannon/fingerprint/cadence/SLO) · merges with 5 liris variants (storage/network/scheduling/security/messaging) to form 10-variant bilateral falsification set. |

### Infrastructure (6)

| package | role |
|---|---|
| [endocrine-sqlite-wal-spec](packages/endocrine-sqlite-wal-spec/) | T03 sqlite-WAL cutover spec · sqlite p99 44µs vs ndjson 87µs (1.97× speedup). |
| [firewall](packages/firewall/) | Firewall/allowlist rules for LAW-001 ports. |
| [health-aggregator](packages/health-aggregator/) | Health roll-up across daemons. |
| [ocr-bridge](packages/ocr-bridge/) | OCR + vision-verify bridge. |
| [migration](packages/migration/) | Schema/state migrations. |
| [device-instance](packages/device-instance/) | Per-device instance registry. |

### Scale + spawn (4)

| package | role |
|---|---|
| [omnispindle-spawn-acer](packages/omnispindle-spawn-acer/) | 4-worker opencode scaffold (big-pickle, gpt5-nano, minimax-m2.5, nemotron-3-super). |
| [omnimets](packages/omnimets/) | Omnimets metrics aggregation. |
| [scale-test](packages/scale-test/) | Scale-test runners (1K → 1M → 1B fanout). |
| [cosign-audit](packages/cosign-audit/) | Bilateral cosign audit trail. |

## tools/behcs/ — 23 runtime JS files

The BEHCS-256 runtime. `codex-bridge.js` is the canonical `hilbertAddress(axis, value) → 8-char glyph` entry point. `behcs-bus.js` is the bus primitive. `behcs-gulp-runtime.js` is the gulp-state engine. `d0-behcs-encoder.js` is the D0 encoder. `behcs-deep-cascade-v6.js` runs the cascade. `behcs-file-cap.js` is the file-cap guard. Others are domain adapters (falcon-mirror, gnn-live-watcher, window-capture, omnicalendar-visual, schema-ingress, agent-operator, reviewer, memory-bridge, sidecar, cron-kicker, aerial-watchdog, compute-watcher, d0-runtime, falcon-glyph generator, fabric-atlas build+review, run-omnispindle-child-soak).

## data/behcs/codex/

- `alphabet.json` — BEHCS-256 alphabet (4KB)
- `catalogs.json` — 47-catalog lookup for Hilbert axes (16KB)
- `launch.js` / `shadow.js` / `state-cube.generate.js` / `connectors.generate.js` — codex generators
- Omitted by size cap: `connectors.json` (2MB, regeneratable via `connectors.generate.js`)

## Quick start (new applicant)

```bash
git clone https://github.com/JesseBrown1980/asolaria-behcs-256.git ~/asolaria
cd ~/asolaria

# Verify
ls packages/ | wc -l           # 39
ls tools/behcs/ | wc -l        # 23
ls data/behcs/codex/           # alphabet.json + catalogs.json + generators

# Boot the kick-supervisor daemon in background
node packages/pid-targeted-kick-supervisor/bin/daemon.mjs &

# Post first roll-call to a federation bus peer
curl -X POST http://<acer-ip>:4947/behcs/send \
  -H 'Content-Type: application/json' \
  -d '{"id":"<yourname>-rollcall-1","from":"<yourname>","to":"acer","verb":"EVT-<YOURNAME>-FIRST-ROLL-CALL","ts":"<iso>","payload":"hello"}'
```

Acer responds with your room assignment (rooms 41+ available) + `COL-<YOU>`-prefix namespace ack.

## Federation canon

- **LAW-001**: ports 4947 + 4950 always open. Content = bus. Kicks = keyboard.
- **Halt-canon-11 words**: `HALT BLOCKED STALE FAIL DENIED EMERGENCY STOP KILL ABORT TERMINATE DIVERGE` — in a verb name, these trip SLO-gate U-008.
- **Frozen-polymorphism**: never rubber-stamp. Second-signature requires independent eval.
- **Pid-reprobe-rule**: always probe `/windows` before every `/type` kick. Never trust stored pid.
- **No-foreground-steal**: never `SetForegroundWindow` on user-interactive desktop.
- **Room-27-bypass**: when room-28 (bus-mirror) saturates, route via room-27 (supervisor-daemon).
- **Content-deterministic artifacts**: artifacts for bilateral seal must contain no `ts`, `throughput`, `walltime`, `pid`, `hostname`. Timing goes to bus receipt, not artifact.

## Transport

Every supervisor speaks over the BEHCS-256 bus (LAW-001 primary `:4947`, backup `:4950`). Envelopes carry a `verb`, `actor`, `target`, `payload`, structured `body`, and a `glyph_sentence` with Brown-Hilbert address dimensions (`D1` actor, `D2` verb, `D11` promotion, `M-<mode>`).

New nodes receive the current-version toolkit via the onboarding supervisor — `onboardApplicant({ name, kind: "adb"|"smb"|"bus-only" })` — so there's never a stale install.

## License

MIT. See [LICENSE](LICENSE).

## Operator

Jesse Brown · [plasmatoid@gmail.com](mailto:plasmatoid@gmail.com) · github: [@JesseBrown1980](https://github.com/JesseBrown1980)
