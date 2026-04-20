import { pruneInbox } from "../src/pruner.ts";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== I-001 inbox-pruner tests ===\n");

const TESTDIR = join(tmpdir(), "asolaria-i001-" + Date.now());
mkdirSync(TESTDIR);

function write(path: string, msgs: any[]) {
  writeFileSync(path, msgs.map(m => JSON.stringify(m)).join("\n") + "\n");
}

// T1: heartbeats old → archived; non-heartbeat recent → kept
console.log("T1: basic separation");
const p1 = join(TESTDIR, "inbox1.ndjson");
const arc1 = join(TESTDIR, "archive1");
write(p1, [
  { verb: "behcs.heartbeat", received_at: "2026-04-18T00:00:00Z" },
  { verb: "behcs.heartbeat", received_at: "2026-04-18T01:00:00Z" },
  { verb: "smp-v5-track-claimed", received_at: "2026-04-19T03:00:00Z" },
  { verb: "cosign-append", received_at: "2026-04-18T02:00:00Z", entry_sig: { key_id: "k1", sig_b64: "..." } },
]);
const r1 = pruneInbox({ inbox_path: p1, archive_dir: arc1, keep_hours: 24, always_keep_verbs: [], now: "2026-04-19T03:30:00Z" });
assert(r1.total_in === 4, "4 in");
assert(r1.signed_preserved === 1, "1 signed preserved (cosign-append with entry_sig)");
assert(r1.heartbeats_archived === 2, "2 heartbeats archived");
assert(r1.recent_preserved === 1, "1 recent non-heartbeat preserved");
assert(r1.kept === 2, "2 kept total");

// T2: allowlisted verb preserved regardless of age
console.log("\nT2: allowlist overrides age");
const p2 = join(TESTDIR, "inbox2.ndjson");
const arc2 = join(TESTDIR, "archive2");
write(p2, [
  { verb: "audit-critical", received_at: "2020-01-01T00:00:00Z" },
  { verb: "behcs.heartbeat", received_at: "2020-01-01T00:00:00Z" },
]);
const r2 = pruneInbox({ inbox_path: p2, archive_dir: arc2, keep_hours: 1, always_keep_verbs: ["audit-critical"], now: "2026-04-19T03:00:00Z" });
assert(r2.allowlist_preserved === 1, "allowlist preserved");
assert(r2.heartbeats_archived === 1, "heartbeat archived");

// T3: signed preserved even if old + heartbeat-kind
console.log("\nT3: signed beats everything");
const p3 = join(TESTDIR, "inbox3.ndjson");
const arc3 = join(TESTDIR, "archive3");
write(p3, [
  { verb: "heartbeat", received_at: "1990-01-01T00:00:00Z", signature: { key_id: "x", sig_b64: "y" } },
]);
const r3 = pruneInbox({ inbox_path: p3, archive_dir: arc3, keep_hours: 24, always_keep_verbs: [], now: "2026-04-19T03:00:00Z" });
assert(r3.signed_preserved === 1, "signed heartbeat preserved");

// T4: .bak kept after rewrite
console.log("\nT4: .bak preserved");
assert(existsSync(p1 + ".bak"), ".bak exists post-prune");

// T5: archive files created with ISO date suffix
console.log("\nT5: archive filename shape");
const files = readdirSync(arc1);
assert(files.every(f => /^inbox-archive-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)), "all filenames match pattern", files.join(","));
assert(Object.keys(r1.archived_by_day).length === 1 && r1.archived_by_day["2026-04-18"] === 2, "archived_by_day correct");

// T6: missing inbox returns empty result
console.log("\nT6: missing inbox");
const r6 = pruneInbox({ inbox_path: join(TESTDIR, "does-not-exist.ndjson"), archive_dir: join(TESTDIR, "arcX"), keep_hours: 24, always_keep_verbs: [] });
assert(r6.total_in === 0, "total_in=0 on missing");
assert(r6.glyph_sentence.includes("inbox-missing"), "glyph says missing");

// T7: malformed line preserved (safety)
console.log("\nT7: malformed preserved");
const p7 = join(TESTDIR, "inbox7.ndjson");
writeFileSync(p7, '{"verb":"ok","received_at":"2026-04-19T03:00:00Z"}\n[not-json line]\n');
const r7 = pruneInbox({ inbox_path: p7, archive_dir: join(TESTDIR, "arc7"), keep_hours: 24, always_keep_verbs: [], now: "2026-04-19T03:00:00Z" });
assert(r7.kept >= 1, "unparseable preserved");

// T8: glyph sentence shape
console.log("\nT8: glyph shape");
assert(r1.glyph_sentence.startsWith("EVT-INBOX-PRUNE"), "starts EVT-INBOX-PRUNE");
assert(r1.glyph_sentence.includes("in="), "has in=");
assert(r1.glyph_sentence.includes("kept="), "has kept=");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-I-001-INBOX-PRUNER-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
