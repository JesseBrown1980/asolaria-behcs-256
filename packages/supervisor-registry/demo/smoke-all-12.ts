// smoke-all-12.ts — refresh every supervisor, force a second round to emit
// per-profile events, then verify GC logStats sees all 10 canonical streams and
// Gulp picks up the new event-kinds (EVT-SHANNON-RECALLED, EVT-OMNISHANNON-RECALLED,
// EVT-INSTRUCT-KR-RECALLED, EVT-OMNIFLYWHEEL-RECALLED, EVT-EBACMAP-RECALLED).

import { refreshAllSupervisors, summonSupervisor } from "../src/cache.ts";
import { listSupervisors } from "../src/compile.ts";
import { logStats, runGc } from "../../omni-gulp-gc/src/gc.ts";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";

console.log("=== known supervisors ===");
const known = listSupervisors();
for (const p of known) console.log("  " + p);
console.log("  total=" + known.length);

console.log("");
console.log("=== refresh all (fresh compile per profile → events emitted) ===");
const all = refreshAllSupervisors();
for (const r of all) {
  console.log("  " + r.corpus.profile_glyph.padEnd(34) + " d11=" + r.corpus.d11_level.padEnd(9) + " " + r.corpus.refresh_cost_ms + "ms");
}

console.log("");
console.log("=== first sentence of each ===");
for (const r of all) console.log("  " + r.corpus.sentences[0]);

console.log("");
console.log("=== force-refresh the 5 new profiles again (second event) ===");
const newOnes = [
  "PROF-SHANNON-SUPERVISOR",
  "PROF-OMNISHANNON-SUPERVISOR",
  "PROF-INSTRUCT-KR-SUPERVISOR",
  "PROF-OMNIFLYWHEEL-SUPERVISOR",
  "PROF-EBACMAP-SUPERVISOR",
];
for (const p of newOnes) {
  const hit = summonSupervisor(p, { forceRefresh: true });
  const keys = Object.keys(hit.corpus.facts).slice(0, 4).join(",");
  console.log("  " + p.padEnd(34) + " facts_keys[0..3]=" + keys);
}

console.log("");
console.log("=== GC logStats (10 streams now) ===");
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
console.log("=== Gulp pattern extraction (includes new event kinds) ===");
console.log("scanned_lines=" + gulp.scanned_lines);
for (const k of gulp.top_10_event_kinds.slice(0, 20)) {
  console.log("  " + k.key.padEnd(42) + " count=" + k.count);
}

// PASS: all 12 supervisors compile, all 5 new per-profile streams exist.
const ls = logStats();
const byName: Record<string, number> = {};
for (const s of ls) {
  const name = s.path.split(/[\\/]/).pop();
  if (name) byName[name] = s.bytes;
}
const requiredStreams = [
  "supervisor-events.ndjson",
  "hermes-events.ndjson",
  "shannon-events.ndjson",
  "omnishannon-events.ndjson",
  "instruct-kr-events.ndjson",
  "omniflywheel-events.ndjson",
  "ebacmap-events.ndjson",
];
const missing = requiredStreams.filter((s) => !(byName[s] > 0));
const pass = all.length >= 12 && missing.length === 0;
console.log("");
console.log("PASS=" + pass + " supervisors=" + all.length + " missing_streams=" + missing.length + (missing.length ? " [" + missing.join(",") + "]" : ""));
process.exit(pass ? 0 : 1);
