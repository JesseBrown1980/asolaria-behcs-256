// packages/ocr-bridge/src/profile.ts — Q.8 Item-235 PROF-OCR-WORKER glyph profile
//
// Canonical profile record for an OCR worker agent, with glyph encoding
// and BEHCS-256 signature so the worker can be addressed as a named
// agent in the federation routing layer.

import { createHash } from "node:crypto";
import type { PSM, OEM, D11Level } from "./envelope.ts";

export interface OCRWorkerProfile {
  version: "prof-ocr-worker-v1";
  id: string;
  lang: string;
  psm: PSM;
  oem: OEM;
  d11_level: D11Level;
  named_agent: string;              // e.g. "acer-ocr-integrator-batch-16"
  spawned_at: string;
  host_device: string;
  profile_glyph: string;            // BEHCS-256 hilbertAddress-ish sha256 slice
  capabilities: string[];           // ["recognize", "detect", "orientation"]
  glyph_sentence: string;
}

export interface BuildProfileInput {
  id: string;
  lang: string;
  psm: PSM;
  oem: OEM;
  d11_level?: D11Level;
  named_agent: string;
  host_device?: string;
  capabilities?: string[];
  spawned_at?: string;
}

export function buildProfile(input: BuildProfileInput): OCRWorkerProfile {
  const spawned_at = input.spawned_at ?? new Date().toISOString();
  const host_device = input.host_device ?? "DEV-ACER";
  const capabilities = input.capabilities ?? ["recognize", "detect", "orientation"];
  const d11 = input.d11_level ?? "ASSUMED";

  // Profile glyph — deterministic fingerprint
  const key = `${input.named_agent}|${input.lang}|psm${input.psm}|oem${input.oem}|${host_device}`;
  const profile_glyph = createHash("sha256").update(key).digest("hex").slice(0, 16);

  return {
    version: "prof-ocr-worker-v1",
    id: input.id,
    lang: input.lang,
    psm: input.psm,
    oem: input.oem,
    d11_level: d11,
    named_agent: input.named_agent,
    spawned_at,
    host_device,
    profile_glyph,
    capabilities,
    glyph_sentence: `EVT-PROF-OCR-WORKER · id=${input.id} · lang=${input.lang} · psm=${input.psm} · oem=${input.oem} · named=${input.named_agent} · glyph=${profile_glyph} · d11=${d11} @ M-EYEWITNESS .`,
  };
}

// Q.8 Item-236 — D11-OBSERVED stamp. Once a worker successfully produces
// results that an upstream consumer validates, caller can promote its
// d11_level from ASSUMED → OBSERVED.
export function promoteToObserved(profile: OCRWorkerProfile, observations: number, at?: string): OCRWorkerProfile {
  const ts = at ?? new Date().toISOString();
  return {
    ...profile,
    d11_level: "OBSERVED",
    glyph_sentence: `EVT-PROF-OCR-WORKER-D11-PROMOTED · id=${profile.id} · observations=${observations} · ASSUMED→OBSERVED @ ${ts} · M-EYEWITNESS .`,
  };
}
