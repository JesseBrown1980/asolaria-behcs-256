// smoke-gc-supervisors-full-sweep.ts — consolidated audit of the GC+Gulp+Supervisor
// pipeline post-mint + post-cross-pollination. Shows what every supervisor is
// saying, what every event stream holds, what Gulp has extracted, what GC
// would archive, and whether any garbage has accumulated beyond thresholds.

import { refreshAllSupervisors, listCachedSupervisors } from "../src/cache.ts";
import { listSupervisors } from "../src/compile.ts";
import { logStats, runGc, listArchive } from "../../omni-gulp-gc/src/gc.ts";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";

console.log("=== FULL SWEEP — 12 supervisors + 13 event streams + GC + Gulp ===");
console.log("");

// ─── Part 1: Supervisors ─────────────────────────────────────────────────────
console.log("--- 12 SUPERVISORS (instant recall) ---");
const known = listSupervisors();
console.log("known=" + known.length);

const all = refreshAllSupervisors();
console.log("");
console.log("profile".padEnd(34) + "d11        " + "cost_ms  " + "first_sentence");
console.log("".padEnd(34, "-") + "---------  " + "-------  " + "".padEnd(60, "-"));
for (const r of all) {
  const first = r.corpus.sentences[0] ?? "(none)";
  console.log(r.corpus.profile_glyph.padEnd(34) + r.corpus.d11_level.padEnd(11) + (r.corpus.refresh_cost_ms + "ms").padEnd(9) + first.slice(0, 70));
}

console.log("");
console.log("--- supervisor cache on disk (~/.asolaria-workers/supervisors/) ---");
for (const c of listCachedSupervisors()) {
  console.log("  " + c.profile.padEnd(34) + "age=" + c.age_ms + "ms  bytes=" + c.bytes);
}

// ─── Part 2: Event streams ───────────────────────────────────────────────────
console.log("");
console.log("--- 13 CANONICAL EVENT STREAMS (GC+Gulp coverage) ---");
const stats = logStats();
let totalBytes = 0;
let totalLines = 0;
for (const s of stats) {
  const name = s.path.split(/[\\/]/).pop();
  totalBytes += s.bytes;
  totalLines += s.lines >= 0 ? s.lines : 0;
  console.log("  " + (name ?? "").padEnd(32) + " bytes=" + String(s.bytes).padStart(10) + " lines=" + String(s.lines).padStart(6));
}
console.log("  " + "TOTAL".padEnd(32) + " bytes=" + String(totalBytes).padStart(10) + " lines=" + String(totalLines).padStart(6));

// ─── Part 3: GC sweep ────────────────────────────────────────────────────────
console.log("");
console.log("--- GC SWEEP (rotate at 50MB/100k-line thresholds) ---");
const gc = runGc();
console.log("  any_rotated=" + gc.any_rotated + " ms=" + gc.ms + " total_archived=" + gc.total_bytes_archived);
const wouldRotate = gc.rotations.filter((r) => r.rotated);
if (wouldRotate.length > 0) {
  for (const r of wouldRotate) console.log("  ROTATED: " + r.path.split(/[\\/]/).pop() + " → " + (r.archive_path ?? "").split(/[\\/]/).pop());
} else {
  console.log("  (no streams exceeded threshold this sweep)");
}

console.log("");
console.log("--- archive/ directory state ---");
const arch = listArchive();
console.log("  archive_files=" + arch.length);
for (const a of arch.slice(0, 5)) console.log("  " + a.file + " bytes=" + a.bytes + " mtime=" + a.mtime.slice(0, 19));

// ─── Part 4: Gulp pattern extraction ─────────────────────────────────────────
console.log("");
console.log("--- GULP PATTERN EXTRACTION (last hour) ---");
const gulp = runGulp();
console.log("  scanned_lines=" + gulp.scanned_lines + " skipped=" + gulp.skipped_lines + " ms=" + gulp.ms);
console.log("");
console.log("  top event kinds:");
for (const k of gulp.top_10_event_kinds) {
  console.log("    " + k.key.padEnd(42) + " count=" + k.count);
}
if (gulp.summary_sentences.length > 0) {
  console.log("");
  console.log("  glyph summary sentences:");
  for (const s of gulp.summary_sentences.slice(0, 6)) console.log("    " + s);
}

// ─── Verdict ─────────────────────────────────────────────────────────────────
console.log("");
const pass =
  known.length === 12 &&
  all.length === 12 &&
  stats.length === 13 &&
  gulp.scanned_lines > 0 &&
  gulp.top_10_event_kinds.length > 0;

console.log("FULL_SWEEP_PASS=" + pass);
console.log("  supervisors=" + all.length + "/12  streams=" + stats.length + "/13  gulp_scanned=" + gulp.scanned_lines);
process.exit(pass ? 0 : 1);
