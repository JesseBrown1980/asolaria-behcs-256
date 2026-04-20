// Item 036 · Mux routing wrapper
// Picks a backend by model name + policy, then forwards to the chosen runtime.

const llamacpp = require("./llamacpp.js");

const ROUTING = {
  // modelPattern → runtime module
  "llama": llamacpp,
  "qwen":  llamacpp,
  "nemotron": llamacpp,
  "mistral": llamacpp,
  "default": llamacpp,
};

function pickRuntime(model = "default") {
  const m = String(model).toLowerCase();
  for (const key of Object.keys(ROUTING)) {
    if (m.includes(key)) return ROUTING[key];
  }
  return ROUTING.default;
}

async function complete(opts) { return pickRuntime(opts.model).complete(opts); }
async function* stream(opts) { yield* pickRuntime(opts.model).stream(opts); }
async function embed(opts)    { return pickRuntime(opts.model).embed(opts); }

module.exports = { complete, stream, embed, pickRuntime, ROUTING };
