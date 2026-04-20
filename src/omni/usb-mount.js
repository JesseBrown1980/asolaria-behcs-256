// Item 150 · omni.usb.mount · negotiates liris-side TestDisk mount + posts EVT-USB-MOUNT-READY

const { omniEnvelopeAnnounce } = require("./envelope-announce.js");

async function omniUsbMount({ target_host = "liris", drive_letter = "D", operator_ack = false } = {}) {
  if (!operator_ack) {
    return { ok: false, reason: "operator-ack-required", note: "USB mount requires jesse/rayssa explicit ack per never-wipe rule" };
  }
  // This does NOT run diskpart or modify the USB. It only announces readiness.
  const env = {
    id: `usb-mount-request-${Date.now()}`,
    ts: new Date().toISOString(),
    src: "omni",
    dst: target_host,
    kind: "EVT-USB-MOUNT-REQUEST",
    body: { drive_letter, target_host, requester: "acer", operator_ack },
  };
  const r = await omniEnvelopeAnnounce(env);
  return { ok: r.ok, request: env, bus: r };
}

module.exports = { omniUsbMount };
