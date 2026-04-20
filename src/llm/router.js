// Item 042 · Local-first fallback chain router
// Try local llama.cpp first; if down/error + retryable, fall back to cloud (Anthropic connector).

const mux = require("./mux.js");

async function complete(opts, { allow_cloud_fallback = true } = {}) {
  const local = await mux.complete(opts);
  if (local.ok) return local;
  if (!allow_cloud_fallback) return local;
  // Cloud fallback stub — real impl goes through packages-legacy-import anthropicCliConnector
  return {
    ok: false,
    error: "local-failed-and-cloud-fallback-not-wired",
    local_error: local.error,
    runtime: "router",
    retryable: false,
  };
}

module.exports = { complete };
