// Smoke: compile + summon all 6 supervisors + verify instant recall from cache.
import { listSupervisors, summonSupervisor, refreshAllSupervisors, listCachedSupervisors } from "../src/index.ts";

async function main(): Promise<void> {
  console.log("[supervisor-smoke] available profiles:");
  for (const p of listSupervisors()) console.log(`  ${p}`);
  console.log("");

  console.log("[supervisor-smoke] fresh compile all (refreshAllSupervisors)...");
  const freshStart = Date.now();
  const fresh = refreshAllSupervisors();
  const freshMs = Date.now() - freshStart;
  for (const r of fresh) {
    console.log(`  ${r.corpus.profile_glyph.padEnd(36)} d11=${r.corpus.d11_level.padEnd(10)} sentences=${r.corpus.sentences.length} compile_ms=${r.corpus.refresh_cost_ms}`);
  }
  console.log(`[supervisor-smoke] fresh total ms=${freshMs}`);
  console.log("");

  console.log("[supervisor-smoke] instant recall via cache (summonSupervisor, no refresh)...");
  const recallStart = Date.now();
  const recalls = listSupervisors().map((p) => summonSupervisor(p));
  const recallMs = Date.now() - recallStart;
  for (const r of recalls) {
    console.log(`  ${r.corpus.profile_glyph.padEnd(36)} source=${r.source.padEnd(5)} age_ms=${r.age_ms}`);
  }
  console.log(`[supervisor-smoke] recall total ms=${recallMs}`);
  console.log("");

  console.log("[supervisor-smoke] cached state on disk:");
  for (const c of listCachedSupervisors()) {
    console.log(`  ${c.profile.padEnd(36)} bytes=${c.bytes} age_ms=${c.age_ms}`);
  }
  console.log("");

  console.log("[supervisor-smoke] example corpus (PROF-KERNEL-SUPERVISOR):");
  const kernelCorpus = recalls.find((r) => r.corpus.profile_glyph === "PROF-KERNEL-SUPERVISOR")?.corpus;
  if (kernelCorpus) {
    console.log("  sentences:");
    for (const s of kernelCorpus.sentences) console.log(`    ${s}`);
    console.log("  facts:");
    console.log(`    ${JSON.stringify(kernelCorpus.facts)}`);
  }

  const allFreshOk = fresh.every((r) => r.source === "fresh");
  const allRecallFromCache = recalls.every((r) => r.source === "cache");
  const recallFast = recallMs < 500; // 6 profiles from disk in <500ms

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify({
    total_profiles: listSupervisors().length,
    fresh_total_ms: freshMs,
    recall_total_ms: recallMs,
    all_fresh_compiled: allFreshOk,
    all_recalled_from_cache: allRecallFromCache,
    recall_under_500ms: recallFast,
    ts: new Date().toISOString(),
  }, null, 2));

  process.exit(allFreshOk && allRecallFromCache && recallFast ? 0 : 1);
}

main().catch((err) => { console.error("[supervisor-smoke] fatal:", err); process.exit(2); });
