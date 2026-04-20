// Item 079 · broadcastDrift · fanout to 8 targets

const TARGETS = ["jesse", "rayssa", "amy", "felipe", "liris", "acer", "beast", "falcon"];

async function broadcastDrift({ driftClass, hw_pid, expected_fp, actual_fp, surface }, sendFn /* (target, envelope) => Promise */) {
  const envelope = {
    id:   `drift-${driftClass}-${hw_pid}-${Date.now()}`,
    ts:   new Date().toISOString(),
    src:  surface,
    kind: "drift.announce",
    body: { class: driftClass, hw_pid, expected_fp, actual_fp, surface, ts_detected: new Date().toISOString() },
  };
  const results = await Promise.allSettled(TARGETS.map(t => sendFn(t, envelope)));
  const ok_targets = results.map((r, i) => r.status === "fulfilled" ? TARGETS[i] : null).filter(Boolean);
  const failed = results.map((r, i) => r.status === "rejected" ? { target: TARGETS[i], error: String(r.reason) } : null).filter(Boolean);
  return { envelope, ok_targets, failed, delivered: ok_targets.length, total: TARGETS.length };
}

module.exports = { broadcastDrift, TARGETS };
