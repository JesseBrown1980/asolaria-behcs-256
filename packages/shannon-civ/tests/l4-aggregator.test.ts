import { buildCohortReport, renderCohortReport, type L4CohortEntry } from "../src/l4-aggregator.ts";
import type { L4Result } from "../src/acer-dispatch.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== G-093 L4 cohort aggregator tests ===\n");

function mkL4(overrides: Partial<L4Result> = {}): L4Result {
  return {
    scan_id: "s", evidence: "STRONG", phase_expectation_met: true,
    l0_l2_all_ok: true, l3_accepted: true, notes: [], ...overrides,
  };
}
function mkEntry(overrides: Partial<L4CohortEntry> = {}): L4CohortEntry {
  return {
    scan_id: "scan-1", profile_name: "shannon-recon",
    requesting_target: "test.com", at: "2026-04-19T05:00:00Z",
    l4: mkL4(), ...overrides,
  };
}

// T1: empty
console.log("T1: empty cohort");
const r1 = buildCohortReport([]);
assert(r1.total_scans === 0, "0 scans");
assert(r1.weak_profiles.length === 0, "no weak profiles");

// T2: single entry
console.log("\nT2: single entry");
const r2 = buildCohortReport([mkEntry()]);
assert(r2.total_scans === 1, "1 scan");
assert(r2.overall.strong_ratio === 1, "100% STRONG");
assert(r2.overall.weak_or_insufficient_ratio === 0, "0 weak");

// T3: all STRONG → 100%
console.log("\nT3: all strong");
const strong: L4CohortEntry[] = Array.from({ length: 10 }, (_, i) => mkEntry({ scan_id: `s${i}` }));
const r3 = buildCohortReport(strong);
assert(r3.overall.strong_ratio === 1, "100%");
assert(r3.overall.phase_expectation_met_ratio === 1, "100% phase met");
assert(r3.weak_profiles.length === 0, "no weak");

// T4: mixed evidence
console.log("\nT4: mixed evidence");
const mixed: L4CohortEntry[] = [
  ...Array.from({ length: 4 }, (_, i) => mkEntry({ scan_id: `s${i}`, l4: mkL4({ evidence: "STRONG" }) })),
  ...Array.from({ length: 3 }, (_, i) => mkEntry({ scan_id: `w${i}`, l4: mkL4({ evidence: "WEAK" }) })),
  ...Array.from({ length: 2 }, (_, i) => mkEntry({ scan_id: `i${i}`, l4: mkL4({ evidence: "INSUFFICIENT" }) })),
  mkEntry({ scan_id: "c1", l4: mkL4({ evidence: "CONTRADICTORY" }) }),
];
const r4 = buildCohortReport(mixed);
assert(r4.overall.total === 10, "10 total");
assert(r4.overall.evidence_counts.STRONG === 4, "4 STRONG");
assert(r4.overall.evidence_counts.WEAK === 3, "3 WEAK");
assert(r4.overall.evidence_counts.INSUFFICIENT === 2, "2 INSUFF");
assert(r4.overall.evidence_counts.CONTRADICTORY === 1, "1 CONTR");
assert(r4.overall.strong_ratio === 0.4, "40% strong");
assert(r4.overall.weak_or_insufficient_ratio === 0.5, "50% weak");

// T5: profile buckets
console.log("\nT5: profile buckets");
const multiProfile: L4CohortEntry[] = [
  ...Array.from({ length: 5 }, (_, i) => mkEntry({ profile_name: "good", scan_id: `g${i}` })),
  ...Array.from({ length: 5 }, (_, i) => mkEntry({ profile_name: "bad", scan_id: `b${i}`, l4: mkL4({ evidence: "WEAK" }) })),
];
const r5 = buildCohortReport(multiProfile, 0.3, 5);
assert(r5.by_profile.good.total === 5, "good=5");
assert(r5.by_profile.bad.total === 5, "bad=5");
assert(r5.by_profile.bad.weak_or_insufficient_ratio === 1, "bad 100% weak");
assert(r5.weak_profiles.length === 1, "1 flagged");
assert(r5.weak_profiles[0].profile === "bad", "bad flagged");

// T6: target buckets
console.log("\nT6: target buckets");
const multiTarget: L4CohortEntry[] = [
  ...Array.from({ length: 6 }, (_, i) => mkEntry({ requesting_target: "ok.com", scan_id: `ok${i}` })),
  ...Array.from({ length: 6 }, (_, i) => mkEntry({ requesting_target: "flaky.com", scan_id: `fl${i}`, l4: mkL4({ evidence: i < 2 ? "STRONG" : "INSUFFICIENT" }) })),
];
const r6 = buildCohortReport(multiTarget, 0.3, 5);
assert(r6.by_target["ok.com"].total === 6, "ok 6");
assert(r6.by_target["flaky.com"].total === 6, "flaky 6");
assert(r6.weak_targets.some(t => t.target === "flaky.com"), "flaky flagged");

// T7: min-sample threshold filters out under-sampled
console.log("\nT7: min-sample filter");
const sparse: L4CohortEntry[] = [
  mkEntry({ profile_name: "rare", l4: mkL4({ evidence: "WEAK" }) }),
  mkEntry({ profile_name: "rare", scan_id: "s2", l4: mkL4({ evidence: "INSUFFICIENT" }) }),
];
const r7 = buildCohortReport(sparse, 0.3, 5);
assert(r7.weak_profiles.length === 0, "rare skipped (below min samples)");

// T8: phase expectation ratio
console.log("\nT8: phase expectation");
const phase: L4CohortEntry[] = [
  ...Array.from({ length: 3 }, (_, i) => mkEntry({ scan_id: `p${i}`, l4: mkL4({ phase_expectation_met: true }) })),
  ...Array.from({ length: 2 }, (_, i) => mkEntry({ scan_id: `n${i}`, l4: mkL4({ phase_expectation_met: false }) })),
];
const r8 = buildCohortReport(phase);
assert(r8.overall.phase_expectation_met_ratio === 0.6, "60% phase met");

// T9: l0_l2_ok and l3_accepted ratios
console.log("\nT9: l0_l2 + l3 ratios");
const gates: L4CohortEntry[] = [
  mkEntry({ scan_id: "a", l4: mkL4({ l0_l2_all_ok: true, l3_accepted: true }) }),
  mkEntry({ scan_id: "b", l4: mkL4({ l0_l2_all_ok: true, l3_accepted: false }) }),
  mkEntry({ scan_id: "c", l4: mkL4({ l0_l2_all_ok: false, l3_accepted: true }) }),
  mkEntry({ scan_id: "d", l4: mkL4({ l0_l2_all_ok: false, l3_accepted: false }) }),
];
const r9 = buildCohortReport(gates);
assert(r9.overall.l0_l2_ok_ratio === 0.5, "50% l0l2 ok");
assert(r9.overall.l3_accepted_ratio === 0.5, "50% l3 accepted");

// T10: rendered report
console.log("\nT10: render");
const text = renderCohortReport(r5);
assert(text.includes("L4 COHORT REPORT"), "header");
assert(text.includes("OVERALL"), "overall row");
assert(text.includes("WEAK PROFILES"), "weak profiles header");
assert(text.includes("bad"), "bad profile listed");
assert(text.includes("EVT-L4-COHORT-REPORT"), "glyph");

// T11: sort order — highest weak ratio first
console.log("\nT11: sort order");
const weak2: L4CohortEntry[] = [
  ...Array.from({ length: 10 }, (_, i) => mkEntry({ profile_name: "worst", scan_id: `w${i}`, l4: mkL4({ evidence: "WEAK" }) })),
  ...Array.from({ length: 10 }, (_, i) => mkEntry({ profile_name: "bad", scan_id: `b${i}`, l4: mkL4({ evidence: i < 5 ? "WEAK" : "STRONG" }) })),
];
const r11 = buildCohortReport(weak2, 0.3, 5);
assert(r11.weak_profiles[0].profile === "worst", "worst first");
assert(r11.weak_profiles[1].profile === "bad", "bad second");

// T12: glyph counts
console.log("\nT12: glyph");
assert(r5.glyph_sentence.includes("weak-profiles=1"), "weak-profiles count");
assert(r4.glyph_sentence.includes("scans=10"), "scans count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-G-093-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
