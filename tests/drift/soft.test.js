// Item 086 · SOFT drift → announce, no freeze
const { handleDrift } = require("../../src/drift/halt-handler.js");
const { isFrozen, unfreezeDevice } = require("../../src/drift/freeze.js");

let pass = 0, fail = 0;
function t(name, cond) { cond ? (pass++, console.log("[PASS]", name)) : (fail++, console.log("[FAIL]", name)); }

(async () => {
  // Ensure clean state
  unfreezeDevice("JESSE-UNFREEZE-AUTHORIZED");
  const sent = [];
  const sendFn = async (target, env) => { sent.push({ target, kind: env.kind }); return { ok: true }; };
  const r = await handleDrift({ class: "SOFT", hw_pid: "PID-TEST", expected_fp: "sha256:aaa", actual_fp: "sha256:aab", surface: "test" }, sendFn);
  t("SOFT-action-is-announced", r.action === "announced");
  t("SOFT-broadcast-8-targets", r.bcast.total === 8 && r.bcast.delivered === 8);
  t("SOFT-no-freeze", !isFrozen());
  console.log(`summary: pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
