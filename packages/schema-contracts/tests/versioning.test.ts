import { resolveContract, deprecationReport, deprecate, retire, type VersionedContract } from "../src/versioning.ts";
import type { EnvelopeContract } from "../src/contracts.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== Q-004 contract versioning tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

// Two versions of a fake "example-verb" contract
const V1_CONTRACT: EnvelopeContract = {
  name: "example-verb-v1",
  description: "v1: requires only subject",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true, enum: ["example-verb"] },
    { name: "subject", kind: "string", required: true },
  ],
};
const V2_CONTRACT: EnvelopeContract = {
  name: "example-verb-v2",
  description: "v2: adds target",
  allow_extra_fields: true,
  fields: [
    { name: "verb", kind: "string", required: true, enum: ["example-verb"] },
    { name: "subject", kind: "string", required: true },
    { name: "target", kind: "string", required: true },
  ],
};

const v1: VersionedContract = {
  verb: "example-verb", version: "1.0.0", status: "active",
  introduced_at: "2026-01-01T00:00:00Z", contract: V1_CONTRACT,
};
const v2: VersionedContract = {
  verb: "example-verb", version: "2.0.0", status: "active",
  introduced_at: "2026-04-01T00:00:00Z", contract: V2_CONTRACT,
  migration_note: "add `target` field (required)",
};

// T1: v1 envelope resolves to v1
console.log("T1: v1 envelope");
const env1 = { verb: "example-verb", subject: "s" };
const r1 = resolveContract(env1, [v1, v2]);
assert(r1.matched_version === "1.0.0", "matched v1");
assert(r1.status === "active", "active");
assert(r1.fallback_used === false, "not deprecated");
// NOTE: Both v1 and v2 have allow_extra_fields: true, so env with just subject
// actually validates under v2 too because v2 just adds target as required.
// Wait — target is required, and env1 doesn't have it, so v2 fails. Good.

// T2: v2 envelope with target resolves to v2 (newest-first)
console.log("\nT2: v2 envelope");
const env2 = { verb: "example-verb", subject: "s", target: "t" };
const r2 = resolveContract(env2, [v1, v2]);
assert(r2.matched_version === "2.0.0", "matched v2 (newest first)");

// T3: unknown verb
console.log("\nT3: unknown verb");
const r3 = resolveContract({ verb: "what" }, [v1, v2]);
assert(r3.matched_version === null, "no version");
assert(r3.glyph_sentence.includes("UNMAPPED"), "unmapped glyph");

// T4: missing verb field
console.log("\nT4: no verb");
const r4 = resolveContract({}, [v1, v2]);
assert(r4.matched_version === null, "no match");
assert(r4.glyph_sentence.includes("NO-VERB"), "no-verb glyph");

// T5: both versions fail → drift glyph + first failure returned
console.log("\nT5: drift");
const env5 = { verb: "example-verb" };  // no subject
const r5 = resolveContract(env5, [v1, v2]);
assert(r5.matched_version === null, "no version matches");
assert(r5.validation?.ok === false, "validation failure returned");
assert(r5.glyph_sentence.includes("DRIFT"), "drift glyph");
assert(r5.tried_versions.length === 2, "both tried");

// T6: deprecated fallback flagged
console.log("\nT6: deprecated fallback");
const v1Dep = deprecate(v1, NOW, "use v2");
const r6 = resolveContract(env1, [v1Dep, v2]);  // env1 only has subject — matches v1Dep
assert(r6.matched_version === "1.0.0", "fell back to v1");
assert(r6.fallback_used === true, "fallback_used=true");
assert(r6.status === "deprecated", "status deprecated");
assert(r6.glyph_sentence.includes("deprecated-fallback-in-use"), "glyph mentions fallback");

// T7: retired version not tried
console.log("\nT7: retired skipped");
const v1Ret = retire(v1, NOW);
const r7 = resolveContract(env1, [v1Ret, v2]);
assert(r7.matched_version === null, "v1 retired, v2 rejects env1");
assert(!r7.tried_versions.includes("1.0.0"), "v1 not tried");

// T8: semver ordering — three versions, newest wins
console.log("\nT8: semver ordering");
const v3: VersionedContract = { ...v2, version: "3.0.0", contract: V2_CONTRACT };
const r8 = resolveContract(env2, [v1, v2, v3]);
assert(r8.matched_version === "3.0.0", "v3 is newest");
assert(r8.tried_versions[0] === "3.0.0", "v3 tried first");

// T9: pre-release sorts lower than stable
console.log("\nT9: pre-release");
const v2alpha: VersionedContract = { ...v2, version: "2.0.0-alpha" };
const r9 = resolveContract(env2, [v2alpha, v2]);
assert(r9.matched_version === "2.0.0", "stable beats alpha");

// T10: deprecation report
console.log("\nT10: deprecation report");
const reg: VersionedContract[] = [v1Dep, v2, v3];
const rep = deprecationReport(reg);
assert(rep.by_verb["example-verb"].active.length === 2, "2 active");
assert(rep.by_verb["example-verb"].deprecated.length === 1, "1 deprecated");
assert(rep.glyph_sentence.includes("deprecated=1"), "deprecated in glyph");
assert(rep.glyph_sentence.includes("active=2"), "active in glyph");

// T11: migration notes in report
console.log("\nT11: migration notes");
assert(rep.migration_notes.some(n => n.to_version === "2.0.0" && n.note.includes("target")), "note captured");

// T12: deprecate() is pure (no mutation)
console.log("\nT12: deprecate purity");
assert(v1.status === "active", "original unchanged");
assert(v1.deprecated_at === undefined, "original no deprecated_at");
assert(v1Dep.status === "deprecated", "copy has deprecated");
assert(v1Dep.deprecated_at === NOW, "copy has ts");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-Q-004-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
