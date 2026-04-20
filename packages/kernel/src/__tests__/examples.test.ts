// @asolaria/kernel — R.3 examples regression harness
// D11:ASSUMED. Exercises the 5 well-formed + 5 ill-formed examples from
// plans/section-R-3-grammar-specification.md §Examples.

import { parseAndValidate } from "../index.ts";
import { runClosure } from "../closure-test.ts";

interface Case {
  label: string;
  src: string;
  expect_ok: boolean;
  expect_subtype?: string;
}

const WELLFORMED: Case[] = [
  { label: "W1 D11 eyewitness",
    src: "D11 · PROOF-OBSERVED @ M-EYEWITNESS .",
    expect_ok: true },
  { label: "W2 OP-MORPH subjunctive",
    src: "OP-MORPH {PROF-NOVALUM @ DEVICE} @ M-SUBJUNCTIVE .",
    expect_ok: true },
  { label: "W3 drift broadcast",
    src: "EVT-DRIFT-BROADCAST {DRIFT-NEW-LOCATION · DEV-LIRIS · PORT-4947} @ M-EYEWITNESS .",
    expect_ok: true },
  { label: "W4 self-closure",
    src: "META-PROOF-OF-CLOSURE @ M-INDICATIVE .",
    expect_ok: true },
  { label: "W5 law lift with witness",
    src: "LAW-001 {PORT-4947 · PORT-4950} ^ @ M-INDICATIVE @ operator_witness=jesse .",
    expect_ok: true },
];

const ILLFORMED: Case[] = [
  { label: "I1 unknown glyph",
    src: "D11 · Dxx @ M-EYEWITNESS .",
    expect_ok: false,
    expect_subtype: "unknown_glyph" },
  { label: "I2 arity mismatch (OP-MORPH no operand)",
    src: "OP-MORPH @ M-INDICATIVE .",
    expect_ok: false,
    expect_subtype: "arity_mismatch" },
  { label: "I3 ambiguous profile concat",
    src: "PROF-FALCON · PROF-EBACMAP @ M-EYEWITNESS .",
    expect_ok: false,
    expect_subtype: "requires_braces" },
  { label: "I4 LAW scoped to OPERATION",
    src: "LAW-012 @ OPERATION @ M-INDICATIVE .",
    expect_ok: false,
    expect_subtype: "blast_too_narrow" },
  { label: "I5 colony lift unwitnessed",
    src: "PROF-SHANNON ^ @ M-INDICATIVE .",
    expect_ok: false,
    expect_subtype: "colony_lift_unwitnessed" },
];

interface Outcome { label: string; pass: boolean; detail: string; }

function run(): { passed: number; failed: number; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  for (const c of [...WELLFORMED, ...ILLFORMED]) {
    try {
      const { result } = parseAndValidate(c.src);
      let pass = result.ok === c.expect_ok;
      let detail = pass
        ? `ok=${result.ok}`
        : `ok=${result.ok}, expected ${c.expect_ok}, diag=${result.diagnostics.map(d => d.subtype).join(",")}`;
      if (pass && c.expect_subtype) {
        const has = result.diagnostics.some((d) => d.subtype === c.expect_subtype);
        if (!has) {
          pass = false;
          detail = `missing expected subtype '${c.expect_subtype}' in diag=[${result.diagnostics.map(d => d.subtype).join(",")}]`;
        }
      }
      outcomes.push({ label: c.label, pass, detail });
    } catch (err) {
      outcomes.push({ label: c.label, pass: false, detail: `threw: ${(err as Error).message}` });
    }
  }
  const passed = outcomes.filter((o) => o.pass).length;
  const failed = outcomes.length - passed;
  return { passed, failed, outcomes };
}

export function runAll(): { closure_ok: boolean; total: number; passed: number; failed: number; outcomes: Outcome[]; census: ReturnType<typeof import("../glyph-genesis.ts").censusReport> } {
  const { passed, failed, outcomes } = run();
  const closure = runClosure();
  return {
    closure_ok: closure.ok,
    total: outcomes.length,
    passed,
    failed,
    outcomes,
    census: closure.report,
  };
}
