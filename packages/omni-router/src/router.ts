// @asolaria/omni-router — the brain-in-the-middle for thin-worker ferries
// D11:OBSERVED as of 2026-04-18 — stub mode green (100/100 smoke) + freetier
// mode green against opencode-local big-pickle free model (cost:0 material proof).
//
// One Node process, holds free-tier connections, accepts glyph-sentences from N
// thin workers via POST /acp, dispatches to the right endpoint, returns response.
// Never spawns models locally. Never writes to disk outside NDJSON event log.

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { parseGlyphCall, dispatchGlyphLocal, isLocalOp } from "./glyph-dispatch.ts";

const LAW_001_RESERVED_PORTS = new Set([4947, 4950]);

export type RouterMode = "stub" | "echo" | "opencode-local" | "smart";

export interface RouterConfig {
  port: number;
  host?: string;
  eventLogPath?: string;
  mode?: RouterMode;
  openCodeHost?: string;      // default 127.0.0.1
  openCodePort?: number;      // default required when mode=opencode-local
  openCodeSessionId?: string; // pre-created session id; router attaches to it
}

export interface RouterStats {
  startedAt: number;
  requests: number;
  errors: number;
  bytesIn: number;
  bytesOut: number;
  upstream_requests: number;
  upstream_errors: number;
  tokens_in_cumulative: number;
  tokens_out_cumulative: number;
  cost_cumulative: number;
  /** per-lane counters — smart mode */
  lane_glyph_local: number;
  lane_opencode_local: number;
  lane_stub: number;
  lane_errors: number;
}

export interface OmniRouter {
  stats: RouterStats;
  close(): Promise<void>;
  port: number;
}

const DEFAULT_EVENT_LOG = join(homedir(), ".asolaria-workers", "router-events.ndjson");

function postJson(host: string, port: number, path: string, body: string, timeoutMs = 60000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host, port, path, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("upstream timeout")); });
    req.write(body);
    req.end();
  });
}

async function dispatchOpenCodeLocal(
  config: Required<Pick<RouterConfig, "openCodeHost" | "openCodePort" | "openCodeSessionId">>,
  promptText: string
): Promise<{ completion: string; cost: number; tokens_in: number; tokens_out: number; modelID: string; upstream_status: number; upstream_body: string }> {
  const path = `/session/${config.openCodeSessionId}/message`;
  const body = JSON.stringify({ parts: [{ type: "text", text: promptText }] });
  const up = await postJson(config.openCodeHost, config.openCodePort, path, body);
  let completion = "";
  let cost = 0, tokens_in = 0, tokens_out = 0, modelID = "";
  try {
    const parsed = JSON.parse(up.body);
    modelID = parsed?.info?.modelID ?? "";
    cost = parsed?.info?.cost ?? 0;
    tokens_in = parsed?.info?.tokens?.input ?? 0;
    tokens_out = parsed?.info?.tokens?.output ?? 0;
    const textParts = (parsed?.parts ?? []).filter((p: { type?: string }) => p?.type === "text");
    completion = textParts.map((p: { text?: string }) => p?.text ?? "").join("").trim();
  } catch { /* leave defaults */ }
  return { completion, cost, tokens_in, tokens_out, modelID, upstream_status: up.status, upstream_body: up.body };
}

export function startRouter(config: RouterConfig): Promise<OmniRouter> {
  if (LAW_001_RESERVED_PORTS.has(config.port)) {
    throw new Error(`LAW-001 violation: port ${config.port} is reserved (4947+4950 ALWAYS OPEN)`);
  }
  const mode: RouterMode = config.mode ?? "stub";
  const eventLogPath = config.eventLogPath ?? DEFAULT_EVENT_LOG;
  mkdirSync(dirname(eventLogPath), { recursive: true });

  const stats: RouterStats = {
    startedAt: Date.now(),
    requests: 0, errors: 0, bytesIn: 0, bytesOut: 0,
    upstream_requests: 0, upstream_errors: 0,
    tokens_in_cumulative: 0, tokens_out_cumulative: 0, cost_cumulative: 0,
    lane_glyph_local: 0, lane_opencode_local: 0, lane_stub: 0, lane_errors: 0,
  };

  const appendEvent = (rec: Record<string, unknown>): void => {
    try { appendFileSync(eventLogPath, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n"); }
    catch { stats.errors++; }
  };

  if (mode === "opencode-local") {
    if (!config.openCodePort || !config.openCodeSessionId) {
      throw new Error("opencode-local mode requires openCodePort + openCodeSessionId");
    }
  }
  if (mode === "smart" && (!config.openCodePort || !config.openCodeSessionId)) {
    // smart without opencode wiring is allowed — just warns in first request
    appendEvent({ event: "EVT-ROUTER-SMART-WITHOUT-CLOUD", port: config.port });
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    stats.requests++;
    const url = req.url ?? "";
    const glyph = (req.headers["x-behcs256-glyph"] as string) || "PID-UNSET";

    if (req.method === "GET" && url === "/health") {
      const body = JSON.stringify({ ok: true, mode, stats });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      stats.bytesOut += body.length;
      return;
    }

    if (req.method !== "POST" || url !== "/acp") {
      const body = JSON.stringify({ ok: false, error: "not_found" });
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(body);
      stats.bytesOut += body.length;
      stats.errors++;
      return;
    }

    const chunks: Buffer[] = [];
    let inLen = 0;
    req.on("data", (c: Buffer) => { chunks.push(c); inLen += c.length; });
    await new Promise<void>((resolve, reject) => { req.on("end", () => resolve()); req.on("error", reject); });
    stats.bytesIn += inLen;
    const reqBody = Buffer.concat(chunks).toString("utf-8");

    let parsed: Record<string, unknown> = {};
    try { parsed = reqBody ? JSON.parse(reqBody) : {}; } catch { /* leave as {} */ }

    const taskId = (parsed.task_id as string) || `task-${stats.requests}`;
    const message = (parsed.message as string) || (parsed.task as string) || (parsed.text as string) || "(empty)";

    let respObj: Record<string, unknown>;

    if (mode === "smart") {
      // LAW-014 lane-select: glyph-local first, opencode-local fallthrough
      const call = parseGlyphCall(message);
      if (call && isLocalOp(call.op)) {
        const g = await dispatchGlyphLocal(call);
        stats.lane_glyph_local++;
        respObj = {
          ok: g.ok, glyph, task_id: taskId,
          completion: g.result,
          lane: "glyph-local",
          tokens: { input: 0, output: 0 },
          cost: 0,
          latency_ms: g.latency_ms,
          error: g.error,
        };
        appendEvent({
          event: "EVT-ROUTER-LANE-GLYPH-LOCAL",
          glyph, task_id: taskId, op: call.op, ok: g.ok, ms: g.latency_ms,
        });
      } else if (config.openCodePort && config.openCodeSessionId) {
        // Fallthrough to opencode-local
        stats.upstream_requests++;
        stats.lane_opencode_local++;
        try {
          const r = await dispatchOpenCodeLocal({
            openCodeHost: config.openCodeHost ?? "127.0.0.1",
            openCodePort: config.openCodePort,
            openCodeSessionId: config.openCodeSessionId,
          }, message);
          stats.tokens_in_cumulative += r.tokens_in;
          stats.tokens_out_cumulative += r.tokens_out;
          stats.cost_cumulative += r.cost;
          respObj = {
            ok: r.upstream_status >= 200 && r.upstream_status < 300,
            glyph, task_id: taskId,
            completion: r.completion,
            lane: "opencode-local",
            model: r.modelID,
            cost: r.cost,
            tokens: { input: r.tokens_in, output: r.tokens_out },
            upstream_status: r.upstream_status,
          };
          appendEvent({
            event: "EVT-ROUTER-LANE-OPENCODE",
            glyph, task_id: taskId, model: r.modelID, cost: r.cost,
            tokens_in: r.tokens_in, tokens_out: r.tokens_out,
          });
        } catch (err: unknown) {
          stats.upstream_errors++;
          stats.lane_errors++;
          const msg = (err as Error)?.message ?? String(err);
          respObj = { ok: false, glyph, task_id: taskId, lane: "opencode-local-failed", error: msg };
          appendEvent({ event: "EVT-ROUTER-LANE-OPENCODE-FAILED", glyph, task_id: taskId, error: msg });
        }
      } else {
        // No opencode session configured and glyph didn't match local registry → stub fallback
        stats.lane_stub++;
        respObj = {
          ok: false, glyph, task_id: taskId,
          lane: "no-lane",
          error: "unknown_op_and_no_cloud_configured",
          message_prefix: message.slice(0, 80),
        };
      }
    } else if (mode === "echo") {
      respObj = { ok: true, glyph, echoed: parsed, ts: Date.now() };
    } else if (mode === "opencode-local") {
      stats.upstream_requests++;
      try {
        const r = await dispatchOpenCodeLocal({
          openCodeHost: config.openCodeHost ?? "127.0.0.1",
          openCodePort: config.openCodePort!,
          openCodeSessionId: config.openCodeSessionId!,
        }, message);
        stats.tokens_in_cumulative += r.tokens_in;
        stats.tokens_out_cumulative += r.tokens_out;
        stats.cost_cumulative += r.cost;
        respObj = {
          ok: r.upstream_status >= 200 && r.upstream_status < 300,
          glyph, task_id: taskId,
          completion: r.completion,
          model: r.modelID,
          cost: r.cost,
          tokens: { input: r.tokens_in, output: r.tokens_out },
          upstream_status: r.upstream_status,
          mode: "opencode-local",
        };
        appendEvent({
          event: "EVT-ROUTER-UPSTREAM-OPENCODE",
          glyph, task_id: taskId,
          model: r.modelID, cost: r.cost,
          tokens_in: r.tokens_in, tokens_out: r.tokens_out,
          upstream_status: r.upstream_status,
        });
      } catch (err: unknown) {
        stats.upstream_errors++;
        const msg = (err as Error)?.message ?? String(err);
        respObj = { ok: false, glyph, task_id: taskId, error: "upstream_failed", detail: msg };
        appendEvent({ event: "EVT-ROUTER-UPSTREAM-FAILED", glyph, task_id: taskId, error: msg });
      }
    } else {
      respObj = {
        ok: true, glyph, task_id: taskId,
        completion: `STUB-ROUTER received ${message.length} chars from ${glyph} at ${new Date().toISOString()}`,
        mode: "stub",
        router_req_count: stats.requests,
      };
    }

    const body = JSON.stringify(respObj);
    res.writeHead(200, { "Content-Type": "application/json", "X-BEHCS256-Router": mode });
    res.end(body);
    stats.bytesOut += body.length;
    appendEvent({ event: "EVT-ROUTER-DISPATCH", glyph, bytes_in: inLen, bytes_out: body.length, mode });
  };

  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      stats.errors++;
      try {
        const body = JSON.stringify({ ok: false, error: String(err?.message || err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(body);
      } catch { /* give up cleanly */ }
    });
  });

  return new Promise<OmniRouter>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host ?? "127.0.0.1", () => {
      appendEvent({ event: "EVT-ROUTER-STARTED", port: config.port, mode });
      resolve({
        stats, port: config.port,
        close: () => new Promise<void>((r) => {
          server.close(() => {
            appendEvent({ event: "EVT-ROUTER-STOPPED", port: config.port, final_stats: stats });
            r();
          });
        }),
      });
    });
  });
}
