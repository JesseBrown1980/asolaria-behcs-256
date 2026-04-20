// Smart-mode mixed-payload smoke.
// 10 tasks: 7 glyph-local ops (OP-*) + 3 prose tasks that need the LLM.
// Router auto-routes each. Measure per-lane: token count, cost, latency.
//
// Pre: opencode serve running on 127.0.0.1:11003

import { startRouter } from "../src/router.ts";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_CMD = join(__dirname, "..", "..", "thin-worker", "worker.cmd");

const OPENCODE_HOST = "127.0.0.1";
const OPENCODE_PORT = 11003;
const ROUTER_PORT = 11047; // prime, LAW-001-safe

function postJson(host: string, port: number, path: string, body: string, timeoutMs = 30000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host, port, path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString() },
      timeout: timeoutMs },
      (res) => {
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

function runThinWorker(glyph: string, routerHostPort: string, payload: string): Promise<{ ok: boolean; ms: number; stdout: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const proc = spawn("cmd.exe", ["/c", WORKER_CMD], {
      shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: { ...process.env, BEHCS256_GLYPH: glyph, BEHCS256_ROUTER: routerHostPort },
    });
    const stdoutChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stdin.write(payload); proc.stdin.end();
    proc.on("close", (code) => resolve({
      ok: code === 0, ms: Date.now() - startMs,
      stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
      exitCode: code,
    }));
    proc.on("error", () => resolve({ ok: false, ms: Date.now() - startMs, stdout: "", exitCode: null }));
  });
}

const TASKS: Array<{ id: string; message: string; expected_lane: "glyph-local" | "opencode-local" }> = [
  // Glyph-local lane (0 tokens expected)
  { id: "L-001", message: "OP-NOW{} @ M-EYEWITNESS .",                                expected_lane: "glyph-local" },
  { id: "L-002", message: "OP-VERSION{} @ M-EYEWITNESS .",                            expected_lane: "glyph-local" },
  { id: "L-003", message: "OP-ECHO{hello from thin worker} @ M-EYEWITNESS .",         expected_lane: "glyph-local" },
  { id: "L-004", message: "OP-STAT{packages/kernel/package.json} @ DEVICE .",         expected_lane: "glyph-local" },
  { id: "L-005", message: "OP-GLOB{packages/*/package.json} @ DEVICE .",              expected_lane: "glyph-local" },
  { id: "L-006", message: "OP-READ{packages/omni-router/package.json} @ DEVICE .",    expected_lane: "glyph-local" },
  { id: "L-007", message: "OP-NOW{} @ M-EYEWITNESS .",                                expected_lane: "glyph-local" },
  // Cloud-lane (needs real reasoning)
  { id: "C-001", message: "Reply with only the single word: GREEN. No punctuation.",  expected_lane: "opencode-local" },
  { id: "C-002", message: "Reply with only the single word: RED. No punctuation.",    expected_lane: "opencode-local" },
  { id: "C-003", message: "Reply with only the single word: BLUE. No punctuation.",   expected_lane: "opencode-local" },
];

async function main(): Promise<void> {
  console.log(`[smart] creating opencode session on ${OPENCODE_HOST}:${OPENCODE_PORT}...`);
  const createRes = await postJson(OPENCODE_HOST, OPENCODE_PORT, "/session", "{}");
  if (createRes.status !== 200) {
    console.error(`[smart] session create failed: ${createRes.status} ${createRes.body.slice(0, 200)}`);
    process.exit(1);
  }
  const session = JSON.parse(createRes.body);
  const sid = session.id as string;
  console.log(`[smart] session ${sid}`);

  const router = await startRouter({
    port: ROUTER_PORT,
    mode: "smart",
    openCodeHost: OPENCODE_HOST,
    openCodePort: OPENCODE_PORT,
    openCodeSessionId: sid,
  });
  console.log(`[smart] router up on 127.0.0.1:${ROUTER_PORT} mode=smart`);

  const routerHostPort = `127.0.0.1:${ROUTER_PORT}`;
  const results: Array<{ id: string; expected_lane: string; actual_lane: string; ok: boolean; tokens_in: number; tokens_out: number; cost: number; latency_worker_ms: number; completion_prefix: string }> = [];

  for (const t of TASKS) {
    const glyph = `PID-H00-A05-W${t.id.replace(/\D/g, "").padStart(9, "0")}-P000-N00000`;
    const r = await runThinWorker(glyph, routerHostPort, JSON.stringify({ task_id: t.id, message: t.message }));
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch { /* */ }
    const tokens = (parsed as { tokens?: { input?: number; output?: number } }).tokens ?? {};
    const row = {
      id: t.id,
      expected_lane: t.expected_lane,
      actual_lane: (parsed.lane as string) ?? "unknown",
      ok: Boolean(parsed.ok),
      tokens_in: tokens.input ?? 0,
      tokens_out: tokens.output ?? 0,
      cost: (parsed.cost as number) ?? 0,
      latency_worker_ms: r.ms,
      completion_prefix: ((parsed.completion as string) ?? "").slice(0, 60),
    };
    results.push(row);
    console.log(`[smart] ${t.id} lane=${row.actual_lane} ok=${row.ok} tok=${row.tokens_in}+${row.tokens_out} ms=${r.ms} completion="${row.completion_prefix}"`);
  }

  const glyphLocalResults = results.filter((r) => r.actual_lane === "glyph-local");
  const opencodeLocalResults = results.filter((r) => r.actual_lane === "opencode-local");

  const report = {
    task_count: TASKS.length,
    lanes: {
      glyph_local: {
        count: glyphLocalResults.length,
        ok_count: glyphLocalResults.filter((r) => r.ok).length,
        tokens_in_total: glyphLocalResults.reduce((s, r) => s + r.tokens_in, 0),
        tokens_out_total: glyphLocalResults.reduce((s, r) => s + r.tokens_out, 0),
        cost_total: glyphLocalResults.reduce((s, r) => s + r.cost, 0),
        avg_latency_ms: Math.round(glyphLocalResults.reduce((s, r) => s + r.latency_worker_ms, 0) / Math.max(1, glyphLocalResults.length)),
      },
      opencode_local: {
        count: opencodeLocalResults.length,
        ok_count: opencodeLocalResults.filter((r) => r.ok).length,
        tokens_in_total: opencodeLocalResults.reduce((s, r) => s + r.tokens_in, 0),
        tokens_out_total: opencodeLocalResults.reduce((s, r) => s + r.tokens_out, 0),
        cost_total: opencodeLocalResults.reduce((s, r) => s + r.cost, 0),
        avg_latency_ms: Math.round(opencodeLocalResults.reduce((s, r) => s + r.latency_worker_ms, 0) / Math.max(1, opencodeLocalResults.length)),
      },
    },
    router_stats: router.stats,
    all_expected_matched: results.every((r) => r.actual_lane === r.expected_lane),
    results,
    ts: new Date().toISOString(),
  };

  await router.close();

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.all_expected_matched && results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => { console.error("[smart] fatal:", err); process.exit(2); });
