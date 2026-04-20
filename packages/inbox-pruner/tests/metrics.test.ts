import { emptyMetrics, foldRun, saveMetrics, loadMetrics, appendRunEvent, renderPrometheus, renderGlyph } from "../src/metrics.ts";
import type { PruneResult } from "../src/pruner.ts";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== I-003 pruner metrics tests ===\n");

const TMP = "C:/asolaria-acer/tmp/i003-metrics-test";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

function mkResult(overrides: Partial<PruneResult> = {}): PruneResult {
  return {
    total_in: 1000,
    kept: 100,
    archived_by_day: { "2026-04-18": 900 },
    signed_preserved: 5,
    allowlist_preserved: 10,
    recent_preserved: 85,
    heartbeats_archived: 895,
    output_path: "/tmp/inbox",
    archive_paths: ["/tmp/archive/2026-04-18.ndjson"],
    glyph_sentence: "EVT-PRUNER-RUN · kept=100 @ M-EYEWITNESS .",
    ...overrides,
  };
}

// T1: empty metrics
console.log("T1: empty metrics");
const m0 = emptyMetrics();
assert(m0.total_runs === 0, "0 runs");
assert(m0.total_entries_in === 0, "0 in");
assert(m0.last_run_at === null, "null last_run_at");

// T2: fold one run
console.log("\nT2: fold one run");
const m1 = foldRun(m0, mkResult(), "2026-04-19T05:00:00Z");
assert(m1.total_runs === 1, "1 run");
assert(m1.total_entries_in === 1000, "1000 in");
assert(m1.total_kept === 100, "100 kept");
assert(m1.total_archived === 900, "900 archived");
assert(m1.total_signed_preserved === 5, "5 signed");
assert(m1.total_heartbeats_archived === 895, "895 heartbeats");
assert(m1.last_run_at === "2026-04-19T05:00:00Z", "last_run_at stamped");
assert(m1.last_result_glyph?.includes("kept=100"), "last glyph captured");

// T3: fold multiple runs (cumulative)
console.log("\nT3: cumulative fold");
let m = emptyMetrics();
m = foldRun(m, mkResult({ total_in: 500, kept: 50, archived_by_day: { "2026-04-19": 450 } }), "2026-04-19T01:00:00Z");
m = foldRun(m, mkResult({ total_in: 700, kept: 70, archived_by_day: { "2026-04-19": 630 } }), "2026-04-19T02:00:00Z");
m = foldRun(m, mkResult({ total_in: 900, kept: 90, archived_by_day: { "2026-04-19": 810 } }), "2026-04-19T03:00:00Z");
assert(m.total_runs === 3, "3 runs");
assert(m.total_entries_in === 2100, "2100 cumulative in");
assert(m.total_kept === 210, "210 cumulative kept");
assert(m.total_archived === 1890, "1890 cumulative archived");
assert(m.last_run_at === "2026-04-19T03:00:00Z", "latest ts");

// T4: save + load roundtrip
console.log("\nT4: save + load");
const path = `${TMP}/metrics.json`;
saveMetrics(path, m);
const loaded = loadMetrics(path);
assert(loaded.total_runs === 3, "3 runs restored");
assert(loaded.total_entries_in === 2100, "entries_in restored");
assert(loaded.last_result_glyph === m.last_result_glyph, "glyph restored");

// T5: load on missing file → empty
console.log("\nT5: load missing");
const loadedEmpty = loadMetrics(`${TMP}/missing.json`);
assert(loadedEmpty.total_runs === 0, "missing returns empty");

// T6: load corrupt file → empty (resilient)
console.log("\nT6: load corrupt");
const corruptPath = `${TMP}/corrupt.json`;
require("node:fs").writeFileSync(corruptPath, "not json{{{");
const loadedCorrupt = loadMetrics(corruptPath);
assert(loadedCorrupt.total_runs === 0, "corrupt returns empty");

// T7: append run event → NDJSON line
console.log("\nT7: append run event");
const ndjsonPath = `${TMP}/runs.ndjson`;
appendRunEvent(ndjsonPath, mkResult({ total_in: 100 }), "2026-04-19T06:00:00Z");
appendRunEvent(ndjsonPath, mkResult({ total_in: 200 }), "2026-04-19T06:01:00Z");
const ndjsonText = readFileSync(ndjsonPath, "utf8");
const ndjsonLines = ndjsonText.trim().split("\n");
assert(ndjsonLines.length === 2, "2 NDJSON entries");
const ev1 = JSON.parse(ndjsonLines[0]);
assert(ev1.total_in === 100, "first entry total_in");
assert(ev1.ts === "2026-04-19T06:00:00Z", "first entry ts");

// T8: prometheus render shape
console.log("\nT8: prometheus render");
const prom = renderPrometheus(m);
assert(prom.includes("asolaria_pruner_runs_total 3"), "runs_total metric");
assert(prom.includes("asolaria_pruner_entries_in_total 2100"), "entries_in_total metric");
assert(prom.includes("asolaria_pruner_kept_total 210"), "kept_total metric");
assert(prom.includes("# HELP asolaria_pruner_runs_total"), "HELP comment");
assert(prom.includes("# TYPE asolaria_pruner_runs_total counter"), "TYPE counter");
assert(prom.includes("# last_run_at 2026-04-19T03:00:00Z"), "last_run_at note");

// T9: glyph render
console.log("\nT9: glyph render");
const g = renderGlyph(m);
assert(g.startsWith("EVT-PRUNER-METRICS"), "glyph prefix");
assert(g.includes("runs=3"), "runs in glyph");
assert(g.includes("archived=1890"), "archived in glyph");
assert(g.includes("@ M-INDICATIVE ."), "mood");

// T10: empty metrics prometheus still renders
console.log("\nT10: empty prom");
const emptyProm = renderPrometheus(emptyMetrics());
assert(emptyProm.includes("asolaria_pruner_runs_total 0"), "0 runs metric");
assert(!emptyProm.includes("# last_run_at"), "no last_run_at when never run");

// Cleanup
rmSync(TMP, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-I-003-METRICS-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
