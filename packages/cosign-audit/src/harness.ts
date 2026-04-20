// packages/cosign-audit/src/harness.ts — K-001 cosign audit harness
//
// Periodic audit of the federation's cosign-chain across peers. Composes
// existing verifiers:
//   - rolling-chain prev_sha (from PRE-006 follow-up)
//   - entry_sig ed25519 (from D-055 + liris canonical spec)
//   - registry freshness (D-055 key rotation)
//
// Produces a structured audit report. Writes to an audit-history NDJSON
// so trends are visible over time.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const AUDIT_HISTORY_DEFAULT = join(homedir(), ".asolaria-workers", "cosign-audit-history.ndjson");

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface AuditReport {
  audited_at: string;
  chain_source: string;
  total_entries: number;
  rolling_chain: {
    ok: boolean;
    matches: number;
    breaks: number;
    first_break_seq: number | null;
  };
  entry_sig: {
    signed_count: number;
    unsigned_count: number;
    verified_count: number;
    unverified_count: number;
    unverified_seqs: number[];
  };
  registry: {
    keys_known: number;
    rotated_keys: number;
    rotated_key_ids: string[];
  };
  seq_continuity: {
    ok: boolean;
    gaps: Array<{ expected: number; found: number }>;
  };
  verdict: "GREEN" | "YELLOW" | "RED";
  yellow_reasons: string[];
  red_reasons: string[];
  glyph_sentence: string;
}

// ──────────────────────────────────────────────────────────────────────
// Verifiers (inlined to avoid cross-package deps)
// ──────────────────────────────────────────────────────────────────────

function rollingChainSha(lines: string[], upToExclusive: number): string {
  const joined = lines.slice(0, upToExclusive).join("\n") + "\n";
  return createHash("sha256").update(joined, "utf-8").digest("hex");
}

function rawPubToKeyObject(b64: string) {
  const raw = Buffer.from(b64, "base64");
  const header = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([header, raw]), format: "der", type: "spki" });
}

// Liris's canonicalEntryMaterial spec (PRE-006 discovery):
//   const { entry_sig, ...rest } = entry;
//   const sortedKeys = Object.keys(rest).sort();
//   const sorted = {}; for (k of sortedKeys) sorted[k] = rest[k];
//   return Buffer.from(JSON.stringify(sorted), 'utf-8');
function canonicalEntryMaterial(entry: any): Buffer {
  const { entry_sig: _s, ...rest } = entry;
  const sortedKeys = Object.keys(rest).sort();
  const sorted: any = {};
  for (const k of sortedKeys) sorted[k] = rest[k];
  return Buffer.from(JSON.stringify(sorted), "utf-8");
}

// ──────────────────────────────────────────────────────────────────────
// Audit harness
// ──────────────────────────────────────────────────────────────────────

export interface AuditInput {
  chain_path: string;
  registry_path: string;
  audit_history_path?: string;
  chain_source?: string;  // label for the report (e.g. "liris:9999" or "acer-local")
}

export function auditCosignChain(input: AuditInput): AuditReport {
  if (!existsSync(input.chain_path)) {
    return buildReport({
      audited_at: new Date().toISOString(),
      chain_source: input.chain_source ?? input.chain_path,
      entries: [],
      lines: [],
      registry: { keys: [] },
      missingChain: true,
    });
  }
  const raw = readFileSync(input.chain_path, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());
  const entries: any[] = [];
  for (const l of lines) {
    try { entries.push(JSON.parse(l)); } catch { /* skip malformed */ }
  }
  const registry = existsSync(input.registry_path)
    ? JSON.parse(readFileSync(input.registry_path, "utf-8"))
    : { keys: [] };

  return buildReport({
    audited_at: new Date().toISOString(),
    chain_source: input.chain_source ?? input.chain_path,
    entries,
    lines,
    registry,
    missingChain: false,
  });
}

interface BuildReportInput {
  audited_at: string;
  chain_source: string;
  entries: any[];
  lines: string[];
  registry: { keys: any[] };
  missingChain: boolean;
}

function buildReport(b: BuildReportInput): AuditReport {
  const yellowReasons: string[] = [];
  const redReasons: string[] = [];

  if (b.missingChain) {
    redReasons.push("chain file not found");
  }

  // Rolling-chain audit
  let rolling_ok = true, rolling_matches = 0, rolling_breaks = 0, firstBreakSeq: number | null = null;
  for (let i = 0; i < b.entries.length; i++) {
    const e = b.entries[i];
    if (i === 0) {
      if (e.prev_sha === null) rolling_matches++;
      else { rolling_ok = false; rolling_breaks++; firstBreakSeq ??= e.seq; }
      continue;
    }
    const expected = rollingChainSha(b.lines, i);
    if (e.prev_sha === expected) rolling_matches++;
    else { rolling_ok = false; rolling_breaks++; firstBreakSeq ??= e.seq; }
  }
  if (!rolling_ok) redReasons.push(`rolling-chain break at seq=${firstBreakSeq} (${rolling_breaks} broken links)`);

  // Seq continuity audit
  const gaps: Array<{ expected: number; found: number }> = [];
  let continuity_ok = true;
  for (let i = 0; i < b.entries.length; i++) {
    const expected = i + 1;  // seq=1 at index 0
    const found = b.entries[i].seq;
    if (found !== expected) {
      continuity_ok = false;
      gaps.push({ expected, found });
    }
  }
  if (!continuity_ok) redReasons.push(`seq gaps detected: ${gaps.length}`);

  // Entry sig audit
  const keyById = new Map<string, any>();
  for (const k of b.registry.keys ?? []) keyById.set(k.key_id, k);
  let signedCount = 0, unsignedCount = 0, verifiedCount = 0, unverifiedCount = 0;
  const unverifiedSeqs: number[] = [];
  for (const e of b.entries) {
    if (!e.entry_sig) { unsignedCount++; continue; }
    signedCount++;
    const key = keyById.get(e.entry_sig.key_id);
    if (!key) { unverifiedCount++; unverifiedSeqs.push(e.seq); continue; }
    if (key.rotated_at) {
      // Signed by a rotated-out key — acceptable if entry predates rotation, but flag
      const entryTs = e.ts || "";
      if (entryTs && entryTs > key.rotated_at) {
        unverifiedCount++;
        unverifiedSeqs.push(e.seq);
        yellowReasons.push(`seq=${e.seq} signed by rotated-out key ${e.entry_sig.key_id} after ${key.rotated_at}`);
        continue;
      }
    }
    try {
      const pub = rawPubToKeyObject(key.public_key_b64);
      const sig = Buffer.from(e.entry_sig.sig_b64, "base64");
      const ok = cryptoVerify(null, canonicalEntryMaterial(e), pub, sig);
      if (ok) verifiedCount++;
      else { unverifiedCount++; unverifiedSeqs.push(e.seq); }
    } catch (err) {
      unverifiedCount++;
      unverifiedSeqs.push(e.seq);
    }
  }
  if (unverifiedCount > 0) redReasons.push(`${unverifiedCount} signed entries failed verification`);
  if (signedCount > 0 && unsignedCount / (signedCount + unsignedCount) > 0.5) {
    yellowReasons.push(`${unsignedCount}/${signedCount + unsignedCount} entries unsigned (majority — consider sign-by-default)`);
  }

  // Registry summary
  const rotatedKeyIds = (b.registry.keys ?? []).filter((k: any) => k.rotated_at).map((k: any) => k.key_id);

  const verdict: "GREEN" | "YELLOW" | "RED" = redReasons.length > 0 ? "RED" : (yellowReasons.length > 0 ? "YELLOW" : "GREEN");

  return {
    audited_at: b.audited_at,
    chain_source: b.chain_source,
    total_entries: b.entries.length,
    rolling_chain: {
      ok: rolling_ok,
      matches: rolling_matches,
      breaks: rolling_breaks,
      first_break_seq: firstBreakSeq,
    },
    entry_sig: {
      signed_count: signedCount,
      unsigned_count: unsignedCount,
      verified_count: verifiedCount,
      unverified_count: unverifiedCount,
      unverified_seqs: unverifiedSeqs,
    },
    registry: {
      keys_known: (b.registry.keys ?? []).length,
      rotated_keys: rotatedKeyIds.length,
      rotated_key_ids: rotatedKeyIds,
    },
    seq_continuity: { ok: continuity_ok, gaps },
    verdict,
    yellow_reasons: yellowReasons,
    red_reasons: redReasons,
    glyph_sentence: `META-COSIGN-AUDIT · source=${b.chain_source.split("/").pop()} · entries=${b.entries.length} · rolling=${rolling_ok ? "ok" : "BROKEN"} · sig=${verifiedCount}/${signedCount} · verdict=${verdict} @ M-EYEWITNESS .`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Persist to history
// ──────────────────────────────────────────────────────────────────────

export function appendAuditHistory(report: AuditReport, path: string = AUDIT_HISTORY_DEFAULT) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(report) + "\n");
}

export function loadAuditHistory(path: string = AUDIT_HISTORY_DEFAULT): AuditReport[] {
  if (!existsSync(path)) return [];
  const out: AuditReport[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}
