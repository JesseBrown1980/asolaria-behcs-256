// UPGRADE-2 · UnisonTestDriver
// Executes the 5 UNISON-TESTs from the ratified spec, one at a time.
// Each test is bilateral: both peers run the same deterministic script; shape_fingerprint must match.
// Test suite:
//   UNISON-TEST-001  Shannon L0-L6 verdict
//   UNISON-TEST-002  key-rotation intent
//   UNISON-TEST-003  federation-health roll-up
//   UNISON-TEST-004  drift-broadcast
//   UNISON-TEST-005  contract-migration Q-005

import { createHash } from "node:crypto";

export const UNISON_TESTS = [
  { id: "UNISON-TEST-001", name: "shannon-l0-l6-verdict",    requires_peer: true, deterministic: true },
  { id: "UNISON-TEST-002", name: "key-rotation-intent",      requires_peer: true, deterministic: true },
  { id: "UNISON-TEST-003", name: "fed-health-roll-up",       requires_peer: true, deterministic: true },
  { id: "UNISON-TEST-004", name: "drift-broadcast",          requires_peer: true, deterministic: true },
  { id: "UNISON-TEST-005", name: "contract-migration-q-005", requires_peer: true, deterministic: true },
];

export class UnisonTestDriver {
  constructor({ fingerprintTracker, stateMachines = {}, busPost, scriptRunner }) {
    this.fpt = fingerprintTracker;
    this.peers = stateMachines;
    this.busPost = busPost;
    this.scriptRunner = scriptRunner;  // async fn (test_id) → { canonical_bytes, sha256 }
    this.results = new Map();
  }

  async runOne(test_id) {
    const spec = UNISON_TESTS.find(t => t.id === test_id);
    if (!spec) return { ok: false, error: `unknown test ${test_id}` };

    // Acer side runs locally
    const localRun = await this.scriptRunner(test_id);

    // Fail-closed: if the runner explicitly declares it is not
    // deterministic-today, we MUST NOT produce a bilateral match for
    // it — any "match" would be fabricated. Surface the reason so
    // operators see which runner needs finishing.
    if (localRun && localRun.deterministic_today === false) {
      const reason = localRun.meta?.reason ?? "unspecified non-determinism";
      return { ok: false, error: `runner not deterministic: ${reason}` };
    }
    if (!localRun?.sha256) return { ok: false, error: "local run did not produce sha256" };
    this.fpt.record("acer", spec.id, spec.name, localRun.sha256, localRun.canonical_bytes);

    // Announce to peer + canonical bytes for deterministic replay
    await this.busPost?.({
      verb: `EVT-UNISON-TEST-${spec.id}-ACER-COMPLETE`,
      body: {
        test_id: spec.id,
        test_name: spec.name,
        acer_sha256: localRun.sha256,
        canonical_bytes: localRun.canonical_bytes,
        request: "liris run same test locally, post EVT-UNISON-TEST-*-LIRIS-COMPLETE with your sha256",
      },
    });

    const initial = this.fpt.check(`${spec.id}::${spec.name}`);
    this.results.set(spec.id, initial);
    return { ok: true, test_id: spec.id, acer_sha256: localRun.sha256, verdict: initial.verdict };
  }

  absorbPeerResult(test_id, peer_id, sha256, canonical_bytes = null) {
    const spec = UNISON_TESTS.find(t => t.id === test_id);
    if (!spec) return { ok: false, error: `unknown test ${test_id}` };
    const verdict = this.fpt.record(peer_id, spec.id, spec.name, sha256, canonical_bytes);
    this.results.set(spec.id, verdict);
    return { ok: true, verdict };
  }

  snapshot() {
    return Array.from(this.results.entries()).map(([k, v]) => ({ test_id: k, verdict: v.verdict, hash: v.sha256 ?? null }));
  }
}
