// UPGRADE-3 · BilateralFingerprintTracker
// Records sha256 fingerprints per peer × verb and detects divergence.
// Enforces the determinism-proven pattern from 2026-04-20 (D11=PROVEN seal).
// Artifacts MUST be content-deterministic (no ts/throughput/pid) per feedback_content_deterministic_artifacts.
//
// P1 upgrades (2026-04-19):
//   - QUORUM verdict for ≥2-agree + ≥1-diverge case (majority info preserved)
//   - peers[peer_id].history[] retains last 8 recorded sha256s per peer
//   - REGRESSION verdict returned from record() when new sha matches a prior history entry for that peer
//
// Verdict priority on record() return:
//   REGRESSION (if peer's new sha re-appears in its own history) > check() verdict

import { createHash } from "node:crypto";

const HISTORY_LIMIT = 8;

export class BilateralFingerprintTracker {
  constructor() {
    this.records = new Map();  // key = `${verb}::${artifact_name}` → {peers: {acer:{sha256,bytes,recorded_at,history}, ...}, first_seen, last_updated}
  }

  static hashBytes(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
  }

  record(peer_id, verb, artifact_name, sha256, bytes = null) {
    const key = `${verb}::${artifact_name}`;
    const now = new Date().toISOString();
    const rec = this.records.get(key) ?? {
      verb, artifact_name,
      peers: {}, first_seen: now,
    };
    const prev = rec.peers[peer_id];
    const prevSha = prev?.sha256 ?? null;
    const history = prev?.history ? [...prev.history] : [];

    // Regression detection: new sha appears in this peer's prior history (any entry, not just most-recent)
    // Only triggers when the hash ACTUALLY changes — re-recording the identical latest sha is a no-op, not a regression.
    let regressionFromSha = null;
    if (prevSha && sha256 !== prevSha) {
      // Look at prior history entries (those recorded BEFORE current latest)
      for (const h of history) {
        if (h.sha === sha256) {
          regressionFromSha = prevSha;
          break;
        }
      }
    }

    // Append the prior "latest" into history before overwriting (only if we had a prior)
    if (prevSha) {
      history.push({ sha: prevSha, recorded_at: prev.recorded_at });
      while (history.length > HISTORY_LIMIT) history.shift();
    }

    rec.peers[peer_id] = { sha256, bytes, recorded_at: now, history };
    rec.last_updated = now;
    this.records.set(key, rec);

    if (regressionFromSha) {
      return {
        verdict: "REGRESSION",
        key,
        peer_id,
        from_sha: regressionFromSha,
        to_sha: sha256,
        history_len: history.length,
      };
    }
    return this.check(key);
  }

  check(key) {
    const rec = this.records.get(key);
    if (!rec) return { verdict: "unknown", key };
    const peers = Object.entries(rec.peers);
    if (peers.length < 2) return { verdict: "single-sided", key, peers: peers.map(([p]) => p) };
    const perPeer = Object.fromEntries(peers.map(([p, v]) => [p, v.sha256]));
    const hashes = new Set(peers.map(([, v]) => v.sha256));
    if (hashes.size === 1) {
      return {
        verdict: "BILATERAL-MATCH",
        key,
        sha256: [...hashes][0],
        peers: peers.map(([p]) => p),
      };
    }

    // Count sha → list-of-peers
    const tally = new Map();
    for (const [p, v] of peers) {
      const arr = tally.get(v.sha256) ?? [];
      arr.push(p);
      tally.set(v.sha256, arr);
    }
    const entries = [...tally.entries()];
    // Sort by group size desc; largest group wins the "majority" slot when there's a plurality.
    entries.sort((a, b) => b[1].length - a[1].length);
    const [topSha, topPeers] = entries[0];

    // DIVERGE only when every peer has a distinct sha (no agreement at all) AND peers.length >= 3.
    // Historical two-peer mismatch kept as DIVERGE to preserve the prior smoke-test contract.
    if (peers.length >= 3 && hashes.size === peers.length) {
      return {
        verdict: "DIVERGE",
        key,
        per_peer: perPeer,
        distinct_hashes: hashes.size,
      };
    }

    // QUORUM: ≥2 peers agree on topSha and ≥1 peer diverges.
    if (topPeers.length >= 2 && hashes.size >= 2) {
      const minority = {};
      for (const [p, v] of peers) {
        if (v.sha256 !== topSha) minority[p] = v.sha256;
      }
      return {
        verdict: "QUORUM",
        key,
        majority_sha: topSha,
        majority_peers: topPeers,
        minority_peers: minority,
        distinct_hashes: hashes.size,
      };
    }

    // Fallback (e.g. 2 peers with different hashes): keep DIVERGE for contract compatibility.
    return {
      verdict: "DIVERGE",
      key,
      per_peer: perPeer,
      distinct_hashes: hashes.size,
    };
  }

  allBilateralMatches() {
    const out = [];
    for (const key of this.records.keys()) {
      const v = this.check(key);
      if (v.verdict === "BILATERAL-MATCH") out.push(v);
    }
    return out;
  }

  allDivergences() {
    const out = [];
    for (const key of this.records.keys()) {
      const v = this.check(key);
      if (v.verdict === "DIVERGE") out.push(v);
    }
    return out;
  }

  allQuorums() {
    const out = [];
    for (const key of this.records.keys()) {
      const v = this.check(key);
      if (v.verdict === "QUORUM") out.push(v);
    }
    return out;
  }

  peerHistory(peer_id, verb, artifact_name) {
    const key = `${verb}::${artifact_name}`;
    const rec = this.records.get(key);
    if (!rec || !rec.peers[peer_id]) return [];
    const p = rec.peers[peer_id];
    // history[] holds prior snapshots; append current latest at the tail for callers that want the full sequence.
    return [...p.history, { sha: p.sha256, recorded_at: p.recorded_at }];
  }

  snapshot() {
    return {
      total_keys: this.records.size,
      matches: this.allBilateralMatches().length,
      divergences: this.allDivergences().length,
      quorums: this.allQuorums().length,
    };
  }
}
