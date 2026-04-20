// profile-schema.ts — Section G-084 Shannon agent profile schema.
//
// 13 shannon-* profiles live as .asolaria/agents/shannon-<name>.md with
// YAML-style frontmatter. This module validates spawn requests + the
// frontmatter shape. Workers run on acer civilization; liris authorizes.
//
// LAW-001 / LAW-008 / LAW-012 compliant; pure function.
// named_agent: liris-smp-v5-G-084-builder (2026-04-18).

export const SHANNON_AGENT_NAMES = [
  "shannon-pre-recon",
  "shannon-recon",
  "shannon-vuln-injection",
  "shannon-vuln-xss",
  "shannon-vuln-auth",
  "shannon-vuln-ssrf",
  "shannon-vuln-authz",
  "shannon-exploit-injection",
  "shannon-exploit-xss",
  "shannon-exploit-auth",
  "shannon-exploit-ssrf",
  "shannon-exploit-authz",
  "shannon-report",
] as const;
export type ShannonAgentName = (typeof SHANNON_AGENT_NAMES)[number];

export const SHANNON_PHASES = [0, 1, 2, 3, 4] as const;
export type ShannonPhase = (typeof SHANNON_PHASES)[number];

export const SHANNON_MODELS = ["haiku", "sonnet", "opus"] as const;
export type ShannonModel = (typeof SHANNON_MODELS)[number];

export const SHANNON_AUTONOMY = ["Assisted", "Supervised", "Operator-only"] as const;
export type ShannonAutonomy = (typeof SHANNON_AUTONOMY)[number];

export interface ShannonProfile {
  name: ShannonAgentName;
  phase: ShannonPhase;
  model: ShannonModel;
  purpose: string;
  autonomy: ShannonAutonomy;
  requires_witness: ("rayssa" | "jesse")[];
  lives_on_device: "DEV-ACER" | "DEV-LIRIS";
  halts_on: string[];
  never_performs: string[];
}

export interface SpawnRequest {
  profile_name: ShannonAgentName;
  scan_id: string; // ULID or similar
  scope: { allowed_hosts: string[]; allowed_paths: string[] };
  operator_witness: {
    gate: "rayssa" | "jesse";
    profile: "owner";
  };
  requested_by: string;
  ts: string;
}

export const CANONICAL_PROFILES: Record<ShannonAgentName, Omit<ShannonProfile, "name">> = {
  "shannon-pre-recon":        { phase: 0, model: "haiku",  purpose: "Scope validation; halt on out-of-scope", autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-LIRIS", halts_on: ["out-of-scope target","missing operator_witness"], never_performs: ["exploit","destructive probes"] },
  "shannon-recon":            { phase: 1, model: "sonnet", purpose: "Surface enumeration; NO exploit",         autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["surface mismatch","rate limit exceeded"], never_performs: ["exploit","auth bypass"] },
  "shannon-vuln-injection":   { phase: 2, model: "sonnet", purpose: "SQLi/NoSQLi/cmd-injection pattern study", autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["active payload firing in prod"], never_performs: ["live destructive injection"] },
  "shannon-vuln-xss":         { phase: 2, model: "sonnet", purpose: "Reflected/stored/DOM XSS study",          autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["active payload firing in prod"], never_performs: ["stored-xss on live users"] },
  "shannon-vuln-auth":        { phase: 2, model: "sonnet", purpose: "Session/token/MFA bypass study",          autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["actual credential theft"],        never_performs: ["credential exfiltration"] },
  "shannon-vuln-ssrf":        { phase: 2, model: "sonnet", purpose: "SSRF + URL-parser confusion",             autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["internal-network probe without scope"], never_performs: ["cloud-metadata exfil"] },
  "shannon-vuln-authz":       { phase: 2, model: "sonnet", purpose: "IDOR, privilege escalation, RBAC",        autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER",  halts_on: ["real priv-esc attempt"],            never_performs: ["persistent role change"] },
  "shannon-exploit-injection":{ phase: 3, model: "sonnet", purpose: "Sandbox-only verification",               autonomy: "Operator-only", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER", halts_on: ["non-sandbox target"], never_performs: ["live target without explicit witness"] },
  "shannon-exploit-xss":      { phase: 3, model: "sonnet", purpose: "Sandbox-only verification",               autonomy: "Operator-only", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER", halts_on: ["non-sandbox target"], never_performs: ["live target"] },
  "shannon-exploit-auth":     { phase: 3, model: "sonnet", purpose: "Sandbox-only verification",               autonomy: "Operator-only", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER", halts_on: ["non-sandbox target"], never_performs: ["live target"] },
  "shannon-exploit-ssrf":     { phase: 3, model: "sonnet", purpose: "Sandbox-only verification",               autonomy: "Operator-only", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER", halts_on: ["non-sandbox target"], never_performs: ["live target"] },
  "shannon-exploit-authz":    { phase: 3, model: "sonnet", purpose: "Sandbox-only verification",               autonomy: "Operator-only", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-ACER", halts_on: ["non-sandbox target"], never_performs: ["live target"] },
  "shannon-report":           { phase: 4, model: "opus",   purpose: "Synthesis artifact for operator review",  autonomy: "Assisted", requires_witness: ["rayssa","jesse"], lives_on_device: "DEV-LIRIS", halts_on: ["missing prior phase receipts"], never_performs: ["autonomous promotion"] },
};

export type ViolationKind =
  | "not_object"
  | "missing_required"
  | "bad_enum"
  | "out_of_scope"
  | "witness_missing"
  | "profile_unknown";

export interface Violation { kind: ViolationKind; field?: string; message: string; }
export interface ValidateResult { ok: boolean; violations: Violation[]; }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate a profile frontmatter object. */
export function validateProfile(input: unknown): ValidateResult {
  const violations: Violation[] = [];
  if (!isPlainObject(input)) return { ok: false, violations: [{ kind: "not_object", message: "profile must be an object" }] };
  for (const k of ["name", "phase", "model", "purpose", "autonomy", "requires_witness", "lives_on_device", "halts_on", "never_performs"] as const) {
    if (!(k in input)) violations.push({ kind: "missing_required", field: k, message: `missing required field '${k}'` });
  }
  if (typeof input.name === "string" && !SHANNON_AGENT_NAMES.includes(input.name as ShannonAgentName)) {
    violations.push({ kind: "profile_unknown", field: "name", message: `name '${input.name}' not in canonical list` });
  }
  if (typeof input.phase === "number" && !SHANNON_PHASES.includes(input.phase as ShannonPhase)) {
    violations.push({ kind: "bad_enum", field: "phase", message: `phase ${input.phase} not in ${SHANNON_PHASES.join(",")}` });
  }
  if (typeof input.model === "string" && !SHANNON_MODELS.includes(input.model as ShannonModel)) {
    violations.push({ kind: "bad_enum", field: "model", message: `model '${input.model}' not in ${SHANNON_MODELS.join("|")}` });
  }
  if (typeof input.autonomy === "string" && !SHANNON_AUTONOMY.includes(input.autonomy as ShannonAutonomy)) {
    violations.push({ kind: "bad_enum", field: "autonomy", message: `autonomy '${input.autonomy}' not in ${SHANNON_AUTONOMY.join("|")}` });
  }
  return { ok: violations.length === 0, violations };
}

/** Validate a spawn request against scope + witness rules. */
export function validateSpawnRequest(input: unknown): ValidateResult {
  const violations: Violation[] = [];
  if (!isPlainObject(input)) return { ok: false, violations: [{ kind: "not_object", message: "spawn request must be an object" }] };
  for (const k of ["profile_name", "scan_id", "scope", "operator_witness", "requested_by", "ts"] as const) {
    if (!(k in input)) violations.push({ kind: "missing_required", field: k, message: `missing required field '${k}'` });
  }
  if (typeof input.profile_name === "string" && !SHANNON_AGENT_NAMES.includes(input.profile_name as ShannonAgentName)) {
    violations.push({ kind: "profile_unknown", field: "profile_name", message: `profile_name '${input.profile_name}' not in canonical list` });
  }
  const ow = input.operator_witness;
  if (!isPlainObject(ow)) {
    violations.push({ kind: "witness_missing", field: "operator_witness", message: "operator_witness must be an object {gate, profile}" });
  } else {
    if (ow.gate !== "rayssa" && ow.gate !== "jesse") {
      violations.push({ kind: "witness_missing", field: "operator_witness.gate", message: `gate '${ow.gate}' not in rayssa|jesse` });
    }
    if (ow.profile !== "owner") {
      violations.push({ kind: "witness_missing", field: "operator_witness.profile", message: `profile '${ow.profile}' must be 'owner'` });
    }
  }
  const scope = input.scope as { allowed_hosts?: unknown; allowed_paths?: unknown } | undefined;
  if (scope === undefined || !Array.isArray(scope.allowed_hosts) || scope.allowed_hosts.length === 0) {
    violations.push({ kind: "out_of_scope", field: "scope.allowed_hosts", message: "scope.allowed_hosts must be a non-empty array" });
  }
  return { ok: violations.length === 0, violations };
}
