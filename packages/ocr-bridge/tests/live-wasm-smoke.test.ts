// Live WASM smoke test — runs a REAL tesseract worker on the already-rasterized
// Connor W-8BEN PNG (from the forensic session earlier). Validates end-to-end
// envelope shape, sec-review, D11 stamp.
//
// Deliberately uses a small timeout + short text to keep CI cost low.

import { createOCRWorker } from "../src/worker.ts";
import { buildProfile, promoteToObserved } from "../src/profile.ts";

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

console.log("=== ocr-bridge · LIVE WASM smoke test (Connor W-8BEN PNG) ===\n");

// Resolve image path — tests may be invoked from Git Bash (/tmp) or Node (Windows %TEMP%)
const fs = await import("node:fs");
const candidates = [
  "/tmp/connor-ocr/connor-1.png",
  "C:/Users/acer/AppData/Local/Temp/connor-ocr/connor-1.png",
];
let IMG = "";
for (const c of candidates) if (fs.existsSync(c)) { IMG = c; break; }
if (!IMG) {
  console.log("  SKIP — no connor-1.png at any candidate path");
  console.log("META-ACER-OCR-LIVE-WASM-TESTS · SKIPPED (image unavailable)");
  process.exit(0);
}
console.log(`  using image at: ${IMG}`);

console.log("T1: spawn worker + recognize real image");
const t0 = Date.now();
let worker: any = null;
try {
  worker = await createOCRWorker({ lang: "eng", psm: 3, oem: 3, actor: "acer-ocr-live-smoke", id: "live-smoke" });
  assert(worker.id === "live-smoke", "worker id");
  assert(worker.lang === "eng", "lang");

  const res = await worker.recognize(IMG);
  const elapsed = Date.now() - t0;
  console.log(`  (recognize took ${elapsed}ms)`);

  if (res.verb === "ocr-refused") {
    fail++;
    console.log("  FAIL  recognize returned refusal: " + res.detail);
  } else {
    assert(res.verb === "ocr-recognize", "verb");
    assert(res.version === "ocr-envelope-v1", "envelope-v1");
    assert(res.d11_level === "ASSUMED", "D11 ASSUMED");
    assert(res.profile.startsWith("PROF-OCR-WORKER:eng:psm3:oem3"), "profile");
    assert(typeof res.result.text === "string", "text field");
    assert(res.result.text.length > 100, `text extracted (got ${res.result.text.length} chars)`);
    assert(typeof res.result.confidence === "number", "confidence");
    assert(res.result.confidence > 0, `confidence > 0 (got ${res.result.confidence})`);
    assert(res.sec_review.risk_level === "clean", "SEC clean for tax form");
    assert(res.glyph_sentence.includes("EVT-OCR-LANDED"), "landed glyph");

    // Validate extraction caught key Connor strings
    const text = res.result.text.toLowerCase();
    assert(text.includes("w-8ben") || text.includes("w8ben"), "W-8BEN in text");
    assert(text.includes("japan"), "Japan in text");
    assert(text.includes("connor") || text.includes("lee"), "name in text");
  }

  // T2: profile + D11 promotion
  console.log("\nT2: profile + D11 promotion");
  const prof = buildProfile({
    id: "live-smoke",
    lang: "eng", psm: 3, oem: 3,
    named_agent: "acer-ocr-integrator-batch-16",
    host_device: "DEV-ACER",
  });
  assert(prof.d11_level === "ASSUMED", "starts ASSUMED");
  const promoted = promoteToObserved(prof, 1);
  assert(promoted.d11_level === "OBSERVED", "promoted to OBSERVED");

} finally {
  if (worker) await worker.terminate();
}

console.log("\n=== RESULTS ===");
console.log("pass:", pass, "fail:", fail);
console.log(`META-ACER-OCR-LIVE-WASM-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
