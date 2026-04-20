// Smoke test: dispatch 6 glyph-verb calls through local registry.
// Proves LAW-014 compression: 0 tokens, 0 cost, real results.

import { parseGlyphCall, dispatchGlyphLocal, listLocalOps } from "../src/glyph-dispatch.ts";

const CASES: Array<{ name: string; sentence: string; expect_ok: boolean }> = [
  { name: "OP-ECHO",    sentence: "OP-ECHO{hello world} @ M-EYEWITNESS .",             expect_ok: true },
  { name: "OP-NOW",     sentence: "OP-NOW{} @ M-EYEWITNESS .",                          expect_ok: true },
  { name: "OP-VERSION", sentence: "OP-VERSION{} @ M-EYEWITNESS .",                      expect_ok: true },
  { name: "OP-STAT",    sentence: "OP-STAT{packages/kernel/package.json} @ DEVICE .",   expect_ok: true },
  { name: "OP-READ",    sentence: "OP-READ{packages/kernel/package.json} @ DEVICE .",   expect_ok: true },
  { name: "OP-GLOB",    sentence: "OP-GLOB{packages/*/package.json} @ DEVICE .",        expect_ok: true },
  { name: "OP-UNKNOWN", sentence: "OP-NOTAVERB{x} @ M-SUBJUNCTIVE .",                   expect_ok: false },
  { name: "NOT-GLYPH",  sentence: "just plain prose, not a glyph",                      expect_ok: false },
];

async function main(): Promise<void> {
  console.log("[glyph-local] registry:", listLocalOps().join(", "));
  console.log("");
  const results: Array<{ name: string; parsed: boolean; ok: boolean; op?: string; result_len?: number; latency_ms?: number; tokens: 0; cost: 0; error?: string }> = [];

  for (const c of CASES) {
    const call = parseGlyphCall(c.sentence);
    if (!call) {
      results.push({ name: c.name, parsed: false, ok: false, tokens: 0, cost: 0, error: "not a glyph sentence" });
      console.log(`[glyph-local] ${c.name}: NOT GLYPH (correctly rejected)`);
      continue;
    }
    const r = await dispatchGlyphLocal(call);
    const row = {
      name: c.name,
      parsed: true,
      ok: r.ok,
      op: call.op,
      result_len: r.result.length,
      latency_ms: r.latency_ms,
      tokens: 0 as const,
      cost: 0 as const,
      error: r.error,
    };
    results.push(row);
    const shown = r.result.length > 100 ? r.result.slice(0, 100) + "..." : r.result;
    console.log(`[glyph-local] ${c.name}: ok=${r.ok} ms=${r.latency_ms} result="${shown}"${r.error ? " err=" + r.error : ""}`);
  }

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify({
    registry: listLocalOps(),
    results,
    summary: {
      total_cases: CASES.length,
      passed: results.filter((r, i) => r.ok === CASES[i].expect_ok || (!r.parsed && !CASES[i].expect_ok)).length,
      total_tokens_consumed: 0,
      total_cost_usd: 0,
      total_latency_ms: results.reduce((s, r) => s + (r.latency_ms ?? 0), 0),
    },
    node_version: process.version,
    ts: new Date().toISOString(),
  }, null, 2));

  const expectedPass = CASES.length;
  const actualPass = results.filter((r, i) =>
    (CASES[i].expect_ok && r.ok) ||
    (!CASES[i].expect_ok && (!r.parsed || !r.ok))
  ).length;
  process.exit(actualPass === expectedPass ? 0 : 1);
}

main().catch((err) => { console.error("[glyph-local] fatal:", err); process.exit(2); });
