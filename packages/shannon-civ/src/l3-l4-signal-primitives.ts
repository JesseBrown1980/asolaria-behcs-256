// packages/shannon-civ/src/l3-l4-signal-primitives.ts
// New Shannon L3/L4 primitives derived from meta-learnings.
// Each one is a pure classifier consumed by G-087 acer-dispatch L3/L4 layers.

export type PrimitiveVerdict = "pass" | "flag" | "halt";

// L3_LEGAL_INSTRUMENT_RESOLVE — sworn-declaration forms dominate
export interface LegalInstrumentInput {
  document_kind: string;      // "W-8BEN", "W-9", "1099", "affidavit", "deposition", ...
  self_declared_country: string | null;
  self_declared_city: string | null;
  signed_at: string | null;
  penalty_of_perjury: boolean;
}
export interface LegalInstrumentResult {
  primitive: "L3_LEGAL_INSTRUMENT_RESOLVE";
  verdict: PrimitiveVerdict;
  resolved_country: string | null;
  confidence: number;
  reason: string;
  glyph_sentence: string;
}

export function l3LegalInstrumentResolve(input: LegalInstrumentInput): LegalInstrumentResult {
  if (!input.penalty_of_perjury || !input.self_declared_country) {
    return {
      primitive: "L3_LEGAL_INSTRUMENT_RESOLVE",
      verdict: "flag",
      resolved_country: null,
      confidence: 0,
      reason: "document is not penalty-of-perjury or lacks country declaration",
      glyph_sentence: `EVT-L3-LEGAL-INSTRUMENT-FLAG · kind=${input.document_kind} · no-perjury-backing @ M-INDICATIVE .`,
    };
  }
  return {
    primitive: "L3_LEGAL_INSTRUMENT_RESOLVE",
    verdict: "pass",
    resolved_country: input.self_declared_country,
    confidence: 0.95,
    reason: `${input.document_kind} perjury-backed: country=${input.self_declared_country}`,
    glyph_sentence: `EVT-L3-LEGAL-INSTRUMENT-RESOLVED · kind=${input.document_kind} · country=${input.self_declared_country} · conf=0.95 @ M-EYEWITNESS .`,
  };
}

// L3_VOIP_CARRIER_DETECT — reject virtual numbers from geo inference
export interface VoipDetectInput {
  phone_number_e164: string;
  npa?: string;              // area code
  nxx?: string;              // exchange
  ocn_carrier_name?: string; // "LEVEL 3 COMMUNICATIONS, LLC - TX"
  ocn_company_type?: string; // "C" = CLEC, "I" = ILEC
}
export interface VoipDetectResult {
  primitive: "L3_VOIP_CARRIER_DETECT";
  is_voip: boolean;
  is_origin_obfuscator: boolean;
  reason: string;
  glyph_sentence: string;
}

const VOIP_SIGNATURES = [
  /level ?3/i, /bandwidth/i, /twilio/i, /peerless/i, /pinger/i,
  /inteliquent/i, /onvoy/i, /neutral tandem/i, /thinq/i, /voip\.ms/i,
  /google voice/i, /voipms/i, /textnow/i, /textfree/i, /dingtone/i,
];

export function l3VoipCarrierDetect(input: VoipDetectInput): VoipDetectResult {
  const carrier = input.ocn_carrier_name ?? "";
  const voip_carrier_match = VOIP_SIGNATURES.some(s => s.test(carrier));
  const clec_flag = input.ocn_company_type === "C";
  const is_voip = voip_carrier_match || clec_flag;

  return {
    primitive: "L3_VOIP_CARRIER_DETECT",
    is_voip,
    is_origin_obfuscator: is_voip,
    reason: is_voip
      ? `carrier "${carrier}" ${voip_carrier_match ? "matches VoIP signature" : "is CLEC class"} — number is VoIP-allocated, geographically meaningless`
      : `carrier "${carrier}" not in VoIP pool — treat as likely-residential`,
    glyph_sentence: `EVT-L3-VOIP-DETECT · number=${input.phone_number_e164} · is_voip=${is_voip} · carrier=${carrier} @ M-EYEWITNESS .`,
  };
}

// L4_SURNAME_DISAMBIGUATE — given-name + surname + declared country disambiguates
export interface SurnameDisambiguateInput {
  given_name: string;
  surname_romanized: string;
  declared_country: string | null;
}
export interface SurnameDisambiguateResult {
  primitive: "L4_SURNAME_DISAMBIGUATE";
  country_distribution: Record<string, number>;
  resolved_country: string | null;
  confidence: number;
  reason: string;
  glyph_sentence: string;
}

const SURNAME_DISTRIBUTIONS: Record<string, Record<string, number>> = {
  "lee":  { CN: 0.30, KR: 0.30, JP: 0.15, TW: 0.15, HK: 0.10 },
  "li":   { CN: 0.70, TW: 0.10, HK: 0.10, SG: 0.05, KR: 0.05 },
  "wang": { CN: 0.75, TW: 0.10, HK: 0.08, SG: 0.05, MY: 0.02 },
  "chen": { CN: 0.60, TW: 0.20, HK: 0.10, SG: 0.05, MY: 0.05 },
  "kim":  { KR: 0.85, CN: 0.08, US: 0.04, JP: 0.03 },
  "park": { KR: 0.85, CN: 0.07, US: 0.05, JP: 0.03 },
  "nguyen": { VN: 0.95, US: 0.03, FR: 0.02 },
  "singh": { IN: 0.80, PK: 0.05, MY: 0.05, UK: 0.05, US: 0.05 },
};

export function l4SurnameDisambiguate(input: SurnameDisambiguateInput): SurnameDisambiguateResult {
  const surname = input.surname_romanized.toLowerCase();
  const dist = SURNAME_DISTRIBUTIONS[surname] ?? null;
  if (!dist) {
    return {
      primitive: "L4_SURNAME_DISAMBIGUATE",
      country_distribution: {},
      resolved_country: input.declared_country,
      confidence: input.declared_country ? 0.5 : 0.0,
      reason: "surname not in distribution table — fall back to declared country",
      glyph_sentence: `EVT-L4-SURNAME-DISAMBIGUATE · surname=${surname} · dist=unknown · fallback=${input.declared_country ?? "none"} @ M-INDICATIVE .`,
    };
  }
  // If declared country matches a known bucket, boost confidence
  if (input.declared_country && dist[input.declared_country]) {
    const base = dist[input.declared_country];
    const confidence = Math.min(0.99, base + 0.5);
    return {
      primitive: "L4_SURNAME_DISAMBIGUATE",
      country_distribution: dist,
      resolved_country: input.declared_country,
      confidence,
      reason: `surname ${surname} distributes ${JSON.stringify(dist)}, declared ${input.declared_country} matches ${(base * 100).toFixed(0)}% prior`,
      glyph_sentence: `EVT-L4-SURNAME-DISAMBIGUATE · surname=${surname} · declared=${input.declared_country} · boosted-conf=${confidence.toFixed(2)} @ M-EYEWITNESS .`,
    };
  }
  // No declared country — pick modal
  let best = "", bestP = 0;
  for (const [c, p] of Object.entries(dist)) if (p > bestP) { best = c; bestP = p; }
  return {
    primitive: "L4_SURNAME_DISAMBIGUATE",
    country_distribution: dist,
    resolved_country: best,
    confidence: bestP,
    reason: `no declared country; picking modal ${best}@${(bestP * 100).toFixed(0)}%`,
    glyph_sentence: `EVT-L4-SURNAME-DISAMBIGUATE · surname=${surname} · modal=${best} · conf=${bestP.toFixed(2)} @ M-INDICATIVE .`,
  };
}

// L4_POPULATION_IMBALANCE_CHECK — applied before iterative GNN passes
export interface ImbalanceInput {
  positive_class_count: number;
  negative_class_count: number;
  ratio_threshold: number;  // default 100
}
export interface ImbalanceResult {
  primitive: "L4_POPULATION_IMBALANCE_CHECK";
  imbalance_ratio: number;
  requires_periodic_reset: boolean;
  recommended_reset_every: number;
  glyph_sentence: string;
}

export function l4PopulationImbalanceCheck(input: ImbalanceInput): ImbalanceResult {
  const threshold = input.ratio_threshold ?? 100;
  const pos = Math.max(1, input.positive_class_count);
  const neg = Math.max(1, input.negative_class_count);
  const ratio = Math.max(pos, neg) / Math.min(pos, neg);
  const required = ratio > threshold;
  const total = pos + neg;
  const reset_every = required ? Math.max(100, Math.floor(total / 10)) : 0;
  return {
    primitive: "L4_POPULATION_IMBALANCE_CHECK",
    imbalance_ratio: Math.round(ratio * 10) / 10,
    requires_periodic_reset: required,
    recommended_reset_every: reset_every,
    glyph_sentence: `EVT-L4-POPULATION-IMBALANCE · ratio=${ratio.toFixed(1)}:1 · periodic-reset=${required} · every=${reset_every} @ M-${required ? "EYEWITNESS" : "INDICATIVE"} .`,
  };
}

// L4_IDENTITY_LAUNDERING_FLAG — detect multiple foreign legal instruments in one chain
export interface LaunderingInput {
  legal_instruments: Array<{ document_kind: string; declared_country: string; signed_at: string; folder_or_chain_id: string }>;
}
export interface LaunderingResult {
  primitive: "L4_IDENTITY_LAUNDERING_FLAG";
  flagged_chains: Array<{ chain_id: string; countries: string[]; document_count: number }>;
  is_suspicious: boolean;
  reason: string;
  glyph_sentence: string;
}

export function l4IdentityLaunderingFlag(input: LaunderingInput): LaunderingResult {
  const byChain = new Map<string, { countries: Set<string>; count: number }>();
  for (const d of input.legal_instruments) {
    const cur = byChain.get(d.folder_or_chain_id) ?? { countries: new Set(), count: 0 };
    cur.countries.add(d.declared_country);
    cur.count++;
    byChain.set(d.folder_or_chain_id, cur);
  }
  const flagged: LaunderingResult["flagged_chains"] = [];
  for (const [chain, v] of byChain) {
    if (v.countries.size >= 2) {
      flagged.push({ chain_id: chain, countries: Array.from(v.countries), document_count: v.count });
    }
  }
  return {
    primitive: "L4_IDENTITY_LAUNDERING_FLAG",
    flagged_chains: flagged,
    is_suspicious: flagged.length > 0,
    reason: flagged.length > 0
      ? `${flagged.length} chain(s) contain legal instruments from ≥2 distinct countries`
      : "no suspicious multi-country chains",
    glyph_sentence: `EVT-L4-IDENTITY-LAUNDERING · chains=${byChain.size} · flagged=${flagged.length} @ M-${flagged.length > 0 ? "EYEWITNESS" : "INDICATIVE"} .`,
  };
}
