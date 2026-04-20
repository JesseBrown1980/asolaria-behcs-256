import { startPruneScheduler } from "../src/scheduler.ts";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== I-002 pruner scheduler tests ===\n");

const TESTDIR = join(tmpdir(), "asolaria-i002-" + Date.now());
mkdirSync(TESTDIR);
const inbox = join(TESTDIR, "inbox.ndjson");
writeFileSync(inbox, JSON.stringify({ verb: "behcs.heartbeat", received_at: "2020-01-01T00:00:00Z" }) + "\n");

// Mock scheduler
let mockFn: (() => void) | null = null;
const mockSched = {
  setInterval: (fn: () => void, ms: number) => {
    mockFn = fn;
    return { stop: () => { mockFn = null; } };
  },
};

// T1: startPruneScheduler returns handle with stats
console.log("T1: handle shape");
const h = startPruneScheduler({
  prune: { inbox_path: inbox, archive_dir: join(TESTDIR, "arc"), keep_hours: 1, always_keep_verbs: [] },
  interval_ms: 60000,
  scheduler: mockSched,
});
assert(typeof h.stop === "function", "stop()");
assert(typeof h.runOnce === "function", "runOnce()");
assert(typeof h.stats === "function", "stats()");

// T2: stats.started_at ISO + runs starts at 0
console.log("\nT2: initial stats");
const s1 = h.stats();
assert(/\d{4}-\d{2}-\d{2}T/.test(s1.started_at), "started_at ISO");
assert(s1.runs === 0, "runs=0");
assert(s1.last_result === null, "last_result null");

// T3: runOnce → runs=1, last_result set
console.log("\nT3: runOnce increments");
const r = h.runOnce();
const s2 = h.stats();
assert(s2.runs === 1, "runs=1");
assert(s2.last_result !== null, "last_result set");
assert(r.total_in === 1, "pruned 1 msg");

// T4: scheduler-triggered tick also counts
console.log("\nT4: scheduler tick");
writeFileSync(inbox, JSON.stringify({ verb: "behcs.heartbeat", received_at: "2020-01-01T00:00:00Z" }) + "\n");
if (mockFn) mockFn();  // simulate interval tick
const s3 = h.stats();
assert(s3.runs === 2, "runs=2 after tick");

// T5: on_result callback fires
console.log("\nT5: on_result callback");
let callbackFired = 0;
const h2 = startPruneScheduler({
  prune: { inbox_path: inbox, archive_dir: join(TESTDIR, "arc2"), keep_hours: 1, always_keep_verbs: [] },
  interval_ms: 60000,
  on_result: () => { callbackFired++; },
  scheduler: mockSched,
});
h2.runOnce();
assert(callbackFired === 1, "callback fired once");
h2.stop();

// T6: stop() halts ticks
console.log("\nT6: stop() halts");
h.stop();
assert(mockFn === null, "mock stopped");

// T7: on_error when inbox vanishes mid-run (path does not exist scenario — handled by pruneInbox gracefully, not thrown)
console.log("\nT7: missing inbox graceful");
const missingH = startPruneScheduler({
  prune: { inbox_path: join(TESTDIR, "never-exists.ndjson"), archive_dir: join(TESTDIR, "arcZ"), keep_hours: 1, always_keep_verbs: [] },
  interval_ms: 60000,
  scheduler: mockSched,
});
const rMiss = missingH.runOnce();
assert(rMiss.total_in === 0, "graceful 0 when missing");
missingH.stop();

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-I-002-SCHEDULER-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
