// packages/schema-contracts/src/ingress.ts — Q-002 ingress validator wire
//
// Composes Q-001 contracts into an ingress-side pre-accept hook that
// pattern-matches the incoming envelope to a known contract by `verb`
// and rejects with HTTP 400 + EVT-INGRESS-SCHEMA-REJECTED glyph when
// structure drifts.
//
// Pure functions — caller wires into /behcs/send receiver. Test-friendly.

import { ALL_CONTRACTS, validateEnvelope, type EnvelopeContract, type ValidationResult } from "./contracts.ts";

export interface IngressCheckInput {
  envelope: any;
  enforce_mode: "observe" | "warn" | "reject";  // observe = log only; warn = log+respond 200+flag; reject = 400
  contracts?: EnvelopeContract[];                // defaults to ALL_CONTRACTS
  verb_to_contract?: Record<string, string>;     // override mapping of verb → contract name
}

export interface IngressCheckResult {
  action: "accept" | "warn" | "reject";
  matched_contract: string | null;
  validation: ValidationResult | null;
  reason: string;
  glyph_sentence: string;
  http_response: { status: number; body: any };
}

// Default verb→contract mapping — matches contract.name exactly when envelope.verb matches
const DEFAULT_VERB_MAP: Record<string, string> = {
  "shannon-scan-dispatch":    "shannon-scan-dispatch",
  "shannon-scan-result":      "shannon-scan-result",
  "drift-detected":           "drift-detected",
  "migration-intent-ack":     "migration-intent-ack",
  // cosign entries are tested via COSIGN_ENTRY directly, not via verb
};

export function ingressCheck(input: IngressCheckInput): IngressCheckResult {
  const env = input.envelope;
  const verbMap = input.verb_to_contract ?? DEFAULT_VERB_MAP;
  const contracts = input.contracts ?? ALL_CONTRACTS;

  // Step 1: find a contract for this envelope
  const verb = typeof env?.verb === "string" ? env.verb : null;
  const contractName = verb ? verbMap[verb] : null;
  if (!contractName) {
    // No contract known for this verb — observe/accept
    return {
      action: "accept",
      matched_contract: null,
      validation: null,
      reason: "no contract registered for this verb (accept)",
      glyph_sentence: `EVT-INGRESS-SCHEMA-UNMAPPED · verb=${verb ?? "(none)"} @ M-INDICATIVE .`,
      http_response: { status: 200, body: { ok: true, schema_check: "no-contract" } },
    };
  }
  const contract = contracts.find(c => c.name === contractName);
  if (!contract) {
    return {
      action: "accept",
      matched_contract: null,
      validation: null,
      reason: "verb mapped to contract but contract not in loaded set",
      glyph_sentence: `EVT-INGRESS-SCHEMA-CONTRACT-MISSING · verb=${verb} · mapped=${contractName} @ M-INDICATIVE .`,
      http_response: { status: 200, body: { ok: true, schema_check: "contract-missing" } },
    };
  }

  // Step 2: validate
  const validation = validateEnvelope(env, contract);
  if (validation.ok) {
    return {
      action: "accept",
      matched_contract: contract.name,
      validation,
      reason: "schema valid",
      glyph_sentence: `EVT-INGRESS-SCHEMA-OK · verb=${verb} · contract=${contract.name} @ M-EYEWITNESS .`,
      http_response: { status: 200, body: { ok: true, schema_check: "ok", contract: contract.name } },
    };
  }

  // Step 3: drift detected — action based on mode
  const violationSummary = validation.violations.slice(0, 5).map(v => `${v.field}:${v.kind}`).join("; ");
  const baseGlyph = `EVT-INGRESS-SCHEMA-REJECTED · verb=${verb} · contract=${contract.name} · violations=${validation.violations.length} · ${violationSummary} @ M-EYEWITNESS .`;

  if (input.enforce_mode === "observe") {
    return {
      action: "accept",
      matched_contract: contract.name,
      validation,
      reason: `schema drift (observe-mode, accepted): ${violationSummary}`,
      glyph_sentence: baseGlyph.replace("REJECTED", "OBSERVED"),
      http_response: { status: 200, body: { ok: true, schema_check: "observed-drift", violations: validation.violations } },
    };
  }
  if (input.enforce_mode === "warn") {
    return {
      action: "warn",
      matched_contract: contract.name,
      validation,
      reason: `schema drift (warn-mode, flagged): ${violationSummary}`,
      glyph_sentence: baseGlyph.replace("REJECTED", "WARNED"),
      http_response: { status: 200, body: { ok: true, schema_check: "warn", violations: validation.violations } },
    };
  }
  // enforce_mode === "reject"
  return {
    action: "reject",
    matched_contract: contract.name,
    validation,
    reason: `schema drift (reject-mode): ${violationSummary}`,
    glyph_sentence: baseGlyph,
    http_response: { status: 400, body: { ok: false, error: "schema_rejected", contract: contract.name, violations: validation.violations } },
  };
}
