// packages/drift-broadcast/src/history.ts — F-078 drift-history
//
// Builds on F-077 broadcaster. Takes signed drift envelopes arriving at
// this node (or any peer's archived envelopes) and persists them to a
// time-indexed NDJSON ledger. Exposes queries:
//   - by subject (permanent_name / hilbert_pid)
//   - by drift kind
//   - by time range
//   - cross-peer quorum on the same drift event (same instance_sha256)
//
// Each ingested envelope is signature-verified (via D-055 registry)
// before being stored, so the history is tamper-evident from the
// federation's point of view — only envelopes that passed verification
// are considered authoritative.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { verifyEnvelope, type Ed25519Registry, type SignedEnvelope } from "../../kernel/src/ed25519-registry.ts";
import type { DriftBroadcastPayload, SignedDriftEnvelope } from "./broadcaster.ts";

// ──────────────────────────────────────────────────────────────────────
// Storage
// ──────────────────────────────────────────────────────────────────────

const HISTORY_DEFAULT = join(homedir(), ".asolaria-workers", "drift-history.ndjson");

export interface HistoryEntry {
  ingested_at: string;
  verified: boolean;
  verify_reason?: string;
  signer_key_id: string;
  signer_owner_glyph: string | null;
  envelope: SignedDriftEnvelope;
}

export function ingestDrift(
  env: SignedDriftEnvelope,
  registry: Ed25519Registry,
  opts: { historyPath?: string } = {},
): HistoryEntry {
  const path = opts.historyPath ?? HISTORY_DEFAULT;
  mkdirSync(dirname(path), { recursive: true });

  const v = verifyEnvelope(env, registry);
  const entry: HistoryEntry = {
    ingested_at: new Date().toISOString(),
    verified: v.ok,
    verify_reason: v.ok ? undefined : v.reason,
    signer_key_id: env.signature.key_id,
    signer_owner_glyph: v.owner_glyph,
    envelope: env,
  };
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return entry;
}

// ──────────────────────────────────────────────────────────────────────
// Load + query
// ──────────────────────────────────────────────────────────────────────

export function loadHistory(path: string = HISTORY_DEFAULT): HistoryEntry[] {
  if (!existsSync(path)) return [];
  const out: HistoryEntry[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

export interface QueryInput {
  subject_permanent_name?: string;
  subject_hilbert_pid?: string;
  drift_kind?: "verify_failed" | "new_drift_log_entry" | "both";
  since_iso?: string;
  until_iso?: string;
  verified_only?: boolean;
  historyPath?: string;
}

export function queryHistory(q: QueryInput = {}): HistoryEntry[] {
  const all = loadHistory(q.historyPath ?? HISTORY_DEFAULT);
  return all.filter((e) => {
    if (q.verified_only && !e.verified) return false;
    const det = e.envelope.payload.detection;
    if (q.subject_permanent_name && det.permanent_name !== q.subject_permanent_name) return false;
    if (q.subject_hilbert_pid && det.hilbert_pid !== q.subject_hilbert_pid) return false;
    if (q.drift_kind && det.drift_kind !== q.drift_kind) return false;
    if (q.since_iso && e.ingested_at < q.since_iso) return false;
    if (q.until_iso && e.ingested_at > q.until_iso) return false;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────────────
// Cross-peer quorum on same drift
// ──────────────────────────────────────────────────────────────────────

export interface QuorumInput {
  instance_sha256: string;       // the drifted instance's file sha at observation time
  historyPath?: string;
  verified_only?: boolean;
}

export interface QuorumResult {
  instance_sha256: string;
  distinct_signers: string[];           // owner_glyphs that independently observed this drift
  distinct_key_ids: string[];
  total_entries: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  all_drift_kinds: string[];
  verified_count: number;
  unverified_count: number;
}

export function quorumForDrift(q: QuorumInput): QuorumResult {
  const all = loadHistory(q.historyPath ?? HISTORY_DEFAULT);
  const relevant = all.filter((e) => e.envelope.payload.detection.instance_sha256 === q.instance_sha256 && (!q.verified_only || e.verified));
  const signers = new Set<string>();
  const keys = new Set<string>();
  const kinds = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;
  let verified = 0, unverified = 0;
  for (const e of relevant) {
    if (e.signer_owner_glyph) signers.add(e.signer_owner_glyph);
    keys.add(e.signer_key_id);
    kinds.add(e.envelope.payload.detection.drift_kind);
    const ts = e.envelope.payload.detection.observed_at || e.ingested_at;
    if (!first || ts < first) first = ts;
    if (!last || ts > last) last = ts;
    if (e.verified) verified++; else unverified++;
  }
  return {
    instance_sha256: q.instance_sha256,
    distinct_signers: [...signers],
    distinct_key_ids: [...keys],
    total_entries: relevant.length,
    first_observed_at: first,
    last_observed_at: last,
    all_drift_kinds: [...kinds],
    verified_count: verified,
    unverified_count: unverified,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Summary roll-up for dashboards
// ──────────────────────────────────────────────────────────────────────

export interface HistorySummary {
  total_entries: number;
  verified_count: number;
  unverified_count: number;
  by_subject: Record<string, number>;
  by_drift_kind: Record<string, number>;
  by_signer_owner: Record<string, number>;
  most_recent_ingested_at: string | null;
  unique_subjects: number;
  unique_instance_shas: number;
}

export function summarizeHistory(historyPath?: string): HistorySummary {
  const all = loadHistory(historyPath ?? HISTORY_DEFAULT);
  const bySubj: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const bySigner: Record<string, number> = {};
  const shas = new Set<string>();
  let verified = 0, unverified = 0, mostRecent: string | null = null;
  for (const e of all) {
    const det = e.envelope.payload.detection;
    bySubj[det.permanent_name] = (bySubj[det.permanent_name] || 0) + 1;
    byKind[det.drift_kind] = (byKind[det.drift_kind] || 0) + 1;
    const signer = e.signer_owner_glyph || "(unknown)";
    bySigner[signer] = (bySigner[signer] || 0) + 1;
    shas.add(det.instance_sha256);
    if (e.verified) verified++; else unverified++;
    if (!mostRecent || e.ingested_at > mostRecent) mostRecent = e.ingested_at;
  }
  return {
    total_entries: all.length,
    verified_count: verified,
    unverified_count: unverified,
    by_subject: bySubj,
    by_drift_kind: byKind,
    by_signer_owner: bySigner,
    most_recent_ingested_at: mostRecent,
    unique_subjects: Object.keys(bySubj).length,
    unique_instance_shas: shas.size,
  };
}
