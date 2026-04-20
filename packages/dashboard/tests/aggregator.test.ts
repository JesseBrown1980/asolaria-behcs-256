import { pollFederation, defaultFederationEndpoints, type PeerEndpoint } from "../src/aggregator.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
console.log("=== N-001 dashboard aggregator tests ===\n");

// Mock transport builder
function mockTransport(responses: Record<string, { ok?: boolean; status?: number; body: any }>) {
  return async (url: string) => {
    const r = responses[url];
    if (!r) return { ok: false, status: 0, body: "no mock for " + url, latency_ms: 0 };
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      body: typeof r.body === "string" ? r.body : JSON.stringify(r.body),
      latency_ms: 5,
    };
  };
}

// T1: happy path all peers ok
console.log("T1: all peers ok");
const peers1: PeerEndpoint[] = [
  { name: "acer-behcs", url: "http://A:4947/behcs/health" },
  { name: "liris-server", url: "http://B:9999/health" },
];
const s1 = await pollFederation({
  peers: peers1,
  transport: mockTransport({
    "http://A:4947/behcs/health": { body: { ok: true, service: "behcs", port: 4947, process_started_at: "2026-04-19T00:00:00Z", source_commit: "b5f287d", uptime_s: 100 } },
    "http://B:9999/health": { body: { ok: true, service: "liris-server", port: 9999, process_started_at: "2026-04-19T01:00:00Z", source_commit: "a5638df", uptime_s: 60 } },
  }),
});
assert(s1.peer_count === 2, "peer_count=2");
assert(s1.ok_count === 2, "ok_count=2");
assert(s1.fail_count === 0, "fail_count=0");

// T2: one peer fails (timeout/500)
console.log("\nT2: one peer fails");
const s2 = await pollFederation({
  peers: peers1,
  transport: mockTransport({
    "http://A:4947/behcs/health": { body: { ok: true, source_commit: "b5f287d" } },
    "http://B:9999/health": { ok: false, status: 500, body: "internal error" },
  }),
});
assert(s2.ok_count === 1, "ok_count=1");
assert(s2.fail_count === 1, "fail_count=1");
const failed = s2.peers.find(p => !p.ok);
assert(failed?.error?.startsWith("http_500") === true, "error field set");

// T3: stale vs reference_commit flagged
console.log("\nT3: stale commit flagged");
const peers3: PeerEndpoint[] = [
  { name: "acer-behcs", url: "http://A/h", reference_commit: "b5f287d" },
  { name: "stale", url: "http://B/h", reference_commit: "b5f287d" },
];
const s3 = await pollFederation({
  peers: peers3,
  transport: mockTransport({
    "http://A/h": { body: { ok: true, source_commit: "b5f287d" } },
    "http://B/h": { body: { ok: true, source_commit: "old-commit" } },
  }),
});
assert(s3.stale_count === 1, "1 stale");
const stale = s3.peers.find(p => p.stale_vs_reference);
assert(stale?.name === "stale", "stale peer identified");

// T4: by_commit roll-up
console.log("\nT4: by_commit roll-up");
assert(Object.keys(s1.by_commit).length === 2, "2 distinct commits in s1");
assert(s1.by_commit["b5f287d"]?.[0] === "acer-behcs", "acer-behcs under b5f287d");

// T5: uptime_exceeds_max flagged
console.log("\nT5: uptime_exceeds_max");
const s5 = await pollFederation({
  peers: [{ name: "old", url: "http://X/h" }],
  max_uptime_s: 50,
  transport: mockTransport({ "http://X/h": { body: { ok: true, uptime_s: 100 } } }),
});
assert(s5.peers[0].uptime_exceeds_max === true, "uptime flag set");
assert(s5.stale_count === 1, "counted as stale");

// T6: parse failure doesn't crash
console.log("\nT6: non-JSON body");
const s6 = await pollFederation({
  peers: [{ name: "bad", url: "http://X/h" }],
  transport: mockTransport({ "http://X/h": { body: "<html>not json</html>" } }),
});
assert(s6.peers[0].ok === true, "ok still true (HTTP 200)");
assert(s6.peers[0].service === undefined, "fields undefined");

// T7: no mock → fail gracefully
console.log("\nT7: no mock");
const s7 = await pollFederation({
  peers: [{ name: "dead", url: "http://Z/h" }],
  transport: mockTransport({}),
});
assert(s7.fail_count === 1, "fail_count=1 on missing mock");

// T8: defaultFederationEndpoints returns expected list
console.log("\nT8: default endpoints");
const defaults = defaultFederationEndpoints("some-token");
assert(defaults.length === 5, "5 default peers");
const names = defaults.map(p => p.name);
assert(names.includes("acer-behcs"), "acer-behcs present");
assert(names.includes("liris-server"), "liris-server present");
const keyboard = defaults.find(p => p.name === "acer-keyboard");
assert(keyboard?.bearer === "some-token", "bearer threaded");

// T9: glyph sentence shape
console.log("\nT9: glyph");
assert(s1.glyph_sentence.startsWith("EVT-FEDERATION-HEALTH"), "starts EVT-FEDERATION-HEALTH");
assert(s1.glyph_sentence.includes("peers="), "peers=");
assert(s1.glyph_sentence.includes("ok="), "ok=");
assert(s1.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends mood");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-001-DASHBOARD-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
