// Item 096 · omni-processor dual-cosign per stage
// Each stage can request a cosign from two independent roles; bilateral sha256 record.

const crypto = require("node:crypto");

function requestCosign(stageId, envelope, a_role, b_role) {
  const body = JSON.stringify({ stageId, envelope_id: envelope.id, kind: envelope.kind });
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  return {
    stageId,
    envelope_id: envelope.id,
    sha256: sha,
    a: { role: a_role, ts: new Date().toISOString() },
    b: { role: b_role, ts: new Date().toISOString() },
    bilateral: true,
  };
}

module.exports = { requestCosign };
