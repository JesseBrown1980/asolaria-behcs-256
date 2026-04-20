import {
  l3LegalInstrumentResolve, l3VoipCarrierDetect,
  l4SurnameDisambiguate, l4PopulationImbalanceCheck, l4IdentityLaunderingFlag,
} from "../src/l3-l4-signal-primitives.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== shannon-civ · L3/L4 signal primitives tests ===\n");

// T1: legal instrument resolves with perjury
console.log("T1: W-8BEN resolve");
const r1 = l3LegalInstrumentResolve({
  document_kind: "W-8BEN",
  self_declared_country: "Japan",
  self_declared_city: "Chiba",
  signed_at: "2024-10-11",
  penalty_of_perjury: true,
});
assert(r1.verdict === "pass", "pass");
assert(r1.resolved_country === "Japan", "country resolved");
assert(r1.confidence === 0.95, "confidence 0.95");

// T2: missing perjury backing → flag
console.log("\nT2: non-perjury");
const r2 = l3LegalInstrumentResolve({
  document_kind: "invoice",
  self_declared_country: "Japan",
  self_declared_city: null,
  signed_at: null,
  penalty_of_perjury: false,
});
assert(r2.verdict === "flag", "flag");
assert(r2.resolved_country === null, "no resolution");

// T3: VoIP carrier detection — Level 3
console.log("\nT3: VoIP Level 3");
const v1 = l3VoipCarrierDetect({
  phone_number_e164: "+12544884301",
  npa: "254", nxx: "488",
  ocn_carrier_name: "LEVEL 3 COMMUNICATIONS, LLC - TX",
  ocn_company_type: "C",
});
assert(v1.is_voip === true, "VoIP detected");
assert(v1.is_origin_obfuscator === true, "obfuscator flag");

// T4: VoIP — Bandwidth.com
console.log("\nT4: VoIP Bandwidth");
const v2 = l3VoipCarrierDetect({
  phone_number_e164: "+13035551234",
  ocn_carrier_name: "Bandwidth.com CLEC, LLC",
  ocn_company_type: "C",
});
assert(v2.is_voip === true, "Bandwidth detected");

// T5: not VoIP — real ILEC
console.log("\nT5: real ILEC");
const v3 = l3VoipCarrierDetect({
  phone_number_e164: "+18035551234",
  ocn_carrier_name: "Charter Communications",
  ocn_company_type: "I",
});
assert(v3.is_voip === false, "not VoIP");

// T6: surname Lee + declared Japan
console.log("\nT6: surname Lee + declared Japan");
const s1 = l4SurnameDisambiguate({ given_name: "Connor", surname_romanized: "Lee", declared_country: "JP" });
assert(s1.resolved_country === "JP", "resolved JP");
assert(s1.confidence > 0.5, "confidence boosted");

// T7: surname Wang unknown country
console.log("\nT7: surname Wang no declared");
const s2 = l4SurnameDisambiguate({ given_name: "Defu", surname_romanized: "Wang", declared_country: null });
assert(s2.resolved_country === "CN", "modal CN");
assert(s2.country_distribution.CN === 0.75, "CN prior 0.75");

// T8: unknown surname
console.log("\nT8: unknown surname");
const s3 = l4SurnameDisambiguate({ given_name: "X", surname_romanized: "Smithovich", declared_country: "US" });
assert(Object.keys(s3.country_distribution).length === 0, "no distribution");
assert(s3.resolved_country === "US", "fallback declared");

// T9: surname Nguyen → Vietnam
console.log("\nT9: Nguyen");
const s4 = l4SurnameDisambiguate({ given_name: "X", surname_romanized: "Nguyen", declared_country: null });
assert(s4.resolved_country === "VN", "VN modal");

// T10: population imbalance trigger
console.log("\nT10: imbalance check");
const p1 = l4PopulationImbalanceCheck({ positive_class_count: 36, negative_class_count: 91152, ratio_threshold: 100 });
assert(p1.imbalance_ratio > 100, "ratio > threshold");
assert(p1.requires_periodic_reset === true, "reset required");
assert(p1.recommended_reset_every >= 100, "reset_every positive");

// T11: balanced pop → no reset
console.log("\nT11: balanced");
const p2 = l4PopulationImbalanceCheck({ positive_class_count: 5000, negative_class_count: 5000, ratio_threshold: 100 });
assert(p2.requires_periodic_reset === false, "no reset");

// T12: identity laundering — two W-8BENs different countries same folder
console.log("\nT12: identity laundering");
const l1 = l4IdentityLaunderingFlag({
  legal_instruments: [
    { document_kind: "W-8BEN", declared_country: "Japan", signed_at: "2024-10-11", folder_or_chain_id: "payment-connor-friend" },
    { document_kind: "W-8BEN", declared_country: "China", signed_at: "2025-07-01", folder_or_chain_id: "payment-connor-friend" },
  ],
});
assert(l1.is_suspicious === true, "flagged suspicious");
assert(l1.flagged_chains.length === 1, "1 chain");
assert(l1.flagged_chains[0].countries.length === 2, "2 countries in chain");

// T13: single-country chain → not suspicious
console.log("\nT13: single-country chain");
const l2 = l4IdentityLaunderingFlag({
  legal_instruments: [
    { document_kind: "W-9", declared_country: "USA", signed_at: "2024-01-01", folder_or_chain_id: "normal-vendor" },
    { document_kind: "W-9", declared_country: "USA", signed_at: "2024-06-01", folder_or_chain_id: "normal-vendor" },
  ],
});
assert(l2.is_suspicious === false, "not suspicious");

// T14: cross-chain laundering with 3 countries
console.log("\nT14: 3-country laundering");
const l3 = l4IdentityLaunderingFlag({
  legal_instruments: [
    { document_kind: "W-8BEN", declared_country: "Japan", signed_at: "t1", folder_or_chain_id: "chain-a" },
    { document_kind: "W-8BEN", declared_country: "China", signed_at: "t2", folder_or_chain_id: "chain-a" },
    { document_kind: "W-8BEN", declared_country: "Korea", signed_at: "t3", folder_or_chain_id: "chain-a" },
  ],
});
assert(l3.is_suspicious === true, "3-country chain flagged");
assert(l3.flagged_chains[0].countries.length === 3, "3 countries");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L3-L4-PRIMITIVES-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
