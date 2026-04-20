// Gulp: batch-scan recent events from NDJSON logs, extract patterns, emit
// OP-GULP-SUMMARY{...} glyph sentences that capture the aggregate shape.
//
// The "Gulp 2000" system per memory/project_mistakes_gulp_2000_system.md:
// process batches of events into structured patterns for the mistake-ledger
// feedback loop. This is the minimum-viable first pass — counts + groupings
// + glyph-sentence output. Pattern classification + severity scoring is v2.

import { readFileSync, existsSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOT = join(homedir(), ".asolaria-workers");
const GULP_LEDGER = join(ROOT, "gulp-ledger.ndjson");

export interface GulpConfig {
  /** logs to ingest. Default: the canonical 3. */
  logPaths?: string[];
  /** only events newer than this epoch_ms. Default: last 60 minutes. */
  sinceMs?: number;
  /** emit a glyph-sentence summary per group. Default true. */
  emitSummaries?: boolean;
  /** append summaries to ~/.asolaria-workers/gulp-ledger.ndjson. Default true. */
  persistLedger?: boolean;
}

export interface GulpPattern {
  key: string;
  count: number;
  first_ts?: string;
  last_ts?: string;
  sample?: Record<string, unknown>;
}

export interface GulpResult {
  ran_at: string;
  window_since_ms: number;
  scanned_lines: number;
  skipped_lines: number;
  patterns_by_event_kind: GulpPattern[];
  patterns_by_glyph: GulpPattern[];
  top_10_event_kinds: GulpPattern[];
  summary_sentences: string[];
  ms: number;
}

function defaultLogPaths(): string[] {
  return [
    join(ROOT, "omnispindle-events.ndjson"),
    join(ROOT, "router-events.ndjson"),
    join(ROOT, "hookwall-events.ndjson"),
    join(ROOT, "supervisor-events.ndjson"),
    join(ROOT, "hermes-events.ndjson"),
    join(ROOT, "shannon-events.ndjson"),
    join(ROOT, "omnishannon-events.ndjson"),
    join(ROOT, "instruct-kr-events.ndjson"),
    join(ROOT, "omniflywheel-events.ndjson"),
    join(ROOT, "ebacmap-events.ndjson"),
    join(ROOT, "guardscan-events.ndjson"),
    join(ROOT, "skillbuild-events.ndjson"),
    join(ROOT, "hubsync-events.ndjson"),
    join(ROOT, "smp-convergence-events.ndjson"),
    join(ROOT, "forward-build-events.ndjson"),
    join(ROOT, "omnimets-events.ndjson"),
    join(ROOT, "convergence-events.ndjson"),
    join(ROOT, "stub-acp-events.ndjson"),
    join(ROOT, "dev-liris-events.ndjson"),
    join(ROOT, "dev-acer-events.ndjson"),
    join(ROOT, "dev-falcon-events.ndjson"),
    join(ROOT, "dev-aether-events.ndjson"),
    join(ROOT, "dev-gaia-events.ndjson"),
    join(ROOT, "taskmgr-events.ndjson"),
    join(ROOT, "hardware-registry-events.ndjson"),
    join(ROOT, "device-registry-events.ndjson"),
    join(ROOT, "asolaria-root-events.ndjson"),
    join(ROOT, "vision-events.ndjson"),
    join(ROOT, "comms-events.ndjson"),
    join(ROOT, "omnikeyboard-events.ndjson"),
    join(ROOT, "omnimailbox-events.ndjson"),
    join(ROOT, "omnischeduler-events.ndjson"),
  ];
}

export function runGulp(config: GulpConfig = {}): GulpResult {
  const started = Date.now();
  const logs = config.logPaths ?? defaultLogPaths();
  const sinceMs = config.sinceMs ?? (Date.now() - 60 * 60 * 1000);
  const emit = config.emitSummaries ?? true;
  const persist = config.persistLedger ?? true;

  const eventKindCounts = new Map<string, GulpPattern>();
  const glyphCounts = new Map<string, GulpPattern>();
  let scanned = 0;
  let skipped = 0;

  for (const p of logs) {
    if (!existsSync(p)) continue;
    const st = statSync(p);
    if (st.size === 0) continue;
    // Simple full-read for now — gulp is batch-oriented, files are capped by gc.
    const text = readFileSync(p, "utf-8");
    const lines = text.split("\n");
    for (const line of lines) {
      if (!line) continue;
      let rec: Record<string, unknown>;
      try { rec = JSON.parse(line); }
      catch { skipped++; continue; }
      const ts = rec.ts as string | undefined;
      if (ts) {
        const tsMs = Date.parse(ts);
        if (!isNaN(tsMs) && tsMs < sinceMs) { skipped++; continue; }
      }
      scanned++;
      const kind = (rec.event as string) ?? (rec.kind as string) ?? "unknown";
      const glyph = (rec.glyph as string) ?? (rec.glyph_id as string) ?? "-";

      const k = eventKindCounts.get(kind) ?? { key: kind, count: 0 };
      k.count++;
      k.last_ts = ts ?? k.last_ts;
      if (!k.first_ts) k.first_ts = ts;
      if (!k.sample) k.sample = rec;
      eventKindCounts.set(kind, k);

      const g = glyphCounts.get(glyph) ?? { key: glyph, count: 0 };
      g.count++;
      g.last_ts = ts ?? g.last_ts;
      if (!g.first_ts) g.first_ts = ts;
      glyphCounts.set(glyph, g);
    }
  }

  const eventPatterns = Array.from(eventKindCounts.values()).sort((a, b) => b.count - a.count);
  const glyphPatterns = Array.from(glyphCounts.values()).sort((a, b) => b.count - a.count);
  const top10 = eventPatterns.slice(0, 10);

  const summarySentences: string[] = [];
  if (emit) {
    for (const p of top10) {
      const sentence = `OP-GULP-SUMMARY { ${p.key} · ${p.count} } @ M-EYEWITNESS .`;
      summarySentences.push(sentence);
    }
  }

  if (persist && summarySentences.length > 0) {
    const ledgerLine = JSON.stringify({
      ts: new Date().toISOString(),
      event: "EVT-GULP-LEDGER",
      window_since_ms: sinceMs,
      scanned_lines: scanned,
      top_patterns: top10.map((p) => ({ event: p.key, count: p.count })),
      glyph_sentences: summarySentences,
    }) + "\n";
    try { appendFileSync(GULP_LEDGER, ledgerLine, "utf-8"); } catch { /* non-fatal */ }
  }

  return {
    ran_at: new Date().toISOString(),
    window_since_ms: sinceMs,
    scanned_lines: scanned,
    skipped_lines: skipped,
    patterns_by_event_kind: eventPatterns,
    patterns_by_glyph: glyphPatterns,
    top_10_event_kinds: top10,
    summary_sentences: summarySentences,
    ms: Date.now() - started,
  };
}
