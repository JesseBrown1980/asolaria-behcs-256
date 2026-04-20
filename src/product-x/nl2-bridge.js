// Item 110 · NL2/NovaLink bridge → envelope-v1 adapter
// Takes NL2 frames and produces envelope-v1 shaped messages for the federation bus.

function nl2ToEnvelope(frame, { src = "nl2-bridge", dst = "federation" } = {}) {
  return {
    id:   `nl2-${frame.sequence || Date.now()}`,
    ts:   frame.ts || new Date().toISOString(),
    src,
    dst,
    kind: `nl2.${frame.type || "frame"}`,
    body: {
      sequence: frame.sequence || null,
      payload:  frame.payload  || null,
      metadata: frame.metadata || {},
    },
    mode: "real",
  };
}

function envelopeToNL2(env) {
  if (!env || env.kind?.startsWith?.("nl2.") !== true) throw new Error("not an nl2.* envelope");
  return {
    type:     env.kind.slice(4),
    sequence: env.body?.sequence ?? null,
    ts:       env.ts,
    payload:  env.body?.payload  ?? null,
    metadata: env.body?.metadata ?? {},
  };
}

module.exports = { nl2ToEnvelope, envelopeToNL2 };
