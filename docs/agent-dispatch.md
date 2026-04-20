# Item 060 · Agent Dispatch Playbook for Operators

## TL;DR
1. Start the agent HTTP server: `node src/agent/server.js` → listens `:4952`.
2. POST `/agent.spawn` with a profile conforming to `schemas/agent-profile.schema.json`.
3. List running: `GET /agent.list`.
4. Close: `POST /agent.close` with `{ "named_agent": "<name>" }`.

## Example profile
```json
{
  "named_agent": "acer-rose-rollcall-agent",
  "role": "EXP",
  "tools": ["behcs-bus", "pid-kick", "adb-input"],
  "model_tier": "7B",
  "room": 42,
  "colony_prefix": "COL-ROSE",
  "device_binding": "acer",
  "limits": { "max_concurrent": 1, "max_tokens_per_request": 4096, "wall_timeout_seconds": 120 },
  "launcher_cmd": "node",
  "launcher_args": ["packages/pid-targeted-kick-supervisor/bin/daemon.mjs"]
}
```

## Contract
- Every spawn emits `EVT-AGENT-RUN` (from SPAWN→RUN transition).
- Every close emits `EVT-AGENT-RECYCLE` and then `EVT-AGENT-CLOSE`.
- Federation bus observers correlate transitions via `body.named_agent`.

## When review is needed
Use `src/agent/review-dispatch.js` with the 6-body pattern. Consensus ≥4 before ship.

## Mistake logging
On any exception, call `logMistake({ named_agent, mistake_class, summary, context, chain })` → writes `data/agent-index/mistakes/IX-NNNN.md` linking back to relevant chains (IX-063, IX-071, IX-147, etc).

## Hard rules
- probe-before-spawn (item 054) enforces uniqueness
- bind-check (item 055) blocks cross-device spawn
- lifecycle.js enforces valid state transitions; invalid = throw
- multi-agent-enforcement-gate (separate package) ensures SMP-v5+ seals have ≥2 sigs
