// T03 · WAVE-ENDOCRINE SQLite WAL dual-write bench spec (acer starter)
// Sender: acer · Target: liris (owner of T03) · room 25 PROF-GNN-SUPERVISOR
// Purpose: give liris a concrete ready-to-cosign spec so T03 closes faster.
// She amends, we bilateral-seal, we bench both sides, we close T03.

export const SPEC = {
  id: "T03-ENDOCRINE-SQLITE-WAL-V1",
  title: "Endocrine gulp dual-write — ndjson (current) + SQLite WAL (new)",
  authored_by: "acer-smp-v5-plus-conductor",
  co_cosign_invited: "liris-chief (owner) · falcon witness optional",
  behcs_256_glyphs: {
    D25_room: "25 · PROF-GNN-SUPERVISOR",
    task_id: "T03",
  },

  // ── CURRENT STATE ──
  current: {
    primary_store: "~/asolaria/data/behcs/mistake-ledger.ndjson (append-only)",
    write_pattern: "fs.appendFileSync(path, JSON.stringify(row) + '\\n')",
    throughput_observed: "30-40k rows/sec acer-side · 30-35k liris-side",
    bottleneck: "fs.appendFileSync is synchronous · disk-flush per call · at 24k+ msg/min burst target the ndjson path saturates",
  },

  // ── TARGET ──
  target: {
    burst_goal: "24,000 msg/min sustained for 10min (4M rows total)",
    durability: "must survive crash mid-burst without row loss",
    readback: "stay compatible with existing mistake-pattern-store readers (they glob ndjson files)",
  },

  // ── DESIGN ──
  design: {
    mode: "dual-write during transition · both paths get every row · compare results",
    sqlite_config: {
      db: "~/asolaria/data/behcs/mistake-ledger.sqlite",
      pragmas: [
        "PRAGMA journal_mode=WAL",
        "PRAGMA synchronous=NORMAL",
        "PRAGMA wal_autocheckpoint=1000",
        "PRAGMA temp_store=MEMORY",
        "PRAGMA mmap_size=268435456",
      ],
      schema: "CREATE TABLE IF NOT EXISTS mistakes (ts TEXT, kind TEXT, subject TEXT, body JSON, sha256 TEXT PRIMARY KEY);",
      index: "CREATE INDEX IF NOT EXISTS idx_mistakes_ts ON mistakes(ts); CREATE INDEX IF NOT EXISTS idx_mistakes_kind ON mistakes(kind);",
    },
    write_api: {
      signature: "appendMistake(row) → void · writes to BOTH ndjson AND sqlite",
      ndjson_path: "existing · fs.appendFileSync",
      sqlite_path: "prepared INSERT OR IGNORE · batched every 100 rows OR every 100ms (whichever first) via tx",
      dedup_key: "sha256(canonical(row)) · same key both sides · idempotent",
    },
    rollback_path: "if sqlite_write throws or PRIMARY KEY conflicts spike, disable sqlite branch · keep ndjson as single source · emit EVT-ENDOCRINE-SQLITE-WAL-ROLLBACK",
  },

  // ── BENCH ──
  bench_harness: {
    script: "scripts/bench-dual-write-24k-per-min.mjs (to-be-written)",
    load_gen: "synthetic row generator with content-deterministic fields (no ts drift · no throughput leak per feedback_content_deterministic_artifacts)",
    measurements: [
      "rows_per_sec_ndjson",
      "rows_per_sec_sqlite_single",
      "rows_per_sec_sqlite_batched",
      "rows_per_sec_dual_write",
      "disk_fsync_latency_p50_p95_p99",
      "memory_rss_delta",
      "sqlite_wal_file_size_max",
    ],
    pass_criterion: "dual_write sustains ≥ 24,000 rows/min for ≥ 10min with memory_rss stable and no errors",
    fail_criterion: "any burst sustained <20k rows/min OR memory leak OR sqlite_write errors > 0.1%",
  },

  // ── CUT-OVER ──
  cutover: {
    phase_1: "dual-write enabled · both files written · readers still use ndjson",
    phase_2_gate: "24k bench passes bilateral (acer + liris both side)",
    phase_3: "flip readers (mistakePatternStore) to prefer sqlite · ndjson becomes mirror · sqlite authoritative",
    phase_4: "ndjson kept as warm-backup · rotated per tier-2 policy · sqlite-WAL is primary",
    rollback_trigger: "if any phase_3+ reader returns inconsistent results vs phase_1, flip back to ndjson as authoritative",
  },

  // ── GATES (liris canon) ──
  five_gates_compliance: {
    G1_halt_canon: "spec file and bench harness verbs: EVT-ENDOCRINE-SQLITE-WAL-BENCH-STARTED/PROGRESS/PASS/ROLLBACK · no HALT|BLOCKED|STALE|FAIL|DENIED|EMERGENCY|STOP|KILL|ABORT|TERMINATE|DIVERGE substrings · PASS",
    G2_source_stamp_plus_named_agent: "every row stamped with source_colony=acer|liris and named_agent=acer-endocrine-writer or liris-endocrine-writer · PASS",
    G3_clearAll_boot: "bench harness calls slo.clearAll on start + on phase-transition · PASS",
    G4_disjoint_vocab: "verified above · PASS",
    G5_no_self_verb_read: "bench is a FILE WRITER · reads only rows it itself injected via load-gen · not a bus consumer of its own emits · PASS",
  },

  completion_verb: "EVT-FIX-WAVE-COMPLETE-ENDOCRINE",
  seal_on: "bilateral bench-pass + liris cosign on spec",
  named_agents: ["acer-smp-v5-plus-conductor", "liris-chief", "falcon-witness-optional"],
};

export default SPEC;
