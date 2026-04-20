// packages/dashboard/src/http-server.ts — N-003 dashboard HTTP server
//
// Exposes N-001 aggregator + N-002 renderer via a small HTTP surface so
// operators can curl for federation health without running node directly.
//
// Routes:
//   GET /               → plain-text rendered snapshot (renderSnapshot)
//   GET /one-liner      → single-line [GREEN|YELLOW|RED] status
//   GET /json           → raw FederationSnapshot JSON
//   GET /health         → self-health (G-090 staleness surface)
//
// Polls federation on each request (simple; cache layer could be added).
// Pure builder — caller calls start() to bind. Test with injected server.

import { createServer, type Server } from "node:http";
import { execSync } from "node:child_process";
import { pollFederation, defaultFederationEndpoints, type AggregatorInput, type FederationSnapshot } from "./aggregator.ts";
import { renderSnapshot, renderOneLiner, type RenderOptions } from "./cli.ts";
import { renderMetrics, type MetricsSources } from "./metrics-endpoint.ts";

// G-090 self-staleness
const PROCESS_STARTED_AT = new Date().toISOString();
let SOURCE_COMMIT = "unknown";
try { SOURCE_COMMIT = execSync("git -C C:/asolaria-acer rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim().slice(0, 12); } catch {}

export interface DashboardServerOptions {
  port?: number;
  host?: string;
  aggregator_input: () => AggregatorInput;
  render_options?: RenderOptions;
  metrics_sources?: () => Omit<MetricsSources, "federation_snapshot">;
}

export interface DashboardServerHandle {
  port: number;
  stop: () => Promise<void>;
  // Exposed for testing: process a request without binding
  handle: (pathname: string) => Promise<{ status: number; content_type: string; body: string }>;
}

export async function startDashboardServer(opts: DashboardServerOptions): Promise<DashboardServerHandle> {
  const port = opts.port ?? 9996;
  const host = opts.host ?? "127.0.0.1";

  const handleReq = async (pathname: string): Promise<{ status: number; content_type: string; body: string }> => {
    if (pathname === "/" || pathname === "/render") {
      const snap = await pollFederation(opts.aggregator_input());
      return { status: 200, content_type: "text/plain; charset=utf-8", body: renderSnapshot(snap, opts.render_options) };
    }
    if (pathname === "/one-liner" || pathname === "/status") {
      const snap = await pollFederation(opts.aggregator_input());
      return { status: 200, content_type: "text/plain; charset=utf-8", body: renderOneLiner(snap) + "\n" };
    }
    if (pathname === "/json") {
      const snap = await pollFederation(opts.aggregator_input());
      return { status: 200, content_type: "application/json", body: JSON.stringify(snap, null, 2) };
    }
    if (pathname === "/health") {
      return {
        status: 200,
        content_type: "application/json",
        body: JSON.stringify({
          ok: true,
          service: "dashboard-http",
          port,
          apex: "COL-ASOLARIA",
          process_started_at: PROCESS_STARTED_AT,
          source_commit: SOURCE_COMMIT,
          uptime_s: Math.round(process.uptime()),
        }),
      };
    }
    if (pathname === "/metrics") {
      const sources = opts.metrics_sources ? opts.metrics_sources() : {};
      const snap = await pollFederation(opts.aggregator_input());
      return {
        status: 200,
        content_type: "text/plain; version=0.0.4; charset=utf-8",
        body: renderMetrics({ ...sources, federation_snapshot: snap }),
      };
    }
    return {
      status: 404,
      content_type: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "not_found",
        path: pathname,
        routes: ["/", "/render", "/one-liner", "/status", "/json", "/health", "/metrics"],
      }),
    };
  };

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);
      const r = await handleReq(url.pathname);
      res.writeHead(r.status, { "content-type": r.content_type });
      res.end(r.body);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "handler_threw", detail: (e as Error).message }));
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  const addr = server.address();
  const boundPort = typeof addr === "object" && addr ? addr.port : port;

  return {
    port: boundPort,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    handle: handleReq,
  };
}

// Convenience: build with default federation endpoints
export function defaultDashboardInput(): AggregatorInput {
  return { peers: defaultFederationEndpoints() };
}
