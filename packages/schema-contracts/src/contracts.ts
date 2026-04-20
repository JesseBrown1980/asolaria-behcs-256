// packages/schema-contracts/src/contracts.ts — Q-001 envelope schema lockdown
//
// Closes recurring drift risk: every envelope shape we've silently agreed
// on across the federation is now snapshot-locked here. Any field rename
// or shape change fails a contract test before it reaches production.
//
// Contracts are pure-data; validators live alongside. Schemas derived from
// observed wire-shape (not from hypothetical specs) — what peers actually
// emit, not what they claim.

export type FieldKind = "string" | "number" | "boolean" | "object" | "array" | "null" | "string-or-null";

export interface FieldSpec {
  name: string;
  kind: FieldKind | FieldKind[];   // array = any-of
  required: boolean;
  enum?: string[];                  // exact match allowed values
  pattern?: RegExp;                 // string-match for string kind
  nested?: EnvelopeContract;        // for object kind
  of?: EnvelopeContract | FieldKind; // for array: element type
}

export interface EnvelopeContract {
  name: string;                     // human label e.g. "shannon-scan-dispatch"
  description: string;
  fields: FieldSpec[];
  allow_extra_fields: boolean;      // if false, unknown top-level keys fail
}

export interface ValidationResult {
  ok: boolean;
  contract: string;
  violations: Array<{ kind: "missing" | "wrong_type" | "bad_enum" | "bad_pattern" | "unknown_field"; field: string; detail: string }>;
}

// ──────────────────────────────────────────────────────────────────────
// Canonized contracts
// ──────────────────────────────────────────────────────────────────────

export const SHANNON_SCAN_DISPATCH: EnvelopeContract = {
  name: "shannon-scan-dispatch",
  description: "G-085 liris scan-dispatcher emits this to acer",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true, enum: ["shannon-scan-dispatch"] },
    { name: "actor", kind: "string", required: true },
    { name: "target", kind: "string", required: true, enum: ["acer"] },
    { name: "body", kind: "object", required: true, nested: {
      name: "shannon-scan-dispatch.body",
      description: "dispatch body",
      allow_extra_fields: true,
      fields: [
        { name: "scan_id", kind: "string", required: true },
        { name: "spawn_request", kind: "object", required: true },
        { name: "l0_l2_verdicts", kind: "array", required: true },
      ],
    } },
    { name: "glyph_sentence", kind: "string", required: false },
  ],
};

export const SHANNON_SCAN_RESULT: EnvelopeContract = {
  name: "shannon-scan-result",
  description: "G-087/G-088 acer daemon emits this back to liris",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true, enum: ["shannon-scan-result"] },
    { name: "actor", kind: "string", required: true, enum: ["acer"] },
    { name: "target", kind: "string", required: true, enum: ["liris"] },
    { name: "body", kind: "object", required: true, nested: {
      name: "shannon-scan-result.body",
      description: "acer verdict body",
      allow_extra_fields: true,
      fields: [
        { name: "scan_id", kind: "string", required: true },
        { name: "acer_verdict", kind: "string", required: true, enum: ["promote", "halt", "pending-acer-civ-return"] },
        { name: "reason", kind: "string", required: true },
        { name: "l3", kind: "object", required: true },
        { name: "l4", kind: "object", required: true },
      ],
    } },
    { name: "entry_sig", kind: ["object", "null"], required: false },
  ],
};

export const DRIFT_DETECTED: EnvelopeContract = {
  name: "drift-detected",
  description: "F-077 broadcaster emits this on drift observation",
  allow_extra_fields: true,
  fields: [
    { name: "actor", kind: "string", required: true },
    { name: "verb", kind: "string", required: true, enum: ["drift-detected"] },
    { name: "target", kind: "string", required: true },
    { name: "detection", kind: "object", required: true, nested: {
      name: "drift-detected.detection",
      description: "drift detection payload",
      allow_extra_fields: true,
      fields: [
        { name: "permanent_name", kind: "string", required: true },
        { name: "hilbert_pid", kind: "string", required: true },
        { name: "instance_sha256", kind: "string", required: true, pattern: /^[0-9a-f]{64}$|^sha-.+/ },
        { name: "drift_kind", kind: "string", required: true, enum: ["verify_failed", "new_drift_log_entry", "both"] },
      ],
    } },
  ],
};

export const SIGNED_ENVELOPE_SIBLING: EnvelopeContract = {
  name: "signed-envelope-sibling",
  description: "Envelope with verb at top level + entry_sig as sibling (NOT signPayload wrapper). See feedback memory on G-088 verb-fix.",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true },
    { name: "entry_sig", kind: "object", required: true, nested: {
      name: "entry_sig",
      description: "ed25519 signature sibling",
      allow_extra_fields: false,
      fields: [
        { name: "key_id", kind: "string", required: true },
        { name: "sig_b64", kind: "string", required: true, pattern: /^[A-Za-z0-9+/=]+$/ },
        { name: "alg", kind: "string", required: true, enum: ["ed25519"] },
        { name: "signed_at", kind: "string", required: true },
      ],
    } },
  ],
};

export const COSIGN_ENTRY: EnvelopeContract = {
  name: "cosign-entry",
  description: "Single line of COSIGN_CHAIN.ndjson — 8 required fields + extensions",
  allow_extra_fields: true,
  fields: [
    { name: "seq", kind: "number", required: true },
    { name: "ts", kind: "string", required: true },
    { name: "event", kind: "string", required: true, pattern: /^COSIGN-/ },
    { name: "authority", kind: "string", required: true },
    { name: "apex", kind: "string", required: true },
    { name: "operator_witness", kind: "string", required: true },
    { name: "prev_sha", kind: "string-or-null", required: true },
    { name: "glyph_sentence", kind: "string", required: true },
  ],
};

export const MIGRATION_INTENT_ACK: EnvelopeContract = {
  name: "migration-intent-ack",
  description: "D-061 operator ack of migration intent",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true, enum: ["migration-intent-ack"] },
    { name: "operator", kind: "string", required: true, enum: ["jesse", "rayssa", "amy", "felipe", "dan"] },
    { name: "plan", kind: "object", required: true },
    { name: "ack_ts", kind: "string", required: true },
    { name: "window_expires_at", kind: "string", required: true },
  ],
};

export const ALL_CONTRACTS: EnvelopeContract[] = [
  SHANNON_SCAN_DISPATCH,
  SHANNON_SCAN_RESULT,
  DRIFT_DETECTED,
  SIGNED_ENVELOPE_SIBLING,
  COSIGN_ENTRY,
  MIGRATION_INTENT_ACK,
];

// ──────────────────────────────────────────────────────────────────────
// Validator
// ──────────────────────────────────────────────────────────────────────

function kindOf(v: any): FieldKind {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as FieldKind;
}

function kindMatches(v: any, wanted: FieldKind | FieldKind[]): boolean {
  const actual = kindOf(v);
  const list = Array.isArray(wanted) ? wanted : [wanted];
  for (const k of list) {
    if (k === actual) return true;
    if (k === "string-or-null" && (actual === "string" || actual === "null")) return true;
  }
  return false;
}

export function validateEnvelope(input: any, contract: EnvelopeContract, path = ""): ValidationResult {
  const violations: ValidationResult["violations"] = [];
  if (kindOf(input) !== "object") {
    return { ok: false, contract: contract.name, violations: [{ kind: "wrong_type", field: path || "(root)", detail: `expected object, got ${kindOf(input)}` }] };
  }
  const seenFields = new Set<string>();
  for (const spec of contract.fields) {
    const fullPath = path ? `${path}.${spec.name}` : spec.name;
    seenFields.add(spec.name);
    const present = spec.name in input;
    if (!present) {
      if (spec.required) violations.push({ kind: "missing", field: fullPath, detail: "required field missing" });
      continue;
    }
    const v = input[spec.name];
    if (!kindMatches(v, spec.kind)) {
      violations.push({ kind: "wrong_type", field: fullPath, detail: `expected ${JSON.stringify(spec.kind)}, got ${kindOf(v)}` });
      continue;
    }
    if (spec.enum && typeof v === "string" && !spec.enum.includes(v)) {
      violations.push({ kind: "bad_enum", field: fullPath, detail: `'${v}' not in ${spec.enum.join("|")}` });
    }
    if (spec.pattern && typeof v === "string" && !spec.pattern.test(v)) {
      violations.push({ kind: "bad_pattern", field: fullPath, detail: `'${v.slice(0, 40)}' fails ${spec.pattern}` });
    }
    if (spec.nested && kindOf(v) === "object") {
      const sub = validateEnvelope(v, spec.nested, fullPath);
      violations.push(...sub.violations);
    }
  }
  if (!contract.allow_extra_fields) {
    for (const k of Object.keys(input)) {
      if (!seenFields.has(k)) violations.push({ kind: "unknown_field", field: path ? `${path}.${k}` : k, detail: "unknown field rejected under allow_extra_fields=false" });
    }
  }
  return { ok: violations.length === 0, contract: contract.name, violations };
}

export function findContract(name: string): EnvelopeContract | null {
  return ALL_CONTRACTS.find(c => c.name === name) ?? null;
}
