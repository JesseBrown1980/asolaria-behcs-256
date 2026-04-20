import { makeL5Cache, l5FingerPrint, lookup, store, stats, serializeCache, loadFromNdjson } from "../src/l5-cache.ts";
import type { L3Result, L4Result } from "../src/acer-dispatch.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== G-092 L5 cache tests ===\n");

const NOW = "2026-04-19T05:00:00Z";

function mkL3(overrides: Partial<L3Result> = {}): L3Result {
  return {
    scan_id: "s1",
    profile_name: "shannon-recon",
    verdict: "PROFILE_ACER_RESIDENT",
    resident_device: "DEV-ACER",
    halts_observed: [],
    never_performs_observed: [],
    reasons: [],
    ...overrides,
  };
}
function mkL4(overrides: Partial<L4Result> = {}): L4Result {
  return {
    scan_id: "s1",
    evidence: "STRONG",
    phase_expectation_met: true,
    l0_l2_all_ok: true,
    l3_accepted: true,
    notes: [],
    ...overrides,
  };
}

// T1: identical input → identical fingerprint
console.log("T1: fingerprint stability");
const fp1 = l5FingerPrint({ profile_name: "p1", l3: mkL3(), l4: mkL4() });
const fp2 = l5FingerPrint({ profile_name: "p1", l3: mkL3(), l4: mkL4() });
assert(fp1 === fp2, "same input same fingerprint");
assert(fp1.length === 24, "24-char hash slice");

// T2: different profile → different fingerprint
console.log("\nT2: different input");
const fp3 = l5FingerPrint({ profile_name: "p2", l3: mkL3(), l4: mkL4() });
assert(fp1 !== fp3, "different profile differs");

// T3: halts_observed order doesn't matter
console.log("\nT3: halt order independence");
const fpA = l5FingerPrint({ profile_name: "p", l3: mkL3({ halts_observed: ["a", "b"] }), l4: mkL4() });
const fpB = l5FingerPrint({ profile_name: "p", l3: mkL3({ halts_observed: ["b", "a"] }), l4: mkL4() });
assert(fpA === fpB, "sorted — order ignored");

// T4: cache miss → store → cache hit
console.log("\nT4: miss then hit");
const cache = makeL5Cache();
const input = { profile_name: "p1", l3: mkL3(), l4: mkL4() };
const look1 = lookup(cache, input, NOW);
assert(look1.hit === false, "first miss");
assert(cache.misses === 1, "miss counted");
store(cache, look1.key, "promote", "all green", NOW);
const look2 = lookup(cache, input, "2026-04-19T06:00:00Z");
assert(look2.hit === true, "second hit");
assert(look2.entry?.verdict === "promote", "verdict retrieved");
assert(look2.entry?.hit_count === 1, "hit count=1");
assert(look2.entry?.last_hit_at === "2026-04-19T06:00:00Z", "last_hit_at updated");
assert(cache.hits === 1, "hit counted");

// T5: hit_count increments
console.log("\nT5: hit count increments");
const look3 = lookup(cache, input, "2026-04-19T07:00:00Z");
const look3Count = look3.entry?.hit_count;
assert(look3Count === 2, "hit=2");
const look4 = lookup(cache, input, "2026-04-19T08:00:00Z");
const look4Count = look4.entry?.hit_count;
assert(look4Count === 3, "hit=3");

// T6: LRU eviction when full
console.log("\nT6: LRU eviction");
const small = makeL5Cache(3);
for (let i = 0; i < 3; i++) {
  const inp = { profile_name: `p${i}`, l3: mkL3(), l4: mkL4() };
  const l = lookup(small, inp, new Date(Date.parse(NOW) + i * 1000).toISOString());
  store(small, l.key, "promote", "r", new Date(Date.parse(NOW) + i * 1000).toISOString());
}
assert(small.entries.size === 3, "full at 3");
// Touch p1 to make it not-LRU
lookup(small, { profile_name: "p1", l3: mkL3(), l4: mkL4() }, "2026-04-19T05:10:00Z");
// Now add p3 — p0 should evict (oldest last_hit_at)
const inp3 = { profile_name: "p3", l3: mkL3(), l4: mkL4() };
const l3look = lookup(small, inp3, "2026-04-19T05:11:00Z");
store(small, l3look.key, "halt", "r", "2026-04-19T05:11:00Z");
assert(small.entries.size === 3, "still 3 after evict+insert");
assert(small.evictions === 1, "1 eviction counted");
// p0 should be gone
const p0Fp = l5FingerPrint({ profile_name: "p0", l3: mkL3(), l4: mkL4() });
assert(!small.entries.has(p0Fp), "p0 evicted");
// p1, p2, p3 should remain
const p1Fp = l5FingerPrint({ profile_name: "p1", l3: mkL3(), l4: mkL4() });
assert(small.entries.has(p1Fp), "p1 retained");

// T7: stats
console.log("\nT7: stats");
const s = stats(cache);
assert(s.size === 1, "1 entry");
assert(s.hits === 3, "3 hits");
assert(s.misses === 1, "1 miss");
assert(s.hit_ratio === 0.75, "75% ratio");
assert(s.glyph_sentence.includes("ratio=75.0%"), "ratio in glyph");

// T8: serialization roundtrip
console.log("\nT8: serialization roundtrip");
const text = serializeCache(cache);
assert(text.includes("promote"), "verdict serialized");
const cache2 = makeL5Cache();
const loaded = loadFromNdjson(cache2, text);
assert(loaded === 1, "1 entry loaded");
const restoredLookup = lookup(cache2, input, NOW);
assert(restoredLookup.hit === true, "warm-start hit");
assert(restoredLookup.entry?.verdict === "promote", "verdict preserved");

// T9: corrupt NDJSON tolerance
console.log("\nT9: corrupt NDJSON");
const cache3 = makeL5Cache();
const loadedCorrupt = loadFromNdjson(cache3, "not-json{{{\n{\"key\":\"kx\",\"verdict\":\"halt\",\"reason\":\"ok\",\"created_at\":\"t\",\"last_hit_at\":\"t\",\"hit_count\":0}\ngarbage");
assert(loadedCorrupt === 1, "only valid line loaded");
assert(cache3.entries.size === 1, "1 entry in cache");

// T10: 500-lookup replay workload
console.log("\nT10: replay workload");
const hot = makeL5Cache(100);
const hotInp = { profile_name: "hot-profile", l3: mkL3(), l4: mkL4() };
const hotFirst = lookup(hot, hotInp, NOW);
store(hot, hotFirst.key, "promote", "hot", NOW);
for (let i = 0; i < 500; i++) lookup(hot, hotInp);
const hotStats = stats(hot);
assert(hotStats.hits === 500, "500 hits in replay");
assert(hotStats.misses === 1, "1 miss at warmup");
assert(hotStats.hit_ratio > 0.99, "hit ratio > 99%");

// T11: extra dimensions in fingerprint
console.log("\nT11: extra dimensions");
const fpExtra1 = l5FingerPrint({ profile_name: "p", l3: mkL3(), l4: mkL4(), extra: { host: "a" } });
const fpExtra2 = l5FingerPrint({ profile_name: "p", l3: mkL3(), l4: mkL4(), extra: { host: "b" } });
const fpNoExtra = l5FingerPrint({ profile_name: "p", l3: mkL3(), l4: mkL4() });
assert(fpExtra1 !== fpExtra2, "extra.host differs");
assert(fpExtra1 !== fpNoExtra, "with-extra differs from without");

// T12: extra key order independence
console.log("\nT12: extra key order independence");
const fpOrderA = l5FingerPrint({ profile_name: "p", l3: mkL3(), l4: mkL4(), extra: { a: 1, b: 2 } });
const fpOrderB = l5FingerPrint({ profile_name: "p", l3: mkL3(), l4: mkL4(), extra: { b: 2, a: 1 } });
assert(fpOrderA === fpOrderB, "extra-key order independent");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-G-092-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
