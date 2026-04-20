// packages/ocr-bridge/src/worker.ts — OP-OCR-SPAWN-WORKER + OP-OCR-RECOGNIZE + OP-OCR-DETECT
//
// Wraps tesseract.js v7 createWorker() with BEHCS conventions:
//   - default lang "eng"
//   - D-OCR-LANG configurable
//   - D-OCR-PSM 0..13 + D-OCR-OEM 0..3
//   - D-OCR-CONFIDENCE reported
//   - EVT-OCR-LANDED / EVT-OCR-REFUSED / EVT-OCR-ORIENTATION glyph events
//
// Deps: tesseract.js v7.0.0 WASM (installed at node_modules/tesseract.js)

import { wrapOcrEnvelope, buildRefusal, buildOrientation, type PSM, type OEM, type OCREnvelopeV1, type OCRRefusalEnvelope, type OCROrientationEnvelope, type D11Level } from "./envelope.ts";

// Lazy-import so this module stays usable in tests that don't need Tesseract runtime
async function loadTesseract() {
  try {
    // @ts-ignore — dynamic import
    const t = await import("tesseract.js");
    return t;
  } catch (e) {
    throw new Error(`tesseract.js not installed: ${(e as Error).message}`);
  }
}

export interface OCRWorkerHandle {
  id: string;
  lang: string;
  psm: PSM;
  oem: OEM;
  terminate: () => Promise<void>;
  recognize: (image: string | Buffer | ArrayBuffer | ImageBitmap | Uint8Array) => Promise<OCREnvelopeV1 | OCRRefusalEnvelope>;
  detect: (image: string | Buffer | ArrayBuffer) => Promise<OCROrientationEnvelope | OCRRefusalEnvelope>;
  _raw: any;  // underlying tesseract worker
}

export interface SpawnWorkerInput {
  lang?: string;              // default "eng"
  psm?: PSM;                  // default 3
  oem?: OEM;                  // default 3
  actor?: string;             // default "acer-ocr-worker"
  d11_level?: D11Level;       // default ASSUMED
  id?: string;                // unique worker id
}

// OP-OCR-SPAWN-WORKER
export async function createOCRWorker(input: SpawnWorkerInput = {}): Promise<OCRWorkerHandle> {
  const tesseract = await loadTesseract();
  const lang = input.lang ?? "eng";
  const psm = input.psm ?? 3;
  const oem = input.oem ?? 3;
  const actor = input.actor ?? "acer-ocr-worker";
  const d11 = input.d11_level ?? "ASSUMED";
  const id = input.id ?? `ocr-worker-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // @ts-ignore — tesseract.js default export and named exports
  const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
  if (!createWorker) throw new Error("tesseract.js createWorker not found");

  const worker = await createWorker(lang, oem);
  // @ts-ignore
  if (typeof worker.setParameters === "function") {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
  }

  const handle: OCRWorkerHandle = {
    id, lang, psm, oem,
    _raw: worker,
    async terminate() { await worker.terminate(); },

    // OP-OCR-RECOGNIZE
    async recognize(image) {
      try {
        const res = await worker.recognize(image);
        const data = res?.data ?? {};
        return wrapOcrEnvelope({
          actor,
          target: "federation",
          verb: "ocr-recognize",
          lang, psm, oem,
          text: data.text ?? "",
          confidence: typeof data.confidence === "number" ? data.confidence : 0,
          words_count: Array.isArray(data.words) ? data.words.length : 0,
          lines_count: Array.isArray(data.lines) ? data.lines.length : 0,
          blocks_count: Array.isArray(data.blocks) ? data.blocks.length : 0,
          d11_level: d11,
        });
      } catch (e) {
        return buildRefusal({
          actor, target: "federation",
          reason: "image_unreadable",
          detail: (e as Error).message,
        });
      }
    },

    // OP-OCR-DETECT (orientation/script)
    async detect(image) {
      try {
        // Tesseract detect() requires OSD model
        // @ts-ignore
        const res = typeof worker.detect === "function" ? await worker.detect(image) : null;
        if (!res || !res.data) {
          return buildRefusal({
            actor, target: "federation",
            reason: "worker_init_failed",
            detail: "detect returned empty — possibly missing osd model",
          });
        }
        const data = res.data;
        return buildOrientation({
          actor, target: "federation",
          orientation_deg: data.orientation_degrees ?? 0,
          script: data.script ?? "Unknown",
          confidence: data.orientation_confidence ?? 0,
        });
      } catch (e) {
        return buildRefusal({
          actor, target: "federation",
          reason: "image_unreadable",
          detail: (e as Error).message,
        });
      }
    },
  };

  return handle;
}

// Pool / scheduler — OP-OCR-SCHEDULE-POOL (createScheduler wrapper)
export interface OCRSchedulerHandle {
  id: string;
  size: number;
  workers: OCRWorkerHandle[];
  addJob: <T>(job_type: "recognize" | "detect", image: any) => Promise<any>;
  terminate: () => Promise<void>;
  stats: () => { size: number; queued: number; processing: number; completed: number; failed: number };
}

interface PoolState {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export async function createOCRScheduler(input: {
  size: number;
  lang?: string;
  psm?: PSM;
  oem?: OEM;
  actor_prefix?: string;
}): Promise<OCRSchedulerHandle> {
  const size = Math.max(1, Math.min(16, input.size));
  const workers: OCRWorkerHandle[] = [];
  for (let i = 0; i < size; i++) {
    const w = await createOCRWorker({
      lang: input.lang,
      psm: input.psm,
      oem: input.oem,
      actor: `${input.actor_prefix ?? "acer-ocr-scheduler"}-${i}`,
      id: `ocr-sched-worker-${i}`,
    });
    workers.push(w);
  }

  const state: PoolState = { queued: 0, processing: 0, completed: 0, failed: 0 };
  let roundRobin = 0;

  return {
    id: `ocr-sched-${Date.now()}`,
    size,
    workers,
    async addJob(job_type, image) {
      state.queued++;
      const w = workers[roundRobin++ % workers.length];
      state.queued--;
      state.processing++;
      try {
        const res = job_type === "recognize" ? await w.recognize(image) : await w.detect(image);
        state.processing--;
        if ((res as any).verb === "ocr-refused") state.failed++;
        else state.completed++;
        return res;
      } catch (e) {
        state.processing--;
        state.failed++;
        return buildRefusal({
          actor: "acer-ocr-scheduler",
          target: "federation",
          reason: "timeout",
          detail: (e as Error).message,
        });
      }
    },
    async terminate() {
      await Promise.all(workers.map(w => w.terminate()));
    },
    stats() {
      return { ...state, size };
    },
  };
}
