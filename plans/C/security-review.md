# Item 045 · Local-LLM prompt-injection isolation review

## Threats
1. **Untrusted prompt** poisons system output → downstream agent follows malicious instructions.
2. **Prompt-exfiltration** — model leaks its own instructions/system prompt to an attacker.
3. **Tool-use hijack** — generated text contains fake tool-use XML that a naive caller executes.

## Mitigations (applied)
- `src/llm/server.js` listens **127.0.0.1 only** by default — no LAN exposure unless operator rebinds.
- `/llm/complete` does NOT receive a system-prompt from the request body by default; operator sets via env/config.
- `envelope-adapter.js` validates the envelope against schema before routing → rejects malformed/oversized bodies.
- Mux wrapper never evals model output as code.
- No cloud-fallback executes without explicit operator flag.

## Not yet applied (backlog)
- No prompt-injection detector sanitizer over input (e.g., "ignore previous instructions" patterns).
- No output sandboxer stripping tool-use tags.
- No rate limiter at `:4951`.

## Verdict

**ACCEPTABLE FOR INTERNAL USE · NOT YET PUBLIC-FACING.** Mitigations to add before exposing `:4951` beyond loopback: (a) prompt-injection sanitizer, (b) output tag stripper, (c) rate limit, (d) bearer auth header.
