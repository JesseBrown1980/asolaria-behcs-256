import { makeL3Cache, l3FingerPrint, lookup, store, stats, invalidateOnRegistryChange } from "../src/l3-profile-cache.ts";
import type { L3Result } from "../src/acer-dispatch.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== G-095 L3 profile cache tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkL3(overrides: Partial<L3Result> = {}): L3Result {
  return {
    scan_id: "s1", profile_name: "shannon-recon",
    verdict: "PROFILE_ACER_RESIDENT", resident_device: "DEV-ACER",
    halts_observed: [], never_performs_observed: [], reasons: [],
    ...overrides,
  };
}

// T1: fingerprint stability
console.log("T1: fingerprint stability");
const k1 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] } });
const k2 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] } });
assert(k1 === k2, "same input same key");
assert(k1.length === 20, "20-char");

// T2: different profile → different key
console.log("\nT2: different profile");
const k3 = l3FingerPrint({ profile_name: "q", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] } });
assert(k1 !== k3, "different profile differs");

// T3: host order doesn't matter
console.log("\nT3: host order");
const k4 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["b.com", "a.com"], allowed_paths: ["/"] } });
const k5 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["a.com", "b.com"], allowed_paths: ["/"] } });
assert(k4 === k5, "sorted hosts");

// T4: registry_commit differs → different key
console.log("\nT4: registry commit");
const k6 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] }, registry_commit: "v1" });
const k7 = l3FingerPrint({ profile_name: "p", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] }, registry_commit: "v2" });
assert(k6 !== k7, "registry salts key");

// T5: miss then store then hit
console.log("\nT5: miss then hit");
const cache = makeL3Cache();
const inp = { profile_name: "p", spawn_scope: { allowed_hosts: ["a.com"], allowed_paths: ["/"] } };
const l1 = lookup(cache, inp, NOW);
assert(l1.hit === false, "miss");
assert(cache.misses === 1, "miss counter");
store(cache, l1.key, mkL3(), NOW);
const l2 = lookup(cache, inp, NOW);
assert(l2.hit === true, "hit");
assert(cache.hits === 1, "hit counter");

// T6: hit_count increments
console.log("\nT6: hit count");
const l3 = lookup(cache, inp, NOW);
assert(l3.entry?.hit_count === 2, "hit=2");

// T7: LRU eviction
console.log("\nT7: LRU");
const small = makeL3Cache(3);
for (let i = 0; i < 3; i++) {
  const lk = lookup(small, { profile_name: `p${i}`, spawn_scope: { allowed_hosts: ["a"], allowed_paths: ["/"] } }, new Date(Date.parse(NOW) + i * 1000).toISOString());
  store(small, lk.key, mkL3(), new Date(Date.parse(NOW) + i * 1000).toISOString());
}
assert(small.entries.size === 3, "3 entries");
// Touch p1 to extend its lifetime
lookup(small, { profile_name: "p1", spawn_scope: { allowed_hosts: ["a"], allowed_paths: ["/"] } }, "2026-04-19T06:00:00Z");
// Insert p3 — p0 is oldest
const newLk = lookup(small, { profile_name: "p3", spawn_scope: { allowed_hosts: ["a"], allowed_paths: ["/"] } }, "2026-04-19T06:01:00Z");
store(small, newLk.key, mkL3(), "2026-04-19T06:01:00Z");
assert(small.entries.size === 3, "still 3");
assert(small.evictions === 1, "1 eviction");

// T8: stats
console.log("\nT8: stats");
const s = stats(cache);
assert(s.size === 1, "1 entry");
assert(s.hits === 2, "2 hits");
assert(s.misses === 1, "1 miss");
assert(Math.abs(s.hit_ratio - 2/3) < 0.01, "hit ratio 2/3");

// T9: invalidation on registry change
console.log("\nT9: invalidation");
const c9 = makeL3Cache();
for (let i = 0; i < 5; i++) {
  const lk = lookup(c9, { profile_name: `p${i}`, spawn_scope: { allowed_hosts: ["a"], allowed_paths: ["/"] }, registry_commit: "old" });
  store(c9, lk.key, mkL3(), NOW);
}
assert(c9.entries.size === 5, "5 cached");
const inv = invalidateOnRegistryChange(c9, "old", "new");
assert(inv.cleared === 5, "5 cleared");
assert(c9.entries.size === 0, "cache empty");

// T10: no-op invalidation when commit same
console.log("\nT10: no-op invalidation");
const c10 = makeL3Cache();
const lk10 = lookup(c10, { profile_name: "p", spawn_scope: { allowed_hosts: ["a"], allowed_paths: ["/"] } });
store(c10, lk10.key, mkL3(), NOW);
const inv10 = invalidateOnRegistryChange(c10, "same", "same");
assert(inv10.cleared === 0, "no-op");
assert(c10.entries.size === 1, "still 1 entry");
assert(inv10.glyph_sentence.includes("no-op"), "no-op glyph");

// T11: result preserved through roundtrip
console.log("\nT11: roundtrip");
const customResult = mkL3({ verdict: "PROFILE_LIRIS_RESIDENT", resident_device: "DEV-LIRIS", halts_observed: ["halt-1"] });
const c11 = makeL3Cache();
const lk11 = lookup(c11, { profile_name: "q", spawn_scope: { allowed_hosts: ["b"], allowed_paths: ["/"] } });
store(c11, lk11.key, customResult, NOW);
const l11b = lookup(c11, { profile_name: "q", spawn_scope: { allowed_hosts: ["b"], allowed_paths: ["/"] } });
assert(l11b.entry?.result.verdict === "PROFILE_LIRIS_RESIDENT", "verdict preserved");
assert(l11b.entry?.result.halts_observed[0] === "halt-1", "halts preserved");

// T12: replay workload
console.log("\nT12: replay workload");
const hot = makeL3Cache(100);
const hotInp = { profile_name: "hot", spawn_scope: { allowed_hosts: ["x"], allowed_paths: ["/"] } };
const firstLk = lookup(hot, hotInp);
store(hot, firstLk.key, mkL3(), NOW);
for (let i = 0; i < 500; i++) lookup(hot, hotInp);
const hotStats = stats(hot);
assert(hotStats.hits === 500, "500 hits");
assert(hotStats.misses === 1, "1 miss warmup");
assert(hotStats.hit_ratio > 0.99, ">99% hit ratio");

// T13: glyph
console.log("\nT13: glyph");
assert(s.glyph_sentence.startsWith("EVT-L3-CACHE-STATS"), "prefix");
assert(inv.glyph_sentence.includes("cleared=5"), "cleared count");
assert(inv10.glyph_sentence.includes("no-op"), "no-op note");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-G-095-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
