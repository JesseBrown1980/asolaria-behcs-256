# Item 046 · Antigravity agent-manager lessons

Distilled from prior work + `data/agent-index/mistakes/` + `data/agent-index/patterns/`.

1. **Named agents only** — each agent has a canonical name (`acer-namespace-coordinator`, `liris-chief`, etc). No anonymous workers.
2. **Lifecycle transitions fire envelopes** — SPAWN/RUN/PAUSE/RECYCLE/CLOSE each emits `EVT-AGENT-<STATE>` so the federation observes.
3. **Never kill without RECYCLE first** — a clean recycle (type "/exit" + enter) gives the agent a chance to flush its log; hard-kill loses state.
4. **Probe-before-spawn** — always check if an instance with the same named_agent is already running; duplicate kills federation reasoning.
5. **Device-binding** — an agent tagged `acer-*` only runs on acer; cross-device spawn requires explicit override.
6. **Mistake-logger with `named_agent` field** — every mistake writes `{ agent, mistake_class, ... }` so the index can cluster.
