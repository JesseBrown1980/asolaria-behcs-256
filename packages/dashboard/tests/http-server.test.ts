import { startDashboardServer, defaultDashboardInput } from "../src/http-server.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
console.log("=== N-003 dashboard HTTP server tests ===\n");

// Use a mock aggregator_input with mock transport so no real network
const mockInput = () => ({
  peers: [
    { name: "fake-1", url: "http://fake-1/h" },
    { name: "fake-2", url: "http://fake-2/h" },
  ],
  transport: async (url: string) => ({
    ok: true, status: 200,
    body: JSON.stringify({ ok: true, service: "fake", source_commit: "abc", uptime_s: 10 }),
    latency_ms: 5,
  }),
});

const srv = await startDashboardServer({
  port: 0,  // let OS pick
  aggregator_input: mockInput,
});

// T1: /health returns 200 + staleness fields
console.log("T1: /health");
const h1 = await srv.handle("/health");
assert(h1.status === 200, "HTTP 200");
assert(h1.content_type === "application/json", "json content-type");
const hj = JSON.parse(h1.body);
assert(hj.ok === true, "ok=true");
assert(typeof hj.process_started_at === "string", "process_started_at present");
assert(typeof hj.source_commit === "string", "source_commit present");

// T2: / returns rendered snapshot
console.log("\nT2: / render");
const r1 = await srv.handle("/");
assert(r1.status === 200, "200");
assert(r1.content_type.startsWith("text/plain"), "text/plain");
assert(r1.body.includes("FEDERATION HEALTH SNAPSHOT"), "has header");
assert(r1.body.includes("fake-1"), "peer listed");

// T3: /one-liner
console.log("\nT3: /one-liner");
const r2 = await srv.handle("/one-liner");
assert(r2.status === 200, "200");
assert(/\[(GREEN|YELLOW|RED)\]/.test(r2.body), "[STATUS] prefix");

// T4: /status alias for /one-liner
console.log("\nT4: /status alias");
const r3 = await srv.handle("/status");
assert(r3.status === 200, "200");
assert(/\[(GREEN|YELLOW|RED)\]/.test(r3.body), "status alias works");

// T5: /json
console.log("\nT5: /json");
const r4 = await srv.handle("/json");
assert(r4.status === 200, "200");
assert(r4.content_type === "application/json", "json");
const snap = JSON.parse(r4.body);
assert(typeof snap.peer_count === "number", "peer_count present");
assert(Array.isArray(snap.peers), "peers array");
assert(snap.peer_count === 2, "2 peers from mock");

// T6: 404 on unknown route
console.log("\nT6: unknown route → 404");
const r5 = await srv.handle("/nope");
assert(r5.status === 404, "404");
const nj = JSON.parse(r5.body);
assert(Array.isArray(nj.routes), "routes list in 404 body");

// T7: /render alias
console.log("\nT7: /render alias");
const r6 = await srv.handle("/render");
assert(r6.status === 200, "200");
assert(r6.body.includes("FEDERATION"), "renders");

// T8: server port assigned and stoppable
console.log("\nT8: server lifecycle");
assert(typeof srv.port === "number" && srv.port > 0, "port assigned");
await srv.stop();
assert(true, "stop resolves without throwing");

// T9: defaultDashboardInput shape
console.log("\nT9: defaultDashboardInput");
const di = defaultDashboardInput();
assert(Array.isArray(di.peers) && di.peers.length === 5, "5 default peers");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-003-HTTP-SERVER-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
