// packages/drift-broadcast/tests/history.test.ts — F-078 tests

import { ingestDrift, loadHistory, queryHistory, quorumForDrift, summarizeHistory, type HistoryEntry } from "../src/history.ts";
import { signPayload, mintKey, registerKey, loadRegistry, saveRegistry, type Ed25519Registry } from "../../kernel/src/ed25519-registry.ts";
import type { SignedDriftEnvelope, DriftBroadcastPayload } from "../src/broadcaster.ts";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
console.log("=== F-078 drift-history tests ===\n");

const TESTDIR = join(tmpdir(), "asolaria-f078-" + Date.now());
mkdirSync(TESTDIR, { recursive: true });
const HISTORY_PATH = join(TESTDIR, "drift-history.ndjson");
const REG_PATH = join(TESTDIR, "registry.json");

// Mint 3 peer keys (acer, liris, falcon)
let reg = loadRegistry(REG_PATH);
const keys: Record<string, { key_id: string; priv: string }> = {};
for (const owner of ["DEV-ACER", "DEV-LIRIS", "DEV-FALCON"]) {
  const m = mintKey({ owner_glyph: owner, host_device: owner });
  reg = registerKey(reg, m.entry);
  keys[owner] = { key_id: m.entry.key_id, priv: m.private_key_b64 };
}
saveRegistry(reg, REG_PATH);

function makeSignedDrift(
  owner: string,
  opts: { permanent_name?: string; hilbert_pid?: string; drift_kind?: "verify_failed" | "new_drift_log_entry" | "both"; instance_sha256?: string; observed_at?: string } = {},
): SignedDriftEnvelope {
  const payload: DriftBroadcastPayload = {
    actor: owner.toLowerCase().replace("dev-", ""),
    verb: "drift-detected",
    target: "federation",
    detection: {
      instance_path: "/test",
      permanent_name: opts.permanent_name ?? "test-subject",
      hilbert_pid: opts.hilbert_pid ?? "PID-H01-TEST",
      instance_sha256: opts.instance_sha256 ?? "sha-ABC",
      drift_kind: opts.drift_kind ?? "verify_failed",
      verify_result: null,
      drift_log_entries: [],
      observed_at: opts.observed_at ?? new Date().toISOString(),
      observer_pid: keys[owner].key_id,
    },
    ts: new Date().toISOString(),
  };
  return signPayload(payload, keys[owner].priv, keys[owner].key_id) as SignedDriftEnvelope;
}

// T1: ingest a valid signed drift — verified=true
console.log("T1: ingest valid drift");
const e1 = makeSignedDrift("DEV-ACER", { permanent_name: "subj-1", drift_kind: "verify_failed" });
const r1 = ingestDrift(e1, reg, { historyPath: HISTORY_PATH });
assert(r1.verified === true, "verified=true");
assert(r1.signer_owner_glyph === "DEV-ACER", "owner_glyph captured");

// T2: loadHistory returns the ingested entry
console.log("\nT2: loadHistory");
const all = loadHistory(HISTORY_PATH);
assert(all.length === 1, "1 entry loaded");
assert(all[0].envelope.payload.detection.permanent_name === "subj-1", "entry data preserved");

// T3: ingest a tampered drift — verified=false
console.log("\nT3: tampered drift marked unverified");
const tamp = JSON.parse(JSON.stringify(e1));
tamp.payload.detection.permanent_name = "TAMPERED";
const r3 = ingestDrift(tamp, reg, { historyPath: HISTORY_PATH });
assert(r3.verified === false, "tampered verified=false");
assert(r3.verify_reason !== undefined, "reason captured");

// T4: queryHistory — filter by subject
console.log("\nT4: query by subject");
ingestDrift(makeSignedDrift("DEV-LIRIS", { permanent_name: "subj-2", drift_kind: "new_drift_log_entry" }), reg, { historyPath: HISTORY_PATH });
ingestDrift(makeSignedDrift("DEV-FALCON", { permanent_name: "subj-1", drift_kind: "both" }), reg, { historyPath: HISTORY_PATH });
const q1 = queryHistory({ subject_permanent_name: "subj-1", historyPath: HISTORY_PATH });
assert(q1.length === 2, `2 entries for subj-1 — e1 + falcon; the tampered entry was renamed to 'TAMPERED' (got ${q1.length})`);
const q2 = queryHistory({ subject_permanent_name: "subj-2", historyPath: HISTORY_PATH });
assert(q2.length === 1, "1 entry for subj-2");

// T5: queryHistory — filter by drift_kind
console.log("\nT5: query by drift_kind");
const q3 = queryHistory({ drift_kind: "verify_failed", historyPath: HISTORY_PATH });
assert(q3.length === 2, `2 verify_failed (got ${q3.length}) — e1 valid + tampered e1`);

// T6: queryHistory — verified_only
console.log("\nT6: verified_only filter");
const q4 = queryHistory({ verified_only: true, historyPath: HISTORY_PATH });
assert(q4.every(e => e.verified), "all returned entries verified");
assert(q4.length === 3, "3 verified (excludes tampered)");

// T7: quorumForDrift — same instance_sha256 seen by multiple peers
console.log("\nT7: quorum on same instance_sha");
ingestDrift(makeSignedDrift("DEV-ACER",   { instance_sha256: "SHA-CROSS", permanent_name: "cross" }), reg, { historyPath: HISTORY_PATH });
ingestDrift(makeSignedDrift("DEV-LIRIS",  { instance_sha256: "SHA-CROSS", permanent_name: "cross" }), reg, { historyPath: HISTORY_PATH });
ingestDrift(makeSignedDrift("DEV-FALCON", { instance_sha256: "SHA-CROSS", permanent_name: "cross" }), reg, { historyPath: HISTORY_PATH });
const q5 = quorumForDrift({ instance_sha256: "SHA-CROSS", historyPath: HISTORY_PATH });
assert(q5.distinct_signers.length === 3, `3 distinct signers (got ${q5.distinct_signers.length})`);
assert(q5.total_entries === 3, "total 3");
assert(q5.verified_count === 3, "all 3 verified");

// T8: quorum counts distinct signer owners not raw entries
console.log("\nT8: quorum de-dups multiple acks by same signer");
ingestDrift(makeSignedDrift("DEV-ACER", { instance_sha256: "SHA-CROSS" }), reg, { historyPath: HISTORY_PATH });
const q6 = quorumForDrift({ instance_sha256: "SHA-CROSS", historyPath: HISTORY_PATH });
assert(q6.distinct_signers.length === 3, "still 3 distinct (DEV-ACER dedup'd)");
assert(q6.total_entries === 4, "total 4 (duplicate entry counted in raw total)");

// T9: quorum with verified_only excludes tampered
console.log("\nT9: quorum verified_only");
const tampCross = JSON.parse(JSON.stringify(makeSignedDrift("DEV-ACER", { instance_sha256: "SHA-CROSS" })));
tampCross.payload.detection.permanent_name = "TAMPER";
ingestDrift(tampCross, reg, { historyPath: HISTORY_PATH });
const q7 = quorumForDrift({ instance_sha256: "SHA-CROSS", verified_only: true, historyPath: HISTORY_PATH });
assert(q7.unverified_count === 0, "verified_only excludes tampered from quorum");
assert(q7.verified_count === 4, "4 verified (3 unique signers + 1 ACER dupe)");

// T10: summarizeHistory roll-up
console.log("\nT10: summarize");
const sum = summarizeHistory(HISTORY_PATH);
assert(sum.total_entries >= 7, `total_entries >= 7 (got ${sum.total_entries})`);
assert(sum.unique_subjects >= 3, "at least 3 unique subjects (subj-1, subj-2, cross, TAMPER)");
assert(sum.most_recent_ingested_at !== null, "most_recent set");
assert(Object.keys(sum.by_signer_owner).length >= 3, "3+ distinct signers");

// T11: queryHistory since/until time filter
console.log("\nT11: time-range filter");
const future = "2099-01-01T00:00:00Z";
const q8 = queryHistory({ since_iso: future, historyPath: HISTORY_PATH });
assert(q8.length === 0, "since far-future returns nothing");
const past = "2020-01-01T00:00:00Z";
const q9 = queryHistory({ since_iso: past, historyPath: HISTORY_PATH });
assert(q9.length >= 7, "since past returns all");

// T12: queryHistory by hilbert_pid
console.log("\nT12: query by hilbert_pid");
const e_pid = makeSignedDrift("DEV-ACER", { hilbert_pid: "PID-UNIQUE-X", permanent_name: "custom-pid" });
ingestDrift(e_pid, reg, { historyPath: HISTORY_PATH });
const q10 = queryHistory({ subject_hilbert_pid: "PID-UNIQUE-X", historyPath: HISTORY_PATH });
assert(q10.length === 1, "1 entry matches unique pid");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-F-078-DRIFT-HISTORY-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
