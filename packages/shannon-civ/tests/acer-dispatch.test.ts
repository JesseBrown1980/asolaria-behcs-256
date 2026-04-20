// packages/shannon-civ/tests/acer-dispatch.test.ts — G-087 tests

import {
  classifyProfile, synthesize, decide, runAcerDispatch, buildResultEnvelope,
  type ShannonScanDispatchEnvelope,
} from "../src/acer-dispatch.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

function makeEnv(
  profile: string = "shannon-recon",
  l0: boolean = true,
  l1: boolean = true,
  l2: boolean = true,
  extra: Partial<ShannonScanDispatchEnvelope["body"]["spawn_request"]> = {},
): ShannonScanDispatchEnvelope {
  return {
    verb: "shannon-scan-dispatch",
    actor: "liris-shannon-civ",
    target: "acer",
    d1: "IDENTITY",
    body: {
      scan_id: "scan-" + Math.random().toString(36).slice(2, 8),
      spawn_request: {
        profile_name: profile as any,
        scan_id: "scan-x",
        scope: { allowed_hosts: ["example.test"], allowed_paths: ["/probe"] },
        operator_witness: { gate: "jesse", profile: "owner" },
        requested_by: "liris",
        ts: new Date().toISOString(),
        ...extra,
      } as any,
      l0_l2_verdicts: [
        { level: "L0", ok: l0 },
        { level: "L1", ok: l1 },
        { level: "L2", ok: l2 },
      ],
    },
    glyph_sentence: "EVT-SHANNON-SCAN-DISPATCH @ M-INDICATIVE .",
  };
}

console.log("=== G-087 acer-dispatch tests ===\n");

// T1: happy path — acer-resident profile, all L0-L2 ok → promote
console.log("T1: happy path → promote");
const r1 = runAcerDispatch(makeEnv("shannon-recon"));
assert(r1.verdict === "promote", `verdict=${r1.verdict}`, r1.reason);
assert(r1.l3.verdict === "PROFILE_ACER_RESIDENT", "L3 accepts acer-resident");
assert(r1.l4.evidence === "STRONG", "L4 evidence=STRONG");

// T2: profile lives on liris → pending-acer-civ-return
console.log("\nT2: liris-resident profile → pending-acer-civ-return");
const r2 = runAcerDispatch(makeEnv("shannon-pre-recon"));  // lives_on_device=DEV-LIRIS
assert(r2.verdict === "pending-acer-civ-return", `verdict=${r2.verdict}`, r2.reason);
assert(r2.l3.verdict === "PROFILE_LIRIS_RESIDENT", "L3 flags liris-resident");

// T3: unknown profile → halt
console.log("\nT3: unknown profile → halt");
const r3 = runAcerDispatch(makeEnv("shannon-bogus-profile"));
assert(r3.verdict === "halt", `verdict=${r3.verdict}`);
assert(r3.l3.verdict === "PROFILE_UNKNOWN", "L3 flags unknown");

// T4: empty scope → L3 halt → L5 halt
console.log("\nT4: empty scope → halt");
const emptyScope = makeEnv("shannon-recon");
emptyScope.body.spawn_request.scope = { allowed_hosts: [], allowed_paths: [] };
const r4 = runAcerDispatch(emptyScope);
assert(r4.verdict === "halt", "empty scope halt");
assert(r4.l3.halts_observed.length > 0, "halts_observed populated");

// T5: missing operator_witness → halt
console.log("\nT5: missing operator_witness → halt");
const noWit = makeEnv("shannon-recon");
(noWit.body.spawn_request as any).operator_witness = {};
const r5 = runAcerDispatch(noWit);
assert(r5.verdict === "halt", "missing witness halt");
assert(r5.l3.halts_observed.some(h => h.includes("operator_witness")), "halt reason cites witness");

// T6: L0 fails despite L3 accept → contradictory → halt
console.log("\nT6: L0 fail + L3 accept → contradictory halt");
const r6 = runAcerDispatch(makeEnv("shannon-recon", false, true, true));
assert(r6.verdict === "halt", "contradictory → halt");
assert(r6.l4.evidence === "CONTRADICTORY", "evidence=CONTRADICTORY");

// T7: incomplete L0-L2 coverage → insufficient/weak → pending-return
console.log("\nT7: incomplete L-coverage → pending-return");
const incomplete = makeEnv("shannon-recon");
incomplete.body.l0_l2_verdicts = [{ level: "L0", ok: true }]; // missing L1 + L2
const r7 = runAcerDispatch(incomplete);
assert(r7.verdict === "pending-acer-civ-return" || r7.verdict === "halt", `verdict=${r7.verdict}`);
assert(r7.l4.phase_expectation_met === false, "phase_expectation_met=false");

// T8: classify returns canonical fields
console.log("\nT8: classifyProfile populates reasons");
const l3 = classifyProfile(makeEnv("shannon-recon"));
assert(l3.resident_device === "DEV-ACER", "resident=DEV-ACER");
assert(l3.reasons.length > 0, "reasons populated");

// T9: synthesize independent of decide
console.log("\nT9: synthesize + decide composable");
const env9 = makeEnv("shannon-recon");
const l3_9 = classifyProfile(env9);
const l4_9 = synthesize(env9, l3_9);
const l5_9 = decide(env9, l3_9, l4_9);
assert(l5_9.scan_id === env9.body.scan_id, "scan_id threaded through");
assert(l5_9.glyph_sentence.includes("EVT-SHANNON-ACER-VERDICT"), "glyph has event name");

// T10: buildResultEnvelope shape
console.log("\nT10: result envelope shape");
const env10 = makeEnv("shannon-recon");
const res10 = runAcerDispatch(env10);
const out = buildResultEnvelope(res10);
assert(out.verb === "shannon-scan-result", "verb=shannon-scan-result");
assert(out.target === "liris", "target=liris");
assert(out.actor === "acer", "actor=acer");
assert(out.body.scan_id === env10.body.scan_id, "body.scan_id matches");
assert(out.body.acer_verdict === res10.verdict, "body.acer_verdict matches");

// T11: glyph_sentence contains key fields
console.log("\nT11: glyph_sentence details");
assert(res10.glyph_sentence.includes("scan="), "has scan=");
assert(res10.glyph_sentence.includes("verdict="), "has verdict=");
assert(res10.glyph_sentence.includes("evidence="), "has evidence=");
assert(res10.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends mood");

// T12: G-089 schema-alignment — liris wire shape { layer, decision, reason }
console.log("\nT12: G-089 accept liris wire shape (layer/decision)");
const envLiris: ShannonScanDispatchEnvelope = {
  verb: "shannon-scan-dispatch",
  actor: "liris-shannon-civ",
  target: "acer",
  d1: "IDENTITY",
  body: {
    scan_id: "scan-liris-wire",
    spawn_request: {
      profile_name: "shannon-recon" as any,
      scan_id: "scan-liris-wire",
      scope: { allowed_hosts: ["test.x"], allowed_paths: ["/y"] },
      operator_witness: { gate: "jesse", profile: "owner" },
      requested_by: "liris",
      ts: new Date().toISOString(),
    } as any,
    l0_l2_verdicts: [
      { layer: "L0", decision: "pass", reason: "rate+scope ok" },
      { layer: "L1", decision: "pass" },
      { layer: "L2", decision: "pass" },
    ] as any,
  },
  glyph_sentence: "EVT-SHANNON-SCAN-DISPATCH @ M-INDICATIVE .",
};
const r12 = runAcerDispatch(envLiris);
assert(r12.verdict === "promote", `liris wire shape → promote (got ${r12.verdict})`, r12.reason);
assert(r12.l4.evidence === "STRONG", "evidence=STRONG on liris wire shape");
assert(r12.l4.l0_l2_all_ok === true, "l0_l2_all_ok true on decision=pass");

// T13: mixed shapes still detect failure
console.log("\nT13: decision=fail → contradictory");
const envFail = JSON.parse(JSON.stringify(envLiris));
envFail.body.l0_l2_verdicts[0].decision = "fail";
const r13 = runAcerDispatch(envFail);
assert(r13.l4.l0_l2_all_ok === false, "decision=fail flagged");
assert(r13.verdict === "halt", "halt on contradictory");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-G-087-ACER-DISPATCH-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
