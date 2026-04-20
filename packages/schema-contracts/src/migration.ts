// packages/schema-contracts/src/migration.ts — Q-005 envelope migration
//
// Q-004 added VersionedContract + resolution; Q-005 adds the transform
// step — given an envelope that matches one version, migrate it to the
// shape expected by another. Useful when peers ship on different release
// cadences and need to interop.
//
// Pure — migrations are declarative rewrite rules with optional validator
// call to confirm result conforms to target version.

import type { VersionedContract } from "./versioning.ts";
import { validateEnvelope } from "./contracts.ts";

export interface MigrationStep {
  from_version: string;
  to_version: string;
  transform: (envelope: any) => any;   // pure transform — callers must not mutate input
  description: string;
}

export interface MigrationRegistry {
  verb: string;
  steps: MigrationStep[];
}

export interface MigrationResult {
  ok: boolean;
  from_version: string;
  to_version: string;
  envelope: any | null;
  steps_applied: Array<{ from: string; to: string; description: string }>;
  validation_ok: boolean;
  validation_violations: string[];
  reason: string;
  glyph_sentence: string;
}

// Find a migration chain from → to; returns empty array if target equals source, null if unreachable
export function findPath(registry: MigrationRegistry, from: string, to: string): MigrationStep[] | null {
  if (from === to) return [];

  // BFS over step graph
  const queue: Array<{ node: string; path: MigrationStep[] }> = [{ node: from, path: [] }];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const next = registry.steps.filter(s => s.from_version === cur.node);
    for (const step of next) {
      if (seen.has(step.to_version)) continue;
      const newPath = [...cur.path, step];
      if (step.to_version === to) return newPath;
      seen.add(step.to_version);
      queue.push({ node: step.to_version, path: newPath });
    }
  }
  return null;
}

export function migrate(
  envelope: any,
  from_version: string,
  to_version: string,
  registry: MigrationRegistry,
  targetContract?: VersionedContract,
): MigrationResult {
  const path = findPath(registry, from_version, to_version);
  if (path === null) {
    return {
      ok: false, from_version, to_version, envelope: null,
      steps_applied: [], validation_ok: false, validation_violations: [],
      reason: `no migration path from ${from_version} → ${to_version} for verb=${registry.verb}`,
      glyph_sentence: `EVT-CONTRACT-MIGRATION-UNREACHABLE · verb=${registry.verb} · from=${from_version} · to=${to_version} @ M-EYEWITNESS .`,
    };
  }

  let current = structuredClone(envelope);
  const applied: MigrationResult["steps_applied"] = [];
  for (const step of path) {
    try {
      current = step.transform(current);
      applied.push({ from: step.from_version, to: step.to_version, description: step.description });
    } catch (e) {
      return {
        ok: false, from_version, to_version, envelope: null, steps_applied: applied,
        validation_ok: false, validation_violations: [(e as Error).message],
        reason: `transform threw in ${step.from_version} → ${step.to_version}: ${(e as Error).message}`,
        glyph_sentence: `EVT-CONTRACT-MIGRATION-THREW · verb=${registry.verb} · step=${step.from_version}→${step.to_version} @ M-EYEWITNESS .`,
      };
    }
  }

  // Optional: validate result against target contract
  let validation_ok = true;
  let validation_violations: string[] = [];
  if (targetContract) {
    const res = validateEnvelope(current, targetContract.contract);
    validation_ok = res.ok;
    validation_violations = res.violations.map(v => `${v.field}:${v.kind}:${v.detail}`);
  }

  return {
    ok: validation_ok,
    from_version, to_version,
    envelope: current,
    steps_applied: applied,
    validation_ok,
    validation_violations,
    reason: validation_ok ? `migrated through ${applied.length} step(s)` : `migrated but target validation failed: ${validation_violations.length} violations`,
    glyph_sentence: validation_ok
      ? `EVT-CONTRACT-MIGRATION-OK · verb=${registry.verb} · ${from_version}→${to_version} · steps=${applied.length} @ M-EYEWITNESS .`
      : `EVT-CONTRACT-MIGRATION-VALIDATION-FAIL · verb=${registry.verb} · ${from_version}→${to_version} · violations=${validation_violations.length} @ M-EYEWITNESS .`,
  };
}

// Given a batch of envelopes at various source versions, migrate all to one target; returns counts + failures
export interface BatchMigrateInput {
  envelopes: Array<{ envelope: any; from_version: string }>;
  to_version: string;
  registry: MigrationRegistry;
  target_contract?: VersionedContract;
}
export interface BatchMigrateReport {
  total: number;
  succeeded: number;
  failed: number;
  successes: Array<{ original: any; migrated: any; steps: number }>;
  failures: Array<{ original: any; from_version: string; reason: string }>;
  glyph_sentence: string;
}

export function batchMigrate(input: BatchMigrateInput): BatchMigrateReport {
  const successes: BatchMigrateReport["successes"] = [];
  const failures: BatchMigrateReport["failures"] = [];
  for (const { envelope, from_version } of input.envelopes) {
    const r = migrate(envelope, from_version, input.to_version, input.registry, input.target_contract);
    if (r.ok) successes.push({ original: envelope, migrated: r.envelope, steps: r.steps_applied.length });
    else failures.push({ original: envelope, from_version, reason: r.reason });
  }
  return {
    total: input.envelopes.length,
    succeeded: successes.length,
    failed: failures.length,
    successes,
    failures,
    glyph_sentence: `EVT-CONTRACT-MIGRATION-BATCH · verb=${input.registry.verb} · to=${input.to_version} · ok=${successes.length} · fail=${failures.length} @ M-INDICATIVE .`,
  };
}
