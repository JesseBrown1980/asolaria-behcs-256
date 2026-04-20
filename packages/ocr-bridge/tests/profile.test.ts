import { buildProfile, promoteToObserved } from "../src/profile.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== ocr-bridge · profile tests ===\n");

// T1: minimal profile build
const p1 = buildProfile({
  id: "w1", lang: "eng", psm: 3, oem: 3,
  named_agent: "acer-ocr-integrator-batch-16",
  spawned_at: "2026-04-19T22:00:00Z",
});
assert(p1.version === "prof-ocr-worker-v1", "version");
assert(p1.d11_level === "ASSUMED", "default ASSUMED");
assert(p1.host_device === "DEV-ACER", "default host");
assert(p1.capabilities.length === 3, "3 default capabilities");
assert(p1.profile_glyph.length === 16, "16-char glyph");
assert(p1.glyph_sentence.includes("PROF-OCR-WORKER"), "glyph");

// T2: glyph determinism
console.log("\nT2: glyph determinism");
const p2a = buildProfile({ id: "w2", lang: "eng", psm: 3, oem: 3, named_agent: "a1", spawned_at: "2026-04-19T22:00:00Z" });
const p2b = buildProfile({ id: "w2", lang: "eng", psm: 3, oem: 3, named_agent: "a1", spawned_at: "2026-04-19T22:00:00Z" });
assert(p2a.profile_glyph === p2b.profile_glyph, "deterministic");

// T3: different lang → different glyph
console.log("\nT3: lang differentiates");
const p3 = buildProfile({ id: "w3", lang: "chi_sim", psm: 3, oem: 3, named_agent: "a1" });
assert(p3.profile_glyph !== p2a.profile_glyph, "lang flips glyph");

// T4: D11 ASSUMED → OBSERVED promotion
console.log("\nT4: D11 promotion");
const p4 = promoteToObserved(p1, 10, "2026-04-19T22:05:00Z");
assert(p4.d11_level === "OBSERVED", "promoted");
assert(p4.glyph_sentence.includes("ASSUMED→OBSERVED"), "glyph");
assert(p4.glyph_sentence.includes("observations=10"), "obs count");

// T5: D11 override at build
console.log("\nT5: D11 override at build");
const p5 = buildProfile({ id: "w5", lang: "eng", psm: 3, oem: 3, named_agent: "a", d11_level: "WITNESSED" });
assert(p5.d11_level === "WITNESSED", "override");

// T6: multi-language profile
console.log("\nT6: multi-language");
const p6 = buildProfile({ id: "w6", lang: "eng+chi_sim+jpn", psm: 6, oem: 1, named_agent: "a" });
assert(p6.glyph_sentence.includes("lang=eng+chi_sim+jpn"), "multi-lang in glyph");
assert(p6.glyph_sentence.includes("psm=6"), "psm=6");
assert(p6.glyph_sentence.includes("oem=1"), "oem=1");

// T7: capabilities override
console.log("\nT7: capability subset");
const p7 = buildProfile({ id: "w7", lang: "eng", psm: 3, oem: 3, named_agent: "a", capabilities: ["recognize"] });
assert(p7.capabilities.length === 1, "1 capability");
assert(p7.capabilities[0] === "recognize", "only recognize");

// T8: profile shape matches downstream consumers
console.log("\nT8: consumer-required fields");
assert("id" in p1 && "lang" in p1 && "psm" in p1 && "oem" in p1 && "named_agent" in p1 && "profile_glyph" in p1, "all consumer fields");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-OCR-PROFILE-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
