// Item 026 · Translate DroidSwarm event → v1
// Input: { swarm_id, kind, src, t, data }

function translateDroidswarm(e) {
  if (!e || typeof e !== "object") throw new Error("translateDroidswarm: envelope must be object");
  return {
    id:   String(e.swarm_id || `droidswarm-${Date.now()}`),
    ts:   typeof e.t === "number" ? new Date(e.t * 1000).toISOString() : (e.t || new Date().toISOString()),
    src:  String(e.src || "droidswarm"),
    dst:  "federation",
    kind: String(e.kind || "DROIDSWARM-UNKNOWN"),
    body: e.data && typeof e.data === "object" ? e.data : {},
    mode: "real",
  };
}

module.exports = { translateDroidswarm };
