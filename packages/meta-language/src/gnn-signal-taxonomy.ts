// packages/meta-language/src/gnn-signal-taxonomy.ts
// Enriched signal taxonomy for reverse-gain GNN.
// Pipeline input to Shannon L3/L4 + Gulp-2000 training.
//
// Ten architectural learnings from the origin-inference exercise, abstracted
// out of the specific case and formalized as reusable signal classes.

export type SignalClass =
  | "legal-instrument-self-declaration"    // W-8BEN, tax forms, SEC filings — penalty-of-perjury → HIGHEST weight
  | "sworn-testimony"                       // deposition, affidavit — same class
  | "surname-romanization-prior"            // Lee/Li/Lee/Rhee distribution across CN/KR/JP/TW
  | "given-name-cultural-prior"             // Western given name = active presentation choice
  | "vpn-exit-cluster-affinity"             // HK exit pool = needs HK-adjacency (JP/KR/TW/CN) but NOT exclusively any one
  | "voip-carrier-obfuscator"               // area code on Bandwidth/Level3/Twilio/Pinger = geographically meaningless
  | "timezone-activity-window"              // session clustering reveals UTC+N working hours
  | "language-choice-suppression"           // English-only when multilingual possible = active mask
  | "payment-chain-associate"               // separate foreign entity in same payment folder = weak CN/associate bias
  | "pivot-vs-residence"                    // used target X as jump = target is TOOL, not residence
  | "certificate-signer-regional"           // software signer region = APAC-origin supply-chain hint
  | "population-imbalance-marker"           // rare-class ratio > 100:1 → periodic-reset-halve@N required downstream
  | "candidate-set-completeness"            // meta-signal: which jurisdictions should ALWAYS be in candidate pool
  | "identity-laundering-pattern"           // multiple foreign W-8BENs in same payment chain = flag for L4 evidence
  | "document-sec-review-status";           // OCR'd text passed prompt-injection review

export type SignalIntent = "mask" | "leak" | "neutral" | "meta";

export interface GNNSignalClassDef {
  class_id: SignalClass;
  intent: SignalIntent;
  base_weight: number;                 // canonical weight; consumers can override per case
  obfuscator_flag: boolean;            // if true, this class is a DELIBERATE mask; reverse-gain applies
  country_bias_template: "explicit" | "distribution" | "adjacency" | "none";
  description: string;
  example_feature: string;
  downstream_shannon_stage: "L3" | "L4" | "L5" | "L6" | null;
  gulp_training_tag: string;
}

export const CANONICAL_TAXONOMY: GNNSignalClassDef[] = [
  {
    class_id: "legal-instrument-self-declaration",
    intent: "leak",
    base_weight: 1.00,
    obfuscator_flag: false,
    country_bias_template: "explicit",
    description: "Self-declared citizenship/residence on a penalty-of-perjury legal form (IRS W-8BEN, SEC Form 4, LLC registration). Highest-confidence single datapoint available short of direct observation.",
    example_feature: "W-8BEN citizenship=Japan, address=Chuo Ward Chiba 260-0808",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "legal-instrument-weight-1.0",
  },
  {
    class_id: "sworn-testimony",
    intent: "leak",
    base_weight: 0.95,
    obfuscator_flag: false,
    country_bias_template: "explicit",
    description: "Deposition or affidavit — perjury-backed factual statements; equivalent to legal-instrument but softer because not tied to tax liability",
    example_feature: "witnessed affidavit stating residence",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "sworn-testimony-weight-0.95",
  },
  {
    class_id: "surname-romanization-prior",
    intent: "leak",
    base_weight: 0.35,
    obfuscator_flag: false,
    country_bias_template: "distribution",
    description: "Surname alone distributes probability across multiple jurisdictions (Lee → CN 35% KR 30% JP 20% TW 15%). Weak until paired with citizenship signal.",
    example_feature: "surname=Lee distributes across CN/KR/JP/TW",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "surname-distribution-prior",
  },
  {
    class_id: "given-name-cultural-prior",
    intent: "mask",
    base_weight: 0.12,
    obfuscator_flag: true,
    country_bias_template: "explicit",
    description: "A non-native Western given name chosen for presentation is deliberate — reverse-gain flips this toward non-western origin.",
    example_feature: "given-name=Connor on APAC surname",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "given-name-mask",
  },
  {
    class_id: "vpn-exit-cluster-affinity",
    intent: "leak",
    base_weight: 0.35,
    obfuscator_flag: false,
    country_bias_template: "adjacency",
    description: "VPN exit preference reveals LATENCY-RING adjacency (HK exit = JP/KR/TW/CN ring; EU exit = EU ring). Does NOT pin country exclusively; needs additional signal.",
    example_feature: "ExpressVPN-HK 9x → HK adjacency ring",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "vpn-adjacency-ring",
  },
  {
    class_id: "voip-carrier-obfuscator",
    intent: "mask",
    base_weight: 0.30,
    obfuscator_flag: true,
    country_bias_template: "none",
    description: "US area codes on VoIP-class carriers (Bandwidth.com, Level 3 CLEC, Twilio, Pinger/TextFree, Google Voice) are GEOGRAPHICALLY MEANINGLESS. Flag as origin_obfuscator and REMOVE from geo inference.",
    example_feature: "+1 254-488 on Level 3 CLEC = virtual number",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "voip-strip",
  },
  {
    class_id: "timezone-activity-window",
    intent: "leak",
    base_weight: 0.40,
    obfuscator_flag: false,
    country_bias_template: "distribution",
    description: "Session-timestamp clustering across days reveals UTC+N working-hours window (13-22 UTC = UTC+8/+9 evening = CN/JP/KR/TW/SG/HK).",
    example_feature: "sessions cluster 13-22Z Mon-Fri",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "timezone-window-leak",
  },
  {
    class_id: "language-choice-suppression",
    intent: "mask",
    base_weight: 0.15,
    obfuscator_flag: true,
    country_bias_template: "explicit",
    description: "English-only communication when native-language alternative exists is a deliberate suppression signal. Reverse-gain flips against native-language country.",
    example_feature: "English-only Slack DMs from APAC actor",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "language-mask",
  },
  {
    class_id: "payment-chain-associate",
    intent: "leak",
    base_weight: 0.20,
    obfuscator_flag: false,
    country_bias_template: "explicit",
    description: "Separate foreign entity in the same payment chain (W-8BEN folder, invoice batch) = weak bias toward associate's country. Does not override actor's self-declaration but raises suspicion on identity-laundering.",
    example_feature: "Wang Defu CN in Connor JP payment folder",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "associate-graph-edge",
  },
  {
    class_id: "pivot-vs-residence",
    intent: "neutral",
    base_weight: 0.05,
    obfuscator_flag: false,
    country_bias_template: "none",
    description: "When actor routes through target X, X is their TOOL, not their residence. Reject X as origin candidate. Example: Connor used Jesse's Sumter SC house as pivot — SC is a pivot, not Connor's residence.",
    example_feature: "Charter Sumter SC 71.76.10.39 used as jump target",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "pivot-exclusion",
  },
  {
    class_id: "certificate-signer-regional",
    intent: "leak",
    base_weight: 0.08,
    obfuscator_flag: false,
    country_bias_template: "adjacency",
    description: "Software supply-chain signer region (e.g. RustDesk signer PURSLANE C=SG) hints at which regional pirated-tool ecosystem the actor participated in.",
    example_feature: "cert signer C=SG APAC region",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "supply-chain-regional",
  },
  {
    class_id: "population-imbalance-marker",
    intent: "meta",
    base_weight: 0,
    obfuscator_flag: false,
    country_bias_template: "none",
    description: "Meta-signal: if rare-class ratio exceeds 100:1 in the candidate pool, downstream GNN MUST apply periodic-reset-halve@N primitive or saturation collapses the reward loop (validated by THIRD cascade finding).",
    example_feature: "91152 negative : 36 positive in SECOND cascade",
    downstream_shannon_stage: null,
    gulp_training_tag: "meta-reset-required",
  },
  {
    class_id: "candidate-set-completeness",
    intent: "meta",
    base_weight: 0,
    obfuscator_flag: false,
    country_bias_template: "none",
    description: "Meta-signal: GNN inference is bounded by candidate set. When VPN-HK ring is observed, candidate set MUST include {JP, KR, TW, CN, HK, SG, MY, PH, TH, VN, ID}. Missing any → false precision in top-ranked (pattern failure observed: v1 missed JP, locked on CN).",
    example_feature: "v1 missed Japan → locked China → corrected in v2",
    downstream_shannon_stage: null,
    gulp_training_tag: "meta-candidate-completeness",
  },
  {
    class_id: "identity-laundering-pattern",
    intent: "leak",
    base_weight: 0.25,
    obfuscator_flag: false,
    country_bias_template: "distribution",
    description: "Multiple foreign W-8BENs in the same payment chain OR same actor submitting forms under different names across time windows = identity-laundering flag. Warrants L4 elevated evidence.",
    example_feature: "two W-8BENs in Payment-connor-friend folder for different countries",
    downstream_shannon_stage: "L4",
    gulp_training_tag: "identity-laundering-L4-flag",
  },
  {
    class_id: "document-sec-review-status",
    intent: "meta",
    base_weight: 0,
    obfuscator_flag: false,
    country_bias_template: "none",
    description: "OCR'd text MUST pass prompt-injection review before Shannon L3+ consumes it. Status ∈ {clean, suspicious, high}. high-risk text cannot bypass L2 gate.",
    example_feature: "OCR'd W-8BEN passed SEC review with risk=clean",
    downstream_shannon_stage: "L3",
    gulp_training_tag: "meta-sec-review-required",
  },
];

export interface SignalAppliedToCase {
  class_id: SignalClass;
  case_id: string;
  actual_weight: number;                // may differ from base_weight
  country_bias: Record<string, number>;
  raw_value: string;
  notes: string;
}

// Given a case dossier, recommend which taxonomy classes apply + at what weights
export function recommendSignalsForCase(caseSignals: Array<{ id: string; detail: string; country_hints?: Record<string, number> }>): Array<{ taxonomy_class: SignalClass; signal_id: string; recommended_weight: number; rationale: string }> {
  const out: Array<{ taxonomy_class: SignalClass; signal_id: string; recommended_weight: number; rationale: string }> = [];
  for (const s of caseSignals) {
    const detail = s.detail.toLowerCase();
    if (detail.includes("w-8ben") || detail.includes("w8ben") || detail.includes("1099") || detail.includes("affidavit") || detail.includes("deposition")) {
      out.push({
        taxonomy_class: detail.includes("w-8ben") || detail.includes("w8ben") || detail.includes("1099") ? "legal-instrument-self-declaration" : "sworn-testimony",
        signal_id: s.id,
        recommended_weight: CANONICAL_TAXONOMY.find(t => t.class_id === "legal-instrument-self-declaration")!.base_weight,
        rationale: "perjury-backed legal form detected",
      });
    }
    if (/\bsurname\b|\blast name\b|\bfamily name\b/.test(detail) || /^lee|^li|^wang|^chen|^kim/.test(detail)) {
      out.push({
        taxonomy_class: "surname-romanization-prior",
        signal_id: s.id,
        recommended_weight: 0.35,
        rationale: "surname-only prior",
      });
    }
    if (/(voip|bandwidth\.com|level 3|textfree|textnow|google voice|dingtone|talkatone|pinger)/.test(detail)) {
      out.push({
        taxonomy_class: "voip-carrier-obfuscator",
        signal_id: s.id,
        recommended_weight: 0.30,
        rationale: "VoIP CLEC detected — geographically meaningless",
      });
    }
    if (detail.includes("vpn") || detail.includes("expressvpn") || detail.includes("nordvpn")) {
      out.push({
        taxonomy_class: "vpn-exit-cluster-affinity",
        signal_id: s.id,
        recommended_weight: 0.35,
        rationale: "VPN cluster adjacency, not exclusive",
      });
    }
    if (/timezone|utc\+|activity.window|session.clust/.test(detail)) {
      out.push({
        taxonomy_class: "timezone-activity-window",
        signal_id: s.id,
        recommended_weight: 0.40,
        rationale: "timezone activity pattern",
      });
    }
  }
  return out;
}

// Summarize how Connor's case maps — a concrete fixture for Gulp-2000 training
export function buildConnorTrainingFixture() {
  const evidence = [
    { id: "connor_w8ben", detail: "W-8BEN self-declared Japan / Chiba / DOB 1995-08-23", class: "legal-instrument-self-declaration" as SignalClass, weight: 1.0, bias: { JP: 1.0 } },
    { id: "wangdefu_w8ben", detail: "Wang Defu separate W-8BEN / China / Yiwu", class: "payment-chain-associate" as SignalClass, weight: 0.20, bias: { CN: 0.6 } },
    { id: "connor_both_w8bens_same_folder", detail: "two W-8BENs under two countries in one payment folder", class: "identity-laundering-pattern" as SignalClass, weight: 0.25, bias: { JP: 0.3, CN: 0.3 } },
    { id: "waco_tx_voip", detail: "+1 254-488-4301 Bandwidth/Level 3 CLEC VoIP", class: "voip-carrier-obfuscator" as SignalClass, weight: 0.30, bias: { US: -1.0 } },
    { id: "vpn_hk_cluster", detail: "ExpressVPN-HK 9× exits", class: "vpn-exit-cluster-affinity" as SignalClass, weight: 0.35, bias: { JP: 0.7, KR: 0.5, TW: 0.5, CN: 0.7, HK: 0.8 } },
    { id: "tz_utc8_9", detail: "session cluster 13-22Z UTC evening", class: "timezone-activity-window" as SignalClass, weight: 0.40, bias: { JP: 1.0, CN: 0.9, KR: 0.9, HK: 0.9, TW: 0.8 } },
    { id: "english_only", detail: "English-only Slack DMs from APAC actor", class: "language-choice-suppression" as SignalClass, weight: 0.15, bias: { JP: -0.3, CN: -0.3 } },
    { id: "connor_given_name", detail: "given-name Connor on surname Lee", class: "given-name-cultural-prior" as SignalClass, weight: 0.12, bias: { US: -0.5 } },
    { id: "surname_lee", detail: "surname Lee", class: "surname-romanization-prior" as SignalClass, weight: 0.35, bias: { JP: 0.4, KR: 0.5, CN: 0.5, TW: 0.4, HK: 0.4 } },
    { id: "pivot_jesse_sc", detail: "used Jesse US house 71.76.10.39 as pivot", class: "pivot-vs-residence" as SignalClass, weight: 0.05, bias: { US: -0.5 } },
  ];
  return {
    case: "connor-origin-inference",
    resolution_country: "JP",
    resolution_city: "Chiba",
    evidence,
    glyph_sentence: `EVT-GULP-TRAINING-FIXTURE · case=connor-origin · evidence=${evidence.length} · resolution=JP-Chiba · taxonomy-classes=${new Set(evidence.map(e => e.class)).size} @ M-EYEWITNESS .`,
  };
}
