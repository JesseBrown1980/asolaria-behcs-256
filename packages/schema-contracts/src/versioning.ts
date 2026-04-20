// packages/schema-contracts/src/versioning.ts — Q-004 contract evolution
//
// Schema contracts drift over time. When liris ships a new shape under an
// existing verb, acer needs to (a) match the right version against the
// incoming envelope, (b) report which version each envelope conformed to,
// (c) deprecate older versions gracefully. Q-004 adds a VersionedContract
// type + resolve helpers, while keeping Q-001 ALL_CONTRACTS as the
// default singleton (v1 effectively).

import { validateEnvelope, type EnvelopeContract, type ValidationResult } from "./contracts.ts";

export type ContractStatus = "active" | "deprecated" | "retired";

export interface VersionedContract {
  verb: string;
  version: string;                   // semver-ish: "1.0.0", "2.0.0-alpha"
  status: ContractStatus;
  introduced_at: string;             // ISO date
  deprecated_at?: string;            // ISO date (if deprecated)
  retired_at?: string;
  contract: EnvelopeContract;
  migration_note?: string;           // plain text on how to migrate from previous version
}

export interface VersionResolution {
  matched_version: string | null;
  status: ContractStatus | null;
  validation: ValidationResult | null;
  fallback_used: boolean;
  tried_versions: string[];
  glyph_sentence: string;
}

// Sort by semver-ish so newest comes first; tolerant of "2.0.0-alpha"
function semverCmp(a: string, b: string): number {
  const splitPre = (v: string) => {
    const [main, pre] = v.split("-");
    return { main, pre: pre ?? "" };
  };
  const aa = splitPre(a), bb = splitPre(b);
  const ap = aa.main.split(".").map(n => parseInt(n, 10) || 0);
  const bp = bb.main.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0, bv = bp[i] ?? 0;
    if (av !== bv) return bv - av;  // newer first
  }
  // Same main version: stable < alpha (no pre-release sorts newer)
  if (aa.pre === "" && bb.pre !== "") return -1;
  if (aa.pre !== "" && bb.pre === "") return 1;
  return aa.pre.localeCompare(bb.pre);
}

// Find the best contract to validate this envelope against.
// Strategy: try each active version newest-first. Return the first that validates.
// If none validates, return the newest active version's validation result (so
// operators see the most-expected drift).
export function resolveContract(envelope: any, contracts: VersionedContract[]): VersionResolution {
  const verb = typeof envelope?.verb === "string" ? envelope.verb : null;
  if (!verb) {
    return {
      matched_version: null, status: null, validation: null, fallback_used: false,
      tried_versions: [],
      glyph_sentence: "EVT-CONTRACT-VERSION-NO-VERB · @ M-INDICATIVE .",
    };
  }

  const candidates = contracts
    .filter(c => c.verb === verb && c.status !== "retired")
    .sort((a, b) => semverCmp(a.version, b.version));

  if (candidates.length === 0) {
    return {
      matched_version: null, status: null, validation: null, fallback_used: false,
      tried_versions: [],
      glyph_sentence: `EVT-CONTRACT-VERSION-UNMAPPED · verb=${verb} @ M-INDICATIVE .`,
    };
  }

  const tried: string[] = [];
  let firstFailure: { validation: ValidationResult; version: string; status: ContractStatus } | null = null;

  for (const c of candidates) {
    tried.push(c.version);
    const validation = validateEnvelope(envelope, c.contract);
    if (validation.ok) {
      return {
        matched_version: c.version,
        status: c.status,
        validation,
        fallback_used: c.status === "deprecated",
        tried_versions: tried,
        glyph_sentence: `EVT-CONTRACT-VERSION-MATCHED · verb=${verb} · version=${c.version} · status=${c.status}${c.status === "deprecated" ? " · deprecated-fallback-in-use" : ""} @ M-EYEWITNESS .`,
      };
    }
    if (!firstFailure) firstFailure = { validation, version: c.version, status: c.status };
  }

  // No version matched; return newest-active validation result for inspection
  return {
    matched_version: null,
    status: firstFailure?.status ?? null,
    validation: firstFailure?.validation ?? null,
    fallback_used: false,
    tried_versions: tried,
    glyph_sentence: `EVT-CONTRACT-VERSION-DRIFT · verb=${verb} · tried=${tried.length} · no-version-matched @ M-EYEWITNESS .`,
  };
}

export interface DeprecationReport {
  by_verb: Record<string, {
    active: string[];
    deprecated: string[];
    retired: string[];
  }>;
  migration_notes: Array<{ verb: string; from_version: string; to_version: string; note: string }>;
  glyph_sentence: string;
}

export function deprecationReport(contracts: VersionedContract[]): DeprecationReport {
  const byVerb: DeprecationReport["by_verb"] = {};
  const notes: DeprecationReport["migration_notes"] = [];

  for (const c of contracts) {
    if (!byVerb[c.verb]) byVerb[c.verb] = { active: [], deprecated: [], retired: [] };
    if (c.status === "active") byVerb[c.verb].active.push(c.version);
    else if (c.status === "deprecated") byVerb[c.verb].deprecated.push(c.version);
    else byVerb[c.verb].retired.push(c.version);
  }

  for (const verb of Object.keys(byVerb)) {
    const versions = contracts.filter(c => c.verb === verb).sort((a, b) => semverCmp(b.version, a.version)); // oldest first
    for (let i = 1; i < versions.length; i++) {
      if (versions[i].migration_note) {
        notes.push({ verb, from_version: versions[i - 1].version, to_version: versions[i].version, note: versions[i].migration_note! });
      }
    }
  }

  let activeCount = 0, deprCount = 0, retCount = 0;
  for (const v of Object.values(byVerb)) { activeCount += v.active.length; deprCount += v.deprecated.length; retCount += v.retired.length; }

  return {
    by_verb: byVerb,
    migration_notes: notes,
    glyph_sentence: `EVT-CONTRACT-DEPRECATION-REPORT · verbs=${Object.keys(byVerb).length} · active=${activeCount} · deprecated=${deprCount} · retired=${retCount} @ M-INDICATIVE .`,
  };
}

// Helper: mark a contract as deprecated, producing a new record without mutating input
export function deprecate(c: VersionedContract, at: string, migration_note?: string): VersionedContract {
  return { ...c, status: "deprecated", deprecated_at: at, migration_note: migration_note ?? c.migration_note };
}

export function retire(c: VersionedContract, at: string): VersionedContract {
  return { ...c, status: "retired", retired_at: at };
}
