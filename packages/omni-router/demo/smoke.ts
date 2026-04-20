// Smoke test: start router + spawn N thin CMD workers + measure round-trip + RAM.
// Proves thin-worker architecture works end-to-end without any cloud, any API dollars,
// any model local. Establishes the baseline numbers.

import { startRouter } from "../src/router.ts";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_CMD = join(__dirname, "..", "..", "thin-worker", "worker.cmd");

interface WorkerResult {
  ok: boolean;
  ms: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runThinWorker(glyph: string, routerHostPort: string, payload: string): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const proc = spawn("cmd.exe", ["/c", WORKER_CMD], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        BEHCS256_GLYPH: glyph,
        BEHCS256_ROUTER: routerHostPort,
      },
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    proc.stdin.write(payload);
    proc.stdin.end();
    proc.on("close", (code) => {
      resolve({
        ok: code === 0,
        ms: Date.now() - startMs,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code,
      });
    });
    proc.on("error", (err) => {
      resolve({ ok: false, ms: Date.now() - startMs, stdout: "", stderr: String(err), exitCode: null });
    });
  });
}

async function main(): Promise<void> {
  const port = 11003; // prime, LAW-001-safe
  const routerHostPort = `127.0.0.1:${port}`;
  console.log(`[smoke] starting router on ${routerHostPort}...`);
  const router = await startRouter({ port, mode: "stub" });
  console.log(`[smoke] router up. PID=${process.pid}`);

  // Single round-trip
  console.log("[smoke] single round-trip...");
  const one = await runThinWorker(
    "PID-H00-A05-W000000001-P000-N00000",
    routerHostPort,
    JSON.stringify({ task_id: "demo-001", message: "hello router" })
  );
  console.log("[smoke] single result:", JSON.stringify({ ok: one.ok, ms: one.ms, stdout_len: one.stdout.length, exitCode: one.exitCode }));
  if (!one.ok) {
    console.log("[smoke] single stdout:", one.stdout.slice(0, 500));
    console.log("[smoke] single stderr:", one.stderr.slice(0, 500));
  } else {
    console.log("[smoke] single response sample:", one.stdout.slice(0, 200));
  }

  // Burst — N concurrent workers
  const bursts = [10, 50, 100];
  const burstReport: Array<{ N: number; ok: number; fail: number; p50_ms: number; p95_ms: number; max_ms: number; total_ms: number }> = [];
  for (const N of bursts) {
    console.log(`[smoke] burst N=${N}...`);
    const burstStart = Date.now();
    const promises: Promise<WorkerResult>[] = [];
    for (let i = 0; i < N; i++) {
      const glyph = `PID-H00-A05-W${String(i).padStart(9, "0")}-P000-N00000`;
      const payload = JSON.stringify({ task_id: `burst-${N}-${i}`, message: `worker ${i} of ${N}` });
      promises.push(runThinWorker(glyph, routerHostPort, payload));
    }
    const results = await Promise.all(promises);
    const burstTotalMs = Date.now() - burstStart;
    const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
    const p = (q: number): number => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];
    const okCount = results.filter((r) => r.ok).length;
    const report = {
      N,
      ok: okCount,
      fail: N - okCount,
      p50_ms: p(0.5),
      p95_ms: p(0.95),
      max_ms: latencies[latencies.length - 1],
      total_ms: burstTotalMs,
    };
    burstReport.push(report);
    console.log(`[smoke] burst N=${N} report:`, JSON.stringify(report));
    if (okCount < N) {
      const firstFail = results.find((r) => !r.ok);
      console.log(`[smoke] first-fail stdout:`, firstFail?.stdout.slice(0, 200));
      console.log(`[smoke] first-fail stderr:`, firstFail?.stderr.slice(0, 200));
    }
  }

  console.log("[smoke] final router stats:", JSON.stringify(router.stats));
  await router.close();
  console.log("[smoke] router closed.");

  const final = {
    single: { ok: one.ok, ms: one.ms, exitCode: one.exitCode, stdout_prefix: one.stdout.slice(0, 200) },
    bursts: burstReport,
    router_stats: router.stats,
    node_version: process.version,
    platform: process.platform,
  };
  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify(final, null, 2));

  const allOk = one.ok && burstReport.every((b) => b.fail === 0);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(2);
});
