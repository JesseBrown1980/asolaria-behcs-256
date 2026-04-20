// Item 027 · Translate OP_DISPATCH → v1
// Input: { op, issued_by, t, args }

function translateOpdispatch(e) {
  if (!e || typeof e !== "object") throw new Error("translateOpdispatch: envelope must be object");
  return {
    id:   `opdispatch-${e.op || "op"}-${typeof e.t === "string" ? Date.parse(e.t) : Date.now()}`,
    ts:   e.t || new Date().toISOString(),
    src:  String(e.issued_by || "operator"),
    dst:  "federation",
    kind: String(e.op || "OP-UNKNOWN"),
    body: e.args && typeof e.args === "object" ? e.args : {},
    mode: "real",
  };
}

module.exports = { translateOpdispatch };
