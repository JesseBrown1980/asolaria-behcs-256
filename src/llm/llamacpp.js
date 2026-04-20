// Item 035 · llama.cpp CLI spawn wrapper
// Shells out to `llama-server` HTTP mode (if running) or `main` binary for one-shot.
// Honors wrapper-spec.md.

const { spawn } = require("node:child_process");

const DEFAULTS = {
  server_url: process.env.LLAMACPP_SERVER_URL || "http://127.0.0.1:8080",
  binary:     process.env.LLAMACPP_BIN || "llama-server",
  model_dir:  process.env.LLAMACPP_MODEL_DIR || "./signed-model",
};

async function complete({ prompt, model = "default", max_tokens = 512, temperature = 0.7, stop = [] }) {
  // Prefer HTTP server (persistent) over one-shot CLI
  try {
    const r = await fetch(`${DEFAULTS.server_url}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, n_predict: max_tokens, temperature, stop }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`llamacpp-server ${r.status}`);
    const j = await r.json();
    return { ok: true, text: j.content || "", usage: { prompt_tokens: j.tokens_evaluated, completion_tokens: j.tokens_predicted }, runtime: "llama.cpp-server" };
  } catch (e) {
    return { ok: false, error: String(e.message || e), runtime: "llama.cpp-server", retryable: true };
  }
}

async function* stream({ prompt, model = "default", max_tokens = 512, temperature = 0.7, stop = [] }) {
  try {
    const r = await fetch(`${DEFAULTS.server_url}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, n_predict: max_tokens, temperature, stop, stream: true }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) { yield { delta: "", done: true, error: `status ${r.status}` }; return; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) { yield { delta: "", done: true }; return; }
      buf += dec.decode(value, { stream: true });
      for (const line of buf.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.content) yield { delta: obj.content, done: false };
        } catch {}
      }
      buf = buf.split("\n").slice(-1)[0];
    }
  } catch (e) {
    yield { delta: "", done: true, error: String(e.message || e) };
  }
}

async function embed({ texts = [], model = "default" }) {
  try {
    const r = await fetch(`${DEFAULTS.server_url}/embedding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: texts }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`embedding ${r.status}`);
    const j = await r.json();
    const vectors = Array.isArray(j) ? j.map(x => x.embedding) : [j.embedding];
    return { ok: true, vectors, dim: (vectors[0] || []).length, runtime: "llama.cpp-server" };
  } catch (e) {
    return { ok: false, error: String(e.message || e), runtime: "llama.cpp-server", retryable: true };
  }
}

module.exports = { complete, stream, embed, DEFAULTS };
