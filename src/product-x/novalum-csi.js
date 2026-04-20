// Item 109 · NovaLUM WiFi CSI sensing module stub (generic; no device-name leakage)
// CSI = Channel State Information; works on any 802.11 NIC exposing per-subcarrier phase+amp.

async function probeCSI({ interface_name = "wlan0", sample_count = 100, timeout_ms = 5000 } = {}) {
  // Stub: real impl shells out to a CSI-exposing driver (atheros-csi, nexmon-csi, iwlwifi+specific patch).
  // Returns synthetic shape so callers can develop against it without a live device.
  return {
    ok: true,
    interface_name,
    sample_count,
    sampled_at: new Date().toISOString(),
    csi_frames: Array.from({ length: sample_count }, (_, i) => ({
      ts: Date.now() + i,
      rssi: -40 + Math.random() * 10,
      phase: Array.from({ length: 64 }, () => Math.random() * 2 * Math.PI),
      amplitude: Array.from({ length: 64 }, () => Math.random()),
    })),
    note: "stub CSI shape — replace with nexmon/atheros/iwlwifi bridge on live hardware",
  };
}

function classifyPresence(frames) {
  // Very basic variance-based presence detector — real model uses GNN/CNN on CSI.
  if (!frames || frames.length < 10) return { presence: "unknown", reason: "too-few-frames" };
  const rssi = frames.map(f => f.rssi);
  const mean = rssi.reduce((a,b)=>a+b,0)/rssi.length;
  const variance = rssi.reduce((a,b)=>a+(b-mean)**2,0)/rssi.length;
  return { presence: variance > 1.5 ? "present" : "empty", variance, mean_rssi: mean };
}

module.exports = { probeCSI, classifyPresence };
