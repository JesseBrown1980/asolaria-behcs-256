// packages/kernel/src/key-revocation.ts — K-003 key revocation registry
//
// Complements K-001 (ed25519 registry) + K-002 (rotation planner) by
// managing a revocation list. When a key is compromised (lost device,
// owner-breach incident, etc.) it must be marked REVOKED so every peer
// refuses future envelopes signed with it, even if still in the active
// registry pending a full rotation.
//
// Revocation is ADDITIVE and APPEND-ONLY: once revoked, always revoked.
// Operators cannot un-revoke; the only path forward is a new key.

import type { Ed25519KeyEntry } from "./key-rotation-scheduler.ts";

export type RevocationReason = "compromised" | "lost" | "retired" | "rotation-complete" | "policy-violation" | "other";

export interface RevocationRecord {
  key_id: string;
  owner_glyph: string;
  revoked_at: string;
  reason: RevocationReason;
  witness_gate: string;          // operator who ordered the revocation
  witness_profile: "owner";      // revocation is owner-only
  detail: string;
  replacement_key_id?: string;   // new key to use, if known
}

export interface RevocationList {
  version: "k-003-v1";
  built_at: string;
  records: RevocationRecord[];
}

export interface RevokeInput {
  key: Pick<Ed25519KeyEntry, "key_id" | "owner_glyph">;
  reason: RevocationReason;
  witness_gate: string;
  detail: string;
  replacement_key_id?: string;
  at?: string;
}

export function makeEmptyList(): RevocationList {
  return { version: "k-003-v1", built_at: new Date().toISOString(), records: [] };
}

export function revoke(list: RevocationList, input: RevokeInput): { list: RevocationList; record: RevocationRecord; already_revoked: boolean } {
  const existing = list.records.find(r => r.key_id === input.key.key_id);
  if (existing) {
    return { list, record: existing, already_revoked: true };
  }
  const record: RevocationRecord = {
    key_id: input.key.key_id,
    owner_glyph: input.key.owner_glyph,
    revoked_at: input.at ?? new Date().toISOString(),
    reason: input.reason,
    witness_gate: input.witness_gate,
    witness_profile: "owner",
    detail: input.detail,
    replacement_key_id: input.replacement_key_id,
  };
  return {
    list: { ...list, records: [...list.records, record] },
    record,
    already_revoked: false,
  };
}

export interface RevocationCheck {
  revoked: boolean;
  record: RevocationRecord | null;
  glyph_sentence: string;
}

export function isRevoked(list: RevocationList, key_id: string): RevocationCheck {
  const record = list.records.find(r => r.key_id === key_id);
  if (record) {
    return {
      revoked: true,
      record,
      glyph_sentence: `EVT-KEY-REVOKED-CHECK · key_id=${key_id} · revoked_at=${record.revoked_at} · reason=${record.reason} @ M-EYEWITNESS .`,
    };
  }
  return {
    revoked: false,
    record: null,
    glyph_sentence: `EVT-KEY-REVOKED-CHECK · key_id=${key_id} · status=active @ M-INDICATIVE .`,
  };
}

export interface RevocationAudit {
  total_revoked: number;
  by_reason: Record<RevocationReason, number>;
  by_owner_glyph: Record<string, number>;
  oldest_revocation: string | null;
  newest_revocation: string | null;
  pending_replacement: number;   // revocations with no replacement_key_id yet
  glyph_sentence: string;
}

export function auditRevocations(list: RevocationList): RevocationAudit {
  const byReason: Record<RevocationReason, number> = {
    compromised: 0, lost: 0, retired: 0, "rotation-complete": 0, "policy-violation": 0, other: 0,
  };
  const byOwner: Record<string, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;
  let pending = 0;
  for (const r of list.records) {
    byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    byOwner[r.owner_glyph] = (byOwner[r.owner_glyph] ?? 0) + 1;
    if (!oldest || r.revoked_at < oldest) oldest = r.revoked_at;
    if (!newest || r.revoked_at > newest) newest = r.revoked_at;
    if (!r.replacement_key_id) pending++;
  }
  return {
    total_revoked: list.records.length,
    by_reason: byReason,
    by_owner_glyph: byOwner,
    oldest_revocation: oldest,
    newest_revocation: newest,
    pending_replacement: pending,
    glyph_sentence: `EVT-KEY-REVOCATION-AUDIT · total=${list.records.length} · pending-replacement=${pending} · reasons=${Object.values(byReason).filter(v => v > 0).length} @ M-INDICATIVE .`,
  };
}

// Helper: given a set of keys + a revocation list, partition into active vs revoked
export function partitionKeys(keys: Ed25519KeyEntry[], list: RevocationList): { active: Ed25519KeyEntry[]; revoked: Array<{ key: Ed25519KeyEntry; record: RevocationRecord }> } {
  const active: Ed25519KeyEntry[] = [];
  const revoked: Array<{ key: Ed25519KeyEntry; record: RevocationRecord }> = [];
  for (const k of keys) {
    const rec = list.records.find(r => r.key_id === k.key_id);
    if (rec) revoked.push({ key: k, record: rec });
    else active.push(k);
  }
  return { active, revoked };
}
