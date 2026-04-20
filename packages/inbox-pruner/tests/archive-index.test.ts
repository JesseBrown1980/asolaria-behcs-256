import { buildIndex, query, stats, type ArchiveShard } from "../src/archive-index.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== I-004 archive index tests ===\n");

function mkShard(day: string, lines: any[]): ArchiveShard {
  return { day, path: `/fake/${day}.ndjson`, reader: () => lines.map(l => JSON.stringify(l)).join("\n") };
}

const shardA = mkShard("2026-04-17", [
  { ts: "2026-04-17T10:00:00Z", actor: "liris", verb: "drift-detected", target: "acer" },
  { ts: "2026-04-17T11:00:00Z", actor: "liris", verb: "shannon-scan-dispatch", target: "acer" },
  { ts: "2026-04-17T12:00:00Z", actor: "acer", verb: "shannon-scan-result", target: "liris", signature: { alg: "ed25519" } },
]);
const shardB = mkShard("2026-04-18", [
  { ts: "2026-04-18T10:00:00Z", actor: "liris", verb: "drift-detected", target: "acer" },
  { ts: "2026-04-18T11:00:00Z", actor: "falcon", verb: "shannon-scan-dispatch", target: "acer" },
]);

// T1: buildIndex basic
console.log("T1: buildIndex");
const idx = buildIndex([shardA, shardB]);
assert(idx.total_shards === 2, "2 shards");
assert(idx.total_entries === 5, "5 entries");
assert(Object.keys(idx.by_verb).length === 3, "3 distinct verbs");
assert(Object.keys(idx.by_actor).length === 3, "3 distinct actors");

// T2: by_verb bucket
console.log("\nT2: by_verb");
assert(idx.by_verb["drift-detected"].length === 2, "2 drifts");
assert(idx.by_verb["shannon-scan-dispatch"].length === 2, "2 dispatches");
assert(idx.by_verb["shannon-scan-result"].length === 1, "1 result");

// T3: by_actor bucket
console.log("\nT3: by_actor");
assert(idx.by_actor.liris.length === 3, "3 liris");
assert(idx.by_actor.acer.length === 1, "1 acer");
assert(idx.by_actor.falcon.length === 1, "1 falcon");

// T4: by_day bucket
console.log("\nT4: by_day");
assert(idx.by_day["2026-04-17"].length === 3, "3 on 17th");
assert(idx.by_day["2026-04-18"].length === 2, "2 on 18th");

// T5: signed detection
console.log("\nT5: signed detection");
const signedCount = Object.values(idx.by_day).flat().filter(e => e.signed).length;
assert(signedCount === 1, "1 signed entry");

// T6: query by verb only
console.log("\nT6: query verb");
const r1 = query(idx, { verb: "drift-detected" });
assert(r1.matches.length === 2, "2 matches");
assert(r1.applied_filters.includes("verb=drift-detected"), "filter echoed");

// T7: query by actor + verb intersection
console.log("\nT7: query actor+verb");
const r2 = query(idx, { actor: "liris", verb: "drift-detected" });
assert(r2.matches.length === 2, "2 liris drifts");

// T8: query by day filter
console.log("\nT8: query by day");
const r3 = query(idx, { day: "2026-04-17", verb: "drift-detected" });
assert(r3.matches.length === 1, "1 drift on 17th");

// T9: signed_only
console.log("\nT9: signed_only");
const r4 = query(idx, { signed_only: true });
assert(r4.matches.length === 1, "only 1 signed");
assert(r4.matches[0].verb === "shannon-scan-result", "the signed one");

// T10: since filter
console.log("\nT10: since");
const r5 = query(idx, { since: "2026-04-18T00:00:00Z" });
assert(r5.matches.length === 2, "2 on/after 18th");

// T11: until filter
console.log("\nT11: until");
const r6 = query(idx, { until: "2026-04-17T23:59:59Z" });
assert(r6.matches.length === 3, "3 on 17th only");

// T12: combined filters
console.log("\nT12: combined");
const r7 = query(idx, { actor: "liris", verb: "drift-detected", since: "2026-04-18T00:00:00Z" });
assert(r7.matches.length === 1, "1 liris drift on 18th");

// T13: limit
console.log("\nT13: limit");
const r8 = query(idx, { limit: 2 });
assert(r8.matches.length === 2, "2 returned");

// T14: no matches
console.log("\nT14: no matches");
const r9 = query(idx, { verb: "nope" });
assert(r9.matches.length === 0, "0 matches");

// T15: stats
console.log("\nT15: stats");
const s = stats(idx);
assert(s.total_entries === 5, "5 total");
assert(s.distinct_verbs === 3, "3 verbs");
assert(s.distinct_actors === 3, "3 actors");
assert(s.distinct_days === 2, "2 days");
assert(s.signed_ratio === 0.2, "20% signed");
assert(s.top_verbs[0].count >= 2, "top verb has most");
assert(s.top_actors[0].actor === "liris", "liris top actor");

// T16: handles corrupt lines gracefully
console.log("\nT16: corrupt lines");
const badShard: ArchiveShard = {
  day: "2026-04-19", path: "/fake/bad.ndjson",
  reader: () => 'not-json{{{\n{"ts":"2026-04-19T10:00:00Z","verb":"ok","actor":"x"}\ngarbage{{',
};
const idx2 = buildIndex([badShard]);
assert(idx2.total_entries === 1, "only valid parsed");

// T17: empty shard
console.log("\nT17: empty shard");
const emptyShard: ArchiveShard = { day: "2026-04-01", path: "/fake/empty.ndjson", reader: () => "" };
const idx3 = buildIndex([emptyShard]);
assert(idx3.total_entries === 0, "0 entries");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-I-004-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
