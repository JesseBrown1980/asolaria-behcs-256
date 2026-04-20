// Item 037 · envelope-shaped request/response for LLM calls
// Input: envelope-v1 with body.llm_request = { prompt, model, ... }
// Output: envelope-v1 with body.llm_response = { text, usage, runtime, error? }

const mux = require("./mux.js");
const { validate } = require("../envelope/validate.js");

async function callAsEnvelope(requestEnv) {
  const v = validate(requestEnv);
  if (!v.ok) return { ok: false, error: "envelope-invalid", details: v.errors };
  const req = requestEnv.body && requestEnv.body.llm_request;
  if (!req || typeof req !== "object") return { ok: false, error: "body.llm_request missing" };
  const res = await mux.complete(req);
  return {
    id: `${requestEnv.id}-response`,
    ts: new Date().toISOString(),
    src: "llm-mux",
    dst: requestEnv.src,
    kind: "EVT-LLM-RESPONSE",
    body: { llm_response: res, for_request_id: requestEnv.id },
  };
}

module.exports = { callAsEnvelope };
