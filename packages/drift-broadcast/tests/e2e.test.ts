// packages/drift-broadcast/tests/e2e.test.ts — F-079 end-to-end
//
// Exercises the full F-077 + F-078 pipeline:
//   1. Spawn a real AsolariaInstance manifest on disk
//   2. Inject a drift_log entry + tamper the permanent_name (simulate drift)
//   3. detectDrift → flag observable
//   4. broadcastDrift via mock transport → multi-peer fanout
//   5. ingestDrift from each peer into history ledger (using their registries)
//   6. quorumForDrift → verify 3 independent signers agree on same instance_sha256
//   7. summarizeHistory → verify roll-up reflects reality
//
// All with signed envelopes using D-055 keys for 3 synthetic peers.

import { detectDrift, broadcastDrift, detectAndBroadcast } from "../src/broadcaster.ts";
import { ingestDrift, loadHistory, queryHistory, quorumForDrift, summarizeHistory } from "../src/history.ts";
import { mintKey, registerKey, loadRegistry, saveRegistry } from "../../kernel/src/ed25519-registry.ts";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
console.log("=== F-079 drift-broadcast end-to-end ===\n");

const TESTDIR = join(tmpdir(), "asolaria-f079-" + Date.now());
mkdirSync(TESTDIR, { recursive: true });
const HISTORY = join(TESTDIR, "history.ndjson");
const REG_ACER   = join(TESTDIR, "reg-acer.json");
const REG_LIRIS  = join(TESTDIR, "reg-liris.json");
const REG_FALCON = join(TESTDIR, "reg-falcon.json");

// Build 3 peer registries — each peer knows all 3 public keys but only
// has its own private (real-world shape)
const keys: Record<string, { key_id: string; priv: string; pub: string }> = {};
for (const owner of ["DEV-ACER", "DEV-LIRIS", "DEV-FALCON"]) {
  const m = mintKey({ owner_glyph: owner, host_device: owner });
  keys[owner] = { key_id: m.entry.key_id, priv: m.private_key_b64, pub: m.entry.public_key_b64 };
}
// Shared public registry (each peer sees all pubkeys)
let sharedReg = loadRegistry(REG_ACER);
for (const owner of ["DEV-ACER", "DEV-LIRIS", "DEV-FALCON"]) {
  sharedReg = registerKey(sharedReg, {
    key_id: keys[owner].key_id,
    owner_glyph: owner,
    public_key_b64: keys[owner].pub,
    d11_level: "ASSUMED",
    created_at: new Date().toISOString(),
    rotated_at: null,
    usage: ["behcs-envelope"],
    binding_class: "device-bound",
    host_device: owner,
    notes: "f079-test",
  });
}
saveRegistry(sharedReg, REG_ACER);
saveRegistry(sharedReg, REG_LIRIS);
saveRegistry(sharedReg, REG_FALCON);

// Build a manifest with a drift_log entry (simulates a "drifted" instance)
const instancePath = join(TESTDIR, "subject-instance.json");
const driftedManifest = {
  permanent_name: "subject-drifted",
  hilbert_pid: "PID-H01-SUBJECT-DEV-X-I001-S00000000",
  shape_fingerprint: { scale_1: "a", scale_10: "b", scale_100: "c", scale_1k: "d", scale_10k: "e" },
  first_observation_tuple: {
    ts: "2026-04-19T00:00:00Z",
    observer_pid: "dev-acer-test",
    observer_surface: "asolaria",
    operator_id: "jesse",
    host_surface: "test-host",
  },
  provenance: "original",
  last_verified_at: "2026-04-19T00:00:00Z",
  last_verified_by: "jesse",
  constitutional_clauses: [
    "no_mutation_without_operator_acknowledged_rebind",
    "verify_on_every_touch",
    "halt_on_fingerprint_drift",
  ],
  location_history: [],
  drift_log: [{
    ts: "2026-04-19T01:00:00Z",
    type: "fingerprint",
    observed_location: "DESKTOP-X",
    expected_location: "DESKTOP-X",
    broadcast_to: [],
    broadcast_ack: [],
    resolution: "pending",
    classification: "lined-up",
  }],
  schema_version: "1.0.0",
};
writeFileSync(instancePath, JSON.stringify(driftedManifest));

// ──────────────────────────────────────────────────────────────────────
// T1: detectDrift spots the drift_log entry
// ──────────────────────────────────────────────────────────────────────
console.log("T1: detectDrift flags drift_log entry");
const det = detectDrift({ instance_path: instancePath, observer_pid: keys["DEV-ACER"].key_id, prior_drift_log_length: 0 });
assert(det !== null, "drift detected");
assert(det?.drift_log_entries.length === 1, "1 drift entry");
assert(det?.permanent_name === "subject-drifted", "permanent_name correct");

// ──────────────────────────────────────────────────────────────────────
// T2: broadcastDrift to 3 peers via mock transport
// ──────────────────────────────────────────────────────────────────────
console.log("\nT2: broadcastDrift fan-out");
const received: Array<{ peer: string; body: string }> = [];
const mockTransport = async (url: string, body: string) => {
  received.push({ peer: url, body });
  return { ok: true, status: 200, text: '{"ok":true}' };
};
const bres = await broadcastDrift({
  detection: det!,
  signing_key_id: keys["DEV-ACER"].key_id,
  signing_private_key_b64: keys["DEV-ACER"].priv,
  peers: ["http://liris:4947", "http://falcon:4947"],
  transport: mockTransport,
});
assert(bres.ok === true, "broadcast ok");
assert(received.length === 2, "2 peers got the broadcast");
assert(bres.signed_envelope.signature.key_id === keys["DEV-ACER"].key_id, "signed by acer");

// ──────────────────────────────────────────────────────────────────────
// T3: each peer ingests (using shared registry) — all 3 verify
// Simulate 3 independent signers by re-signing with each peer key
// ──────────────────────────────────────────────────────────────────────
console.log("\nT3: 3-peer ingest + verify");
const peerRegistries = { "DEV-ACER": REG_ACER, "DEV-LIRIS": REG_LIRIS, "DEV-FALCON": REG_FALCON };

// Acer already broadcasted; now simulate liris + falcon also observing the same drift
for (const peer of ["DEV-LIRIS", "DEV-FALCON"] as const) {
  const peerBres = await broadcastDrift({
    detection: det!,
    signing_key_id: keys[peer].key_id,
    signing_private_key_b64: keys[peer].priv,
    peers: ["http://local:4947"],
    transport: mockTransport,
  });
  ingestDrift(peerBres.signed_envelope, loadRegistry(peerRegistries[peer]), { historyPath: HISTORY });
}
// Ingest acer's broadcast too
ingestDrift(bres.signed_envelope, loadRegistry(REG_ACER), { historyPath: HISTORY });

const all = loadHistory(HISTORY);
assert(all.length === 3, `3 history entries (got ${all.length})`);
assert(all.every(e => e.verified), "all 3 verified");

// ──────────────────────────────────────────────────────────────────────
// T4: quorumForDrift finds 3 distinct signers on same instance_sha256
// ──────────────────────────────────────────────────────────────────────
console.log("\nT4: cross-peer quorum");
const q = quorumForDrift({ instance_sha256: det!.instance_sha256, historyPath: HISTORY });
assert(q.distinct_signers.length === 3, `3 distinct signers (got ${q.distinct_signers.length}): ${q.distinct_signers.join(",")}`);
assert(q.verified_count === 3, "3 verified in quorum");
assert(q.unverified_count === 0, "0 unverified");
assert(q.all_drift_kinds.length === 1, "1 drift_kind (all same event)");

// ──────────────────────────────────────────────────────────────────────
// T5: tampered broadcast from a 4th signer → ingested but not verified
// ──────────────────────────────────────────────────────────────────────
console.log("\nT5: tampered envelope fails verify");
const tampered = JSON.parse(JSON.stringify(bres.signed_envelope));
tampered.payload.detection.permanent_name = "TAMPERED-NAME";
ingestDrift(tampered, loadRegistry(REG_ACER), { historyPath: HISTORY });
const q2 = quorumForDrift({ instance_sha256: det!.instance_sha256, historyPath: HISTORY });
// Tampered payload has different instance_sha256? Actually the detection is same; only permanent_name changes
// so the tampered signature fails verify → unverified_count should rise
const verifiedOnly = quorumForDrift({ instance_sha256: det!.instance_sha256, verified_only: true, historyPath: HISTORY });
assert(verifiedOnly.verified_count === 3, "verified-only still 3");
// The tampered ingest adds an entry but it's unverified
const hist = loadHistory(HISTORY);
assert(hist.length === 4, "4 total entries after tamper-ingest");
assert(hist.filter(e => !e.verified).length === 1, "1 unverified (tampered)");

// ──────────────────────────────────────────────────────────────────────
// T6: summarizeHistory reflects reality
// ──────────────────────────────────────────────────────────────────────
console.log("\nT6: summary roll-up");
const sum = summarizeHistory(HISTORY);
assert(sum.total_entries === 4, "total=4");
assert(sum.verified_count === 3, "verified=3");
assert(sum.unverified_count === 1, "unverified=1");
assert(Object.keys(sum.by_signer_owner).length === 3, "3 distinct signers");

// ──────────────────────────────────────────────────────────────────────
// T7: queryHistory round-trip
// ──────────────────────────────────────────────────────────────────────
console.log("\nT7: query by subject");
const q3 = queryHistory({ subject_permanent_name: "subject-drifted", historyPath: HISTORY });
assert(q3.length === 3, `3 entries match subject-drifted (got ${q3.length}) — tampered has different name`);

// ──────────────────────────────────────────────────────────────────────
// T8: signed envelope round-trip preserves detection
// ──────────────────────────────────────────────────────────────────────
console.log("\nT8: envelope round-trip");
const re = bres.signed_envelope;
assert(re.payload.verb === "drift-detected", "verb preserved");
assert(re.payload.detection.drift_log_entries.length === 1, "drift_log_entries preserved");
assert(re.payload.detection.instance_sha256 === det!.instance_sha256, "sha256 preserved");

// Cleanup
rmSync(TESTDIR, { recursive: true, force: true });

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-F-079-DRIFT-BROADCAST-E2E · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
