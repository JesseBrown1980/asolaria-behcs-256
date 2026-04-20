import { renderSnapshot, renderOneLiner } from "../src/cli.ts";
import type { FederationSnapshot } from "../src/aggregator.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== N-002 dashboard CLI tests ===\n");

const snap: FederationSnapshot = {
  polled_at: "2026-04-19T04:00:00Z",
  peer_count: 3,
  ok_count: 2,
  fail_count: 1,
  stale_count: 1,
  peers: [
    { name: "acer-behcs", url: "http://A/h", ok: true, http_status: 200, latency_ms: 5, service: "behcs", process_started_at: "2026-04-19T00:00:00Z", source_commit: "b5f287d0e98a", uptime_s: 14400, stale_vs_reference: false, uptime_exceeds_max: false },
    { name: "liris-server", url: "http://B/h", ok: true, http_status: 200, latency_ms: 8, service: "liris-server", process_started_at: "2026-04-19T01:00:00Z", source_commit: "a5638dfa677e", uptime_s: 10800, stale_vs_reference: true, uptime_exceeds_max: false },
    { name: "dead-peer", url: "http://C/h", ok: false, http_status: 0, latency_ms: 5000, error: "timeout", stale_vs_reference: false, uptime_exceeds_max: false },
  ],
  by_commit: { "b5f287d0e98a": ["acer-behcs"], "a5638dfa677e": ["liris-server"], "(unknown)": ["dead-peer"] },
  glyph_sentence: "EVT-FEDERATION-HEALTH · peers=3 · ok=2 · fail=1 · stale=1 · commits=3 · @ M-EYEWITNESS .",
};

// T1: renderSnapshot contains header + peers + glyph
console.log("T1: renderSnapshot structure");
const rendered = renderSnapshot(snap);
assert(rendered.includes("FEDERATION HEALTH SNAPSHOT"), "has header");
assert(rendered.includes("peers=3"), "has peers= stat");
assert(rendered.includes("acer-behcs"), "has peer name");
assert(rendered.includes("liris-server"), "has second peer");
assert(rendered.includes("dead-peer"), "has failed peer");
assert(rendered.includes("EVT-FEDERATION-HEALTH"), "has glyph");

// T2: commit shown
console.log("\nT2: commit shown");
assert(rendered.includes("b5f287d0e98a"), "acer commit shown");
assert(rendered.includes("a5638dfa677e"), "liris commit shown");

// T3: stale peer flagged with symbol
console.log("\nT3: stale flag");
const lirisLine = rendered.split("\n").find(l => l.includes("liris-server"));
assert(lirisLine !== undefined, "liris line found");
assert(/⚠|STALE/.test(lirisLine ?? ""), "stale symbol");

// T4: error shown on failed peer
console.log("\nT4: error on failed peer");
const deadLine = rendered.split("\n").find(l => l.includes("dead-peer"));
assert(deadLine?.includes("err=timeout") === true, "err= on failed peer");

// T5: commit roll-up section
console.log("\nT5: by-commit roll-up");
assert(rendered.includes("BY COMMIT:"), "by-commit header");

// T6: ascii_only swaps symbols
console.log("\nT6: ascii-only");
const ascii = renderSnapshot(snap, { ascii_only: true });
assert(ascii.includes("OK "), "ASCII OK");
assert(ascii.includes("FAIL"), "ASCII FAIL");
assert(!ascii.includes("✓"), "no checkmark");

// T7: show_commits=false hides commit column
console.log("\nT7: show_commits=false");
const noCommits = renderSnapshot(snap, { show_commits: false });
assert(!noCommits.includes("BY COMMIT:"), "no by-commit section");

// T8: uptime formatted
console.log("\nT8: uptime formatting");
assert(rendered.includes("4h"), "uptime renders hours (14400s = 4h)");

// T9: renderOneLiner shape
console.log("\nT9: one-liner");
const line = renderOneLiner(snap);
assert(line.startsWith("[RED]"), "[RED] prefix when fail>0");
assert(line.includes("2/3 ok"), "ok count");
assert(line.includes("1 fail"), "fail count");

// T10: all-green one-liner
console.log("\nT10: all-green one-liner");
const green = renderOneLiner({ ...snap, fail_count: 0, stale_count: 0, peers: snap.peers.filter(p => p.ok) });
assert(green.startsWith("[GREEN]"), "[GREEN] when all ok");

// T11: yellow one-liner (stale but no fail)
console.log("\nT11: yellow one-liner");
const yellow = renderOneLiner({ ...snap, fail_count: 0, stale_count: 1 });
assert(yellow.startsWith("[YELLOW]"), "[YELLOW] when stale-only");

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-N-002-CLI-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
