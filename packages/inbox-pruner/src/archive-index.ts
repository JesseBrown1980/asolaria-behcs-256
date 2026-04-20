// packages/inbox-pruner/src/archive-index.ts — I-004 archive search index
//
// After I-001 prunes heartbeats into archive NDJSON shards (by day),
// operators need to find specific historical events fast. I-004 builds
// a small in-memory index over the archive shards keyed by (actor, verb,
// day) so dashboards can pull "show me all drift-detected from liris on
// 2026-04-17" in O(1) after first pass.
//
// Pure — shard list + reader fn injected; no fs in this module so tests
// stay hermetic.

export interface ArchiveShard {
  day: string;            // "2026-04-18"
  path: string;           // filename for operator reference
  reader: () => string;   // returns NDJSON text (caller injects fs.readFileSync)
}

export interface IndexedEntry {
  ts: string;
  actor: string | null;
  verb: string | null;
  target: string | null;
  signed: boolean;
  day: string;
  offset: number;           // line offset in shard (for quick re-read)
}

export interface ArchiveIndex {
  built_at: string;
  total_shards: number;
  total_entries: number;
  by_verb: Record<string, IndexedEntry[]>;
  by_actor: Record<string, IndexedEntry[]>;
  by_day: Record<string, IndexedEntry[]>;
  glyph_sentence: string;
}

export function buildIndex(shards: ArchiveShard[]): ArchiveIndex {
  const byVerb: Record<string, IndexedEntry[]> = {};
  const byActor: Record<string, IndexedEntry[]> = {};
  const byDay: Record<string, IndexedEntry[]> = {};
  let total = 0;

  for (const shard of shards) {
    const text = shard.reader();
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const entry: IndexedEntry = {
          ts: obj.ts ?? obj.received_at ?? "",
          actor: obj.actor ?? obj.from ?? null,
          verb: obj.verb ?? null,
          target: obj.target ?? obj.to ?? null,
          signed: !!(obj.signature || obj.entry_sig || obj._sig_check?.verdict === "VERIFIED"),
          day: shard.day,
          offset: i,
        };
        total++;
        if (entry.verb) (byVerb[entry.verb] ??= []).push(entry);
        if (entry.actor) (byActor[entry.actor] ??= []).push(entry);
        (byDay[shard.day] ??= []).push(entry);
      } catch {
        // skip bad line
      }
    }
  }

  return {
    built_at: new Date().toISOString(),
    total_shards: shards.length,
    total_entries: total,
    by_verb: byVerb,
    by_actor: byActor,
    by_day: byDay,
    glyph_sentence: `EVT-ARCHIVE-INDEX-BUILT · shards=${shards.length} · entries=${total} · verbs=${Object.keys(byVerb).length} · actors=${Object.keys(byActor).length} @ M-INDICATIVE .`,
  };
}

export interface QueryInput {
  actor?: string;
  verb?: string;
  day?: string;
  signed_only?: boolean;
  since?: string;
  until?: string;
  limit?: number;
}

export interface QueryResult {
  total_candidates: number;
  matches: IndexedEntry[];
  applied_filters: string[];
  glyph_sentence: string;
}

export function query(index: ArchiveIndex, q: QueryInput): QueryResult {
  const filters: string[] = [];
  // Seed from narrowest dimension available
  let candidates: IndexedEntry[] | null = null;
  if (q.verb) { candidates = index.by_verb[q.verb] ?? []; filters.push(`verb=${q.verb}`); }
  if (q.actor) {
    const actorSet = index.by_actor[q.actor] ?? [];
    candidates = candidates ? candidates.filter(e => actorSet.includes(e)) : [...actorSet];
    filters.push(`actor=${q.actor}`);
  }
  if (q.day) {
    const daySet = index.by_day[q.day] ?? [];
    candidates = candidates ? candidates.filter(e => daySet.includes(e)) : [...daySet];
    filters.push(`day=${q.day}`);
  }
  if (candidates === null) {
    // No narrowing — collect all
    candidates = Object.values(index.by_day).flat();
  }
  const totalBeforeRefine = candidates.length;

  let matches = candidates;
  if (q.signed_only) { matches = matches.filter(e => e.signed); filters.push("signed_only"); }
  if (q.since) { matches = matches.filter(e => e.ts >= q.since!); filters.push(`since=${q.since}`); }
  if (q.until) { matches = matches.filter(e => e.ts <= q.until!); filters.push(`until=${q.until}`); }

  if (q.limit) { matches = matches.slice(0, q.limit); filters.push(`limit=${q.limit}`); }

  return {
    total_candidates: totalBeforeRefine,
    matches,
    applied_filters: filters,
    glyph_sentence: `EVT-ARCHIVE-QUERY · candidates=${totalBeforeRefine} · matches=${matches.length} · filters=[${filters.join(",")}] @ M-INDICATIVE .`,
  };
}

export interface IndexStats {
  total_entries: number;
  distinct_verbs: number;
  distinct_actors: number;
  distinct_days: number;
  signed_ratio: number;
  top_verbs: Array<{ verb: string; count: number }>;
  top_actors: Array<{ actor: string; count: number }>;
}

export function stats(index: ArchiveIndex): IndexStats {
  let signed = 0, total = 0;
  for (const entries of Object.values(index.by_day)) {
    for (const e of entries) {
      total++;
      if (e.signed) signed++;
    }
  }
  const topVerbs = Object.entries(index.by_verb).map(([verb, arr]) => ({ verb, count: arr.length }))
    .sort((a, b) => b.count - a.count).slice(0, 5);
  const topActors = Object.entries(index.by_actor).map(([actor, arr]) => ({ actor, count: arr.length }))
    .sort((a, b) => b.count - a.count).slice(0, 5);
  return {
    total_entries: total,
    distinct_verbs: Object.keys(index.by_verb).length,
    distinct_actors: Object.keys(index.by_actor).length,
    distinct_days: Object.keys(index.by_day).length,
    signed_ratio: total === 0 ? 0 : signed / total,
    top_verbs: topVerbs,
    top_actors: topActors,
  };
}
