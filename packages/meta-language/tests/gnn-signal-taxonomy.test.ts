import { CANONICAL_TAXONOMY, recommendSignalsForCase, buildConnorTrainingFixture } from "../src/gnn-signal-taxonomy.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== meta-language · GNN signal taxonomy tests ===\n");

// T1: taxonomy completeness
console.log("T1: taxonomy completeness");
assert(CANONICAL_TAXONOMY.length >= 15, `≥15 classes (got ${CANONICAL_TAXONOMY.length})`);
assert(CANONICAL_TAXONOMY.every(c => typeof c.base_weight === "number"), "all have base_weight");
assert(CANONICAL_TAXONOMY.every(c => ["mask","leak","neutral","meta"].includes(c.intent)), "all intents valid");

// T2: legal-instrument-self-declaration is weight 1.0
console.log("\nT2: legal-instrument weight");
const lisd = CANONICAL_TAXONOMY.find(c => c.class_id === "legal-instrument-self-declaration");
assert(!!lisd, "class exists");
assert(lisd!.base_weight === 1.0, "weight=1.0");
assert(lisd!.intent === "leak", "leak intent");

// T3: voip-carrier-obfuscator has obfuscator_flag
console.log("\nT3: voip obfuscator flag");
const voip = CANONICAL_TAXONOMY.find(c => c.class_id === "voip-carrier-obfuscator");
assert(!!voip, "class exists");
assert(voip!.obfuscator_flag === true, "obfuscator_flag true");
assert(voip!.intent === "mask", "mask intent");

// T4: meta-class population-imbalance-marker
console.log("\nT4: meta signals");
const pi = CANONICAL_TAXONOMY.find(c => c.class_id === "population-imbalance-marker");
assert(!!pi, "exists");
assert(pi!.intent === "meta", "meta intent");
assert(pi!.downstream_shannon_stage === null, "no Shannon stage");

// T5: recommend for W-8BEN case
console.log("\nT5: recommend W-8BEN");
const rec1 = recommendSignalsForCase([{ id: "s1", detail: "W-8BEN self-declared Japan" }]);
assert(rec1.some(r => r.taxonomy_class === "legal-instrument-self-declaration"), "recommends legal-instrument");
assert(rec1.find(r => r.taxonomy_class === "legal-instrument-self-declaration")!.recommended_weight === 1.0, "weight 1.0");

// T6: recommend for VoIP number
console.log("\nT6: recommend VoIP");
const rec2 = recommendSignalsForCase([{ id: "s2", detail: "phone on Level 3 CLEC Bandwidth.com VoIP pool" }]);
assert(rec2.some(r => r.taxonomy_class === "voip-carrier-obfuscator"), "recommends voip");

// T7: recommend for ExpressVPN
console.log("\nT7: recommend VPN");
const rec3 = recommendSignalsForCase([{ id: "s3", detail: "ExpressVPN HK exit cluster" }]);
assert(rec3.some(r => r.taxonomy_class === "vpn-exit-cluster-affinity"), "recommends vpn");

// T8: recommend for timezone
console.log("\nT8: recommend timezone");
const rec4 = recommendSignalsForCase([{ id: "s4", detail: "session activity cluster UTC+8 evening window" }]);
assert(rec4.some(r => r.taxonomy_class === "timezone-activity-window"), "recommends timezone");

// T9: Connor training fixture shape
console.log("\nT9: Connor fixture");
const fx = buildConnorTrainingFixture();
assert(fx.case === "connor-origin-inference", "case id");
assert(fx.resolution_country === "JP", "resolved JP");
assert(fx.resolution_city === "Chiba", "resolved Chiba");
assert(fx.evidence.length >= 10, `≥10 evidence (got ${fx.evidence.length})`);
assert(fx.glyph_sentence.includes("GULP-TRAINING-FIXTURE"), "glyph");

// T10: fixture distinct taxonomy classes used
console.log("\nT10: fixture class coverage");
const classesUsed = new Set(fx.evidence.map(e => e.class));
assert(classesUsed.size >= 6, `≥6 distinct classes used (got ${classesUsed.size})`);

// T11: weights sum sanity — Connor case resolution (JP) should have highest contribution from legal-instrument
console.log("\nT11: fixture weight discipline");
const jpWeight = fx.evidence
  .filter(e => e.bias.JP !== undefined && e.bias.JP > 0)
  .reduce((s, e) => s + e.weight * (e.bias.JP || 0), 0);
const cnWeight = fx.evidence
  .filter(e => e.bias.CN !== undefined && e.bias.CN > 0)
  .reduce((s, e) => s + e.weight * (e.bias.CN || 0), 0);
assert(jpWeight > cnWeight, `JP weight (${jpWeight.toFixed(2)}) > CN weight (${cnWeight.toFixed(2)}) — resolution consistent`);

// T12: all taxonomy classes have gulp_training_tag
console.log("\nT12: gulp tags");
assert(CANONICAL_TAXONOMY.every(c => c.gulp_training_tag.length > 0), "all have gulp tag");

// T13: intent distribution balanced (not all leaks)
console.log("\nT13: intent balance");
const intents = CANONICAL_TAXONOMY.reduce((m, c) => { m[c.intent] = (m[c.intent] ?? 0) + 1; return m; }, {} as Record<string, number>);
assert((intents.mask ?? 0) >= 3, `≥3 masks (got ${intents.mask ?? 0})`);
assert((intents.leak ?? 0) >= 5, `≥5 leaks (got ${intents.leak ?? 0})`);
assert((intents.meta ?? 0) >= 2, `≥2 meta (got ${intents.meta ?? 0})`);

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-GNN-TAXONOMY-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
