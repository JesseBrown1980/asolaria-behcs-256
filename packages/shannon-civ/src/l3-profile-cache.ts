// packages/shannon-civ/src/l3-profile-cache.ts — G-095 L3 profile cache
//
// G-092 cached L5 verdicts. L3 classification is also deterministic given
// (profile_name, spawn_request-scope-signature, registry state) — cache
// it so repeated dispatches of the same profile don't re-do the classify.
//
// Mirror of G-092 shape, different key derivation.

import { createHash } from "node:crypto";
import type { L3Result, L3Verdict } from "./acer-dispatch.ts";
import type { SpawnRequest } from "./profile-schema.ts";

export interface L3CacheKeyInput {
  profile_name: string;
  spawn_scope: SpawnRequest["scope"];        // allowed_hosts + allowed_paths
  registry_commit?: string;                   // optional — salt by registry version
}

export interface L3CacheEntry {
  key: string;
  result: L3Result;
  created_at: string;
  last_hit_at: string;
  hit_count: number;
}

export interface L3Cache {
  entries: Map<string, L3CacheEntry>;
  max_size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export function makeL3Cache(max_size: number = 512): L3Cache {
  return { entries: new Map(), max_size, hits: 0, misses: 0, evictions: 0 };
}

export function l3FingerPrint(input: L3CacheKeyInput): string {
  const normalized = {
    profile: input.profile_name,
    hosts: [...(input.spawn_scope.allowed_hosts ?? [])].sort(),
    paths: [...(input.spawn_scope.allowed_paths ?? [])].sort(),
    registry: input.registry_commit ?? null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 20);
}

export function lookup(cache: L3Cache, input: L3CacheKeyInput, now: string = new Date().toISOString()): { hit: boolean; entry: L3CacheEntry | null; key: string } {
  const key = l3FingerPrint(input);
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

export function store(cache: L3Cache, key: string, result: L3Result, now: string = new Date().toISOString()): L3CacheEntry {
  if (cache.entries.size >= cache.max_size && !cache.entries.has(key)) {
    let oldestKey: string | null = null;
    let oldestTs = "9999-12-31T00:00:00Z";
    for (const [k, e] of cache.entries) {
      if (e.last_hit_at < oldestTs) { oldestTs = e.last_hit_at; oldestKey = k; }
    }
    if (oldestKey) { cache.entries.delete(oldestKey); cache.evictions++; }
  }
  const entry: L3CacheEntry = { key, result, created_at: now, last_hit_at: now, hit_count: 0 };
  cache.entries.set(key, entry);
  return entry;
}

export interface L3CacheStats {
  size: number;
  max_size: number;
  hits: number;
  misses: number;
  evictions: number;
  hit_ratio: number;
  glyph_sentence: string;
}

export function stats(cache: L3Cache): L3CacheStats {
  const total = cache.hits + cache.misses;
  const ratio = total === 0 ? 0 : cache.hits / total;
  return {
    size: cache.entries.size,
    max_size: cache.max_size,
    hits: cache.hits, misses: cache.misses, evictions: cache.evictions,
    hit_ratio: ratio,
    glyph_sentence: `EVT-L3-CACHE-STATS · size=${cache.entries.size}/${cache.max_size} · hit=${cache.hits} · miss=${cache.misses} · evict=${cache.evictions} · ratio=${(ratio * 100).toFixed(1)}% @ M-INDICATIVE .`,
  };
}

// Invalidate cache on registry change
export function invalidateOnRegistryChange(cache: L3Cache, old_commit: string, new_commit: string): { cleared: number; glyph_sentence: string } {
  if (old_commit === new_commit) {
    return { cleared: 0, glyph_sentence: `EVT-L3-CACHE-INVALIDATION · no-op · commit=${new_commit} @ M-INDICATIVE .` };
  }
  const cleared = cache.entries.size;
  cache.entries.clear();
  return {
    cleared,
    glyph_sentence: `EVT-L3-CACHE-INVALIDATION · cleared=${cleared} · from=${old_commit} · to=${new_commit} @ M-EYEWITNESS .`,
  };
}
