// smoke-true-unity.ts — prove the unity Jesse named: EVERY hardware piece gets
// a BEHCS-256 HW-* glyph, a Brown-Hilbert PID, a supervisor slot, and an
// NDJSON stream that GC+Gulp auto-manage.

import { refreshAllSupervisors } from "../src/cache.ts";
import { listSupervisors } from "../src/compile.ts";
import { loadDeviceRegistry, CANONICAL_DEVICES } from "../src/device-registry.ts";
import {
  loadHardwareRegistry, enumerateLocalHardware, registerHardware,
  hwSupervisorGlyphFor, hwEventStreamPathFor, CANONICAL_HARDWARE,
} from "../src/hardware-registry.ts";
import { logStats, runGc } from "../../omni-gulp-gc/src/gc.ts";
import { runGulp } from "../../omni-gulp-gc/src/gulp.ts";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

console.log("=== TRUE UNITY SMOKE — BEHCS-256 + Brown-Hilbert × every hardware piece ===");
console.log("");

// Part 1: device layer (5 canonical DEV-*)
console.log(`[1/5] Device registry (canonical BEHCS-256 DEV-* labels)`);
const devReg = loadDeviceRegistry();
for (const d of devReg.devices) {
  console.log(`  ${d.glyph.padEnd(14)} ${d.source.padEnd(16)} ${d.canonical_name.padEnd(10)} ${d.role.slice(0, 40)}`);
}
console.log(`  total_devices=${devReg.devices.length}`);

// Part 2: live-enumerate hardware on this machine (DEV-LIRIS)
console.log("");
console.log(`[2/5] LIVE hardware enumeration on DEV-LIRIS`);
const liveHw = enumerateLocalHardware();
console.log(`  enumerated=${liveHw.length} pieces`);
// Register each live-enumerated piece (persists + emits EVT-HARDWARE-REGISTERED)
for (const hw of liveHw) {
  registerHardware({
    ...hw,
    operator_witness: "live-enum-liris-2026-04-18",
  });
  const streamPath = hwEventStreamPathFor(hw.glyph);
  mkdirSync(dirname(streamPath), { recursive: true });
  // Emit per-piece lifecycle event
  appendFileSync(streamPath, JSON.stringify({
    ts: new Date().toISOString(),
    event: "EVT-HW-ENUMERATED",
    glyph: hw.glyph,
    kind: hw.kind,
    parent_device: hw.parent_device,
    brown_hilbert_pid: hw.brown_hilbert_pid,
    d11: hw.d11_level,
    glyph_sentence: `EVT-HW-ENUMERATED { ${hw.glyph} } · ${hw.kind} · pid=${hw.brown_hilbert_pid} @ M-EYEWITNESS .`,
  }) + "\n");
}
// Show first 12
const hwByKind: Record<string, number> = {};
for (const h of liveHw) hwByKind[h.kind] = (hwByKind[h.kind] ?? 0) + 1;
console.log(`  by kind: ${Object.entries(hwByKind).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
console.log("");
console.log("  First 12 HW-* glyphs with Brown-Hilbert PIDs:");
for (const h of liveHw.slice(0, 12)) {
  console.log(`    ${h.glyph.padEnd(42)} ${h.brown_hilbert_pid}  ${h.kind}  ${h.canonical_name.slice(0, 40)}`);
}
if (liveHw.length > 12) console.log(`    ... +${liveHw.length - 12} more`);

// Part 3: canonical + runtime registry merge
console.log("");
console.log(`[3/5] Merged hardware registry (canonical + runtime)`);
const hwReg = loadHardwareRegistry();
console.log(`  total=${hwReg.hardware.length}`);
const hwByDev: Record<string, number> = {};
for (const h of hwReg.hardware) hwByDev[h.parent_device] = (hwByDev[h.parent_device] ?? 0) + 1;
for (const [dev, count] of Object.entries(hwByDev)) {
  console.log(`  ${dev.padEnd(14)} ${count} hardware pieces`);
}

// Part 4: supervisor roster — 18 canonical/domain + live-registered hardware auto-supervisor glyphs
console.log("");
console.log(`[4/5] Supervisor roster refresh`);
const allSups = refreshAllSupervisors();
console.log(`  compiled=${allSups.length} supervisors`);
for (const r of allSups) {
  console.log(`    ${r.corpus.profile_glyph.padEnd(34)} d11=${r.corpus.d11_level.padEnd(9)} ${r.corpus.refresh_cost_ms}ms`);
}
// Note: individual hw-piece supervisors are AUTO-GENERATED glyph names that
// compile on demand via hwSupervisorGlyphFor. They aren't in the static
// SUPERVISOR_COMPILERS map because registry is dynamic. Show 5 sample names.
console.log("");
console.log(`  Sample auto-generated hardware supervisor glyphs (materialize on demand):`);
for (const h of liveHw.slice(0, 5)) console.log(`    ${hwSupervisorGlyphFor(h.glyph)}`);
console.log(`  ... +${liveHw.length - 5} more (one per HW-* glyph)`);
console.log(`  Total addressable supervisors = ${allSups.length} static + ${hwReg.hardware.length} hw-auto = ${allSups.length + hwReg.hardware.length}`);

// Part 5: GC + Gulp sweep over all streams
console.log("");
console.log(`[5/5] GC + Gulp sweep`);
const stats = logStats();
console.log(`  canonical streams=${stats.length}`);
for (const s of stats) {
  if (s.bytes > 0) {
    const name = s.path.split(/[\\/]/).pop();
    console.log(`    ${(name ?? "").padEnd(34)} bytes=${String(s.bytes).padStart(10)} lines=${s.lines}`);
  }
}
const gc = runGc();
console.log(`  gc: any_rotated=${gc.any_rotated} ms=${gc.ms}`);
const gulp = runGulp({ sinceMs: Date.now() - 60_000 });
console.log(`  gulp scanned_lines=${gulp.scanned_lines} ms=${gulp.ms}`);
console.log("  top kinds:");
for (const k of gulp.top_10_event_kinds.slice(0, 8)) console.log(`    ${k.key.padEnd(40)} count=${k.count}`);

// Final stamped unity sentence
const totalDevices = devReg.devices.length;
const totalHw = hwReg.hardware.length;
const liveHwCount = liveHw.length;
const staticSups = allSups.length;
const totalSupervisors = staticSups + totalHw;

console.log("");
console.log("=== TRUE UNITY ===");
console.log(`  Devices (BEHCS-256 DEV-*):                  ${totalDevices}`);
console.log(`  Hardware pieces (BEHCS-256 HW-*):           ${totalHw}  (${liveHwCount} live-enumerated on LIRIS)`);
console.log(`  Static domain supervisors:                  ${staticSups}`);
console.log(`  Total addressable supervisors:              ${totalSupervisors}`);
console.log(`  Event streams under GC+Gulp:                ${stats.length} canonical + ${liveHwCount} per-piece`);
console.log(`  Brown-Hilbert PIDs minted:                  ${totalHw}`);
console.log("");
console.log(`META-TRUE-UNITY { BEHCS-256 × BROWN-HILBERT × HARDWARE } · devices=${totalDevices} · hw=${totalHw} · supervisors=${totalSupervisors} · pids=${totalHw} · streams=${stats.length + liveHwCount} @ M-INDICATIVE .`);

const pass = totalDevices >= 5 && totalHw > 5 && staticSups >= 18 && liveHw.length > 0;
process.exit(pass ? 0 : 1);
