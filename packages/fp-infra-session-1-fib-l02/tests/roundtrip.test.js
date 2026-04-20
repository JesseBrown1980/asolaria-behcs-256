// FIB-L02 tests
const { createRoundtrip } = require("../src/supervised-kick-roundtrip.js");

let pass = 0, fail = 0;
function t(n, c, d="") { c ? (pass++, console.log("[PASS]", n, d)) : (fail++, console.log("[FAIL]", n, d)); }

// T1 successful round-trip
(async () => {
  {
    const rt = createRoundtrip();
    const target = {
      probe: async () => ({ ok: true, pid: 42 }),
      deliver: async ({ kick_id, pid }) => { setTimeout(() => rt.ack(kick_id, { pid: 42, msg: "got-it" }), 5); },
    };
    const r = await rt.kick({ target, message: "hello" });
    t("01-roundtrip-ok", r.ok === true && r.attempts === 1);
    t("02-ack-pid-matches-probed", r.ack && r.ack.pid === 42);
  }

  // T2 probe fail → reject
  {
    const rt = createRoundtrip();
    const target = { probe: async () => ({ ok: false }), deliver: async () => {} };
    const r = await rt.kick({ target, message: "x" });
    t("03-probe-fail-rejects", !r.ok && r.reason === "probe-fail");
  }

  // T3 wrong-pid ack classified no-retry
  {
    const rt = createRoundtrip();
    const target = {
      probe: async () => ({ ok: true, pid: 42 }),
      deliver: async ({ kick_id }) => { setTimeout(() => rt.ack(kick_id, { pid: 99 }), 5); },
    };
    const r = await rt.kick({ target, message: "x" });
    t("04-wrong-pid-ack-rejected", !r.ok && r.reason === "wrong-pid-ack");
  }

  // T4 deadline + retry, eventually succeeds
  {
    const rt = createRoundtrip();
    let calls = 0;
    const target = {
      probe: async () => ({ ok: true, pid: 42 }),
      deliver: async ({ kick_id }) => {
        calls++;
        if (calls < 2) return; // first attempt times out
        setTimeout(() => rt.ack(kick_id, { pid: 42 }), 5);
      },
    };
    const r = await rt.kick({ target, message: "x", deadline_ms: 100, max_retries: 2 });
    t("05-retry-success", r.ok === true && r.attempts === 2);
  }

  // T5 deadline exceeded after max retries
  {
    const rt = createRoundtrip();
    const target = { probe: async () => ({ ok: true, pid: 42 }), deliver: async () => {} };
    const r = await rt.kick({ target, message: "x", deadline_ms: 50, max_retries: 1 });
    t("06-deadline-after-retries", !r.ok && r.reason === "deadline-after-retries");
  }

  // T6 inFlight cleared after completion
  {
    const rt = createRoundtrip();
    const target = { probe: async () => ({ ok: true, pid: 42 }), deliver: async ({ kick_id }) => { setTimeout(() => rt.ack(kick_id, { pid: 42 }), 5); } };
    await rt.kick({ target, message: "x" });
    t("07-inflight-cleared", rt._inFlightCount() === 0);
  }

  console.log(`\nsummary: pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
