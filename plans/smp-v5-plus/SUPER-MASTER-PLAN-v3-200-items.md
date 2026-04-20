# SUPER MASTER PLAN v3 — 200 ITEMS (dispatcher-ready)

Format: `Item NNN | Section | Task | Target | Agent | Deps | Hours | Priority`
Agent profiles: PLN=planner, EXP=explorer, BLD=builder, REV=reviewer.
Deps: comma-separated item numbers or "-" if none.

## Section A — Repo structure + migration (items 001-015)
Item 001 | A | Inventory old Asolaria repo tree and emit manifest.json | C:/Users/rayss/Asolaria/ -> plans/A/inventory.json | EXP | - | 2 | P0
Item 002 | A | Map old dirs to BEHCS-256 canonical namespace (src/, agents/, plans/) | plans/A/namespace-map.md | PLN | 001 | 2 | P0
Item 003 | A | Detect duplicate files via sha256 and output dedupe list | plans/A/dedupe.json | EXP | 001 | 2 | P1
Item 004 | A | Draft migration script skeleton with dry-run mode | scripts/migrate_old_asolaria.mjs | BLD | 002,003 | 4 | P0
Item 005 | A | Add provenance tags (old_path, new_path, sha) to every migrated file | scripts/migrate_old_asolaria.mjs | BLD | 004 | 3 | P1
Item 006 | A | Define .gitignore covering node_modules, USB mounts, large binaries | .gitignore | PLN | - | 1 | P0
Item 007 | A | Verify ports 4947 and 4950 referenced nowhere as blockable | grep audit, plans/A/port-audit.md | REV | - | 1 | P0
Item 008 | A | Scaffold top-level README with boot order pointer (no content yet) | README.md | BLD | 002 | 1 | P2
Item 009 | A | Create plans/index.json enumerating all plan files | plans/index.json | BLD | - | 1 | P1
Item 010 | A | Wire git pre-commit hook blocking secrets via regex sweep | .githooks/pre-commit | BLD | - | 2 | P1
Item 011 | A | Audit node_modules size and flag removal candidates | plans/A/node-audit.md | REV | 001 | 2 | P2
Item 012 | A | Move BEHCS-256 kernel file to canonical src/kernel/ path | src/kernel/behcs256-kernel.js | BLD | 002 | 1 | P0
Item 013 | A | Write migration rollback plan document | plans/A/rollback.md | PLN | 004 | 2 | P1
Item 014 | A | Execute migration dry-run and capture log | plans/A/dry-run.log | BLD | 005 | 2 | P0
Item 015 | A | Review migration dry-run for data loss, authorize live run | plans/A/migration-review.md | REV | 014 | 2 | P0

## Section B — Event schema unification (items 016-030)
Item 016 | B | Collect BEHCS envelope samples from all known emitters | plans/B/envelope-samples.ndjson | EXP | - | 3 | P0
Item 017 | B | Collect DroidSwarm event samples | plans/B/droidswarm-samples.ndjson | EXP | - | 2 | P0
Item 018 | B | Collect OP_DISPATCH op samples | plans/B/opdispatch-samples.ndjson | EXP | - | 2 | P0
Item 019 | B | Diff the three schemas and extract union field set | plans/B/union-fields.md | PLN | 016,017,018 | 3 | P0
Item 020 | B | Draft unified envelope JSON Schema v1 | schemas/envelope-v1.schema.json | PLN | 019 | 4 | P0
Item 021 | B | Define required fields: id, ts, src, dst, kind, body, sig | schemas/envelope-v1.schema.json | PLN | 020 | 1 | P0
Item 022 | B | Add D1-D35 dimensional tagging optional block | schemas/envelope-v1.schema.json | PLN | 020 | 2 | P1
Item 023 | B | Add 47D extension reserved block | schemas/envelope-v1.schema.json | PLN | 020,022 | 1 | P1
Item 024 | B | Write Ajv-based validator module | src/envelope/validate.js | BLD | 020 | 3 | P0
Item 025 | B | Write translator old-BEHCS -> v1 envelope | src/envelope/translate-behcs.js | BLD | 020 | 3 | P1
Item 026 | B | Write translator DroidSwarm -> v1 envelope | src/envelope/translate-droidswarm.js | BLD | 020 | 3 | P1
Item 027 | B | Write translator OP_DISPATCH -> v1 envelope | src/envelope/translate-opdispatch.js | BLD | 020 | 3 | P1
Item 028 | B | Unit tests for validator and translators | tests/envelope/*.test.js | REV | 024,025,026,027 | 4 | P0
Item 029 | B | Review schema for law-001/008/012 compliance | plans/B/schema-review.md | REV | 020 | 2 | P0
Item 030 | B | Publish schema to federation via /omni.envelope.announce | runtime announce | BLD | 029 | 1 | P1

## Section C — Local-LLM absorption (items 031-045)
Item 031 | C | Survey llama.cpp build artifacts already on liris | plans/C/llamacpp-inventory.md | EXP | - | 2 | P0
Item 032 | C | Survey Mux binaries and configs | plans/C/mux-inventory.md | EXP | - | 2 | P0
Item 033 | C | Pick target models (7B, 13B) with sha and size table | plans/C/model-choices.md | PLN | 031 | 2 | P0
Item 034 | C | Design local-LLM wrapper API (complete, stream, embed) | src/llm/wrapper-spec.md | PLN | - | 3 | P0
Item 035 | C | Implement llama.cpp CLI spawn wrapper | src/llm/llamacpp.js | BLD | 034 | 4 | P0
Item 036 | C | Implement Mux routing wrapper | src/llm/mux.js | BLD | 034 | 4 | P1
Item 037 | C | Add envelope-shaped request/response for LLM calls | src/llm/envelope-adapter.js | BLD | 035,020 | 2 | P0
Item 038 | C | Add GPU/CPU detection and auto-pick runtime | src/llm/pick-runtime.js | BLD | 035 | 3 | P1
Item 039 | C | Add context-cache for 5-min Anthropic-style reuse pattern | src/llm/context-cache.js | BLD | 037 | 3 | P1
Item 040 | C | Benchmark local LLM latency 100 prompts, write report | plans/C/bench.md | REV | 035 | 3 | P1
Item 041 | C | Quarantine model files under signed-model/ with sha manifest | signed-model/manifest.json | BLD | 033 | 2 | P0
Item 042 | C | Add fallback chain local-first then cloud | src/llm/router.js | BLD | 035,036 | 3 | P1
Item 043 | C | Expose /llm/complete HTTP endpoint on 4951 (new, non-law port) | src/llm/server.js | BLD | 037 | 3 | P1
Item 044 | C | Document local-LLM operator guide | docs/llm-operator.md | PLN | 043 | 2 | P2
Item 045 | C | Review LLM wrapper for prompt-injection isolation | plans/C/security-review.md | REV | 043 | 3 | P0

## Section D — Agent manager (items 046-060)
Item 046 | D | Extract Antigravity agent-manager lessons into notes | plans/D/antigravity-lessons.md | EXP | - | 3 | P0
Item 047 | D | Extract Cursor agent-manager lessons | plans/D/cursor-lessons.md | EXP | - | 3 | P0
Item 048 | D | Define agent lifecycle states: SPAWN, RUN, PAUSE, RECYCLE, CLOSE | src/agent/lifecycle.js | PLN | 046,047 | 2 | P0
Item 049 | D | Define agent profile JSON (role, tools, budget, limits) | schemas/agent-profile.schema.json | PLN | 048 | 2 | P0
Item 050 | D | Build agent spawner reading profile and launching worker | src/agent/spawner.js | BLD | 049 | 4 | P0
Item 051 | D | Build agent recycler that closes stale workers via /type+enter | src/agent/recycler.js | BLD | 050 | 4 | P1
Item 052 | D | Wire six-body-system review dispatcher | src/agent/review-dispatch.js | BLD | 050 | 4 | P1
Item 053 | D | Add mistake-logger with named_agent field | src/agent/mistake-log.js | BLD | 050 | 2 | P0
Item 054 | D | Add probe-before-spawn to avoid duplicate instances | src/agent/probe.js | BLD | 050 | 2 | P0
Item 055 | D | Add device-binding check before spawn | src/agent/bind-check.js | BLD | 054 | 2 | P0
Item 056 | D | Build agent registry persistent store | data/agent-registry.json | BLD | 050 | 2 | P1
Item 057 | D | Add /agent.list /agent.spawn /agent.close HTTP endpoints | src/agent/server.js | BLD | 050 | 3 | P1
Item 058 | D | Write 3-agent smoke test harness | tests/agent/smoke.test.js | REV | 057 | 2 | P0
Item 059 | D | Review against feedback_send_worker_6_reviews pattern | plans/D/review-compliance.md | REV | 052 | 2 | P0
Item 060 | D | Document dispatch playbook for operators | docs/agent-dispatch.md | PLN | 057 | 2 | P2

## Section E — Device-bound instance (items 061-075)
Item 061 | E | Inventory existing _asolaria_identity.json files across devices | plans/E/identity-inventory.md | EXP | - | 2 | P0
Item 062 | E | Define identity schema (hw_pid, surface, parent, stable_tuple) | schemas/asolaria-identity.schema.json | PLN | 061 | 2 | P0
Item 063 | E | Implement hardware fingerprinter (cpu, board, disk serial) | src/identity/fingerprint.js | BLD | 062 | 4 | P0
Item 064 | E | Implement identity writer with atomic rename | src/identity/writer.js | BLD | 062 | 3 | P0
Item 065 | E | Implement identity reader with fallback search | src/identity/reader.js | BLD | 062 | 2 | P0
Item 066 | E | Build spawner that refuses to run if identity mismatches | src/identity/spawner-guard.js | BLD | 063,065 | 3 | P0
Item 067 | E | Build resolver mapping logical name -> current hw_pid | src/identity/resolver.js | BLD | 065 | 3 | P0
Item 068 | E | Lock drive-letter-free addressing via stable-subspace tuple | src/identity/stable-subspace.js | BLD | 063 | 3 | P0
Item 069 | E | Add copy-vs-original shape_fingerprint and provenance | src/identity/provenance.js | BLD | 064 | 3 | P0
Item 070 | E | Write identity-drift detector comparing expected vs actual | src/identity/drift-detect.js | BLD | 063 | 3 | P1
Item 071 | E | Hook drift-detector into broadcastDrift (section F) | integration wiring | BLD | 070,082 | 2 | P1
Item 072 | E | Test identity persistence across reboot on liris | tests/identity/reboot.test.md | REV | 064 | 2 | P0
Item 073 | E | Test identity rejection when USB moves between machines | tests/identity/usb-move.test.md | REV | 066 | 2 | P0
Item 074 | E | Document identity recovery procedure | docs/identity-recovery.md | PLN | 066 | 2 | P1
Item 075 | E | Review against LAW-008 filesystem-as-mirror | plans/E/law008-review.md | REV | 069 | 2 | P0

## Section F — Drift broadcast primitive (items 076-090)
Item 076 | F | List 8 broadcast targets (jesse, rayssa, amy, felipe, liris, acer, beast, falcon) | plans/F/targets.md | PLN | - | 1 | P0
Item 077 | F | Define drift classification: SOFT, HARD, CRITICAL | plans/F/classifications.md | PLN | - | 2 | P0
Item 078 | F | Design broadcastDrift envelope kind=drift.announce | schemas/drift-envelope.schema.json | PLN | 020,077 | 2 | P0
Item 079 | F | Implement broadcastDrift dispatcher with fanout to 8 | src/drift/broadcast.js | BLD | 078 | 4 | P0
Item 080 | F | Implement freezeDevice primitive halting writes on CRITICAL | src/drift/freeze.js | BLD | 077 | 3 | P0
Item 081 | F | Wire drift -> halt pattern per feedback_halt_pattern | src/drift/halt-handler.js | BLD | 079,080 | 3 | P0
Item 082 | F | Expose /drift.report HTTP endpoint on 4947 | src/drift/server.js | BLD | 079 | 2 | P0
Item 083 | F | Ensure broadcast respects LAW-001 port-always-open | plans/F/law001-check.md | REV | 082 | 1 | P0
Item 084 | F | Add drift-history persistent log | data/drift-history.ndjson | BLD | 079 | 2 | P1
Item 085 | F | Build drift-dashboard rendering last N events | src/drift/dashboard.js | BLD | 084 | 3 | P2
Item 086 | F | Test SOFT drift generates announce but no freeze | tests/drift/soft.test.js | REV | 081 | 2 | P0
Item 087 | F | Test CRITICAL drift triggers freeze within 2s | tests/drift/critical.test.js | REV | 081 | 2 | P0
Item 088 | F | Verify no-unilateral-federation-link-severance rule | plans/F/no-sever-review.md | REV | 079 | 2 | P0
Item 089 | F | Verify cross-host-destination-authority on freeze | plans/F/cross-host-review.md | REV | 080 | 2 | P0
Item 090 | F | Document operator drift runbook | docs/drift-runbook.md | PLN | 082 | 2 | P1

## Section G — Shannon 13-agent pentest civilization (items 091-105)
Item 091 | G | Load shannon.txt canonized files and extract 13 agent roles | plans/G/13-roles.md | EXP | - | 2 | P0
Item 092 | G | Map 23-stage closed loop to agent roles | plans/G/23-stage-map.md | PLN | 091 | 3 | P0
Item 093 | G | Define per-stage LCR (Local Confidence Ratio) metric | plans/G/lcr-spec.md | PLN | 092 | 2 | P0
Item 094 | G | Implement stage runner harness | src/shannon/stage-runner.js | BLD | 092 | 4 | P0
Item 095 | G | Implement role profile loader for 13 agents | src/shannon/roles.js | BLD | 091 | 3 | P0
Item 096 | G | Wire omni-processor dual-cosign at each stage | src/shannon/cosign.js | BLD | 094 | 4 | P0
Item 097 | G | Build pentest harness dispatching all 13 against target | src/shannon/pentest.js | BLD | 094,095 | 5 | P1
Item 098 | G | Add 3x6x6 cube addressing per map-map-mapped feedback | src/shannon/cube-addr.js | BLD | 094 | 3 | P0
Item 099 | G | Add ReSono 8-verb structural twin hook | src/shannon/resono-twin.js | BLD | 097 | 3 | P1
Item 100 | G | Add lens-calibration convergent-confidence-trap check | src/shannon/lens-calibration.js | BLD | 097 | 3 | P1
Item 101 | G | Run dry civilization pass against self, record LCR trace | plans/G/dry-run.md | REV | 097 | 3 | P0
Item 102 | G | Review for convergent-confidence-trap false positives | plans/G/trap-review.md | REV | 101 | 2 | P0
Item 103 | G | Persist 23-stage trace to cosign chain | data/shannon-trace.ndjson | BLD | 096 | 2 | P1
Item 104 | G | Document 13-role playbook for operators | docs/shannon-13.md | PLN | 097 | 3 | P2
Item 105 | G | Review against protocol-self-closure property | plans/G/self-closure-review.md | REV | 101 | 2 | P0

## Section H+I — eBacMap + USB sovereignty (items 106-120)
Item 106 | H | Survey old eBacMap QDD code still recoverable | plans/H/ebacmap-survey.md | EXP | - | 3 | P0
Item 107 | H | Map old Globals model to new DeviceAdapter | plans/H/adapter-map.md | PLN | 106 | 3 | P0
Item 108 | H | Port 87 IX buckets to BEHCS-256 namespace | src/ebacmap/ix-buckets.js | BLD | 107 | 5 | P0
Item 109 | H | Stub NovaLUM WiFi CSI sensing module | src/ebacmap/novalum-csi.js | BLD | 107 | 4 | P1
Item 110 | H | Wire NL2/NovaLink bridge to envelope v1 | src/ebacmap/nl2-bridge.js | BLD | 108,020 | 3 | P1
Item 111 | H | Write 4-app monorepo scaffold with shared lib | apps/{qdd,console,sensor,dash}/ | BLD | 107 | 4 | P1
Item 112 | H | Review eBacMap rebuild against NovaLUM PROBE->READ->PARSE->PATCH->VERIFY | plans/H/novalum-review.md | REV | 109 | 2 | P0
Item 113 | I | Re-mount D: sovereignty USB after TestDisk recovery | runtime op on liris | BLD | - | 3 | P0
Item 114 | I | Enumerate 131 shadow envelopes for farming | plans/I/shadow-inventory.md | EXP | 113 | 3 | P0
Item 115 | I | Extract envelope contents into envelope-v1 format | src/farm/extract-shadows.js | BLD | 114,020 | 4 | P0
Item 116 | I | Build USB rotation schedule for bilateral training | plans/I/rotation-schedule.md | PLN | 113 | 2 | P1
Item 117 | I | Wire USB farming to cosign chain append | src/farm/cosign-append.js | BLD | 115 | 3 | P1
Item 118 | I | Verify recovery handles and shared-OS addressing per Brown-Hilbert rule | plans/I/brown-hilbert-check.md | REV | 113 | 2 | P0
Item 119 | I | Add provenance tag copy-vs-original to each farmed file | src/farm/provenance.js | BLD | 115 | 2 | P0
Item 120 | I | Review USB farming against never-wipe law | plans/I/no-wipe-review.md | REV | 115 | 1 | P0

## Section J — Real 100B test (items 121-130)
Item 121 | J | Define 5-scale ramp sizes (100M, 1B, 10B, 50B, 100B) | plans/J/ramp-spec.md | PLN | - | 2 | P0
Item 122 | J | Ground-truth Phase-0 check on ramp inputs | plans/J/phase0-ground-truth.md | REV | 121 | 2 | P0
Item 123 | J | Implement hybrid multi-GNN harness | src/gnn/hybrid-harness.js | BLD | 121 | 6 | P0
Item 124 | J | Wire manifest writer with sha+ts+scale | src/gnn/manifest-writer.js | BLD | 123 | 2 | P0
Item 125 | J | Run 100M scale, capture manifest | data/gnn/100M-manifest.json | BLD | 123 | 2 | P0
Item 126 | J | Run 1B scale, capture manifest | data/gnn/1B-manifest.json | BLD | 125 | 3 | P0
Item 127 | J | Run 10B scale, capture manifest | data/gnn/10B-manifest.json | BLD | 126 | 4 | P1
Item 128 | J | Run 50B scale, capture manifest | data/gnn/50B-manifest.json | BLD | 127 | 6 | P1
Item 129 | J | Run 100B scale, capture manifest | data/gnn/100B-manifest.json | BLD | 128 | 10 | P1
Item 130 | J | Review against feedback_300B_gnn_validation_was_false, mark D11 honestly | plans/J/honesty-review.md | REV | 129 | 3 | P0

## Section K+L — Cosign chain v2 + firewall (items 131-140)
Item 131 | K | Read current COSIGN_CHAIN.ndjson and extract v1 schema | plans/K/v1-schema.md | EXP | - | 2 | P0
Item 132 | K | Draft v2 scheme reconciling dual-cosign + 47D tags | schemas/cosign-v2.schema.json | PLN | 131 | 3 | P0
Item 133 | K | Implement v1->v2 migrator (sha-walk preserving) | src/cosign/migrate-v1-v2.js | BLD | 132 | 4 | P0
Item 134 | K | Implement v2 appender with tamper-evident sha-walk | src/cosign/append-v2.js | BLD | 132 | 3 | P0
Item 135 | K | Review migrator preserves chain integrity | plans/K/integrity-review.md | REV | 133 | 2 | P0
Item 136 | L | Write acer firewall rules for ports 4781, 4782, 4820 | plans/L/acer-firewall.md | PLN | - | 2 | P0
Item 137 | L | Verify 4947 and 4950 remain open (LAW-001) | plans/L/law001-verify.md | REV | 136 | 1 | P0
Item 138 | L | Implement firewall-apply script for windows netsh | scripts/firewall-apply.ps1 | BLD | 136 | 3 | P0
Item 139 | L | Test cross-host 4820 reachability post-apply | plans/L/reach-test.md | REV | 138 | 2 | P0
Item 140 | L | Document firewall operator runbook | docs/firewall-runbook.md | PLN | 138 | 2 | P1

## Section M — Omni primitives + Gulp 2000 (items 141-160)
Item 141 | M | Inventory existing omni.* primitives (request.box, envelope, etc.) | plans/M/omni-inventory.md | EXP | - | 3 | P0
Item 142 | M | Define missing primitives: omni.drift, omni.cosign, omni.agent | plans/M/missing-primitives.md | PLN | 141 | 3 | P0
Item 143 | M | Implement omni.request.box v2 4-track self-approval | src/omni/request-box-v2.js | BLD | 142 | 4 | P0
Item 144 | M | Implement omni.envelope.announce | src/omni/envelope-announce.js | BLD | 020,142 | 2 | P0
Item 145 | M | Implement omni.drift.broadcast | src/omni/drift-broadcast.js | BLD | 079,142 | 2 | P0
Item 146 | M | Implement omni.cosign.append | src/omni/cosign-append.js | BLD | 134,142 | 2 | P0
Item 147 | M | Implement omni.agent.spawn | src/omni/agent-spawn.js | BLD | 050,142 | 2 | P0
Item 148 | M | Implement omni.identity.verify | src/omni/identity-verify.js | BLD | 066,142 | 2 | P0
Item 149 | M | Implement omni.llm.route | src/omni/llm-route.js | BLD | 042,142 | 2 | P1
Item 150 | M | Implement omni.usb.mount | src/omni/usb-mount.js | BLD | 113,142 | 3 | P1
Item 151 | M | Scaffold Gulp 2000 task runner with 2000-step pipeline | gulpfile.mjs | BLD | 142 | 5 | P1
Item 152 | M | Define Gulp 2000 stages (build, validate, sign, deploy) | plans/M/gulp-stages.md | PLN | 151 | 3 | P1
Item 153 | M | Wire Gulp 2000 to emit envelope per stage | gulpfile.mjs | BLD | 151,144 | 3 | P1
Item 154 | M | Wire Gulp 2000 to cosign each stage | gulpfile.mjs | BLD | 151,146 | 3 | P1
Item 155 | M | Wire Gulp 2000 halt on drift CRITICAL | gulpfile.mjs | BLD | 151,080 | 2 | P0
Item 156 | M | Add Gulp 2000 resume-from-step capability | gulpfile.mjs | BLD | 151 | 3 | P1
Item 157 | M | Add Gulp 2000 dashboard showing current step | src/gulp/dashboard.js | BLD | 151 | 3 | P2
Item 158 | M | Benchmark 2000-step dry pass walltime | plans/M/bench.md | REV | 151 | 3 | P1
Item 159 | M | Review Gulp 2000 against never-wipe and LAW-001 | plans/M/gulp-review.md | REV | 156 | 2 | P0
Item 160 | M | Document Gulp 2000 operator guide | docs/gulp-2000.md | PLN | 156 | 3 | P2

## Section N — Acer archaeology + old Asolaria startups + OpenClaude + RU View (items 161-180)
Item 161 | N | Inventory acer desktop files relevant to Asolaria | plans/N/acer-desktop.md | EXP | - | 3 | P0
Item 162 | N | Inventory acer startup folders and scheduled tasks | plans/N/acer-startup.md | EXP | - | 2 | P0
Item 163 | N | Cross-reference acer findings with old Asolaria startups | plans/N/old-startups.md | PLN | 161,162 | 3 | P0
Item 164 | N | Extract OpenClaude (OpenClaw twin) code artifacts | plans/N/openclaude-extract.md | EXP | - | 3 | P0
Item 165 | N | Map OpenClaude 8-verb twin to ReSono binding | src/openclaude/twin-map.js | BLD | 164 | 4 | P1
Item 166 | N | Inventory RU View surface (dashboard or viewer component) | plans/N/ru-view-inventory.md | EXP | - | 2 | P1
Item 167 | N | Define RU View canonical role (observer, actor, both) | plans/N/ru-view-role.md | PLN | 166 | 2 | P1
Item 168 | N | Port RU View into envelope-v1 event stream | src/ru-view/adapter.js | BLD | 167,020 | 4 | P1
Item 169 | N | Rebuild acer startup manifest authoritative list | data/acer-startup-manifest.json | BLD | 163 | 3 | P0
Item 170 | N | Implement startup diff tool (expected vs actual) | src/startup/diff.js | BLD | 169 | 3 | P1
Item 171 | N | Wire startup diff into drift broadcast SOFT class | src/startup/drift-hook.js | BLD | 170,079 | 2 | P1
Item 172 | N | Extract OpenClaude dispatch patterns into docs | docs/openclaude-patterns.md | PLN | 164 | 3 | P2
Item 173 | N | Add OpenClaude third bias-correction tier hook | src/openclaude/bias-correction.js | BLD | 165 | 3 | P1
Item 174 | N | Wire OpenClaude into Shannon civ (tier 3) | integration wiring | BLD | 173,099 | 3 | P1
Item 175 | N | Verify RU View respects LAW-012 look-think-type-look-decide | plans/N/law012-review.md | REV | 168 | 2 | P0
Item 176 | N | Archaeology: recover deleted acer files from recycle bin and VSS | plans/N/acer-recovery.md | EXP | 161 | 4 | P1
Item 177 | N | Merge recovered artifacts into migration manifest | plans/N/merge-recovered.md | PLN | 176,004 | 2 | P1
Item 178 | N | Review all recovered artifacts for provenance integrity | plans/N/provenance-review.md | REV | 177 | 3 | P0
Item 179 | N | Document acer archaeology procedure | docs/acer-archaeology.md | PLN | 176 | 3 | P2
Item 180 | N | Review LAW-008 filesystem-as-mirror applied to recovered set | plans/N/law008-review.md | REV | 178 | 2 | P0

## Section O — Falcon/Falcon2 + NovaLUM dashboards + eBacMap Agent Console + OpenCode Codex 5.3 (items 181-195)
Item 181 | O | Inventory Falcon and Falcon2 code and configs | plans/O/falcon-inventory.md | EXP | - | 3 | P0
Item 182 | O | Define Falcon node role in BEHCS triad Class 5 | plans/O/falcon-role.md | PLN | 181 | 2 | P0
Item 183 | O | Wire Falcon bus on 4947 with envelope-v1 | src/falcon/bus.js | BLD | 020,182 | 4 | P0
Item 184 | O | Port Falcon2 extensions into bus adapter | src/falcon/falcon2-adapter.js | BLD | 183 | 3 | P1
Item 185 | O | Inventory NovaLUM dashboards and existing routes | plans/O/novalum-dash-inventory.md | EXP | - | 3 | P0
Item 186 | O | Wire 82 existing API routes to unified admin dashboard | src/dashboards/admin.js | BLD | 185 | 5 | P1
Item 187 | O | Wire stealth dashboard to BEHCS bridge (already DONE per memory) verify | plans/O/stealth-verify.md | REV | 185 | 2 | P0
Item 188 | O | Wire falcon dashboard to BEHCS bridge | src/dashboards/falcon.js | BLD | 183,186 | 4 | P1
Item 189 | O | Rebuild eBacMap Agent Console on BEHCS-256 namespace | apps/console/ | BLD | 108 | 5 | P1
Item 190 | O | Wire Agent Console to agent manager (section D) | apps/console/agent-bridge.js | BLD | 189,057 | 3 | P1
Item 191 | O | Inventory OpenCode Codex 5.3 artifacts already on liris | plans/O/codex53-inventory.md | EXP | - | 2 | P0
Item 192 | O | Integrate Codex 5.3 as debugging-savant agent profile | agents/codex-53.profile.json | PLN | 191,049 | 3 | P1
Item 193 | O | Wire Codex 5.3 into agent spawner | src/agent/profiles-register.js | BLD | 192,050 | 2 | P1
Item 194 | O | Review Codex-built NL2 dashboard for valuable reuse | plans/O/nl2-review.md | REV | 185 | 3 | P1
Item 195 | O | Document combined dashboards operator guide | docs/dashboards.md | PLN | 188,189 | 3 | P2

## Section P — Meta-plan using Instruct-KR + ASI-OS build (items 196-205, total 10)
Item 196 | P | Survey Instruct-KR artifacts and determine applicability | plans/P/instruct-kr-survey.md | EXP | - | 3 | P0
Item 197 | P | Define meta-plan: plan-of-plans spec using Instruct-KR | plans/P/meta-plan-spec.md | PLN | 196 | 4 | P0
Item 198 | P | Implement meta-plan executor that reads this SMP and dispatches | src/meta/dispatcher.js | BLD | 197 | 5 | P0
Item 199 | P | Draft ASI-OS build spec (layers, kernels, federation) | plans/P/asi-os-spec.md | PLN | 197 | 5 | P0
Item 200 | P | Scaffold ASI-OS boot layer referencing BEHCS-256 kernel | src/asi-os/boot.js | BLD | 012,199 | 4 | P1
Item 201 | P | Wire ASI-OS to Shannon civ as reasoning core | src/asi-os/shannon-core.js | BLD | 097,200 | 4 | P1
Item 202 | P | Wire ASI-OS to omni primitives as syscall layer | src/asi-os/syscalls.js | BLD | 143-150,200 | 4 | P1
Item 203 | P | Wire ASI-OS to cosign v2 as integrity layer | src/asi-os/integrity.js | BLD | 134,200 | 3 | P1
Item 204 | P | Review ASI-OS spec against all feedback_law* rules | plans/P/law-compliance.md | REV | 199 | 4 | P0
Item 205 | P | Final meta-review of entire v3 plan for closure | plans/P/final-review.md | REV | 198,204 | 4 | P0

NOTE: Items 196-205 = 10 items. Section A-O = 195. Total = 205 (plan expanded by 5 to honor all subsection content; dispatcher may prioritize first 200 by priority weight if strict 200 cap needed).

## Dispatch hints (for next-turn dispatcher)
- Parse each `Item NNN` line by ` | ` separator -> 8 fields.
- Spawn one worker per item; respect Deps (topo-sort).
- P0 first, then P1, then P2. Within same priority, honor Deps.
- Each worker receives: task, target, profile, and the relevant feedback_* memory file matching its section.
- Workers emit envelope-v1 completion events to /omni.envelope.announce on 4947.
- On any CRITICAL drift, halt dispatch and invoke freezeDevice.
- Cosign each completed item via omni.cosign.append.
