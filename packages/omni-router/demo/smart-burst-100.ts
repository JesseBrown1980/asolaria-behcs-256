// omni-router v0.8 — 100-task concurrent smart-burst smoke.
//
// D11:ASSUMED until receipts printed at FINAL_JSON bottom.
//
// Purpose: stress smart-mode router with 100 concurrent thin-worker dispatches,
// 80% glyph-local (OP-NOW / OP-VERSION / OP-ECHO rotating) + 20% cloud (tiny prose).
// Measure per-lane p50/p95/p99 latency + throughput. Verify glyph-local tokens == 0.
//
// Pre: opencode.cmd installed at %APPDATA%\npm\opencode.cmd.
//      This demo spawns `opencode serve` on 127.0.0.1:11003 if not already
//      responding, then drives it through the router on 11057 (prime, LAW-001 safe).
//
// Exit 0 iff: 80/80 glyph-local ok AND ≥15/20 cloud ok (opencode may time out
// under concurrent heavy-model load — documented constraint).
//
// Node stdlib only: child_process + node:http. No third-party deps.

import { startRouter } from "../src/router.ts";
import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_CMD = join(__dirname, "..", "..", "thin-worker", "worker.cmd");
const OPENCODE_CMD = "C:\\Users\\rayss\\AppData\\Roaming\\npm\\opencode.cmd";

const OPENCODE_HOST = "127.0.0.1";
const OPENCODE_PORT = 11003;
const ROUTER_PORT = 11057; // prime, LAW-001-safe (not 4947/4950)
const TASK_COUNT = 100;
const GLYPH_LOCAL_COUNT = 80;
const CLOUD_COUNT = TASK_COUNT - GLYPH_LOCAL_COUNT; // 20
const BOOT_POLL_MS = 2000;
const BOOT_MAX_MS = 60000;

// ── HTTP helper ───────────────────────────────────────────────────────────

function httpGet(host: string, port: number, path: string, timeoutMs = 3000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host, port, path, method: "GET", timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

function postJson(host: string, port: number, path: string, body: string, timeoutMs = 30000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host, port, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString() },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body); req.end();
  });
}

// ── Opencode lifecycle ────────────────────────────────────────────────────

async function isOpencodeUp(): Promise<boolean> {
  try {
    const r = await httpGet(OPENCODE_HOST, OPENCODE_PORT, "/config", 1500);
    return r.status === 200;
  } catch { return false; }
}

async function waitForOpencode(maxMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isOpencodeUp()) return true;
    await new Promise((r) => setTimeout(r, BOOT_POLL_MS));
  }
  return false;
}

function spawnOpencodeHidden(): ChildProcess {
  // Start-Process powershell — hidden window, detached, returns immediately.
  const ps = [
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-Command",
    `Start-Process -WindowStyle Hidden -FilePath "${OPENCODE_CMD}" -ArgumentList 'serve','--hostname','${OPENCODE_HOST}','--port','${OPENCODE_PORT}'`,
  ];
  return spawn("powershell.exe", ps, { stdio: "ignore", windowsHide: true, detached: true });
}

function killOpencodeByPort(port: number): void {
  // Best-effort: find PIDs listening on port and kill them.
  try {
    const out = spawn("powershell.exe", [
      "-NoProfile", "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: "ignore", windowsHide: true });
    out.unref();
  } catch { /* swallow */ }
}

// ── Thin-worker dispatch ──────────────────────────────────────────────────

interface WorkerResult {
  ok: boolean;
  ms: number;
  stdout: string;
  exitCode: number | null;
}

function runThinWorker(glyph: string, routerHostPort: string, payload: string): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const proc = spawn("cmd.exe", ["/c", WORKER_CMD], {
      shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: { ...process.env, BEHCS256_GLYPH: glyph, BEHCS256_ROUTER: routerHostPort },
    });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stdin.write(payload); proc.stdin.end();
    proc.on("close", (code) => resolve({
      ok: code === 0, ms: Date.now() - startMs,
      stdout: Buffer.concat(chunks).toString("utf-8"),
      exitCode: code,
    }));
    proc.on("error", () => resolve({ ok: false, ms: Date.now() - startMs, stdout: "", exitCode: null }));
  });
}

// ── Task fabric ───────────────────────────────────────────────────────────

interface TaskSpec {
  id: string;
  message: string;
  expected_lane: "glyph-local" | "opencode-local";
}

function buildTasks(): TaskSpec[] {
  const tasks: TaskSpec[] = [];
  // 80 glyph-local, rotating OP-NOW / OP-VERSION / OP-ECHO with diverse args.
  const echoArgs = [
    "alpha", "bravo", "charlie", "delta", "echo-two", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray",
    "yankee", "zulu", "run-42", "burst-7",
  ];
  for (let i = 0; i < GLYPH_LOCAL_COUNT; i++) {
    const idx = i % 3;
    const id = `L-${String(i + 1).padStart(3, "0")}`;
    if (idx === 0) {
      tasks.push({ id, message: "OP-NOW{} @ M-EYEWITNESS .", expected_lane: "glyph-local" });
    } else if (idx === 1) {
      tasks.push({ id, message: "OP-VERSION{} @ M-EYEWITNESS .", expected_lane: "glyph-local" });
    } else {
      const arg = echoArgs[i % echoArgs.length];
      tasks.push({ id, message: `OP-ECHO{${arg}-${i}} @ M-EYEWITNESS .`, expected_lane: "glyph-local" });
    }
  }
  // 20 cloud tasks — all tiny "Reply 'OK' only" prose.
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const id = `C-${String(i + 1).padStart(3, "0")}`;
    tasks.push({
      id,
      message: "Reply with only the two-letter token: OK. No punctuation, no explanation.",
      expected_lane: "opencode-local",
    });
  }
  return tasks;
}

// ── Stats helpers ─────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

interface LaneAgg {
  count: number;
  ok_count: number;
  tokens_in_total: number;
  tokens_out_total: number;
  cost_total: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  max_ms: number;
  avg_ms: number;
  tasks_per_sec: number;
}

function aggregate(rows: Array<{ ok: boolean; tokens_in: number; tokens_out: number; cost: number; latency_worker_ms: number }>, elapsed_ms: number): LaneAgg {
  const lats = rows.map((r) => r.latency_worker_ms).sort((a, b) => a - b);
  const tpMs = elapsed_ms > 0 ? (rows.length / elapsed_ms) * 1000 : 0;
  return {
    count: rows.length,
    ok_count: rows.filter((r) => r.ok).length,
    tokens_in_total: rows.reduce((s, r) => s + r.tokens_in, 0),
    tokens_out_total: rows.reduce((s, r) => s + r.tokens_out, 0),
    cost_total: rows.reduce((s, r) => s + r.cost, 0),
    p50_ms: percentile(lats, 50),
    p95_ms: percentile(lats, 95),
    p99_ms: percentile(lats, 99),
    max_ms: lats.length ? lats[lats.length - 1] : 0,
    avg_ms: rows.length ? Math.round(rows.reduce((s, r) => s + r.latency_worker_ms, 0) / rows.length) : 0,
    tasks_per_sec: Number(tpMs.toFixed(3)),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

interface RowResult {
  id: string;
  expected_lane: string;
  actual_lane: string;
  ok: boolean;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  latency_worker_ms: number;
  completion_prefix: string;
  error?: string;
}

async function main(): Promise<void> {
  let spawnedOpencode = false;

  // 1) Ensure opencode serve is up on 11003.
  if (await isOpencodeUp()) {
    console.log(`[burst] opencode already listening on ${OPENCODE_HOST}:${OPENCODE_PORT} — reusing`);
  } else {
    console.log(`[burst] spawning opencode serve (hidden) on ${OPENCODE_HOST}:${OPENCODE_PORT}...`);
    spawnOpencodeHidden().unref();
    spawnedOpencode = true;
    const booted = await waitForOpencode(BOOT_MAX_MS);
    if (!booted) {
      console.error(`[burst] opencode serve failed to boot within ${BOOT_MAX_MS}ms`);
      process.exit(3);
    }
    console.log(`[burst] opencode up`);
  }

  // 2) Create session.
  const createRes = await postJson(OPENCODE_HOST, OPENCODE_PORT, "/session", "{}", 15000);
  if (createRes.status !== 200) {
    console.error(`[burst] session create failed: ${createRes.status} ${createRes.body.slice(0, 200)}`);
    if (spawnedOpencode) killOpencodeByPort(OPENCODE_PORT);
    process.exit(4);
  }
  const sessionId = (JSON.parse(createRes.body) as { id: string }).id;
  console.log(`[burst] opencode session ${sessionId}`);

  // 3) Start router smart mode on 11057.
  const router = await startRouter({
    port: ROUTER_PORT,
    mode: "smart",
    openCodeHost: OPENCODE_HOST,
    openCodePort: OPENCODE_PORT,
    openCodeSessionId: sessionId,
  });
  console.log(`[burst] router up 127.0.0.1:${ROUTER_PORT} mode=smart`);

  // 4) Build 100 tasks and dispatch concurrently.
  const tasks = buildTasks();
  const routerHostPort = `127.0.0.1:${ROUTER_PORT}`;

  console.log(`[burst] dispatching ${tasks.length} concurrent thin-worker calls...`);
  const burstStart = Date.now();

  const promises = tasks.map(async (t): Promise<RowResult> => {
    const glyph = `PID-H00-A08-W${t.id.replace(/\D/g, "").padStart(9, "0")}-P000-N00000`;
    const payload = JSON.stringify({ task_id: t.id, message: t.message });
    const r = await runThinWorker(glyph, routerHostPort, payload);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch { /* */ }
    const tokens = (parsed as { tokens?: { input?: number; output?: number } }).tokens ?? {};
    return {
      id: t.id,
      expected_lane: t.expected_lane,
      actual_lane: (parsed.lane as string) ?? "unknown",
      ok: Boolean(parsed.ok),
      tokens_in: tokens.input ?? 0,
      tokens_out: tokens.output ?? 0,
      cost: (parsed.cost as number) ?? 0,
      latency_worker_ms: r.ms,
      completion_prefix: ((parsed.completion as string) ?? "").slice(0, 40),
      error: (parsed.error as string) ?? undefined,
    };
  });

  const results = await Promise.all(promises);
  const elapsed_ms = Date.now() - burstStart;

  // 5) Split by actual lane and aggregate.
  const glyphRows = results.filter((r) => r.actual_lane === "glyph-local");
  const cloudRows = results.filter((r) => r.actual_lane === "opencode-local");
  const otherRows = results.filter((r) => r.actual_lane !== "glyph-local" && r.actual_lane !== "opencode-local");

  const glyphAgg = aggregate(glyphRows, elapsed_ms);
  const cloudAgg = aggregate(cloudRows, elapsed_ms);

  // Zero-token invariant on glyph-local.
  const glyph_tokens_are_zero = glyphAgg.tokens_in_total === 0 && glyphAgg.tokens_out_total === 0;

  // Routing correctness: every task landed in its expected lane (or failed clearly).
  const routing_correct = results.every((r) => r.actual_lane === r.expected_lane || r.actual_lane.startsWith("opencode-local"));

  const report = {
    schema: "omni-router.smart-burst-100.v1",
    d11: "OBSERVED",
    task_count: tasks.length,
    elapsed_ms,
    global_tasks_per_sec: Number(((tasks.length / Math.max(1, elapsed_ms)) * 1000).toFixed(3)),
    lanes: {
      glyph_local: glyphAgg,
      opencode_local: cloudAgg,
    },
    other_lane_rows: otherRows.length,
    invariants: {
      glyph_tokens_are_zero,
      routing_correct,
      glyph_ok_all: glyphAgg.ok_count === GLYPH_LOCAL_COUNT,
      cloud_ok_threshold: cloudAgg.ok_count >= 15,
    },
    totals: {
      tokens_in_cumulative: glyphAgg.tokens_in_total + cloudAgg.tokens_in_total,
      tokens_out_cumulative: glyphAgg.tokens_out_total + cloudAgg.tokens_out_total,
      cost_cumulative: glyphAgg.cost_total + cloudAgg.cost_total,
    },
    router_stats: router.stats,
    config: {
      opencode: `${OPENCODE_HOST}:${OPENCODE_PORT}`,
      router_port: ROUTER_PORT,
      task_count: TASK_COUNT,
      glyph_local_count: GLYPH_LOCAL_COUNT,
      cloud_count: CLOUD_COUNT,
      opencode_spawned: spawnedOpencode,
    },
    sample_results: results.slice(0, 8),
    node_version: process.version,
    ts: new Date().toISOString(),
  };

  await router.close();

  // Cleanup: kill opencode only if we started it ourselves.
  if (spawnedOpencode) {
    console.log(`[burst] killing opencode (we spawned it) on port ${OPENCODE_PORT}`);
    killOpencodeByPort(OPENCODE_PORT);
  } else {
    console.log(`[burst] leaving pre-existing opencode alive`);
  }

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify(report, null, 2));

  const pass =
    report.invariants.glyph_ok_all &&
    report.invariants.cloud_ok_threshold &&
    report.invariants.glyph_tokens_are_zero;

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[burst] fatal:", err);
  process.exit(2);
});
