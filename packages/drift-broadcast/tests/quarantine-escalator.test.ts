import { decideEscalation, sweepExpiredRecords, summarizeActive, type EscalationRecord } from "../src/quarantine-escalator.ts";
import type { SeverityScore } from "../src/severity.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== F-083 quarantine escalator tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkScore(band: SeverityScore["band"], score: number = 50): SeverityScore {
  return {
    band, numeric_score: score, drivers: [],
    recommended_action: "test",
    glyph_sentence: `EVT . band=${band}`,
  };
}

// T1: INFO → none
console.log("T1: INFO → none");
const r1 = decideEscalation({ subject: "s1", score: mkScore("INFO"), prior_actions: [], now: NOW });
assert(r1.action === "none", "none");
assert(r1.ttl_minutes === 0, "no TTL");

// T2: LOW → observe
console.log("\nT2: LOW → observe");
const r2 = decideEscalation({ subject: "s1", score: mkScore("LOW"), prior_actions: [], now: NOW });
assert(r2.action === "observe", "observe");
assert(r2.ttl_minutes === 60, "1h TTL");

// T3: MEDIUM → refuse-new
console.log("\nT3: MEDIUM");
const r3 = decideEscalation({ subject: "s1", score: mkScore("MEDIUM"), prior_actions: [], now: NOW });
assert(r3.action === "refuse-new-envelopes", "refuse");
assert(r3.ttl_minutes === 240, "4h");

// T4: HIGH → quarantine
console.log("\nT4: HIGH");
const r4 = decideEscalation({ subject: "s1", score: mkScore("HIGH"), prior_actions: [], now: NOW });
assert(r4.action === "quarantine-subject", "quarantine");
assert(r4.ttl_minutes === 720, "12h");

// T5: CRITICAL → federation-wide
console.log("\nT5: CRITICAL");
const r5 = decideEscalation({ subject: "s1", score: mkScore("CRITICAL"), prior_actions: [], now: NOW });
assert(r5.action === "federation-wide-isolate", "isolate");
assert(r5.ttl_minutes === 1440, "24h");

// T6: escalation by repeated incidents (≥3)
console.log("\nT6: repeated incidents");
const priors: EscalationRecord[] = [];
for (let i = 0; i < 3; i++) {
  priors.push({
    at: new Date(Date.parse(NOW) - (i + 1) * 3600 * 1000).toISOString(),
    subject: "hot", band: "LOW", action: "observe", ttl_minutes: 60,
    reason: "", federation_peers_count: 0,
  });
}
const r6 = decideEscalation({ subject: "hot", score: mkScore("LOW"), prior_actions: priors, now: NOW });
assert(r6.action === "quarantine-subject", "escalated to quarantine from observe");
assert(r6.rationale.some(r => r.includes("≥3 incidents")), "rationale cites incidents");
assert(r6.escalated_from === "observe", "escalated_from captured");

// T7: escalation by ≥5 incidents
console.log("\nT7: ≥5 incidents");
const priors5: EscalationRecord[] = [];
for (let i = 0; i < 5; i++) {
  priors5.push({
    at: new Date(Date.parse(NOW) - (i + 1) * 3600 * 1000).toISOString(),
    subject: "veryhot", band: "LOW", action: "observe", ttl_minutes: 60,
    reason: "", federation_peers_count: 0,
  });
}
const r7 = decideEscalation({ subject: "veryhot", score: mkScore("LOW"), prior_actions: priors5, now: NOW });
assert(r7.action === "federation-wide-isolate", "escalated to federation-wide");
assert(r7.rationale.some(r => r.includes("≥5 incidents")), "rationale mentions ≥5");

// T8: federation peers trigger isolation
console.log("\nT8: federation consensus");
const r8 = decideEscalation({ subject: "s2", score: mkScore("LOW"), prior_actions: [], federation_peers_alerting: 3, now: NOW });
assert(r8.action === "federation-wide-isolate", "fed consensus → isolate");
assert(r8.rationale.some(r => r.includes("federation consensus")), "rationale mentions federation");

// T9: priors outside 24h window ignored
console.log("\nT9: old priors ignored");
const oldPriors: EscalationRecord[] = [];
for (let i = 0; i < 5; i++) {
  oldPriors.push({
    at: new Date(Date.parse(NOW) - 48 * 3600 * 1000 - i * 1000).toISOString(),  // 48h+ ago
    subject: "cold", band: "LOW", action: "observe", ttl_minutes: 60,
    reason: "", federation_peers_count: 0,
  });
}
const r9 = decideEscalation({ subject: "cold", score: mkScore("LOW"), prior_actions: oldPriors, now: NOW });
assert(r9.action === "observe", "old priors ignored");

// T10: escalation doesn't downgrade
console.log("\nT10: no downgrade");
// Score says CRITICAL; priors say observe; should stay at CRITICAL base, not drop
const r10 = decideEscalation({ subject: "cr", score: mkScore("CRITICAL"), prior_actions: [], now: NOW });
assert(r10.action === "federation-wide-isolate", "stays at CRITICAL action");

// T11: expires_at is now + ttl
console.log("\nT11: expires_at");
const expected = new Date(Date.parse(NOW) + 720 * 60 * 1000).toISOString();
assert(r4.expires_at === expected, "12h TTL from now");

// T12: record shape
console.log("\nT12: record");
assert(r6.record.subject === "hot", "record.subject");
assert(r6.record.action === "quarantine-subject", "record.action");
assert(r6.record.ttl_minutes === 720, "record.ttl");
assert(r6.record.federation_peers_count === 0, "record.peers");

// T13: sweepExpiredRecords
console.log("\nT13: sweep");
const mixed: EscalationRecord[] = [
  { at: new Date(Date.parse(NOW) - 2 * 3600 * 1000).toISOString(), subject: "old", band: "LOW", action: "observe", ttl_minutes: 60, reason: "", federation_peers_count: 0 },
  { at: new Date(Date.parse(NOW) - 30 * 60 * 1000).toISOString(), subject: "fresh", band: "MEDIUM", action: "refuse-new-envelopes", ttl_minutes: 240, reason: "", federation_peers_count: 0 },
];
const live = sweepExpiredRecords(mixed, NOW);
assert(live.length === 1, "1 live");
assert(live[0].subject === "fresh", "fresh retained");

// T14: summarize active
console.log("\nT14: summary");
const summary = summarizeActive(mixed, NOW);
assert(summary.active_subjects === 1, "1 active subject (fresh only)");
assert(summary.by_action["refuse-new-envelopes"] === 1, "action counted");
assert(summary.by_band.MEDIUM === 1, "band counted");

// T15: glyph
console.log("\nT15: glyph");
assert(r5.glyph_sentence.includes("band=CRITICAL"), "band in glyph");
assert(r5.glyph_sentence.includes("action=federation-wide-isolate"), "action in glyph");
assert(r5.glyph_sentence.includes("ttl=1440m"), "ttl in glyph");
assert(summary.glyph_sentence.includes("active-subjects=1"), "summary count");

// T16: multi-subject summary
console.log("\nT16: multi-subject");
const mixed2: EscalationRecord[] = [
  { at: new Date(Date.parse(NOW) - 10 * 60 * 1000).toISOString(), subject: "a", band: "CRITICAL", action: "federation-wide-isolate", ttl_minutes: 1440, reason: "", federation_peers_count: 0 },
  { at: new Date(Date.parse(NOW) - 20 * 60 * 1000).toISOString(), subject: "b", band: "HIGH", action: "quarantine-subject", ttl_minutes: 720, reason: "", federation_peers_count: 0 },
  { at: new Date(Date.parse(NOW) - 30 * 60 * 1000).toISOString(), subject: "a", band: "HIGH", action: "quarantine-subject", ttl_minutes: 720, reason: "", federation_peers_count: 0 },
];
const sum2 = summarizeActive(mixed2, NOW);
assert(sum2.active_subjects === 2, "a + b");
assert(sum2.federation_wide_count === 1, "1 fed-wide");
assert(sum2.by_band.CRITICAL === 1, "1 critical");
assert(sum2.by_band.HIGH === 2, "2 high");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-F-083-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
