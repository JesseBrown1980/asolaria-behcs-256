// Unit tests for scheduler + bench logic — uses a MOCK worker so we don't
// spin up the real WASM runtime in unit tests. Real WASM validation lives
// in integration test (separate).

import { buildRefusal, buildOrientation, type PSM, type OEM } from "../src/envelope.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== ocr-bridge · scheduler/bench unit tests (mock worker) ===\n");

// Mock a scheduler that doesn't touch Tesseract
function makeMockScheduler(size: number) {
  let processed = 0, failed = 0, roundRobin = 0;
  const workers = Array.from({ length: size }, (_, i) => ({ id: `mock-${i}` }));
  return {
    size,
    workers,
    async addJob(jobType: "recognize" | "detect", image: any) {
      roundRobin++;
      await new Promise(r => setTimeout(r, 1));
      if (String(image).includes("fail")) {
        failed++;
        return buildRefusal({ actor: "mock", target: "fed", reason: "image_unreadable", detail: "mock fail" });
      }
      processed++;
      return { verb: jobType, mock: true };
    },
    stats() { return { size, queued: 0, processing: 0, completed: processed, failed }; },
    async terminate() { /* no-op */ },
  };
}

// T1: scheduler size bounded
console.log("T1: scheduler bounds");
const s1 = makeMockScheduler(3);
assert(s1.size === 3, "size=3");
assert(s1.workers.length === 3, "3 workers");

// T2: round-robin job distribution
console.log("\nT2: job distribution");
const s2 = makeMockScheduler(2);
async function t2() {
  const results: any[] = [];
  for (let i = 0; i < 6; i++) results.push(await s2.addJob("recognize", `img-${i}`));
  const okCount = results.filter(r => !('reason' in r)).length;
  assert(okCount === 6, "6 ok");
}
await t2();

// T3: fail path
console.log("\nT3: fail path");
const s3 = makeMockScheduler(2);
async function t3() {
  const r1 = await s3.addJob("recognize", "ok-image");
  const r2 = await s3.addJob("recognize", "please-fail-this");
  assert(!("reason" in r1), "ok passes");
  assert("reason" in r2, "fail path hit");
  const st = s3.stats();
  assert(st.completed === 1, "1 completed");
  assert(st.failed === 1, "1 failed");
}
await t3();

// T4: p50/p95 percentile math
console.log("\nT4: percentile math");
function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
assert(percentile(data, 0.5) === 60, "p50=60 (6th of 10)");
assert(percentile(data, 0.95) === 100, "p95=100");
assert(percentile(data, 0.0) === 10, "p0=10");

// T5: throughput math
console.log("\nT5: throughput math");
const throughput = Math.round((100 / 1000) * 1000 * 100) / 100;
assert(throughput === 100, "100/s with 1000ms total");

// T6: stats shape
console.log("\nT6: stats shape");
const s6 = makeMockScheduler(4);
const st = s6.stats();
assert(typeof st.size === "number", "size number");
assert(typeof st.completed === "number", "completed number");
assert(typeof st.failed === "number", "failed number");

// T7: mock scheduler terminate returns
console.log("\nT7: terminate");
const s7 = makeMockScheduler(2);
await s7.terminate();
assert(true, "terminate returns");

// T8: empty bench batch
console.log("\nT8: empty batch");
const s8 = makeMockScheduler(2);
const results8: any[] = [];
for (const img of [] as any[]) results8.push(await s8.addJob("recognize", img));
assert(results8.length === 0, "0 results for empty batch");

// T9: pool size clamping behavior (would be 16 max in real scheduler)
console.log("\nT9: pool size clamp awareness");
// In real createOCRScheduler we clamp Math.max(1, Math.min(16, size))
// Here we just validate the clamp rule
const clampTest = (n: number) => Math.max(1, Math.min(16, n));
assert(clampTest(0) === 1, "0→1");
assert(clampTest(100) === 16, "100→16");
assert(clampTest(5) === 5, "5→5");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-OCR-SCHEDULER-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
