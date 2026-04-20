// Item 087 · CRITICAL drift → announce + freeze within 2s
const { handleDrift } = require("../../src/drift/halt-handler.js");
const { isFrozen, unfreezeDevice } = require("../../src/drift/freeze.js");

let pass = 0, fail = 0;
function t(name, cond) { cond ? (pass++, console.log("[PASS]", name)) : (fail++, console.log("[FAIL]", name)); }

(async () => {
  unfreezeDevice("JESSE-UNFREEZE-AUTHORIZED");
  const sent = [];
  const sendFn = async (target, env) => { sent.push({ target, kind: env.kind }); return { ok: true }; };
  const t0 = Date.now();
  const r = await handleDrift({ class: "CRITICAL", hw_pid: "PID-TEST", expected_fp: "sha256:aaa", actual_fp: "sha256:zzz", surface: "test" }, sendFn);
  const dt = Date.now() - t0;
  t("CRITICAL-action-announced+frozen", r.action === "announced+frozen");
  t("CRITICAL-broadcast-8", r.bcast.delivered === 8);
  t("CRITICAL-is-frozen", isFrozen());
  t("CRITICAL-within-2s", dt < 2000);
  unfreezeDevice("JESSE-UNFREEZE-AUTHORIZED"); // cleanup
  console.log(`summary: pass=${pass} fail=${fail} elapsed=${dt}ms`);
  process.exit(fail === 0 ? 0 : 1);
})();
