#!/usr/bin/env node
// N-004 dashboard-daemon.mjs — standalone HTTP dashboard service
//
// Runs N-003 startDashboardServer with the default federation endpoint
// set. Env overrides:
//   DASHBOARD_PORT         bind port (default 9993)
//   DASHBOARD_HOST         bind host (default 127.0.0.1)
//   ACER_KEYBOARD_TOKEN    bearer for acer:4913 (optional)
//   DASHBOARD_MAX_UPTIME_S max uptime before stale flag (default infinity)
//
// G-090 staleness surface exposed at /health.
// Launch with tsx (imports .ts sources): `tsx packages/dashboard/scripts/dashboard-daemon.mjs`

import { startDashboardServer, defaultDashboardInput } from "../src/http-server.ts";

const port = parseInt(process.env.DASHBOARD_PORT || "9993", 10);
const host = process.env.DASHBOARD_HOST || "127.0.0.1";
const maxUptime = process.env.DASHBOARD_MAX_UPTIME_S ? parseInt(process.env.DASHBOARD_MAX_UPTIME_S, 10) : undefined;
const bearer = process.env.ACER_KEYBOARD_TOKEN;

const aggregator_input = () => {
  const base = defaultDashboardInput();
  if (bearer) {
    base.peers = base.peers.map(p => p.name === "acer-keyboard" ? { ...p, bearer } : p);
  }
  if (maxUptime !== undefined) base.max_uptime_s = maxUptime;
  return base;
};

const srv = await startDashboardServer({ port, host, aggregator_input });

console.log("dashboard-daemon LIVE");
console.log(`  bind http://${host}:${srv.port}`);
console.log("  routes: / /render /one-liner /status /json /health");
console.log("  peers:", aggregator_input().peers.map(p => p.name).join(", "));
console.log("META-ACER-DASHBOARD-DAEMON-STARTED · port=" + srv.port + " @ M-EYEWITNESS .");
