// Freetier round-trip: thin-worker -> omni-router -> opencode-local big-pickle
// Proves LAW-014 gate #6 green (zero API dollars, real model completion).
//
// Prerequisites: `opencode serve --port 11003 --hostname 127.0.0.1` running
// detached on this machine. We pre-create an opencode session, wire the
// router in opencode-local mode, send N tasks through thin-worker ferries,
// measure tokens + cost + latency.

import { startRouter } from "../src/router.ts";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_CMD = join(__dirname, "..", "..", "thin-worker", "worker.cmd");

const OPENCODE_HOST = "127.0.0.1";
const OPENCODE_PORT = 11003;   // where opencode serve is already running
const ROUTER_PORT = 11027;     // prime, LAW-001-safe

function postJson(host: string, port: number, path: string, body: string, timeoutMs = 15000): Promise<{ status: number; body: string }> {
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

function runThinWorker(glyph: string, routerHostPort: string, payload: string): Promise<{ ok: boolean; ms: number; stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const proc = spawn("cmd.exe", ["/c", WORKER_CMD], {
      shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      env: { ...process.env, BEHCS256_GLYPH: glyph, BEHCS256_ROUTER: routerHostPort },
    });
    const stdoutChunks: Buffer[] = [], stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
    proc.stdin.write(payload); proc.stdin.end();
    proc.on("close", (code) => resolve({
      ok: code === 0, ms: Date.now() - startMs,
      stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
      stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      exitCode: code,
    }));
    proc.on("error", (err) => resolve({ ok: false, ms: Date.now() - startMs, stdout: "", stderr: String(err), exitCode: null }));
  });
}

async function main(): Promise<void> {
  console.log(`[freetier] creating opencode session on ${OPENCODE_HOST}:${OPENCODE_PORT}...`);
  const createRes = await postJson(OPENCODE_HOST, OPENCODE_PORT, "/session", "{}", 30000);
  if (createRes.status !== 200) {
    console.error(`[freetier] failed to create session: HTTP ${createRes.status} ${createRes.body.slice(0, 200)}`);
    process.exit(1);
  }
  const session = JSON.parse(createRes.body);
  const sid = session.id as string;
  console.log(`[freetier] session id=${sid} slug=${session.slug} directory=${session.directory}`);

  console.log(`[freetier] starting router on 127.0.0.1:${ROUTER_PORT} mode=opencode-local...`);
  const router = await startRouter({
    port: ROUTER_PORT,
    mode: "opencode-local",
    openCodeHost: OPENCODE_HOST,
    openCodePort: OPENCODE_PORT,
    openCodeSessionId: sid,
  });
  console.log(`[freetier] router up.`);

  const routerHostPort = `127.0.0.1:${ROUTER_PORT}`;
  const tasks = [
    { task_id: "ft-001", message: "Reply with the single word: GREEN. No other text." },
  ];

  const results: unknown[] = [];
  for (const t of tasks) {
    const glyph = `PID-H00-A05-W000000001-P000-N00000`;
    console.log(`[freetier] dispatching ${t.task_id}...`);
    const r = await runThinWorker(glyph, routerHostPort, JSON.stringify(t));
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch { /* leave empty */ }
    results.push({
      task_id: t.task_id, ok: r.ok, ms: r.ms, exitCode: r.exitCode,
      worker_stdout_len: r.stdout.length,
      router_response: parsed,
    });
    console.log(`[freetier] ${t.task_id} ok=${r.ok} ms=${r.ms} completion=${JSON.stringify((parsed as {completion?:string}).completion ?? "")}`);
  }

  console.log("[freetier] router stats:", JSON.stringify(router.stats));
  await router.close();

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify({
    session: { id: sid, slug: session.slug, directory: session.directory },
    router_stats: router.stats,
    results,
    node_version: process.version,
    platform: process.platform,
    ts: new Date().toISOString(),
  }, null, 2));

  const allOk = results.every((r: unknown) => (r as { ok: boolean }).ok);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => { console.error("[freetier] fatal:", err); process.exit(2); });
