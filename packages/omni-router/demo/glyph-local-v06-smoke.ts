// v0.6 smoke: 12 glyph-verb calls (6 old + 6 new) through local registry.
// Proves LAW-014 compression stays green and LAW-013 self-closure loop closes
// at the router: OP-VALIDATE-BEHCS256 lets the router validate BEHCS-256
// sentences with zero tokens, zero cost.

import { parseGlyphCall, dispatchGlyphLocal, listLocalOps } from "../src/glyph-dispatch.ts";

interface Case {
  name: string;
  sentence: string;
  /** pre-parsed call (bypass glyph regex when arg contains braces). */
  pre_call?: { op: string; arg: string; tone?: string };
  expect_ok: boolean;
  /** optional human note on what this verb exercises */
  note?: string;
}

const CASES: Case[] = [
  // ── 6 existing verbs (verbatim from v0.5 smoke) ─────────────────────
  { name: "OP-ECHO",    sentence: "OP-ECHO{hello world} @ M-EYEWITNESS .",             expect_ok: true },
  { name: "OP-NOW",     sentence: "OP-NOW{} @ M-EYEWITNESS .",                          expect_ok: true },
  { name: "OP-VERSION", sentence: "OP-VERSION{} @ M-EYEWITNESS .",                      expect_ok: true },
  { name: "OP-STAT",    sentence: "OP-STAT{packages/kernel/package.json} @ DEVICE .",   expect_ok: true },
  { name: "OP-READ",    sentence: "OP-READ{packages/kernel/package.json} @ DEVICE .",   expect_ok: true },
  { name: "OP-GLOB",    sentence: "OP-GLOB{packages/*/package.json} @ DEVICE .",        expect_ok: true },

  // ── 6 new verbs (v0.6) ─────────────────────────────────────────────
  { name: "OP-DIFF",
    sentence: "OP-DIFF{packages/omni-router} @ DEVICE .",
    expect_ok: true,
    note: "git diff --stat — zero-token git inspection" },
  { name: "OP-GIT-STATUS",
    sentence: "OP-GIT-STATUS{} @ DEVICE .",
    expect_ok: true,
    note: "porcelain parser for branch/ahead/behind/dirty" },
  { name: "OP-VALIDATE-BEHCS256",
    sentence: "OP-VALIDATE-BEHCS256{META-PROOF-OF-CLOSURE @ M-INDICATIVE .} @ M-EYEWITNESS .",
    expect_ok: true,
    note: "LAW-013 self-closure — router validates BEHCS-256 sentences" },
  { name: "OP-NDJSON-APPEND",
    sentence: "OP-NDJSON-APPEND{v06-smoke.ndjson|{\"event\":\"smoke\",\"ok\":true}} @ DEVICE .",
    // regex captures up to FIRST }, so we bypass with pre_call:
    pre_call: { op: "OP-NDJSON-APPEND", arg: "v06-smoke.ndjson|{\"event\":\"smoke\",\"ok\":true,\"ts\":\"" + new Date().toISOString() + "\"}", tone: "DEVICE" },
    expect_ok: true,
    note: "append one ndjson line under ~/.asolaria-workers/" },
  { name: "OP-HASH-SHA256",
    sentence: "OP-HASH-SHA256{BEHCS-256 is the language} @ DEVICE .",
    expect_ok: true,
    note: "deterministic hex digest" },
  { name: "OP-ENV-FINGERPRINT",
    sentence: "OP-ENV-FINGERPRINT{} @ DEVICE .",
    expect_ok: true,
    note: "host/pid/mem glyph identity" },
];

interface ResultRow {
  name: string;
  parsed: boolean;
  ok: boolean;
  op?: string;
  result_head?: string;
  result_len?: number;
  latency_ms?: number;
  tokens: 0;
  cost: 0;
  error?: string;
  note?: string;
}

async function main(): Promise<void> {
  console.log("[v06-smoke] registry:", listLocalOps().join(", "));
  console.log("[v06-smoke] registry size:", listLocalOps().length);
  console.log("");

  const results: ResultRow[] = [];

  for (const c of CASES) {
    const call = c.pre_call ?? parseGlyphCall(c.sentence);
    if (!call) {
      results.push({ name: c.name, parsed: false, ok: false, tokens: 0, cost: 0, error: "not a glyph sentence", note: c.note });
      console.log(`[v06-smoke] ${c.name}: NOT GLYPH`);
      continue;
    }
    const r = await dispatchGlyphLocal(call);
    const head = r.result.length > 120 ? r.result.slice(0, 120) + "..." : r.result;
    results.push({
      name: c.name,
      parsed: true,
      ok: r.ok,
      op: call.op,
      result_head: head,
      result_len: r.result.length,
      latency_ms: r.latency_ms,
      tokens: 0,
      cost: 0,
      error: r.error,
      note: c.note,
    });
    console.log(`[v06-smoke] ${c.name.padEnd(22)} ok=${r.ok} ms=${r.latency_ms} len=${r.result.length} head="${head}"${r.error ? " err=" + r.error : ""}`);
  }

  const passed = results.filter((r, i) =>
    (CASES[i].expect_ok && r.ok) ||
    (!CASES[i].expect_ok && (!r.parsed || !r.ok))
  ).length;

  const summary = {
    registry: listLocalOps(),
    registry_size: listLocalOps().length,
    results,
    summary: {
      total_cases: CASES.length,
      passed,
      failed: CASES.length - passed,
      old_verbs_pass: results.slice(0, 6).filter((r) => r.ok).length,
      new_verbs_pass: results.slice(6).filter((r) => r.ok).length,
      total_tokens_consumed: 0,
      total_cost_usd: 0,
      total_latency_ms: results.reduce((s, r) => s + (r.latency_ms ?? 0), 0),
    },
    node_version: process.version,
    ts: new Date().toISOString(),
    named_agent: "builder-v06-verbs",
    authority: "COSIGN-MERGED-034",
    d11_level: passed === CASES.length ? "OBSERVED" : "ASSUMED",
  };

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify(summary, null, 2));

  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((err) => { console.error("[v06-smoke] fatal:", err); process.exit(2); });
