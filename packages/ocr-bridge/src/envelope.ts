// packages/ocr-bridge/src/envelope.ts — Q.8 Item-237 envelope-v1 wrap
//
// Wraps OCR recognize/detect results into BEHCS envelope-v1 shape with
// D11 stamp (default ASSUMED), PROF-OCR-WORKER profile, glyph sentence,
// and prompt-injection review (Q.8 Item-238 SEC).
//
// Pure — no network, no Tesseract, no filesystem. Recognize/detect results
// pipe through here before emission to bus.

export type D11Level = "ASSUMED" | "OBSERVED" | "WITNESSED" | "WITNESSED_TWICE" | "ATTESTED";

export type PSM = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type OEM = 0 | 1 | 2 | 3;

export const PSM_MEANINGS: Record<PSM, string> = {
  0: "OSD only — orientation/script detection, no recognition",
  1: "Auto PSM with OSD",
  2: "Auto PSM, no OSD, no OCR",
  3: "Fully automatic PSM, no OSD (default)",
  4: "Single column of text of variable sizes",
  5: "Single uniform block of vertically aligned text",
  6: "Single uniform block of text",
  7: "Single text line",
  8: "Single word",
  9: "Single word in a circle",
  10: "Single character",
  11: "Sparse text — find as much text as possible, no order",
  12: "Sparse text with OSD",
  13: "Raw line — treat image as single line, bypass layout",
};

export const OEM_MEANINGS: Record<OEM, string> = {
  0: "Legacy engine only",
  1: "Neural nets LSTM engine only (default for eng)",
  2: "Legacy + LSTM (fallback pipeline)",
  3: "Default — based on available engines",
};

export interface OCREnvelopeV1 {
  version: "ocr-envelope-v1";
  verb: "ocr-recognize" | "ocr-detect" | "ocr-orientation";
  actor: string;
  target: string;
  ts: string;
  d11_level: D11Level;
  profile: string;            // PROF-OCR-WORKER:<lang>:<psm>:<oem>
  params: {
    lang: string;             // e.g. "eng", "chi_sim", "jpn"
    psm: PSM;
    oem: OEM;
    source_hint?: string;     // caller-supplied source context ("shannon-visual-layer", etc.)
  };
  result: {
    text: string;
    confidence: number;       // 0-100
    words_count: number;
    lines_count: number;
    blocks_count: number;
    orientation_deg?: number;
    script?: string;
  };
  sec_review: PromptInjectionReview;
  glyph_sentence: string;
}

// Q.8 Item-238 — prompt-injection review
// The OCR'd text could come from a hostile image (poisoned document, adversarial
// signage, etc.) and embed instructions targeting downstream LLM consumers.
// SEC classifies + flags.
export interface PromptInjectionReview {
  risk_level: "clean" | "suspicious" | "high";
  flags: Array<{
    kind: "instruction-verb" | "role-override" | "ignore-previous" | "tool-invocation" | "markdown-exfil" | "url-exfil" | "code-block" | "system-prompt-token";
    excerpt: string;
  }>;
  sanitized_text: string;     // text stripped of most-dangerous patterns
  glyph_sentence: string;
}

const INSTRUCTION_VERBS = ["ignore", "disregard", "forget", "override", "bypass", "disable", "delete", "drop all"];
const ROLE_OVERRIDE_PATTERNS = [/you are now/i, /act as/i, /new role:/i, /pretend to be/i, /system:/i, /\[system\]/i];
const IGNORE_PREVIOUS_PATTERNS = [/ignore (all )?(previous|prior) (instructions|context|directives)/i, /forget (what|everything) (you|was)/i];
const TOOL_INVOCATION_PATTERNS = [/<tool_use>/i, /<function[-_ ]call>/i, /exec\s*\(/i, /\bshell\s*:/i, /```(bash|powershell|cmd)/i];
const SYSTEM_PROMPT_TOKENS = [/<\|im_start\|>/i, /<\|im_end\|>/i, /<\/?system>/i, /<\|system\|>/i];
const MD_EXFIL_PATTERNS = [/!\[[^\]]*\]\(https?:\/\/[^)]+\)/i, /\[[^\]]*\]\(https?:\/\/[^)]*\?.*=.*\)/i];
const URL_EXFIL_PATTERNS = [/https?:\/\/[^\s]+\?[^\s]*=[^\s]*&/i];

export function reviewPromptInjection(text: string): PromptInjectionReview {
  const flags: PromptInjectionReview["flags"] = [];
  const lower = text.toLowerCase();

  for (const v of INSTRUCTION_VERBS) {
    if (lower.includes(v + " all") || lower.includes(v + " previous")) {
      flags.push({ kind: "instruction-verb", excerpt: v });
    }
  }
  for (const p of ROLE_OVERRIDE_PATTERNS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "role-override", excerpt: m[0].slice(0, 80) });
  }
  for (const p of IGNORE_PREVIOUS_PATTERNS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "ignore-previous", excerpt: m[0].slice(0, 80) });
  }
  for (const p of TOOL_INVOCATION_PATTERNS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "tool-invocation", excerpt: m[0].slice(0, 80) });
  }
  for (const p of SYSTEM_PROMPT_TOKENS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "system-prompt-token", excerpt: m[0].slice(0, 80) });
  }
  for (const p of MD_EXFIL_PATTERNS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "markdown-exfil", excerpt: m[0].slice(0, 80) });
  }
  for (const p of URL_EXFIL_PATTERNS) {
    const m = text.match(p);
    if (m) flags.push({ kind: "url-exfil", excerpt: m[0].slice(0, 80) });
  }

  const risk_level: PromptInjectionReview["risk_level"] =
    flags.length === 0 ? "clean"
    : flags.length <= 2 && !flags.some(f => f.kind === "tool-invocation" || f.kind === "system-prompt-token") ? "suspicious"
    : "high";

  // Sanitize — strip system-prompt tokens + flagged role-override fragments
  let sanitized = text;
  for (const p of SYSTEM_PROMPT_TOKENS) sanitized = sanitized.replace(p, "[REDACTED:system-token]");
  for (const p of TOOL_INVOCATION_PATTERNS) sanitized = sanitized.replace(p, "[REDACTED:tool-invocation]");

  return {
    risk_level,
    flags,
    sanitized_text: sanitized,
    glyph_sentence: `EVT-OCR-PROMPT-INJECTION-REVIEW · risk=${risk_level} · flags=${flags.length} @ M-${risk_level === "clean" ? "INDICATIVE" : "EYEWITNESS"} .`,
  };
}

export interface WrapInput {
  actor: string;
  target: string;
  verb: OCREnvelopeV1["verb"];
  lang: string;
  psm: PSM;
  oem: OEM;
  text: string;
  confidence: number;
  words_count?: number;
  lines_count?: number;
  blocks_count?: number;
  orientation_deg?: number;
  script?: string;
  d11_level?: D11Level;
  source_hint?: string;
  ts?: string;
}

export function wrapOcrEnvelope(input: WrapInput): OCREnvelopeV1 {
  const ts = input.ts ?? new Date().toISOString();
  const d11 = input.d11_level ?? "ASSUMED";
  const profile = `PROF-OCR-WORKER:${input.lang}:psm${input.psm}:oem${input.oem}`;
  const sec = reviewPromptInjection(input.text);
  const glyph = `EVT-OCR-LANDED · verb=${input.verb} · lang=${input.lang} · psm=${input.psm} · oem=${input.oem} · conf=${input.confidence.toFixed(1)} · words=${input.words_count ?? 0} · risk=${sec.risk_level} · d11=${d11} @ M-EYEWITNESS .`;
  return {
    version: "ocr-envelope-v1",
    verb: input.verb,
    actor: input.actor,
    target: input.target,
    ts,
    d11_level: d11,
    profile,
    params: {
      lang: input.lang,
      psm: input.psm,
      oem: input.oem,
      source_hint: input.source_hint,
    },
    result: {
      text: input.text,
      confidence: input.confidence,
      words_count: input.words_count ?? 0,
      lines_count: input.lines_count ?? 0,
      blocks_count: input.blocks_count ?? 0,
      orientation_deg: input.orientation_deg,
      script: input.script,
    },
    sec_review: sec,
    glyph_sentence: glyph,
  };
}

// Refusal envelope — used when OCR failed or policy said no
export interface OCRRefusalEnvelope {
  version: "ocr-envelope-v1";
  verb: "ocr-refused";
  actor: string;
  target: string;
  ts: string;
  reason: "worker_init_failed" | "image_unreadable" | "lang_missing" | "policy_denied" | "timeout" | "sec_high_risk";
  detail: string;
  glyph_sentence: string;
}

export function buildRefusal(input: {
  actor: string;
  target: string;
  reason: OCRRefusalEnvelope["reason"];
  detail: string;
  ts?: string;
}): OCRRefusalEnvelope {
  const ts = input.ts ?? new Date().toISOString();
  return {
    version: "ocr-envelope-v1",
    verb: "ocr-refused",
    actor: input.actor,
    target: input.target,
    ts,
    reason: input.reason,
    detail: input.detail,
    glyph_sentence: `EVT-OCR-REFUSED · reason=${input.reason} · detail=${input.detail.slice(0, 80)} @ M-EYEWITNESS .`,
  };
}

export interface OCROrientationEnvelope {
  version: "ocr-envelope-v1";
  verb: "ocr-orientation";
  actor: string;
  target: string;
  ts: string;
  orientation_deg: number;    // 0/90/180/270 typically
  script: string;             // "Latin", "Han", "Jpn", etc.
  confidence: number;
  glyph_sentence: string;
}

export function buildOrientation(input: {
  actor: string;
  target: string;
  orientation_deg: number;
  script: string;
  confidence: number;
  ts?: string;
}): OCROrientationEnvelope {
  const ts = input.ts ?? new Date().toISOString();
  return {
    version: "ocr-envelope-v1",
    verb: "ocr-orientation",
    actor: input.actor,
    target: input.target,
    ts,
    orientation_deg: input.orientation_deg,
    script: input.script,
    confidence: input.confidence,
    glyph_sentence: `EVT-OCR-ORIENTATION · deg=${input.orientation_deg} · script=${input.script} · conf=${input.confidence.toFixed(1)} @ M-EYEWITNESS .`,
  };
}
