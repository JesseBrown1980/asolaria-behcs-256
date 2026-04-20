import { synthesizeProposals, renderProposals } from "../src/rule-proposals.ts";
import type { AuditEntry } from "../src/audit.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== L-004 rule-proposal tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: NOW,
    actor: "someone",
    verb: "some-verb",
    target: "acer",
    allowed: true,
    blocking_rule_id: null,
    blocking_reason: null,
    scope_hit: null,
    subject_snapshot: null,
    glyph_sentence: "EVT .",
    ...overrides,
  };
}

// T1: empty log
console.log("T1: empty log");
const r1 = synthesizeProposals({ audit_log: [], now: NOW });
assert(r1.proposals.length === 0, "no proposals");
assert(r1.entries_analyzed === 0, "no entries");
assert(r1.glyph_sentence.includes("proposals=0"), "glyph");

// T2: all allows → no proposals
console.log("\nT2: all allows");
const log2 = Array.from({ length: 50 }, (_, i) => mkEntry({ ts: NOW, allowed: true }));
const r2 = synthesizeProposals({ audit_log: log2, now: NOW });
assert(r2.proposals.length === 0, "no proposals");
assert(r2.entries_denied === 0, "no denies");

// T3: actor hits threshold → actor-block proposal
console.log("\nT3: actor-block");
const log3 = Array.from({ length: 25 }, (_, i) => mkEntry({
  ts: new Date(Date.parse(NOW) - i * 1000).toISOString(),
  actor: "attacker-1", verb: "v", allowed: false, blocking_rule_id: "R-OLD",
}));
const r3 = synthesizeProposals({ audit_log: log3, now: NOW, actor_threshold: 20 });
assert(r3.proposals.length === 1, "1 actor proposal");
assert(r3.proposals[0].kind === "actor-block", "actor-block kind");
assert(r3.proposals[0].subject === "attacker-1", "attacker-1 subject");
assert(r3.proposals[0].seen_count === 25, "25 denials counted");
assert(r3.proposals[0].suggested_rule_id.startsWith("R-ACTOR-ATTACKER_1"), "rule_id shape");

// T4: below threshold → no actor proposal
console.log("\nT4: below threshold");
const log4 = Array.from({ length: 10 }, (_, i) => mkEntry({ ts: NOW, actor: "x", allowed: false }));
const r4 = synthesizeProposals({ audit_log: log4, now: NOW, actor_threshold: 20 });
assert(r4.proposals.length === 0, "no actor proposal");

// T5: verb hits threshold across actors → verb-block
console.log("\nT5: verb-block cross-actor");
const log5 = [
  ...Array.from({ length: 18 }, () => mkEntry({ actor: "a1", verb: "bad-verb", allowed: false })),
  ...Array.from({ length: 18 }, () => mkEntry({ actor: "a2", verb: "bad-verb", allowed: false })),
];
const r5 = synthesizeProposals({ audit_log: log5, now: NOW, verb_threshold: 30 });
assert(r5.proposals.some(p => p.kind === "verb-block" && p.subject === "bad-verb"), "verb-block proposed");

// T6: verb hits threshold from single actor only → no verb proposal (actor-block may fire instead)
console.log("\nT6: single-actor verb → no verb-block");
const log6 = Array.from({ length: 40 }, () => mkEntry({ actor: "a1", verb: "v", allowed: false }));
const r6 = synthesizeProposals({ audit_log: log6, now: NOW, actor_threshold: 100, verb_threshold: 30 });
assert(!r6.proposals.some(p => p.kind === "verb-block"), "no verb-block for single actor");

// T7: subject burst
console.log("\nT7: subject burst");
const base = Date.parse("2026-04-19T04:59:00Z");
const log7 = Array.from({ length: 15 }, (_, i) => mkEntry({
  ts: new Date(base + i * 3000).toISOString(),
  subject_snapshot: "scan-burst-1", actor: `a${i}`, allowed: false,
}));
const r7 = synthesizeProposals({ audit_log: log7, now: NOW, subject_burst_threshold: 10, burst_window_ms: 60_000 });
assert(r7.proposals.some(p => p.kind === "subject-block" && p.subject === "scan-burst-1"), "subject-block proposed");

// T8: subject spread over long time — no burst proposal
console.log("\nT8: non-burst subject");
const log8 = Array.from({ length: 15 }, (_, i) => mkEntry({
  ts: new Date(base + i * 600_000).toISOString(),  // 10 min apart
  subject_snapshot: "scan-slow", allowed: false,
}));
const r8 = synthesizeProposals({ audit_log: log8, now: NOW, subject_burst_threshold: 10, burst_window_ms: 60_000 });
assert(!r8.proposals.some(p => p.kind === "subject-block"), "no burst");

// T9: window filter
console.log("\nT9: window filter");
const log9 = [
  ...Array.from({ length: 25 }, () => mkEntry({ ts: "2026-04-18T00:00:00Z", actor: "old-attacker", allowed: false })),
  ...Array.from({ length: 5 }, () => mkEntry({ ts: NOW, actor: "new-attacker", allowed: false })),
];
const r9 = synthesizeProposals({ audit_log: log9, now: NOW, window_ms: 3600_000, actor_threshold: 20 });
// Only 5 entries in window, none meets threshold → no proposals
assert(r9.proposals.length === 0, "old entries filtered out");
assert(r9.entries_analyzed === 5, "5 in window");

// T10: combined multi-kind
console.log("\nT10: multi-kind");
const combo = [
  ...Array.from({ length: 25 }, () => mkEntry({ actor: "a1", verb: "v-cross", allowed: false })),
  ...Array.from({ length: 20 }, () => mkEntry({ actor: "a2", verb: "v-cross", allowed: false })),
  ...Array.from({ length: 15 }, (_, i) => mkEntry({
    ts: new Date(base + i * 2000).toISOString(), subject_snapshot: "burst-scan", allowed: false,
  })),
];
const r10 = synthesizeProposals({ audit_log: combo, now: NOW, actor_threshold: 20, verb_threshold: 30, subject_burst_threshold: 10 });
const kinds = new Set(r10.proposals.map(p => p.kind));
assert(kinds.has("actor-block"), "actor-block present");
assert(kinds.has("verb-block"), "verb-block present");
assert(kinds.has("subject-block"), "subject-block present");

// T11: render string
console.log("\nT11: render");
const report = renderProposals(r3);
assert(report.includes("FIREWALL RULE PROPOSALS"), "header");
assert(report.includes("actor-block"), "kind shown");
assert(report.includes("attacker-1"), "subject shown");
assert(report.includes("R-ACTOR-ATTACKER_1"), "rule_id shown");

// T12: counts in glyph
console.log("\nT12: glyph");
assert(r10.glyph_sentence.includes("denies=60"), "denies count");
assert(r10.glyph_sentence.includes(`proposals=${r10.proposals.length}`), "proposals count");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-L-004-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
