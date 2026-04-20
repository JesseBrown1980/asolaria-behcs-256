import { emptyCounters, foldRecord, classifyDivergence, buildDivergenceReport, type L6Record } from "../src/verdict-tracker.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== G-091 L6 verdict tracker tests ===\n");

function mkRec(overrides: Partial<L6Record> = {}): L6Record {
  return {
    ts: "2026-04-19T05:00:00Z",
    scan_id: "scan-1",
    dispatcher_actor: "liris-shannon-civ",
    requesting_target: "test.example.com",
    profile_name: "shannon-recon",
    acer_verdict: "promote",
    acer_reason: "clean",
    ...overrides,
  };
}

// T1: emptyCounters
console.log("T1: empty counters");
const c0 = emptyCounters();
assert(c0.total === 0, "total=0");
assert(c0.avg_latency_ms === null, "null avg");
assert(Object.keys(c0.by_target).length === 0, "no targets");

// T2: fold one promote record
console.log("\nT2: fold promote");
const c1 = foldRecord(c0, mkRec({ latency_ms: 100 }));
assert(c1.total === 1, "total=1");
assert(c1.by_acer_verdict.promote === 1, "promote=1");
assert(c1.by_target["test.example.com"].total === 1, "target seen");
assert(c1.by_target["test.example.com"].promoted === 1, "1 promoted");
assert(c1.by_profile["shannon-recon"] === 1, "profile counted");
assert(c1.avg_latency_ms === 100, "avg=100");

// T3: fold halt record
console.log("\nT3: fold halt");
const c2 = foldRecord(c1, mkRec({ scan_id: "scan-2", acer_verdict: "halt", latency_ms: 200 }));
assert(c2.total === 2, "total=2");
assert(c2.by_acer_verdict.halt === 1, "halt=1");
assert(c2.by_target["test.example.com"].halted === 1, "1 halted");
assert(c2.avg_latency_ms === 150, "avg=150");

// T4: different target
console.log("\nT4: different target");
const c3 = foldRecord(c2, mkRec({ scan_id: "scan-3", requesting_target: "other.com" }));
assert(c3.total === 3, "total=3");
assert(c3.by_target["other.com"].total === 1, "other.com counted");
assert(c3.by_target["test.example.com"].total === 2, "test.com still 2");

// T5: with liris final verdict
console.log("\nT5: liris final verdict");
const c4 = foldRecord(c3, mkRec({ scan_id: "scan-4", liris_final_verdict: "ok" }));
assert(c4.by_liris_final.ok === 1, "liris ok=1");

// T6: latency can be absent
console.log("\nT6: no latency");
const c5 = foldRecord(c4, mkRec({ scan_id: "scan-5" }));
assert(c5.total === 5, "total=5");
assert(c5.avg_latency_ms === 150, "avg unchanged when latency absent");

// T7: classifyDivergence agreement (promote+ok)
console.log("\nT7: agreement promote+ok");
const d1 = classifyDivergence(mkRec({ acer_verdict: "promote", liris_final_verdict: "ok" }));
assert(d1.divergent === false, "not divergent");
assert(d1.category === "agreement", "agreement");

// T8: agreement halt+deny
console.log("\nT8: agreement halt+deny");
const d2 = classifyDivergence(mkRec({ acer_verdict: "halt", liris_final_verdict: "deny" }));
assert(d2.divergent === false, "not divergent");

// T9: divergence promote+deny
console.log("\nT9: divergent promote+deny");
const d3 = classifyDivergence(mkRec({ acer_verdict: "promote", liris_final_verdict: "deny" }));
assert(d3.divergent === true, "divergent");
assert(d3.category === "acer-promote-liris-deny", "category correct");

// T10: divergence halt+ok
console.log("\nT10: divergent halt+ok");
const d4 = classifyDivergence(mkRec({ acer_verdict: "halt", liris_final_verdict: "ok" }));
assert(d4.divergent === true, "divergent");
assert(d4.category === "acer-halt-liris-ok", "category correct");

// T11: partial disagreement warn
console.log("\nT11: partial warn");
const d5 = classifyDivergence(mkRec({ acer_verdict: "promote", liris_final_verdict: "warn" }));
assert(d5.divergent === true, "divergent");
assert(d5.category === "partial-disagreement", "partial-disagreement");

// T12: no liris verdict yet
console.log("\nT12: no liris verdict");
const d6 = classifyDivergence(mkRec());
assert(d6.divergent === false, "not yet divergent");
assert(d6.category === "liris-no-verdict", "correctly categorized");

// T13: buildDivergenceReport
console.log("\nT13: divergence report");
const records: L6Record[] = [
  mkRec({ scan_id: "s1", acer_verdict: "promote", liris_final_verdict: "ok" }),
  mkRec({ scan_id: "s2", acer_verdict: "promote", liris_final_verdict: "deny" }),    // divergent
  mkRec({ scan_id: "s3", acer_verdict: "halt", liris_final_verdict: "deny" }),
  mkRec({ scan_id: "s4", acer_verdict: "halt", liris_final_verdict: "ok" }),         // divergent
  mkRec({ scan_id: "s5" }),                                                          // no liris yet
];
const rep = buildDivergenceReport(records);
assert(rep.total_scans === 5, "5 scans");
assert(rep.liris_verdict_recorded === 4, "4 with liris verdict");
assert(rep.agreements === 2, "2 agreements");
assert(rep.divergences === 2, "2 divergences");
assert(rep.sample_divergent.length === 2, "2 in sample");
assert(rep.by_category.agreement === 2, "agreement count");
assert(rep.by_category["acer-promote-liris-deny"] === 1, "promote-deny count");
assert(rep.by_category["acer-halt-liris-ok"] === 1, "halt-ok count");
assert(rep.by_category["liris-no-verdict"] === 1, "no-verdict count");

// T14: sample_size honored
console.log("\nT14: sample_size");
const many: L6Record[] = [];
for (let i = 0; i < 25; i++) {
  many.push(mkRec({ scan_id: `s${i}`, acer_verdict: "promote", liris_final_verdict: "deny" }));
}
const rep2 = buildDivergenceReport(many, 5);
assert(rep2.divergences === 25, "all 25 divergent");
assert(rep2.sample_divergent.length === 5, "sample capped at 5");

// T15: glyph
console.log("\nT15: glyph");
assert(rep.glyph_sentence.startsWith("EVT-L6-VERDICT-DIVERGENCE"), "prefix");
assert(rep.glyph_sentence.includes("agree=2"), "agree count");
assert(rep.glyph_sentence.includes("diverge=2"), "diverge count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-G-091-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
