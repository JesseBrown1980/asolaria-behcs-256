// smoke-deep-unity.ts — go deeper. Enumerate chips, busses, ports, cache
// levels. Pipe live Task Manager into the system. Build the hierarchy tree.

import {
  enumerateLocalHardware, registerHardware, loadHardwareRegistry,
  hwSupervisorGlyphFor, runInteractiveTaskManager, snapshotTaskManager,
  type HardwareEntry,
} from "../src/index.ts";
import { logStats, runGc } from "../../omni-gulp-gc/src/gc.ts";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";

console.log("=== DEEP UNITY — chips, busses, ports, cache, + live TaskMgr ===");
console.log("");

// Part 1: DEEP live enumeration with new taxonomy
console.log("[1/4] Deep hardware enumeration on DEV-LIRIS (wmic probes)");
const live = enumerateLocalHardware();
console.log(`  enumerated=${live.length} pieces`);

// Count by kind + by hilbert level
const byKind: Record<string, number> = {};
const byLevel: Record<number, number> = {};
for (const h of live) {
  byKind[h.kind] = (byKind[h.kind] ?? 0) + 1;
  byLevel[h.hilbert_level] = (byLevel[h.hilbert_level] ?? 0) + 1;
}
console.log(`  by kind:  ${Object.entries(byKind).sort().map(([k, n]) => `${k}=${n}`).join(" · ")}`);
console.log(`  by Hilbert level:`);
for (const [lvl, n] of Object.entries(byLevel).sort()) {
  const label = { 2: "board-level", 3: "chip-level", 4: "chip-internal", 5: "bus-level", 6: "port-level" }[Number(lvl)] ?? "(unknown)";
  console.log(`    H${lvl.padStart(2, "0")} ${label.padEnd(16)} count=${n}`);
}

// Register all live pieces (persist + emit EVT-HARDWARE-REGISTERED)
for (const h of live) registerHardware({ ...h, operator_witness: "deep-unity-enum" });

// Part 2: Hierarchy tree (parent_hw chains)
console.log("");
console.log("[2/4] Hierarchy tree — parent_hw chains (showing roots + children)");
const byGlyph = new Map<string, HardwareEntry>();
for (const h of live) byGlyph.set(h.glyph, h);
const children = new Map<string, HardwareEntry[]>();
for (const h of live) {
  if (h.parent_hw) {
    const arr = children.get(h.parent_hw) ?? [];
    arr.push(h);
    children.set(h.parent_hw, arr);
  }
}
const roots = live.filter((h) => h.parent_hw === null);
console.log(`  roots=${roots.length}  nested=${live.length - roots.length}`);
// Show each CHP chip + its cache children
const chips = roots.filter((h) => h.kind === "CHP");
for (const chip of chips) {
  console.log(`  ${chip.glyph}`);
  console.log(`    ${chip.canonical_name.slice(0, 72)}`);
  const kids = children.get(chip.glyph) ?? [];
  for (const k of kids) {
    console.log(`    └─ ${k.glyph}  (${k.kind}, L${k.hilbert_level})`);
    console.log(`       ${k.canonical_name.slice(0, 68)}`);
  }
}

// Show first 5 ports if any
const ports = live.filter((h) => h.kind === "PRT");
if (ports.length > 0) {
  console.log("");
  console.log(`  Ports (first 5 of ${ports.length}):`);
  for (const p of ports.slice(0, 5)) {
    console.log(`    ${p.glyph}  ${p.canonical_name.slice(0, 60)}`);
  }
}

// Show busses
const busses = live.filter((h) => h.kind === "BUS");
if (busses.length > 0) {
  console.log("");
  console.log(`  Busses (first 5 of ${busses.length}):`);
  for (const b of busses.slice(0, 5)) {
    console.log(`    ${b.glyph}  ${b.canonical_name.slice(0, 60)}`);
  }
}

// Part 3: Interactive Task Manager — live pipe into the system for 5 seconds
console.log("");
console.log("[3/4] Interactive Task Manager live pipe (5s × 1s tick)");
const snaps = await runInteractiveTaskManager({
  durationMs: 5000, tickMs: 1000, topN: 5,
  onTick: (snap, tick) => {
    console.log(`  tick ${tick}: procs=${snap.total_processes} threads=${snap.total_threads} mem_used=${Math.round(snap.mem_used_bytes / 2 ** 30)}GB / ${Math.round(snap.mem_total_bytes / 2 ** 30)}GB  top=${snap.top_by_memory[0]?.name ?? "?"}`);
  },
});
console.log(`  ticks_captured=${snaps.length}`);
console.log(`  glyph sentences emitted:`);
for (const s of snaps.slice(0, 3)) console.log(`    ${s.glyph_sentence}`);
console.log(`  ...`);
const lastSnap = snaps[snaps.length - 1];
console.log(`  top-5 processes by working-set memory (last tick):`);
for (const p of lastSnap.top_by_memory) {
  console.log(`    pid=${String(p.pid).padStart(6)}  threads=${String(p.threads).padStart(4)}  ws=${Math.round(p.ws_bytes / 2 ** 20).toString().padStart(6)}MB  ${p.name}`);
}

// Part 4: GC + Gulp sweep
console.log("");
console.log("[4/4] GC + Gulp post-sweep");
const stats = logStats();
const taskmgrStream = stats.find((s) => s.path.endsWith("taskmgr-events.ndjson"));
const hwStream = stats.find((s) => s.path.endsWith("hardware-registry-events.ndjson"));
console.log(`  taskmgr-events.ndjson:            bytes=${taskmgrStream?.bytes ?? 0} lines=${taskmgrStream?.lines ?? 0}`);
console.log(`  hardware-registry-events.ndjson:  bytes=${hwStream?.bytes ?? 0} lines=${hwStream?.lines ?? 0}`);
const gc = runGc();
console.log(`  gc: any_rotated=${gc.any_rotated} ms=${gc.ms}`);
const gulp = runGulp({ sinceMs: Date.now() - 30_000 });
console.log(`  gulp: scanned_lines=${gulp.scanned_lines} ms=${gulp.ms}`);
console.log(`  top event kinds:`);
for (const k of gulp.top_10_event_kinds.slice(0, 6)) console.log(`    ${k.key.padEnd(42)} count=${k.count}`);

// Final stamp
const reg = loadHardwareRegistry();
const supervisorCount = live.length; // one auto-generated supervisor per HW piece
console.log("");
console.log("=== DEEP UNITY ===");
console.log(`  hardware_pieces_live_enumerated:  ${live.length}`);
console.log(`  kinds_present:                    ${Object.keys(byKind).length}  (${Object.keys(byKind).sort().join(" ")})`);
console.log(`  hilbert_levels_present:           ${Object.keys(byLevel).sort().join(",")}`);
console.log(`  deepest_level:                    H${String(Math.max(...Object.keys(byLevel).map(Number))).padStart(2, "0")}`);
console.log(`  cpu_chips:                        ${chips.length}`);
console.log(`  cache_levels_enumerated:          ${live.filter((h) => h.kind === "CHE").length}`);
console.log(`  busses:                           ${busses.length}`);
console.log(`  ports:                            ${ports.length}`);
console.log(`  taskmgr_ticks:                    ${snaps.length}`);
console.log(`  taskmgr_procs_last_tick:          ${lastSnap.total_processes}`);
console.log(`  hw_auto_supervisors:              ${supervisorCount}`);
console.log(`  total_registry_size:              ${reg.hardware.length}`);
console.log("");
console.log(`META-DEEP-UNITY { BEHCS-256 × BROWN-HILBERT × DEEP-HW × TASKMGR } · hw_live=${live.length} · chips=${chips.length} · busses=${busses.length} · ports=${ports.length} · levels={${Object.keys(byLevel).sort().join(",")}} · taskmgr_ticks=${snaps.length} · procs_observed=${lastSnap.total_processes} @ M-INDICATIVE .`);

const pass = live.length > 13 && chips.length > 0 && Object.keys(byKind).length >= 5 && snaps.length >= 3;
process.exit(pass ? 0 : 1);
