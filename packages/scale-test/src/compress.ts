// packages/scale-test/src/compress.ts — J-compress envelope batch compression
//
// Synthetic J-100k batches showed envelope payloads are highly repetitive
// (same profile shape, same verb, same actor across thousands of rows).
// J-compress measures how much wire + storage we save if we coalesce a
// batch into a compact delta-encoded form — specifically for log replay
// to cold peers and archive snapshots.
//
// Approach:
//   1. Find the most common shape (=> "base" envelope)
//   2. For each envelope, emit only fields that differ
//   3. Header records base + count
//   4. Decompression reverses: base + overlays
//
// Pure in-memory transform — caller decides to write to disk or wire.

export interface CompressedBatch<T> {
  version: "j-compress-v1";
  count: number;
  base: Partial<T>;
  overlays: Array<Partial<T>>;    // per-entry only-diff fields
  glyph_sentence: string;
}

export interface CompressionStats {
  input_bytes: number;
  output_bytes: number;
  compression_ratio: number;     // output/input (lower = better)
  savings_percent: number;
  base_field_count: number;
  avg_overlay_field_count: number;
}

// Compute the "base" envelope: for each field, the most common value across all entries
function computeBase<T extends Record<string, any>>(entries: T[]): Partial<T> {
  if (entries.length === 0) return {};
  const fieldValueCounts: Record<string, Map<string, { value: any; count: number }>> = {};

  for (const e of entries) {
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === "object" && v !== null) continue;  // skip nested for base (kept in overlay)
      const counts = fieldValueCounts[k] ?? (fieldValueCounts[k] = new Map());
      const key = String(v);
      const existing = counts.get(key) ?? { value: v, count: 0 };
      existing.count++;
      counts.set(key, existing);
    }
  }

  const base: Partial<T> = {};
  for (const [k, counts] of Object.entries(fieldValueCounts)) {
    let best: { value: any; count: number } | null = null;
    for (const c of counts.values()) {
      if (!best || c.count > best.count) best = c;
    }
    // Only add to base if the modal value appears in ≥ half the entries
    if (best && best.count >= Math.ceil(entries.length / 2)) {
      (base as any)[k] = best.value;
    }
  }
  return base;
}

export function compressBatch<T extends Record<string, any>>(entries: T[]): CompressedBatch<T> {
  const base = computeBase(entries);
  const baseKeys = Object.keys(base);
  const overlays: Array<Partial<T>> = [];

  for (const e of entries) {
    const overlay: Partial<T> = {};
    for (const [k, v] of Object.entries(e)) {
      const inBase = baseKeys.includes(k);
      if (!inBase || (base as any)[k] !== v) {
        (overlay as any)[k] = v;
      }
    }
    overlays.push(overlay);
  }

  return {
    version: "j-compress-v1",
    count: entries.length,
    base,
    overlays,
    glyph_sentence: `EVT-J-COMPRESS-BATCH · entries=${entries.length} · base-fields=${baseKeys.length} @ M-EYEWITNESS .`,
  };
}

export function decompressBatch<T extends Record<string, any>>(b: CompressedBatch<T>): T[] {
  const out: T[] = [];
  for (const overlay of b.overlays) {
    out.push({ ...b.base, ...overlay } as T);
  }
  return out;
}

export function computeCompressionStats<T extends Record<string, any>>(entries: T[], compressed: CompressedBatch<T>): CompressionStats {
  const inputBytes = JSON.stringify(entries).length;
  const outputBytes = JSON.stringify(compressed).length;
  const ratio = inputBytes === 0 ? 1 : outputBytes / inputBytes;
  const baseFieldCount = Object.keys(compressed.base).length;
  const avgOverlay = compressed.overlays.length === 0 ? 0
    : compressed.overlays.reduce((sum, o) => sum + Object.keys(o).length, 0) / compressed.overlays.length;
  return {
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    compression_ratio: Math.round(ratio * 10000) / 10000,
    savings_percent: Math.round((1 - ratio) * 10000) / 100,
    base_field_count: baseFieldCount,
    avg_overlay_field_count: Math.round(avgOverlay * 100) / 100,
  };
}
