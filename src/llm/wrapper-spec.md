# Item 034 · Local LLM wrapper API spec

Three methods across all runtimes:

```js
// Non-streaming completion
async function complete({ prompt, model, max_tokens = 512, temperature = 0.7, stop = [] }) → { text: string, usage: { prompt_tokens, completion_tokens } }

// Streaming
async function* stream({ prompt, model, ... }) → yields { delta: string, done: boolean }

// Embeddings
async function embed({ texts: string[], model }) → { vectors: number[][], dim: number }
```

All calls carry `envelope_id` (optional) and return `runtime` field identifying the backend (`llama.cpp` / `mux` / `anthropic-cli`).

Error shape: `{ ok: false, error: string, runtime: string, retryable: bool }`.
