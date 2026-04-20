// FIB-L02 · network · supervised-kick-roundtrip-pid-target
// My inference (no peek at liris impl):
//   - send a "kick" to a named target pid
//   - recipient acks within a deadline
//   - round-trip includes pid-reprobe + ack-receipt envelope
//   - timeout classified as fail-with-retry; wrong-pid ack classified as fail-no-retry

const { EventEmitter } = require("node:events");

const DEFAULTS = { deadline_ms: 3000, max_retries: 2 };

function createRoundtrip() {
  const inFlight = new Map();
  const bus = new EventEmitter();

  async function probePid(target) {
    // Stub: real impl calls /windows; for tests we inject a probeFn
    return target.probe ? await target.probe() : { ok: true, pid: target.pid || 0 };
  }

  async function kick({ target, message, deadline_ms = DEFAULTS.deadline_ms, max_retries = DEFAULTS.max_retries }) {
    const kick_id = `kick-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const p = await probePid(target);
    if (!p.ok || !p.pid) return { ok: false, kick_id, reason: "probe-fail", detail: p };

    for (let attempt = 0; attempt <= max_retries; attempt++) {
      const pAck = new Promise((resolve) => {
        const to = setTimeout(() => { inFlight.delete(kick_id); resolve({ ok: false, reason: "deadline" }); }, deadline_ms);
        inFlight.set(kick_id, (ack) => {
          clearTimeout(to);
          inFlight.delete(kick_id);
          resolve({ ok: true, ack });
        });
      });
      // Send (invokes target's .deliver fn in tests; real impl hits HTTP/adb)
      if (target.deliver) await target.deliver({ kick_id, pid: p.pid, message, attempt });
      const r = await pAck;
      if (r.ok) {
        // Verify ack.pid matches probed pid (pid-targeted roundtrip)
        if (r.ack && r.ack.pid === p.pid) return { ok: true, kick_id, attempts: attempt + 1, ack: r.ack };
        return { ok: false, kick_id, reason: "wrong-pid-ack", expected_pid: p.pid, ack: r.ack };
      }
      // Timeout → retry unless max
    }
    return { ok: false, kick_id, reason: "deadline-after-retries" };
  }

  function ack(kick_id, ackBody) {
    const cb = inFlight.get(kick_id);
    if (!cb) return { ok: false, reason: "no-in-flight" };
    cb(ackBody);
    return { ok: true };
  }

  return { kick, ack, bus, _inFlightCount: () => inFlight.size };
}

module.exports = { createRoundtrip, DEFAULTS };
