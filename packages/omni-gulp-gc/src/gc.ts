// Garbage collector: rotate NDJSON logs that exceed size/line thresholds.
// Archives to ~/.asolaria-workers/archive/<basename>-<iso-ts>.ndjson.gz-less
// (we keep uncompressed for glyph introspection; compression is optional v2)
// and emits a glyph summary sentence to the rotated-log-summaries file.
//
// NEVER deletes. Rotates + archives. Preserves audit chain.
// LAW-008 filesystem-is-mirror: every rotation writes a mirror-summary event.

import { statSync, existsSync, renameSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

const ROOT = join(homedir(), ".asolaria-workers");
const ARCHIVE_DIR = join(ROOT, "archive");
const SUMMARY_LOG = join(ROOT, "gc-summaries.ndjson");

export interface GcConfig {
  /** absolute paths of NDJSON logs to watch. Default: the canonical 3. */
  logPaths?: string[];
  /** rotate when bytes >= this threshold. Default 50 MB. */
  maxBytes?: number;
  /** rotate when lines >= this threshold. Default 100k. */
  maxLines?: number;
  /** hard cap — refuse to rotate a single file larger than this (sanity). Default 500 MB. */
  sanityBytes?: number;
}

export interface GcRotation {
  path: string;
  rotated: boolean;
  reason?: "bytes" | "lines" | "none";
  bytes_before?: number;
  lines_before?: number;
  archive_path?: string;
  summary_sentence?: string;
  error?: string;
}

export interface GcResult {
  ran_at: string;
  rotations: GcRotation[];
  any_rotated: boolean;
  total_bytes_archived: number;
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

function countLines(filePath: string): number {
  try {
    const s = readFileSync(filePath, "utf-8");
    if (!s) return 0;
    // Fast-path: count '\n' bytes
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  } catch { return 0; }
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function runGc(config: GcConfig = {}): GcResult {
  const started = Date.now();
  const logs = config.logPaths ?? defaultLogPaths();
  const maxBytes = config.maxBytes ?? 50 * 1024 * 1024;
  const maxLines = config.maxLines ?? 100_000;
  const sanityBytes = config.sanityBytes ?? 500 * 1024 * 1024;

  mkdirSync(ARCHIVE_DIR, { recursive: true });

  const rotations: GcRotation[] = [];
  let totalArchived = 0;

  for (const p of logs) {
    if (!existsSync(p)) {
      rotations.push({ path: p, rotated: false, reason: "none" });
      continue;
    }

    try {
      const st = statSync(p);
      const size = st.size;
      if (size > sanityBytes) {
        rotations.push({
          path: p, rotated: false, error: `file exceeds sanityBytes=${sanityBytes}, refusing`,
          bytes_before: size,
        });
        continue;
      }

      const lines = size > maxBytes ? -1 : countLines(p);
      const rotateByBytes = size >= maxBytes;
      const rotateByLines = lines !== -1 && lines >= maxLines;

      if (!rotateByBytes && !rotateByLines) {
        rotations.push({
          path: p, rotated: false, reason: "none",
          bytes_before: size, lines_before: lines === -1 ? undefined : lines,
        });
        continue;
      }

      // Rotate.
      const archive = join(ARCHIVE_DIR, `${basename(p)}-${nowStamp()}.ndjson`);
      renameSync(p, archive);
      // Re-create empty file so writers can keep going.
      writeFileSync(p, "", "utf-8");

      const summary = `EVT-GC-ROTATED { ${basename(p)} } · ${size} BYTES · ${lines === -1 ? "~" : lines} LINES @ M-EYEWITNESS .`;
      appendFileSync(SUMMARY_LOG, JSON.stringify({
        ts: new Date().toISOString(),
        event: "EVT-GC-ROTATED",
        source: p,
        archive,
        bytes: size,
        lines: lines === -1 ? null : lines,
        reason: rotateByBytes ? "bytes" : "lines",
        glyph_sentence: summary,
      }) + "\n");

      totalArchived += size;
      rotations.push({
        path: p, rotated: true,
        reason: rotateByBytes ? "bytes" : "lines",
        bytes_before: size,
        lines_before: lines === -1 ? undefined : lines,
        archive_path: archive,
        summary_sentence: summary,
      });
    } catch (e) {
      rotations.push({ path: p, rotated: false, error: (e as Error).message });
    }
  }

  return {
    ran_at: new Date().toISOString(),
    rotations,
    any_rotated: rotations.some((r) => r.rotated),
    total_bytes_archived: totalArchived,
    ms: Date.now() - started,
  };
}

export function listArchive(): Array<{ file: string; bytes: number; mtime: string }> {
  if (!existsSync(ARCHIVE_DIR)) return [];
  return readdirSync(ARCHIVE_DIR).map((f) => {
    const full = join(ARCHIVE_DIR, f);
    const s = statSync(full);
    return { file: f, bytes: s.size, mtime: s.mtime.toISOString() };
  }).sort((a, b) => a.mtime < b.mtime ? 1 : -1);
}

export function logStats(logPaths?: string[]): Array<{ path: string; exists: boolean; bytes: number; lines: number }> {
  const logs = logPaths ?? defaultLogPaths();
  return logs.map((p) => {
    if (!existsSync(p)) return { path: p, exists: false, bytes: 0, lines: 0 };
    const s = statSync(p);
    const lines = s.size < 50 * 1024 * 1024 ? countLines(p) : -1;
    return { path: p, exists: true, bytes: s.size, lines };
  });
}
