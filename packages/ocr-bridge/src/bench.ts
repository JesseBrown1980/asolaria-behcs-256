// packages/ocr-bridge/src/bench.ts — Q.8 Item-239 benchmark harness
//
// Pure harness. Takes synthesized or caller-supplied images; measures
// throughput + p50/p95 latency of recognize/detect across worker pool.
// Intended for Shannon-visual + Hermes-bridge-pre-read integration
// tuning — NOT for user-facing pages (minimal footprint).

import { createOCRScheduler, type OCRSchedulerHandle } from "./worker.ts";
import type { PSM, OEM } from "./envelope.ts";

export interface BenchInput {
  images: Array<string | Buffer | ArrayBuffer>;
  pool_size?: number;
  lang?: string;
  psm?: PSM;
  oem?: OEM;
  job_type?: "recognize" | "detect";
}

export interface BenchResult {
  n: number;
  pool_size: number;
  lang: string;
  psm: number;
  oem: number;
  job_type: string;
  total_ms: number;
  per_job_ms: { min: number; max: number; p50: number; p95: number; avg: number };
  throughput_per_sec: number;
  ok: number;
  fail: number;
  sched_stats: ReturnType<OCRSchedulerHandle["stats"]>;
  glyph_sentence: string;
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export async function benchOCR(input: BenchInput): Promise<BenchResult> {
  const poolSize = input.pool_size ?? 2;
  const lang = input.lang ?? "eng";
  const psm = (input.psm ?? 3) as PSM;
  const oem = (input.oem ?? 3) as OEM;
  const jobType = input.job_type ?? "recognize";

  const sched = await createOCRScheduler({ size: poolSize, lang, psm, oem, actor_prefix: "bench-ocr" });
  const latencies: number[] = [];
  let ok = 0, fail = 0;
  const t0 = Date.now();
  try {
    await Promise.all(
      input.images.map(async (img) => {
        const j0 = Date.now();
        const res = await sched.addJob(jobType, img);
        latencies.push(Date.now() - j0);
        if ((res as any).verb === "ocr-refused") fail++;
        else ok++;
      }),
    );
  } finally {
    await sched.terminate();
  }
  const total_ms = Date.now() - t0;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);

  const per_job_ms = {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    avg: Math.round(avg * 100) / 100,
  };
  const throughput = total_ms === 0 ? 0 : Math.round((input.images.length / total_ms) * 1000 * 100) / 100;

  return {
    n: input.images.length,
    pool_size: poolSize,
    lang, psm, oem, job_type: jobType,
    total_ms,
    per_job_ms,
    throughput_per_sec: throughput,
    ok, fail,
    sched_stats: sched.stats(),
    glyph_sentence: `EVT-OCR-BENCH · n=${input.images.length} · pool=${poolSize} · lang=${lang} · psm=${psm} · oem=${oem} · ok=${ok} · fail=${fail} · p50=${per_job_ms.p50}ms · p95=${per_job_ms.p95}ms · throughput=${throughput}/s @ M-EYEWITNESS .`,
  };
}
