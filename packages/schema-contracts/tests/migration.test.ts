import { migrate, findPath, batchMigrate, type MigrationRegistry, type MigrationStep } from "../src/migration.ts";
import type { VersionedContract } from "../src/versioning.ts";
import type { EnvelopeContract } from "../src/contracts.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Q-005 contract migration tests ===\n");

// Registry for fake "widget" verb with 3 versions
const steps: MigrationStep[] = [
  {
    from_version: "1.0.0", to_version: "2.0.0",
    transform: (env: any) => ({ ...env, target: env.target ?? "federation" }),
    description: "v1→v2 adds target default",
  },
  {
    from_version: "2.0.0", to_version: "3.0.0",
    transform: (env: any) => {
      const { subject, ...rest } = env;
      return { ...rest, body: { subject } };
    },
    description: "v2→v3 moves subject into body",
  },
];
const reg: MigrationRegistry = { verb: "widget", steps };

const v3Target: VersionedContract = {
  verb: "widget", version: "3.0.0", status: "active", introduced_at: "2026-01-01T00:00:00Z",
  contract: {
    name: "widget-v3", description: "v3 has nested body.subject",
    allow_extra_fields: true,
    fields: [
      { name: "verb", kind: "string", required: true, enum: ["widget"] },
      { name: "target", kind: "string", required: true },
      { name: "body", kind: "object", required: true, nested: {
        name: "widget-v3.body", description: "", allow_extra_fields: true,
        fields: [{ name: "subject", kind: "string", required: true }],
      }},
    ],
  } as EnvelopeContract,
};

// T1: findPath same version → empty path
console.log("T1: same version");
const p1 = findPath(reg, "1.0.0", "1.0.0");
assert(Array.isArray(p1), "array returned");
assert(p1?.length === 0, "empty path");

// T2: findPath direct
console.log("\nT2: direct step");
const p2 = findPath(reg, "1.0.0", "2.0.0");
assert(p2?.length === 1, "1 step");

// T3: findPath multi-hop
console.log("\nT3: multi-hop");
const p3 = findPath(reg, "1.0.0", "3.0.0");
assert(p3?.length === 2, "2 steps");

// T4: findPath unreachable
console.log("\nT4: unreachable");
const p4 = findPath(reg, "3.0.0", "1.0.0");
assert(p4 === null, "no path");

// T5: migrate v1 → v2
console.log("\nT5: migrate v1→v2");
const env1 = { verb: "widget", subject: "a" };
const r5 = migrate(env1, "1.0.0", "2.0.0", reg);
assert(r5.ok === true, "ok");
assert(r5.envelope.target === "federation", "default added");
assert(r5.envelope.subject === "a", "subject preserved");
assert(r5.steps_applied.length === 1, "1 step");

// T6: migrate v1 → v3 through chain
console.log("\nT6: v1→v3 chain");
const r6 = migrate(env1, "1.0.0", "3.0.0", reg, v3Target);
assert(r6.ok === true, "ok");
assert(r6.steps_applied.length === 2, "2 steps");
assert(r6.envelope.body?.subject === "a", "subject moved into body");
assert(r6.envelope.target === "federation", "target default preserved through chain");
assert(r6.validation_ok === true, "validates target");

// T7: input not mutated
console.log("\nT7: purity");
assert(env1.subject === "a", "input preserved");
assert(!("body" in env1), "input not mutated");
assert(!("target" in env1), "input untouched");

// T8: unreachable → error
console.log("\nT8: no path");
const r8 = migrate(env1, "3.0.0", "1.0.0", reg);
assert(r8.ok === false, "failed");
assert(r8.envelope === null, "no envelope");
assert(r8.glyph_sentence.includes("UNREACHABLE"), "unreachable glyph");

// T9: transform throws
console.log("\nT9: throwing transform");
const throwReg: MigrationRegistry = {
  verb: "widget",
  steps: [{
    from_version: "1.0.0", to_version: "2.0.0",
    transform: () => { throw new Error("boom"); },
    description: "always fails",
  }],
};
const r9 = migrate(env1, "1.0.0", "2.0.0", throwReg);
assert(r9.ok === false, "failed");
assert(r9.reason.includes("boom"), "reason cites boom");
assert(r9.glyph_sentence.includes("THREW"), "threw glyph");

// T10: target validation failure
console.log("\nT10: validation fail");
// Skip v1→v2 which would default target; go v1 directly past v2 into target that requires 'target' — wait,
// v3Target requires target. Our chain adds it via v1→v2. Let's construct a case that fails: migrate from v2
// a missing target into a contract that requires target. Our v2→v3 doesn't touch target, so if we feed a v2
// envelope without target, final v3 won't have target → validation fails.
const env2NoTarget = { verb: "widget", subject: "b" };
const r10 = migrate(env2NoTarget, "2.0.0", "3.0.0", reg, v3Target);
assert(r10.validation_ok === false, "validation fails");
assert(r10.ok === false, "ok=false");
assert(r10.validation_violations.length > 0, "violations captured");

// T11: batch migrate mixed versions
console.log("\nT11: batch migrate");
const bat = batchMigrate({
  envelopes: [
    { envelope: { verb: "widget", subject: "a" }, from_version: "1.0.0" },
    { envelope: { verb: "widget", subject: "b", target: "peer" }, from_version: "2.0.0" },
    { envelope: { verb: "widget", subject: "c" }, from_version: "1.0.0" },
  ],
  to_version: "3.0.0",
  registry: reg,
  target_contract: v3Target,
});
assert(bat.total === 3, "3 total");
assert(bat.succeeded === 3, "all succeeded");
assert(bat.successes[0].migrated.body.subject === "a", "a migrated");
assert(bat.successes[1].migrated.body.subject === "b", "b migrated");
assert(bat.successes[1].migrated.target === "peer", "b target preserved");

// T12: batch with one failure
console.log("\nT12: batch partial");
const batFail = batchMigrate({
  envelopes: [
    { envelope: { verb: "widget", subject: "a" }, from_version: "1.0.0" },
    { envelope: { verb: "widget", subject: "b" }, from_version: "9.9.9" }, // unreachable
  ],
  to_version: "3.0.0",
  registry: reg,
  target_contract: v3Target,
});
assert(batFail.succeeded === 1, "1 ok");
assert(batFail.failed === 1, "1 fail");
assert(batFail.failures[0].from_version === "9.9.9", "failure logged");

// T13: same-version is no-op
console.log("\nT13: no-op");
const r13 = migrate({ verb: "widget", x: 1 }, "1.0.0", "1.0.0", reg);
assert(r13.ok === true, "ok");
assert(r13.steps_applied.length === 0, "no steps");
assert(r13.envelope.x === 1, "envelope preserved");

// T14: glyph counts
console.log("\nT14: glyph");
assert(bat.glyph_sentence.includes("ok=3"), "batch ok count");
assert(bat.glyph_sentence.includes("fail=0"), "batch fail count");

// T15: steps_applied descriptions
console.log("\nT15: step descriptions");
assert(r6.steps_applied[0].description.includes("v1→v2"), "desc preserved");
assert(r6.steps_applied[1].description.includes("v2→v3"), "2nd desc preserved");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-Q-005-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
