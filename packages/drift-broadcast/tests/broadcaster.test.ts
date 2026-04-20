// packages/drift-broadcast/tests/broadcaster.test.ts — F-077 tests

import { detectDrift, broadcastDrift, detectAndBroadcast, type DriftDetection } from "../src/broadcaster.ts";
import { AsolariaInstance, type SpawnRequest } from "../../device-instance/src/index.ts";
import { mintKey } from "../../kernel/src/ed25519-registry.ts";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== F-077 drift-broadcast tests ===\n");

async function main() {
const TESTDIR = join(tmpdir(), "asolaria-f077-tests-" + Date.now());
mkdirSync(TESTDIR, { recursive: true });

function spawnReq(extra: Partial<SpawnRequest> = {}): SpawnRequest {
  return {
    permanent_name: "test-instance",
    hilbert_pid: "PID-H01-TEST-DEV-X-I001-Sabcdef01",
    shape_fingerprint: { scale_1: "a", scale_10: "b", scale_100: "c", scale_1k: "d", scale_10k: "e" },
    first_observation_tuple: {
      ts: "2026-04-18T00:00:00Z",
      observer_pid: "dev-acer-test",
      observer_surface: "asolaria",
      operator_id: "jesse",
      host_surface: "test-host",
    },
    operator_witness: "jesse",
    ...extra,
  };
}

// Helper — mint a key for signing
const k = mintKey({ owner_glyph: "DEV-ACER", host_device: "DEV-ACER" });

// T1: detectDrift returns null when no drift
console.log("T1: no drift → null");
const p1 = join(TESTDIR, "instance-clean.json");
AsolariaInstance.spawn(p1, spawnReq({ permanent_name: "clean-inst" }));
const d1 = detectDrift({ instance_path: p1, observer_pid: "dev-acer-test" });
assert(d1 === null, "no drift returns null");

// T2: detectDrift returns null when missing file
console.log("\nT2: missing file → null");
const d2 = detectDrift({ instance_path: join(TESTDIR, "nonexistent.json"), observer_pid: "test" });
assert(d2 === null, "missing file returns null");

// T3: detectDrift respects prior_drift_log_length (new entries only)
// NOTE: external-file-tamper is out of F-077 scope (manifest-schema layer);
// F-077 focuses on drift_log-driven alarms.
console.log("\nT3: new drift_log entries detected");
const p3 = join(TESTDIR, "drift-log.json");
// Construct a manifest with a drift_log entry manually (appendDriftLog in
// current instance.ts library strips last_verified_by — bug, not F-077 scope)
const manifestWithDrift = {
  permanent_name: "driftlog-inst",
  hilbert_pid: "PID-H01-TEST-DEV-X-I001-Sabcdef01",
  shape_fingerprint: { scale_1: "a", scale_10: "b", scale_100: "c", scale_1k: "d", scale_10k: "e" },
  first_observation_tuple: {
    ts: "2026-04-18T00:00:00Z",
    observer_pid: "dev-acer-test",
    observer_surface: "asolaria",
    operator_id: "jesse",
    host_surface: "test-host",
  },
  provenance: "original",
  last_verified_at: "2026-04-18T00:00:00Z",
  last_verified_by: "jesse",
  constitutional_clauses: [
    "no_mutation_without_operator_acknowledged_rebind",
    "verify_on_every_touch",
    "halt_on_fingerprint_drift",
  ],
  location_history: [],
  drift_log: [{
    ts: "2026-04-18T01:00:00Z",
    type: "fingerprint",
    observed_location: "DESKTOP-J99VCNH",
    expected_location: "DESKTOP-J99VCNH",
    broadcast_to: [],
    broadcast_ack: [],
    resolution: "pending",
    classification: "lined-up",
  }],
  schema_version: "1.0.0",
};
writeFileSync(p3, JSON.stringify(manifestWithDrift));
// Detect with prior_length=0 → should see 1 new entry
const d3 = detectDrift({ instance_path: p3, observer_pid: "dev-acer-test", prior_drift_log_length: 0 });
assert(d3 !== null, "1 new entry detected");
assert(d3?.drift_log_entries.length === 1, "1 entry reported");
assert(d3?.drift_kind === "new_drift_log_entry" || d3?.drift_kind === "both", `drift_kind=${d3?.drift_kind}`);
assert(d3?.permanent_name === "driftlog-inst", "permanent_name correct");

// T4: detectDrift returns null when caller is caught up
console.log("\nT4: caught up → null");
const d4b = detectDrift({ instance_path: p3, observer_pid: "dev-acer-test", prior_drift_log_length: 1 });
assert(d4b === null, "no new entries after catching up");

// T5: broadcastDrift refuses without signing key
console.log("\nT5: broadcastDrift refuses without key");
const fakeDet: DriftDetection = {
  instance_path: "x", permanent_name: "x", hilbert_pid: "x", instance_sha256: "x",
  drift_kind: "verify_failed", verify_result: { ok: false, violations: [] },
  drift_log_entries: [], observed_at: "x", observer_pid: "x",
};
try {
  await broadcastDrift({ detection: fakeDet, signing_key_id: "", signing_private_key_b64: "", peers: ["http://x:4947"] });
  fail++; console.log("  FAIL  should have thrown");
} catch (e) {
  pass++; console.log("  PASS  threw on missing signing key_id");
}

// T6: broadcastDrift signs + uses injected transport
console.log("\nT6: broadcastDrift signs + sends to peers");
const calls: Array<{ url: string; body: any }> = [];
const mockTransport = async (url: string, body: string) => {
  calls.push({ url, body: JSON.parse(body) });
  return { ok: true, status: 200, text: '{"ok":true,"by":"mock"}' };
};
const r6 = await broadcastDrift({
  detection: fakeDet,
  signing_key_id: k.entry.key_id,
  signing_private_key_b64: k.private_key_b64,
  peers: ["http://peer1:4947", "http://peer2:4947"],
  transport: mockTransport,
});
assert(r6.ok === true, "ok=true when all succeed");
assert(r6.destinations_succeeded.length === 2, "2 peers succeeded");
assert(r6.destinations_failed.length === 0, "0 failures");
assert(calls.length === 2, "2 transport calls made");
assert(calls[0].body.payload.verb === "drift-detected", "payload.verb=drift-detected");
assert(calls[0].body.signature.key_id === k.entry.key_id, "signature.key_id matches");

// T7: broadcastDrift reports mixed success/failure
console.log("\nT7: mixed success/failure");
const flaky = async (url: string, body: string) => {
  if (url.includes("peer1")) return { ok: true, status: 200, text: "ok" };
  return { ok: false, status: 500, text: "peer2 down" };
};
const r7 = await broadcastDrift({
  detection: fakeDet,
  signing_key_id: k.entry.key_id,
  signing_private_key_b64: k.private_key_b64,
  peers: ["http://peer1:4947", "http://peer2:4947"],
  transport: flaky,
});
assert(r7.ok === false, "ok=false when any peer fails");
assert(r7.destinations_succeeded.length === 1, "1 succeeded");
assert(r7.destinations_failed.length === 1, "1 failed");
assert(r7.destinations_failed[0].reason.startsWith("http_500"), "failure reason captured");

// T8: detectAndBroadcast returns null when no drift
console.log("\nT8: detectAndBroadcast no-drift case");
const p8 = join(TESTDIR, "clean-db.json");
AsolariaInstance.spawn(p8, spawnReq({ permanent_name: "clean-db-inst" }));
const r8 = await detectAndBroadcast({
  instance_path: p8, observer_pid: "t",
  signing_key_id: k.entry.key_id, signing_private_key_b64: k.private_key_b64,
  peers: ["http://x:4947"], transport: mockTransport,
});
assert(r8 === null, "null when no drift to broadcast");

// T9: glyph sentence shape
console.log("\nT9: glyph sentence");
assert(r6.glyph_sentence.includes("EVT-DRIFT-BROADCAST"), "has EVT-DRIFT-BROADCAST");
assert(r6.glyph_sentence.includes("peers=2/2"), "has peer count");
assert(r6.glyph_sentence.endsWith("@ M-EYEWITNESS ."), "ends with mood");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-F-077-DRIFT-BROADCAST-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
