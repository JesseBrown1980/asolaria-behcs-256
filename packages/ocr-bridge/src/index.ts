// packages/ocr-bridge/src/index.ts — package public surface
//
// Q.8 Items 231-240 (integrated)
// Consumers: shannon-civ-visual-layer · shannon-23-loop-vision-step ·
//   hermes-bridge-pre-read · meeting-room-shared-screen-parse ·
//   vision-keyboard-supervisor-overlay-text · novalum-wrapper-hw-diag ·
//   falcon-bridge-android-screens

export {
  // primitives
  wrapOcrEnvelope,
  buildRefusal,
  buildOrientation,
  reviewPromptInjection,
  // types
  type OCREnvelopeV1,
  type OCRRefusalEnvelope,
  type OCROrientationEnvelope,
  type PromptInjectionReview,
  type D11Level,
  type PSM,
  type OEM,
  PSM_MEANINGS,
  OEM_MEANINGS,
} from "./envelope.ts";

export {
  createOCRWorker,
  createOCRScheduler,
  type OCRWorkerHandle,
  type OCRSchedulerHandle,
  type SpawnWorkerInput,
} from "./worker.ts";

export {
  buildProfile,
  promoteToObserved,
  type OCRWorkerProfile,
  type BuildProfileInput,
} from "./profile.ts";

export {
  benchOCR,
  type BenchInput,
  type BenchResult,
} from "./bench.ts";
