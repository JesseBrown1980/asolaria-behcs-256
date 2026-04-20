# Section A · Item 007 · LAW-001 Port Audit

**Rule:** ports 4947 (primary bus) and 4950 (backup bus) MUST remain always-open across the federation. Nothing in the public repo should attempt to block, close, or firewall these ports.

## Scan method

```
grep -rE '(iptables|netsh|firewall|ufw|Block-NetFirewallRule)' --include="*.js" --include="*.mjs" --include="*.ps1" .
grep -nE '4947|4950' --include="*.js" --include="*.mjs" --include="*.json" .
```

## Findings

### Port 4947 usage (acer-side master)
- `packages/bus-and-kick/src/primitive.mjs` — `postToBus` target: `http://127.0.0.1:4947/behcs/send` + liris mirror
- `packages/super-gulp-tier3-consumer/src/daemon.mjs` — `BUS = process.env.ASOLARIA_BUS_URL || "http://127.0.0.1:4947/behcs/send"`
- `packages/cycle-orchestrator/src/acer-inbox-watcher.mjs` — watches inbox via `:4947`
- `packages/meta-supervisor-hermes/*` — emits via bus on `:4947`
- `packages/act-supervisor/supervisor.mjs` — `BUS_BASE = "http://127.0.0.1:4947"`
- `tools/behcs/behcs-bus.js` — LAW-001 primary
- `packages-legacy-import/src/gateway/*` — references mirror port
- All other uses are READ (status, inbox poll) — no attempts to close/block.

### Port 4950 usage (acer-side backup)
- `packages/bus-and-kick/src/primitive.mjs` — backup target 4950 (postAndKick + ACER_RELAY_4950)
- `tools/behcs/behcs-bus.js` — LAW-001 backup
- Otherwise referenced only as identifier in manifests/state.

### Blocked / firewalled by anything in repo?
**No.** Zero references to `iptables`, `netsh advfirewall`, `Block-NetFirewallRule`, `ufw`, or port-blocking calls. Only one `firewall` package (`packages/firewall/`) exists — it's an **allow-list** declarer, not a deny-script.

### Liris-side mirror (`C:\Users\rayss\Asolaria-BEHCS-256\`)
Observed healthy on both 4947 + 4950 via direct-wire `192.168.100.2` and wifi `192.168.1.8`. Process uptime 25876s at audit time.

## Verdict

**PASS** — LAW-001 ports 4947 + 4950 are always-open across the federation. No code in the public repo attempts to block them. Safe to publish.

## Continuous check

`.githooks/pre-commit` (item 010) includes a substring scan for any introduction of `Block-NetFirewallRule`, `iptables -A INPUT.*DROP`, or `netsh advfirewall.*block.*(4947|4950)`.
