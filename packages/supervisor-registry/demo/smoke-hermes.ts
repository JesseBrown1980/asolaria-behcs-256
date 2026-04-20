// smoke-hermes.ts — end-to-end smoke: PROF-HERMES-SUPERVISOR recall through the
// supervisor cache, and verification that its audit events flow into GC+Gulp.

import { refreshAllSupervisors, summonSupervisor } from "../src/cache.ts";
import { logStats, runGc } from "../../omni-gulp-gc/src/gc.ts";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";

const all = refreshAllSupervisors();
console.log("supervisors_compiled=" + all.length);
for (const r of all) {
  console.log("  " + r.corpus.profile_glyph + " (" + r.corpus.refresh_cost_ms + "ms)");
}

const hit1 = summonSupervisor("PROF-HERMES-SUPERVISOR");
console.log("");
console.log("=== first summon (post-refresh cache hit) ===");
console.log("source=" + hit1.source + " age_ms=" + hit1.age_ms);
const facts = hit1.corpus.facts as { total_atoms: number; skill_atoms: number; meta_primitives: number };
console.log("total_atoms=" + facts.total_atoms + " skill_atoms=" + facts.skill_atoms + " meta_primitives=" + facts.meta_primitives);
console.log("sentences:");
for (const s of hit1.corpus.sentences) console.log("  " + s);

const hit2 = summonSupervisor("PROF-HERMES-SUPERVISOR", { forceRefresh: true });
console.log("");
console.log("=== force-refresh (should emit new events) ===");
console.log("source=" + hit2.source + " refresh_cost_ms=" + hit2.corpus.refresh_cost_ms);

console.log("");
console.log("=== GC log stats (now includes hermes-events + supervisor-events) ===");
for (const s of logStats()) {
  const name = s.path.split(/[\\/]/).pop();
  console.log("  " + (name ?? "").padEnd(32) + " exists=" + s.exists + " bytes=" + s.bytes + " lines=" + s.lines);
}

const gc = runGc();
console.log("");
console.log("=== GC run ===");
console.log("any_rotated=" + gc.any_rotated + " ms=" + gc.ms);

const gulp = runGulp();
console.log("");
console.log("=== Gulp pattern extraction ===");
console.log("scanned_lines=" + gulp.scanned_lines);
console.log("top_10_event_kinds:");
for (const k of gulp.top_10_event_kinds.slice(0, 15)) {
  console.log("  " + k.key.padEnd(42) + " count=" + k.count);
}

const pass = facts.total_atoms === 133 && facts.skill_atoms === 127 && facts.meta_primitives === 6;
console.log("");
console.log("PASS=" + pass);
process.exit(pass ? 0 : 1);
