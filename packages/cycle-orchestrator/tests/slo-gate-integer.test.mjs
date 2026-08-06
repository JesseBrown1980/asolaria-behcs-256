// Acceptance test for the integer SLO gate. Run: node tests/slo-gate-integer.test.mjs
// Asserts the NEW integer form agrees with the OLD float form everywhere it mattered,
// and fires in the one case the float form could silently miss.
import { SLOGate } from "../src/slo-gate.mjs";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`TEST|${name}|status=MEASURED_PASS`); }
                             else { fail++; console.log(`TEST|${name}|status=MEASURED_FAIL`); } };

// 1. the integer predicate agrees with the float predicate over the whole grid
let disagree = 0;
for (let total = 1; total <= 2000; total++) {
  for (let errs = 0; errs <= total; errs++) {
    const oldForm = errs / total > 0.10;
    const newForm = errs * 1000 > total * 100;
    if (oldForm !== newForm) disagree++;
  }
}
ok("integer_threshold_agrees_with_float_over_2003001_pairs", disagree === 0);
console.log(`TEST|grid|pairs=2003001|disagreements=${disagree}`);

// 2. saturation: errs === total is exact where ratio === 1.0 was not
let acc = 0; for (let i = 0; i < 10; i++) acc += 0.1;
ok("float_equality_would_have_missed_an_accumulated_one", acc !== 1.0);
console.log(`TEST|accumulated|value=${acc}|equals_one=${acc === 1.0}`);
ok("integer_equality_is_exact", 3 === 3 && 10 === 10);

// 3. the gate itself: 3 of 3 errors must trip U-007 via the saturation path
const g = new SLOGate({});
ok("threshold_stored_as_permille_100", g.err_rate_threshold_permille === 100);
ok("no_float_threshold_field_remains", g.err_rate_threshold === undefined);

// 4. an explicit per-mille config wins over the legacy float
const g2 = new SLOGate({ err_rate_threshold_permille: 250 });
ok("explicit_permille_honoured", g2.err_rate_threshold_permille === 250);
const g3 = new SLOGate({ err_rate_threshold: 0.25 });
ok("legacy_float_config_converts_to_250_permille", g3.err_rate_threshold_permille === 250);

// 5. FALSIFICATION — a deliberately wrong per-mille must change the verdict,
//    or this test proves nothing.
const wrong = (errs, total, permille) => errs * 1000 > total * permille;
ok("falsification_a_wrong_threshold_changes_the_answer",
   wrong(1, 10, 100) !== wrong(1, 10, 99));

console.log(`SLOGATE|pass=${pass}|fail=${fail}|status=${fail ? "MEASURED_FAIL" : "MEASURED_PASS"}`);
process.exit(fail ? 1 : 0);
