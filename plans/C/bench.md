# Item 040 · Bench stub · 100-prompt latency report

Target runtime: llama.cpp server (local).
Status: **deferred-pending-liris-llamacpp-inventory** (item 031).

## Plan

```js
const prompts = Array.from({length: 100}, (_, i) => `Summarize: test prompt ${i}`);
const t0 = Date.now();
const results = [];
for (const p of prompts) {
  const s = Date.now();
  const r = await mux.complete({ prompt: p, max_tokens: 64 });
  results.push({ ok: r.ok, ms: Date.now() - s, tokens: r.usage?.completion_tokens || 0 });
}
// p50, p95, p99 latency + tokens/sec
```

Re-run once llama.cpp confirmed operational and a model is in `signed-model/`.
