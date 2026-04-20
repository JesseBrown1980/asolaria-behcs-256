import { planRotation, renderRotationReport, DEFAULT_POLICY, type Ed25519Registry } from "../key-rotation-scheduler.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== K-002 key rotation scheduler tests ===\n");

const NOW = "2026-04-19T00:00:00Z";

// Helper to build a key entry
function mk(overrides: any = {}): any {
  return {
    key_id: "dev-test-xxx",
    owner_glyph: "DEV-TEST",
    public_key_b64: "fakefakefakefakefakefakefakefakefake",
    d11_level: "ASSUMED",
    created_at: "2026-04-01T00:00:00Z",  // ~18 days old
    rotated_at: null,
    usage: ["behcs-envelope"],
    binding_class: "device-bound",
    host_device: "DEV-TEST",
    ...overrides,
  };
}

// T1: fresh key → fresh verdict
console.log("T1: fresh key");
const reg1: Ed25519Registry = { version: "0.1.0", updated_at: NOW, keys: [mk({ created_at: "2026-04-15T00:00:00Z" })] };
const p1 = planRotation(reg1, DEFAULT_POLICY, NOW);
assert(p1.total_keys === 1, "total=1");
assert(p1.candidates_fresh === 1, "1 fresh");
assert(p1.candidates[0].verdict === "fresh", "verdict=fresh");
assert(p1.candidates[0].age_days === 4, "4d age");

// T2: old key → rotate-now
console.log("\nT2: old key");
const reg2: Ed25519Registry = { version: "0.1.0", updated_at: NOW, keys: [mk({ created_at: "2025-01-01T00:00:00Z" })] };
const p2 = planRotation(reg2, DEFAULT_POLICY, NOW);
assert(p2.candidates_rotate_now === 1, "1 rotate-now");
assert(p2.candidates[0].verdict === "rotate-now", "verdict=rotate-now");
assert(p2.candidates[0].age_days > 365, "age > 365d");

// T3: within warn window → warn
console.log("\nT3: warn window");
const warnAge = new Date(Date.parse(NOW) - (DEFAULT_POLICY.max_age_days - 15) * 86400 * 1000).toISOString();
const reg3: Ed25519Registry = { version: "0.1.0", updated_at: NOW, keys: [mk({ created_at: warnAge })] };
const p3 = planRotation(reg3, DEFAULT_POLICY, NOW);
assert(p3.candidates_warn === 1, "1 warn");
assert(p3.candidates[0].verdict === "warn", "verdict=warn");
assert(p3.candidates[0].days_to_rotation === 15, "15d remaining");

// T4: recently rotated → rotated-recent
console.log("\nT4: recently rotated");
const reg4: Ed25519Registry = {
  version: "0.1.0", updated_at: NOW,
  keys: [mk({ created_at: "2025-01-01T00:00:00Z", rotated_at: "2026-04-10T00:00:00Z" })],
};
const p4 = planRotation(reg4, DEFAULT_POLICY, NOW);
assert(p4.candidates_rotated_recent === 1, "1 rotated-recent");
assert(p4.candidates[0].verdict === "rotated-recent", "verdict=rotated-recent");
assert(p4.candidates[0].reason.includes("9d ago"), "reason cites 9d ago");

// T5: bootstrap force-rotate policy
console.log("\nT5: bootstrap force rotate");
const reg5: Ed25519Registry = {
  version: "0.1.0", updated_at: NOW,
  keys: [mk({ created_at: "2026-04-15T00:00:00Z", notes: "bootstrap-local-key" })],
};
const p5 = planRotation(reg5, { ...DEFAULT_POLICY, force_rotate_if_bootstrap: true }, NOW);
assert(p5.candidates_rotate_now === 1, "1 rotate-now (bootstrap)");
assert(p5.candidates[0].reason.includes("bootstrap"), "reason mentions bootstrap");

// T6: bootstrap without force policy → fresh
console.log("\nT6: bootstrap without force");
const p6 = planRotation(reg5, DEFAULT_POLICY, NOW);
assert(p6.candidates_fresh === 1, "still fresh under default");

// T7: mixed registry
console.log("\nT7: mixed registry");
const mixedReg: Ed25519Registry = {
  version: "0.1.0", updated_at: NOW,
  keys: [
    mk({ key_id: "k-fresh", created_at: "2026-04-15T00:00:00Z" }),
    mk({ key_id: "k-old", created_at: "2025-01-01T00:00:00Z" }),
    mk({ key_id: "k-warn", created_at: warnAge }),
    mk({ key_id: "k-recent", created_at: "2025-01-01T00:00:00Z", rotated_at: "2026-04-15T00:00:00Z" }),
  ],
};
const p7 = planRotation(mixedReg, DEFAULT_POLICY, NOW);
assert(p7.total_keys === 4, "4 total");
assert(p7.candidates_fresh === 1, "1 fresh");
assert(p7.candidates_warn === 1, "1 warn");
assert(p7.candidates_rotate_now === 1, "1 rotate-now");
assert(p7.candidates_rotated_recent === 1, "1 rotated-recent");

// T8: empty registry
console.log("\nT8: empty registry");
const emptyReg: Ed25519Registry = { version: "0.1.0", updated_at: NOW, keys: [] };
const p8 = planRotation(emptyReg, DEFAULT_POLICY, NOW);
assert(p8.total_keys === 0, "0 keys");
assert(p8.candidates.length === 0, "no candidates");

// T9: glyph sentence
console.log("\nT9: glyph");
assert(p7.glyph_sentence.startsWith("EVT-KEY-ROTATION-PLAN"), "glyph prefix");
assert(p7.glyph_sentence.includes("rotate-now=1"), "rotate-now count in glyph");
assert(p7.glyph_sentence.includes("@ M-INDICATIVE"), "M-INDICATIVE mood");

// T10: render report string
console.log("\nT10: render report");
const report = renderRotationReport(p7);
assert(report.includes("KEY ROTATION REPORT"), "header");
assert(report.includes("max_age=365d"), "policy in header");
assert(report.includes("k-old"), "includes old key");
assert(report.includes("!!"), "rotate-now flag");
assert(report.split("\n").length > 5, "multi-line report");
// rotate-now should appear before fresh
const lines = report.split("\n");
const oldIdx = lines.findIndex(l => l.includes("k-old"));
const freshIdx = lines.findIndex(l => l.includes("k-fresh"));
assert(oldIdx < freshIdx, "rotate-now sorted before fresh");

// T11: custom policy short max_age
console.log("\nT11: custom policy");
const shortPolicy = { max_age_days: 10, force_rotate_if_bootstrap: false, warn_days_before: 3 };
const p11 = planRotation({ version: "0.1.0", updated_at: NOW, keys: [mk({ created_at: "2026-04-15T00:00:00Z" })] }, shortPolicy, NOW);
// 4d old, max=10d, warn_before=3 → within (10-3=7)? 4 < 7 → fresh
assert(p11.candidates[0].verdict === "fresh", "4d under 7d warn threshold");
const p11b = planRotation({ version: "0.1.0", updated_at: NOW, keys: [mk({ created_at: "2026-04-10T00:00:00Z" })] }, shortPolicy, NOW);
// 9d old → ≥ 7 (warn threshold) but < 10 (max) → warn
assert(p11b.candidates[0].verdict === "warn", "9d in warn window");

// T12: checked_at honored
console.log("\nT12: checked_at");
assert(p7.checked_at === NOW, "checked_at stamped");
assert(p7.policy === DEFAULT_POLICY, "policy echoed");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-K-002-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
