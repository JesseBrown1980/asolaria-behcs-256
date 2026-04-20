import { runGc, runGulp, logStats, listArchive } from "../src/index.ts";

async function main(): Promise<void> {
  console.log("[gc-gulp] current log stats:");
  const stats = logStats();
  for (const s of stats) {
    console.log(`  ${s.path.padEnd(60)} exists=${s.exists} bytes=${s.bytes} lines=${s.lines}`);
  }
  console.log("");

  console.log("[gc-gulp] dry-run gc (default thresholds: 50MB / 100k lines)...");
  const gcResult = runGc();
  console.log(`  ran_at=${gcResult.ran_at} any_rotated=${gcResult.any_rotated} total_archived_bytes=${gcResult.total_bytes_archived} ms=${gcResult.ms}`);
  for (const r of gcResult.rotations) {
    console.log(`    ${r.path.padEnd(60)} rotated=${r.rotated} reason=${r.reason ?? "-"} bytes=${r.bytes_before ?? 0} lines=${r.lines_before ?? 0}${r.error ? " ERR=" + r.error : ""}`);
  }
  console.log("");

  console.log("[gc-gulp] run gulp over last 60min...");
  const gulpResult = runGulp();
  console.log(`  scanned_lines=${gulpResult.scanned_lines} skipped_lines=${gulpResult.skipped_lines} ms=${gulpResult.ms}`);
  console.log(`  top-10 event-kinds:`);
  for (const p of gulpResult.top_10_event_kinds) {
    console.log(`    ${p.key.padEnd(40)} count=${p.count} first=${p.first_ts ?? "-"}`);
  }
  console.log(`  glyph-sentence summaries:`);
  for (const s of gulpResult.summary_sentences) {
    console.log(`    ${s}`);
  }
  console.log("");

  console.log("[gc-gulp] archive dir:");
  const arch = listArchive();
  if (arch.length === 0) console.log("  (empty — no rotations yet)");
  for (const a of arch.slice(0, 10)) {
    console.log(`  ${a.file.padEnd(80)} bytes=${a.bytes} mtime=${a.mtime}`);
  }
  if (arch.length > 10) console.log(`  ... +${arch.length - 10} more`);
  console.log("");

  console.log("=== FINAL_JSON ===");
  console.log(JSON.stringify({
    stats_before: stats,
    gc: {
      ran_at: gcResult.ran_at,
      any_rotated: gcResult.any_rotated,
      total_bytes_archived: gcResult.total_bytes_archived,
      ms: gcResult.ms,
      rotation_count: gcResult.rotations.filter((r) => r.rotated).length,
    },
    gulp: {
      ran_at: gulpResult.ran_at,
      scanned_lines: gulpResult.scanned_lines,
      top_kinds: gulpResult.top_10_event_kinds.map((p) => ({ kind: p.key, count: p.count })),
      summary_count: gulpResult.summary_sentences.length,
      ms: gulpResult.ms,
    },
    archive_file_count: arch.length,
  }, null, 2));

  process.exit(0);
}

main().catch((err) => { console.error("[gc-gulp] fatal:", err); process.exit(2); });
