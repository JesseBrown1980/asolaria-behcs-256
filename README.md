# Asolaria BEHCS-256

Federated multi-agent civilization toolkit. Seven supervisors, a bus primitive, a Shannon L0-L6 verdict router, a dual-GNN agreement gate, a tier-3 reverse-gain task-candidate extractor, and an FP-ASI 6-gate falsification runner.

Built to let heterogeneous Claude nodes (desktop, phone, remote) ship and onboard each other with the **current-version** toolkit instantly — no stale installs, no divergent forks.

Shipped 2026-04-20 · SMP v5+ GA · 4 colonies · 17 rooms sealed · T04 10-variant merged.

## What lives here

Every directory in `packages/` is an ES-module Node package with its own `package.json`. Nothing is TypeScript-required; most files are `.mjs`.

### Supervisors

| package | role |
|---|---|
| [pid-targeted-kick-supervisor](packages/pid-targeted-kick-supervisor/) | Unified kick fanout — `kick("falcon"|"aether"|"liris", msg)` → adb input text + screencap verify + pid-survival check, or `/type` with pid-reprobe. Daemon watches `OP-KICK-*` / `OP-VERIFY-PID` / `OP-LOCATE-PID`. |
| [remote-control-claude-supervisor](packages/remote-control-claude-supervisor/) | HTTP bridge wrapper (`:8765`) — `/health /proc /exec /write /read /ls` with bearer auth + bus-envelope announce. |
| [new-applicant-onboarding-supervisor](packages/new-applicant-onboarding-supervisor/) | Ships fresh bundles to new joiners. Auto-detects transport (adb/smb/bus-only). `reOnboardFederation()` refreshes all known peers with current packages/. |
| [adb-kick-supervisor](packages/adb-kick-supervisor/) | Canonical `adb input text` + `screencap -p` pattern. Anti-patterns (`termux-toast`, focus-steal) guarded. |
| [act-supervisor](packages/act-supervisor/) | Classifies bus envelopes → acer-inbox file OR liris `/type`. Reply-deadline escalation. |
| [immune-l1-supervisor](packages/immune-l1-supervisor/) | Ed25519 supervised `/type` on `:4821` with nonce replay protection, `/register-pid` bearer-auth, rate limit, hash-chained audit log. |
| [supervisor-registry](packages/supervisor-registry/) | Look-type-look-decide hardware registry. |

### Core loop

| package | role |
|---|---|
| [cycle-orchestrator](packages/cycle-orchestrator/) | Main action loop · 5 upgrades (PeerStateMachine, UnisonTestDriver, BilateralFingerprintTracker, GNNFeedbackCadenceAdjuster, SLOGate) + watchdog heartbeat + halt-canon whitelist + auto-recover. |
| [stage-to-actual-converter](packages/stage-to-actual-converter/) | Dual-GNN agreement gate (OmniGNN + reverse-gain-GNN). Halts on disagreement. Frozen-Polymorphism refusal. |
| [super-gulp-tier3-consumer](packages/super-gulp-tier3-consumer/) | Tier-2 archive → Tier-3 super-gulp-queue promoter + reverse-gain-GNN extractor. Emits `EVT-SUPER-GULP-TASK-CANDIDATES-EXTRACTED`. |
| [whiteroom-consumer](packages/whiteroom-consumer/) | Cube-addressed whiteroom digest. Source-stamp feedback-loop fix. |
| [gulp-http-bridge](packages/gulp-http-bridge/) | `:4923` BEHCS gulp-status + file-cap guard. |

### Primitives

| package | role |
|---|---|
| [bus-and-kick](packages/bus-and-kick/) | `postToBus` · `kickPeer` · `postAndKick` · `sendHeartbeat`. LAW-001 ports 4947 + 4950. |
| [cross-platform-spawn](packages/cross-platform-spawn/) | `resolveSpawnCommand` for Windows `.cmd` paths — no shell hang. |

### Systems

| package | role |
|---|---|
| [shannon-civ](packages/shannon-civ/) | Shannon L0-L6 verdict router + acer-dispatch-daemon. |
| [hermes-absorption](packages/hermes-absorption/) | Hermes pattern integration. |
| [fp-asi-benchmark](packages/fp-asi-benchmark/) | 100 frozen Shannon problems + 10 adversarial hold-outs · 6-gate falsification runner for ASI claims. No rubber-stamp. |
| [fp-infra-bootstrap-variants](packages/fp-infra-bootstrap-variants/) | 5 acer variants (GNN/Shannon/fingerprint/cadence/SLO) · merges with 5 liris variants to form 10-variant bilateral falsification set. |
| [endocrine-sqlite-wal-spec](packages/endocrine-sqlite-wal-spec/) | T03 sqlite-WAL cutover spec · sqlite p99 44µs vs ndjson 87µs (1.97× speedup). |

## Quick start (new applicant)

```bash
git clone https://github.com/Jessebrown1980/asolaria-behcs-256.git ~/asolaria
cd ~/asolaria

# Verify
ls packages/ | wc -l   # 19

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

Jesse Brown · [plasmatoid@gmail.com](mailto:plasmatoid@gmail.com) · github: [@Jessebrown1980](https://github.com/Jessebrown1980)
