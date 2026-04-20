import { buildAuditEntry, emptyCounters, foldCounters, replayAudit } from "../src/audit.ts";
import { inspect } from "../src/enforcement.ts";
import type { ActiveBlock } from "../src/rules.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== L-003 firewall audit tests ===\n");

const NOW = "2026-04-19T05:00:00Z";
const BLOCKS: ActiveBlock[] = [
  { rule_id: "R-DENY-BAD-ACTOR", subject: "attacker-1", scope: "actor", reason: "test-deny", created_at: NOW, expires_at: null },
  { rule_id: "R-DENY-VERB", subject: "dangerous-verb", scope: "envelope", reason: "verb banned", created_at: NOW, expires_at: null },
];

// T1: audit entry for allow
console.log("T1: audit entry (allow)");
const allowInput = { envelope: { actor: "liris", verb: "shannon-scan-dispatch", target: "acer", body: {} }, active_blocks: BLOCKS, now: NOW };
const allowVerdict = inspect(allowInput);
const allowEntry = buildAuditEntry(allowInput, allowVerdict);
assert(allowEntry.allowed === true, "allowed=true");
assert(allowEntry.actor === "liris", "actor recorded");
assert(allowEntry.blocking_rule_id === null, "no blocking rule");
assert(allowEntry.ts === NOW, "ts stamped");

// T2: audit entry for deny-by-actor
console.log("\nT2: audit entry (deny actor)");
const denyInput = { envelope: { actor: "attacker-1", verb: "anything", target: "acer", body: {} }, active_blocks: BLOCKS, now: NOW };
const denyVerdict = inspect(denyInput);
const denyEntry = buildAuditEntry(denyInput, denyVerdict);
assert(denyEntry.allowed === false, "allowed=false");
assert(denyEntry.blocking_rule_id === "R-DENY-BAD-ACTOR", "rule captured");
assert(denyEntry.scope_hit === "actor", "scope actor");
assert(denyEntry.glyph_sentence.includes("DENY"), "deny glyph");

// T3: counter folding across mixed entries
console.log("\nT3: counter folding");
let c = emptyCounters();
c = foldCounters(c, allowEntry);
c = foldCounters(c, denyEntry);
c = foldCounters(c, denyEntry);
assert(c.total === 3, "total=3");
assert(c.allowed === 1, "allowed=1");
assert(c.denied === 2, "denied=2");
assert(c.by_rule["R-DENY-BAD-ACTOR"] === 2, "rule counter=2");
assert(c.by_scope.actor === 2, "scope counter=2");
assert(c.by_actor["attacker-1"] === 2, "attacker counter=2");
assert(c.by_actor.liris === 1, "liris counter=1");

// T4: replay with same rules → no diff
console.log("\nT4: replay same rules");
const log = [allowEntry, denyEntry];
const diff1 = replayAudit({ audit_log: log, new_rules: BLOCKS, now: NOW });
assert(diff1.total_replayed === 2, "replayed=2");
assert(diff1.flipped_allow_to_deny === 0, "no A2D");
assert(diff1.flipped_deny_to_allow === 0, "no D2A");
assert(diff1.changes.length === 0, "no changes");

// T5: replay with rules removed → deny flips to allow
console.log("\nT5: replay with rules removed");
const diff2 = replayAudit({ audit_log: log, new_rules: [], now: NOW });
assert(diff2.flipped_deny_to_allow === 1, "one D2A");
assert(diff2.flipped_allow_to_deny === 0, "no A2D");
assert(diff2.changes[0].was_allowed === false && diff2.changes[0].now_allowed === true, "flip captured");
assert(diff2.changes[0].actor === "attacker-1", "correct actor flipped");

// T6: replay with new rule added → allow flips to deny
console.log("\nT6: replay with new rule");
const newRules: ActiveBlock[] = [
  ...BLOCKS,
  { rule_id: "R-DENY-LIRIS", subject: "liris", scope: "actor", reason: "paranoia test", created_at: NOW, expires_at: null },
];
const diff3 = replayAudit({ audit_log: log, new_rules: newRules, now: NOW });
assert(diff3.flipped_allow_to_deny === 1, "one A2D");
assert(diff3.changes[0].actor === "liris", "liris flipped to deny");
assert(diff3.changes[0].new_rule === "R-DENY-LIRIS", "new rule captured");

// T7: replay summary glyph
console.log("\nT7: replay glyph");
assert(diff2.glyph_sentence.startsWith("EVT-FIREWALL-REPLAY"), "replay glyph prefix");
assert(diff2.glyph_sentence.includes("d2a=1"), "d2a in glyph");

// T8: entry captures subject from body.scan_id
console.log("\nT8: subject snapshot");
const subjInput = { envelope: { actor: "liris", verb: "v", target: "acer", body: { scan_id: "scan-999" } }, active_blocks: [], now: NOW };
const subjVerdict = inspect(subjInput);
const subjEntry = buildAuditEntry(subjInput, subjVerdict);
assert(subjEntry.subject_snapshot === "scan-999", "scan_id captured as subject");

// T9: empty log replay is no-op
console.log("\nT9: empty log replay");
const empty = replayAudit({ audit_log: [], new_rules: BLOCKS, now: NOW });
assert(empty.total_replayed === 0, "zero replayed");
assert(empty.changes.length === 0, "zero changes");

// T10: large log performance — 1000 entries
console.log("\nT10: 1000-entry replay");
const bigLog: any[] = [];
for (let i = 0; i < 1000; i++) {
  const inp = { envelope: { actor: i % 2 === 0 ? "attacker-1" : "liris", verb: "v", target: "acer", body: {} }, active_blocks: BLOCKS, now: NOW };
  bigLog.push(buildAuditEntry(inp, inspect(inp)));
}
const t0 = Date.now();
const bigDiff = replayAudit({ audit_log: bigLog, new_rules: [], now: NOW });
const t1 = Date.now();
assert(bigDiff.total_replayed === 1000, "1000 replayed");
assert(bigDiff.flipped_deny_to_allow === 500, "500 D2A");
assert(t1 - t0 < 2000, `1000-entry replay < 2s (was ${t1 - t0}ms)`);

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L-003-AUDIT-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
