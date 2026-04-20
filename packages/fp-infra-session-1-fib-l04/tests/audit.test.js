// FIB-L04 tests · zero-false-positive halt-canon auditor
const { HALT_CANON_11, tokenize, audit, auditStream } = require("../src/halt-word-audit.js");

let pass = 0, fail = 0;
function t(n, c, d="") { c ? (pass++, console.log("[PASS]", n, d)) : (fail++, console.log("[FAIL]", n, d)); }

// T1 canon size
t("01-canon-11-words", HALT_CANON_11.length === 11);

// T2 tokenize splits by non-word chars
t("02-tokenize-dash", tokenize("EVT-ACER-HALT").join(",") === "EVT,ACER,HALT");
t("03-tokenize-dot", tokenize("op.halt.now").join(",") === "OP,HALT,NOW");
t("04-tokenize-empty", tokenize("").length === 0);

// T3 whole-word detection
t("05-halt-fires",      audit("OP-HALT").halt_hit === true);
t("06-fail-fires",      audit("EVT-FAIL").halt_hit === true);
t("07-emergency-fires", audit("EVT-EMERGENCY-BRAKE").halt_hit === true);
t("08-divers-fires",    audit("EVT-ROUTE-DIVERGE").halt_hit === true);

// T4 zero false positives — substrings that contain halt-letters but aren't whole tokens
t("09-cadence-slow-no-fire", audit("EVT-ACER-S2A-CADENCE-SLOW").halt_hit === false); // SLOW !== STOP (token-level)
t("10-failed-partial-no-fire", audit("EVT-UNFAILURE-REPORT").halt_hit === false); // UNFAILURE contains FAIL but !== FAIL token
t("11-haltingly-no-fire", audit("EVT-HALTINGLY-OK").halt_hit === false); // HALTINGLY !== HALT token
t("12-killer-no-fire", audit("EVT-KILLER-APP-REVIEW").halt_hit === false); // KILLER !== KILL
t("13-terminated-no-fire", audit("EVT-TERMINATED-RUN").halt_hit === false); // TERMINATED !== TERMINATE
t("14-stopped-no-fire", audit("EVT-AUTOSTOPPED").halt_hit === false); // AUTOSTOPPED !== STOP
t("15-aborts-no-fire", audit("EVT-ABORTS-COUNTED").halt_hit === false); // ABORTS !== ABORT

// T5 mixed hits
{
  const a = audit("EVT-HALT-AND-FAIL");
  t("16-multi-hit-both", a.halt_hit && a.words_hit.includes("HALT") && a.words_hit.includes("FAIL"));
}

// T6 stream
{
  const r = auditStream([
    "EVT-A",
    "OP-HALT",
    "EVT-FAIL",
    "EVT-CADENCE-SLOW",
    "EVT-EMERGENCY-FREEZE",
  ]);
  t("17-stream-total", r.total === 5);
  t("18-stream-halts", r.halts.length === 3);
  t("19-stream-clear", r.clear.length === 2);
  t("20-by-word-emergency", r.by_word.EMERGENCY === 1);
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
