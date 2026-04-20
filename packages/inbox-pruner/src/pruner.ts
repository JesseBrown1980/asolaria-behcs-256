// packages/inbox-pruner/src/pruner.ts — I-001 BEHCS inbox rotation
//
// BEHCS inbox files grow unbounded (acer sits at 30k+ entries and climbing).
// Most entries are heartbeats; signal drowns in noise.
//
// Strategy:
//   1. Read inbox NDJSON
//   2. Compress old entries into archive files by day
//   3. Retain only last N hours of raw NDJSON + all non-heartbeat msgs
//   4. Never drop signed envelopes (entry_sig or signature field present)
//   5. Never drop audit-relevant verbs (configurable allowlist)
//
// Safe: writes to temp + atomic rename; original kept as .bak until
// successful completion.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync, appendFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";

export interface PruneOptions {
  inbox_path: string;
  archive_dir: string;
  keep_hours: number;            // retain raw entries within this many hours
  always_keep_verbs: string[];   // never drop these (e.g. cosign-* + audit-*)
  now?: string;                  // test override
}

export interface PruneResult {
  total_in: number;
  kept: number;
  archived_by_day: Record<string, number>;
  signed_preserved: number;
  allowlist_preserved: number;
  recent_preserved: number;
  heartbeats_archived: number;
  output_path: string;
  archive_paths: string[];
  glyph_sentence: string;
}

function dayOf(iso: string): string {
  return (iso || "1970-01-01T00:00:00Z").slice(0, 10);
}

function isHeartbeat(msg: any): boolean {
  const v = msg.verb;
  if (typeof v !== "string") return true;   // opaque/missing verb → treat as heartbeat
  return v.includes("heartbeat") || v === "pulse" || v === "tick";
}

function isSigned(msg: any): boolean {
  return !!(msg.entry_sig || msg.signature || msg._sig_check?.verdict === "VERIFIED");
}

export function pruneInbox(opts: PruneOptions): PruneResult {
  const nowTs = opts.now ?? new Date().toISOString();
  const cutoffMs = Date.parse(nowTs) - opts.keep_hours * 3600 * 1000;
  if (!existsSync(opts.inbox_path)) {
    return {
      total_in: 0, kept: 0, archived_by_day: {}, signed_preserved: 0, allowlist_preserved: 0,
      recent_preserved: 0, heartbeats_archived: 0, output_path: opts.inbox_path, archive_paths: [],
      glyph_sentence: `EVT-INBOX-PRUNE · inbox-missing @ M-INDICATIVE .`,
    };
  }
  mkdirSync(opts.archive_dir, { recursive: true });

  const lines = readFileSync(opts.inbox_path, "utf-8").split("\n").filter(l => l.trim());
  const keep: string[] = [];
  const archivedByDay: Record<string, string[]> = {};
  let signed_preserved = 0, allowlist_preserved = 0, recent_preserved = 0, heartbeats_archived = 0;

  const allowSet = new Set(opts.always_keep_verbs);

  for (const line of lines) {
    let msg: any;
    try { msg = JSON.parse(line); } catch { keep.push(line); continue; }  // preserve unparseable
    const ts = msg.received_at || msg.ts || "";
    const tsMs = Date.parse(ts);
    const recent = Number.isFinite(tsMs) ? tsMs >= cutoffMs : true;

    const signed = isSigned(msg);
    const allow = typeof msg.verb === "string" && allowSet.has(msg.verb);
    const hb = isHeartbeat(msg);

    if (signed) { keep.push(line); signed_preserved++; continue; }
    if (allow)  { keep.push(line); allowlist_preserved++; continue; }
    if (recent && !hb) { keep.push(line); recent_preserved++; continue; }

    // Archive
    const day = dayOf(ts);
    if (!archivedByDay[day]) archivedByDay[day] = [];
    archivedByDay[day].push(line);
    if (hb) heartbeats_archived++;
  }

  // Write archives (append-mode — idempotent-ish by day)
  const archivePaths: string[] = [];
  for (const [day, entries] of Object.entries(archivedByDay)) {
    const p = join(opts.archive_dir, `inbox-archive-${day}.ndjson`);
    appendFileSync(p, entries.join("\n") + "\n");
    archivePaths.push(p);
  }

  // Atomic rewrite of inbox
  const bak = opts.inbox_path + ".bak";
  const tmp = opts.inbox_path + ".tmp";
  writeFileSync(tmp, keep.join("\n") + (keep.length ? "\n" : ""), "utf-8");
  if (existsSync(opts.inbox_path)) renameSync(opts.inbox_path, bak);
  renameSync(tmp, opts.inbox_path);

  const archivedByDayCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(archivedByDay)) archivedByDayCounts[k] = v.length;

  return {
    total_in: lines.length,
    kept: keep.length,
    archived_by_day: archivedByDayCounts,
    signed_preserved, allowlist_preserved, recent_preserved, heartbeats_archived,
    output_path: opts.inbox_path,
    archive_paths: archivePaths,
    glyph_sentence: `EVT-INBOX-PRUNE · in=${lines.length} · kept=${keep.length} · archived=${Object.values(archivedByDayCounts).reduce((a,b)=>a+b,0)} · signed_preserved=${signed_preserved} · @ M-EYEWITNESS .`,
  };
}
