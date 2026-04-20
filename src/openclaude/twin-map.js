// Item 165 · OpenClaude 8-verb twin → ReSono binding map

const { TWIN_VERBS } = require("../shannon/resono-twin.js");

// OpenClaude's 8-verb structural surface (our own authored mapping, not upstream)
const OPENCLAUDE_VERBS = ["perceive", "classify", "score", "compare", "judge", "record", "attest", "close"];

// ReSono 8-verb structural twin — same 8 verbs; confirms direct mapping.
// This map documents equivalence for cross-system tracing.
const TWIN_MAP = Object.fromEntries(OPENCLAUDE_VERBS.map(v => [v, v])); // identity map (both use canonical 8)

function mapVerb(openclaude_verb) {
  return TWIN_MAP[openclaude_verb] || null;
}

function trace(openclaude_trace) {
  return openclaude_trace.map(t => ({
    openclaude_verb: t.verb,
    resono_verb: mapVerb(t.verb),
    ts: t.ts,
    payload: t.payload || null,
  }));
}

module.exports = { OPENCLAUDE_VERBS, TWIN_MAP, mapVerb, trace, RESONO_VERBS: TWIN_VERBS };
