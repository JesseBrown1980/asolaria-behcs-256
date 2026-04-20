// packages/shannon-civ/src/verdict-tracker.ts — G-091 Shannon L6 verdict tracker
//
// Persistent record of every shannon-scan-result verdict so operators can
// reconstruct WHY liris accepted or halted a scan, compute per-target
// acceptance rates, and spot a drift between what dispatchers requested
// vs what acer returned.
//
// Pure — caller writes the tracker NDJSON + JSON snapshot. Shape is
// aggregation-friendly (per-target, per-actor, per-reason buckets).

export type ShannonVerdict = "promote" | "halt" | "pending-acer-civ-return";
export type LirisVerdict = "ok" | "warn" | "deny" | string;

export interface L6Record {
  ts: string;
  scan_id: string;
  dispatcher_actor: string;       // liris-shannon-civ usually
  requesting_target: string;      // what was scanned
  profile_name: string;
  acer_verdict: ShannonVerdict;
  acer_reason: string;
  liris_final_verdict?: LirisVerdict;    // liris L6 closing verdict
  liris_final_reason?: string;
  witness?: { gate: string; profile: string };
  latency_ms?: number;             // dispatch→result end-to-end
  cosign_seq?: number;             // position in cosign chain
}

export interface VerdictCounters {
  total: number;
  by_acer_verdict: Record<string, number>;
  by_liris_final: Record<string, number>;
  by_target: Record<string, { total: number; promoted: number; halted: number }>;
  by_profile: Record<string, number>;
  avg_latency_ms: number | null;
}

export function emptyCounters(): VerdictCounters {
  return {
    total: 0, by_acer_verdict: {}, by_liris_final: {},
    by_target: {}, by_profile: {}, avg_latency_ms: null,
  };
}

export function foldRecord(base: VerdictCounters, r: L6Record): VerdictCounters {
  const byTarget = { ...base.by_target };
  const t = byTarget[r.requesting_target] ?? { total: 0, promoted: 0, halted: 0 };
  byTarget[r.requesting_target] = {
    total: t.total + 1,
    promoted: t.promoted + (r.acer_verdict === "promote" ? 1 : 0),
    halted: t.halted + (r.acer_verdict === "halt" ? 1 : 0),
  };

  let newAvg: number | null = base.avg_latency_ms;
  if (typeof r.latency_ms === "number") {
    const oldTotal = base.total;
    const oldSum = base.avg_latency_ms != null ? base.avg_latency_ms * oldTotal : 0;
    newAvg = (oldSum + r.latency_ms) / (oldTotal + 1);
  }

  return {
    total: base.total + 1,
    by_acer_verdict: {
      ...base.by_acer_verdict,
      [r.acer_verdict]: (base.by_acer_verdict[r.acer_verdict] ?? 0) + 1,
    },
    by_liris_final: r.liris_final_verdict
      ? { ...base.by_liris_final, [r.liris_final_verdict]: (base.by_liris_final[r.liris_final_verdict] ?? 0) + 1 }
      : { ...base.by_liris_final },
    by_target: byTarget,
    by_profile: {
      ...base.by_profile,
      [r.profile_name]: (base.by_profile[r.profile_name] ?? 0) + 1,
    },
    avg_latency_ms: newAvg,
  };
}

export interface VerdictDivergence {
  divergent: boolean;
  acer_said: ShannonVerdict;
  liris_said: LirisVerdict | undefined;
  category: "agreement" | "acer-promote-liris-deny" | "acer-halt-liris-ok" | "partial-disagreement" | "unknown" | "liris-no-verdict";
  explanation: string;
}

export function classifyDivergence(r: L6Record): VerdictDivergence {
  if (!r.liris_final_verdict) {
    return {
      divergent: false,
      acer_said: r.acer_verdict,
      liris_said: undefined,
      category: "liris-no-verdict",
      explanation: "no liris L6 final verdict recorded yet",
    };
  }

  const a = r.acer_verdict;
  const l = r.liris_final_verdict;

  if (a === "promote" && l === "ok") return mk(false, a, l, "agreement", "both say green");
  if (a === "halt" && l === "deny") return mk(false, a, l, "agreement", "both say red");

  if (a === "promote" && l === "deny") return mk(true, a, l, "acer-promote-liris-deny", "acer wanted to promote but liris final-denied");
  if (a === "halt" && l === "ok") return mk(true, a, l, "acer-halt-liris-ok", "acer said halt but liris final-approved");
  if (a === "halt" && l === "warn") return mk(true, a, l, "partial-disagreement", "acer=halt vs liris=warn");
  if (a === "promote" && l === "warn") return mk(true, a, l, "partial-disagreement", "acer=promote vs liris=warn");
  if (a === "pending-acer-civ-return" && l === "ok") return mk(true, a, l, "partial-disagreement", "acer deferred but liris approved");

  return mk(true, a, l, "unknown", `unclassified pair acer=${a} liris=${l}`);

  function mk(divergent: boolean, acer_said: ShannonVerdict, liris_said: LirisVerdict, category: VerdictDivergence["category"], explanation: string): VerdictDivergence {
    return { divergent, acer_said, liris_said, category, explanation };
  }
}

export interface DivergenceReport {
  total_scans: number;
  liris_verdict_recorded: number;
  agreements: number;
  divergences: number;
  by_category: Record<string, number>;
  sample_divergent: Array<{ scan_id: string; acer: ShannonVerdict; liris: LirisVerdict | undefined; category: string; explanation: string }>;
  glyph_sentence: string;
}

export function buildDivergenceReport(records: L6Record[], sample_size: number = 10): DivergenceReport {
  let agreements = 0, divergences = 0, withLiris = 0;
  const byCat: Record<string, number> = {};
  const sample: DivergenceReport["sample_divergent"] = [];

  for (const r of records) {
    const d = classifyDivergence(r);
    if (r.liris_final_verdict) withLiris++;
    byCat[d.category] = (byCat[d.category] ?? 0) + 1;
    if (d.divergent) {
      divergences++;
      if (sample.length < sample_size) {
        sample.push({ scan_id: r.scan_id, acer: d.acer_said, liris: d.liris_said, category: d.category, explanation: d.explanation });
      }
    } else if (d.category === "agreement") {
      agreements++;
    }
  }

  return {
    total_scans: records.length,
    liris_verdict_recorded: withLiris,
    agreements,
    divergences,
    by_category: byCat,
    sample_divergent: sample,
    glyph_sentence: `EVT-L6-VERDICT-DIVERGENCE · total=${records.length} · agree=${agreements} · diverge=${divergences} · liris-recorded=${withLiris} @ M-INDICATIVE .`,
  };
}
