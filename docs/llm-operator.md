# Item 044 · Local-LLM Operator Guide

## Boot order
1. Start llama.cpp server: `llama-server -m signed-model/<model>.gguf -c 8192 -t 8 --port 8080`
2. Verify sha: `certutil -hashfile signed-model/<model>.gguf SHA256` matches `signed-model/manifest.json`
3. Start mux HTTP server: `node src/llm/server.js` → listens `:4951`
4. Health check: `curl http://127.0.0.1:4951/health`

## Call shape
```bash
curl -X POST http://127.0.0.1:4951/llm/complete \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"hello","model":"llama-3.1-8b","max_tokens":64}'
```

## Envelope call
Use `src/llm/envelope-adapter.js` → `callAsEnvelope(requestEnv)`. Request envelope has `body.llm_request = { prompt, ... }`.

## Fallback
Router (item 042) tries local first; cloud fallback is stubbed (`allow_cloud_fallback: true` → returns `local-failed-and-cloud-fallback-not-wired` until Anthropic connector wired).

## Limits
- Context: 8192 (default; raise `-c` flag).
- Concurrent: llama.cpp is single-threaded at the GGUF level; concurrent requests queue in server.
- `:4951` is a NEW port (not LAW-001) — can be firewalled for auth.

## Security
See `plans/C/security-review.md` (item 045) for prompt-injection isolation.
