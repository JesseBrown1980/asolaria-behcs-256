# Item 047 · Cursor agent-manager lessons

1. **File-scoped agents** — Cursor scopes tool calls per-file; our agents scope per-named_agent.
2. **Task concurrency limits** — Cursor caps concurrent agents at ~3; we enforce `agent-profile.limits.max_concurrent`.
3. **Cost visibility** — Cursor shows token cost; our `body.llm_response.usage` carries prompt/completion tokens for same visibility.
4. **Restart on drift** — Cursor recycles on behavioral drift; our recycler (item 051) closes on SLO-gate fire.
5. **Human approval gate** — Cursor requires user approval per action; our `multi-agent-enforcement-gate` requires ≥2 agent sigs for SMP-v5+ seals.
