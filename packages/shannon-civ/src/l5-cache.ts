// packages/shannon-civ/src/l5-cache.ts — G-092 L5 verdict memoization cache
//
// Shannon L5 is deterministic given (profile_name, l3_result, l4_result,
// phase expectations). When liris re-dispatches an identical scan we
// currently re-run the full pipeline. G-092 memoizes the L5 output keyed
// by a stable fingerprint so replay-heavy testing + sustained scan
// pressure don't spend CPU re-computing the same decision.
//
// Pure — caller wraps real dispatcher; cache is an in-memory map + an
// optional NDJSON side-file for cold-start warmup.

import { createHash } from "node:crypto";
import type { L3Result, L4Result, L5Verdict } from "./acer-dispatch.ts";

export interface L5CacheKeyInput {
  profile_name: string;
  l3: L3Result;
  l4: L4Result;
  // any extra dimensions caller wants to include in the fingerprint
  extra?: Record<string, string | number | boolean>;
}

export interface L5CacheEntry {
  key: string;
  verdict: L5Verdict;
  reason: string;
  created_at: string;
  last_hit_at: string;
  hit_count: number;
}

export interface L5Cache {
  entries: Map<string, L5CacheEntry>;
  max_size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export function makeL5Cache(max_size: number = 1024): L5Cache {
  return { entries: new Map(), max_size, hits: 0, misses: 0, evictions: 0 };
}

// Stable fingerprint — only fold fields that actually influence L5
export function l5FingerPrint(input: L5CacheKeyInput): string {
  const normalized = {
    profile: input.profile_name,
    l3_verdict: input.l3.verdict,
    l3_resident: input.l3.resident_device,
    l3_halts: [...input.l3.halts_observed].sort(),
    l3_never: [...input.l3.never_performs_observed].sort(),
    l4_evidence: input.l4.evidence,
    l4_phase_met: input.l4.phase_expectation_met,
    l4_l0l2: input.l4.l0_l2_all_ok,
    l4_l3_accepted: input.l4.l3_accepted,
    extra: input.extra ? Object.keys(input.extra).sort().reduce((acc, k) => (acc[k] = input.extra![k], acc), {} as any) : null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 24);
}

export interface CacheLookup {
  hit: boolean;
  entry: L5CacheEntry | null;
  key: string;
}

export function lookup(cache: L5Cache, input: L5CacheKeyInput, now: string = new Date().toISOString()): CacheLookup {
  const key = l5FingerPrint(input);
  const existing = cache.entries.get(key);
  if (existing) {
    existing.last_hit_at = now;
    existing.hit_count++;
    cache.hits++;
    return { hit: true, entry: existing, key };
  }
  cache.misses++;
  return { hit: false, entry: null, key };
}

export function store(cache: L5Cache, key: string, verdict: L5Verdict, reason: string, now: string = new Date().toISOString()): L5CacheEntry {
  // Eviction: LRU by last_hit_at when over max_size
  if (cache.entries.size >= cache.max_size && !cache.entries.has(key)) {
    let oldestKey: string | null = null;
    let oldestTs = "9999-12-31T00:00:00Z";
    for (const [k, e] of cache.entries) {
      if (e.last_hit_at < oldestTs) { oldestTs = e.last_hit_at; oldestKey = k; }
    }
    if (oldestKey) { cache.entries.delete(oldestKey); cache.evictions++; }
  }
  const entry: L5CacheEntry = {
    key, verdict, reason,
    created_at: now, last_hit_at: now, hit_count: 0,
  };
  cache.entries.set(key, entry);
  return entry;
}

export interface CacheStats {
  size: number;
  max_size: number;
  hits: number;
  misses: number;
  evictions: number;
  hit_ratio: number;
  glyph_sentence: string;
}

export function stats(cache: L5Cache): CacheStats {
  const total = cache.hits + cache.misses;
  const ratio = total === 0 ? 0 : cache.hits / total;
  return {
    size: cache.entries.size,
    max_size: cache.max_size,
    hits: cache.hits,
    misses: cache.misses,
    evictions: cache.evictions,
    hit_ratio: ratio,
    glyph_sentence: `EVT-L5-CACHE-STATS · size=${cache.entries.size}/${cache.max_size} · hit=${cache.hits} · miss=${cache.misses} · evict=${cache.evictions} · ratio=${(ratio * 100).toFixed(1)}% @ M-INDICATIVE .`,
  };
}

// Serialize cache for cold-start warmup
export function serializeCache(cache: L5Cache): string {
  const lines: string[] = [];
  for (const e of cache.entries.values()) {
    lines.push(JSON.stringify(e));
  }
  return lines.join("\n");
}

export function loadFromNdjson(cache: L5Cache, text: string): number {
  let loaded = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as L5CacheEntry;
      if (e.key && e.verdict) {
        cache.entries.set(e.key, e);
        loaded++;
      }
    } catch { /* tolerate bad lines */ }
  }
  return loaded;
}
