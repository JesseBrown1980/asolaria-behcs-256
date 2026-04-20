import { makeEmptyList, revoke, isRevoked, auditRevocations, partitionKeys } from "../key-revocation.ts";
import type { Ed25519KeyEntry } from "../key-rotation-scheduler.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== K-003 key revocation tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkKey(overrides: Partial<Ed25519KeyEntry> = {}): Ed25519KeyEntry {
  return {
    key_id: "dev-test-aaa", owner_glyph: "DEV-TEST",
    public_key_b64: "b64", d11_level: "ASSUMED",
    created_at: "2025-01-01T00:00:00Z", rotated_at: null,
    usage: ["behcs-envelope"], binding_class: "device-bound",
    host_device: "DEV-TEST", ...overrides,
  };
}

// T1: empty list
console.log("T1: empty list");
const l1 = makeEmptyList();
assert(l1.records.length === 0, "empty");
assert(l1.version === "k-003-v1", "version set");

// T2: revoke adds record
console.log("\nT2: revoke");
const { list: l2, record: r2, already_revoked: a2 } = revoke(l1, {
  key: mkKey(), reason: "compromised", witness_gate: "jesse",
  detail: "device stolen", at: NOW,
});
assert(a2 === false, "not already revoked");
assert(l2.records.length === 1, "1 record");
assert(r2.key_id === "dev-test-aaa", "key_id");
assert(r2.reason === "compromised", "reason");
assert(r2.witness_profile === "owner", "owner-only");
assert(r2.revoked_at === NOW, "ts");

// T3: purity — original list unchanged
console.log("\nT3: purity");
assert(l1.records.length === 0, "original untouched");

// T4: re-revoke returns existing
console.log("\nT4: idempotent");
const re = revoke(l2, { key: mkKey(), reason: "lost", witness_gate: "jesse", detail: "new reason", at: "2026-04-19T06:00:00Z" });
assert(re.already_revoked === true, "already revoked");
assert(re.record.reason === "compromised", "original reason retained");
assert(re.list.records.length === 1, "still 1 record");

// T5: revoke different key
console.log("\nT5: multiple keys");
const k2 = mkKey({ key_id: "dev-test-bbb" });
const { list: l5 } = revoke(l2, { key: k2, reason: "lost", witness_gate: "jesse", detail: "test", at: NOW });
assert(l5.records.length === 2, "2 records");

// T6: isRevoked — positive
console.log("\nT6: isRevoked positive");
const ch1 = isRevoked(l2, "dev-test-aaa");
assert(ch1.revoked === true, "revoked");
assert(ch1.record?.reason === "compromised", "record included");
assert(ch1.glyph_sentence.includes("revoked_at"), "glyph has ts");

// T7: isRevoked — negative
console.log("\nT7: isRevoked negative");
const ch2 = isRevoked(l2, "never-revoked");
assert(ch2.revoked === false, "not revoked");
assert(ch2.record === null, "no record");
assert(ch2.glyph_sentence.includes("active"), "glyph says active");

// T8: replacement_key_id preserved
console.log("\nT8: replacement");
const { record: r8 } = revoke(l1, {
  key: mkKey(), reason: "rotation-complete", witness_gate: "jesse",
  detail: "rotated", replacement_key_id: "dev-test-aaa-2", at: NOW,
});
assert(r8.replacement_key_id === "dev-test-aaa-2", "replacement preserved");

// T9: audit with mixed reasons
console.log("\nT9: audit");
let audit_list = makeEmptyList();
const keys = [
  { key: mkKey({ key_id: "k1" }), reason: "compromised" as const, detail: "d1" },
  { key: mkKey({ key_id: "k2" }), reason: "compromised" as const, detail: "d2" },
  { key: mkKey({ key_id: "k3" }), reason: "lost" as const, detail: "d3" },
  { key: mkKey({ key_id: "k4", owner_glyph: "DEV-LIRIS" }), reason: "rotation-complete" as const, detail: "d4", replacement: "k4-new" },
];
for (const k of keys) {
  const { list } = revoke(audit_list, {
    key: k.key, reason: k.reason, witness_gate: "jesse",
    detail: k.detail, at: NOW,
    replacement_key_id: (k as any).replacement,
  });
  audit_list = list;
}
const audit = auditRevocations(audit_list);
assert(audit.total_revoked === 4, "4 total");
assert(audit.by_reason.compromised === 2, "2 compromised");
assert(audit.by_reason.lost === 1, "1 lost");
assert(audit.by_reason["rotation-complete"] === 1, "1 rotation");
assert(audit.by_owner_glyph["DEV-TEST"] === 3, "3 DEV-TEST");
assert(audit.by_owner_glyph["DEV-LIRIS"] === 1, "1 DEV-LIRIS");
assert(audit.pending_replacement === 3, "3 pending replacement");

// T10: oldest/newest
console.log("\nT10: oldest/newest");
let ages_list = makeEmptyList();
const { list: A } = revoke(ages_list, { key: mkKey({ key_id: "ok" }), reason: "lost", witness_gate: "j", detail: "d", at: "2026-04-17T00:00:00Z" });
const { list: B } = revoke(A, { key: mkKey({ key_id: "middle" }), reason: "lost", witness_gate: "j", detail: "d", at: "2026-04-18T00:00:00Z" });
const { list: C } = revoke(B, { key: mkKey({ key_id: "new" }), reason: "lost", witness_gate: "j", detail: "d", at: "2026-04-19T00:00:00Z" });
const audit3 = auditRevocations(C);
assert(audit3.oldest_revocation === "2026-04-17T00:00:00Z", "oldest");
assert(audit3.newest_revocation === "2026-04-19T00:00:00Z", "newest");

// T11: empty audit
console.log("\nT11: empty audit");
const emptyAudit = auditRevocations(makeEmptyList());
assert(emptyAudit.total_revoked === 0, "0");
assert(emptyAudit.oldest_revocation === null, "no oldest");
assert(emptyAudit.pending_replacement === 0, "no pending");

// T12: partitionKeys
console.log("\nT12: partition");
const activeKey = mkKey({ key_id: "active" });
const revokedKey = mkKey({ key_id: "gone" });
const { list: partList } = revoke(makeEmptyList(), {
  key: revokedKey, reason: "compromised", witness_gate: "j", detail: "d", at: NOW,
});
const part = partitionKeys([activeKey, revokedKey], partList);
assert(part.active.length === 1, "1 active");
assert(part.active[0].key_id === "active", "active key");
assert(part.revoked.length === 1, "1 revoked");
assert(part.revoked[0].key.key_id === "gone", "revoked key");
assert(part.revoked[0].record.reason === "compromised", "record attached");

// T13: audit glyph
console.log("\nT13: audit glyph");
assert(audit.glyph_sentence.includes("total=4"), "total in glyph");
assert(audit.glyph_sentence.includes("pending-replacement=3"), "pending in glyph");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-K-003-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
