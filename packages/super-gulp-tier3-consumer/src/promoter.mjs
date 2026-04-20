// Tier-2 → Tier-3 promoter
// Policy (from Liris 3-tier spec 2026-04-20):
//   archive_max_files: 20
//   when inbox-archives/ has > 20 files, move the OLDEST to super-gulp-queue/
// PROF-SUPER-GULP-SUPERVISOR room 37 · PID-H04-A01-W037000000-P037-N00001

import { readdirSync, statSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ARCHIVE_DIR = "C:/Users/acer/Asolaria/data/behcs/inbox-archives";
const SUPER_GULP_QUEUE = "C:/Users/acer/Asolaria/data/behcs/super-gulp-queue";
const ARCHIVE_MAX_FILES = 20;

export function promoteTier2ToTier3() {
  if (!existsSync(ARCHIVE_DIR)) return { ok: false, reason: "archive dir missing" };
  if (!existsSync(SUPER_GULP_QUEUE)) mkdirSync(SUPER_GULP_QUEUE, { recursive: true });

  const files = readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ndjson"))
    .map(e => ({ name: e.name, full: join(ARCHIVE_DIR, e.name), mtime_ms: statSync(join(ARCHIVE_DIR, e.name)).mtime.getTime() }))
    .sort((a, b) => a.mtime_ms - b.mtime_ms);

  const overflow = files.length - ARCHIVE_MAX_FILES;
  if (overflow <= 0) {
    return { ok: true, promoted: 0, archive_count: files.length, note: `archive below cap (${files.length}/${ARCHIVE_MAX_FILES})` };
  }

  const promoted = [];
  for (let i = 0; i < overflow; i++) {
    const src = files[i].full;
    const dst = join(SUPER_GULP_QUEUE, files[i].name);
    try {
      renameSync(src, dst);
      promoted.push({ from: src, to: dst, bytes: statSync(dst).size });
    } catch (e) { promoted.push({ from: src, error: e.message }); }
  }
  return { ok: true, promoted: promoted.length, archive_count_after: files.length - promoted.length, promoted_details: promoted };
}

// Drain-all variant — for post-burst processing (e.g., post-1B-agent fanout catch-up).
// Ignores cap; promotes every .ndjson in ARCHIVE_DIR into super-gulp-queue.
// Use sparingly — this removes tier-2 buffer.
export function drainTier2ToTier3({ keep_latest_n = 0 } = {}) {
  if (!existsSync(ARCHIVE_DIR)) return { ok: false, reason: "archive dir missing" };
  if (!existsSync(SUPER_GULP_QUEUE)) mkdirSync(SUPER_GULP_QUEUE, { recursive: true });
  const files = readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ndjson"))
    .map(e => ({ name: e.name, full: join(ARCHIVE_DIR, e.name), mtime_ms: statSync(join(ARCHIVE_DIR, e.name)).mtime.getTime() }))
    .sort((a, b) => a.mtime_ms - b.mtime_ms);
  const toMove = keep_latest_n > 0 ? files.slice(0, Math.max(0, files.length - keep_latest_n)) : files;
  const moved = [];
  for (const f of toMove) {
    const dst = join(SUPER_GULP_QUEUE, f.name);
    try { renameSync(f.full, dst); moved.push({ from: f.full, to: dst, bytes: statSync(dst).size }); }
    catch (e) { moved.push({ from: f.full, error: e.message }); }
  }
  return { ok: true, drained: moved.length, kept_in_archive: files.length - moved.length, moved_details: moved };
}

export const TIER2_TIER3_CONFIG = {
  archive_dir: ARCHIVE_DIR,
  super_gulp_queue: SUPER_GULP_QUEUE,
  archive_max_files: ARCHIVE_MAX_FILES,
};
