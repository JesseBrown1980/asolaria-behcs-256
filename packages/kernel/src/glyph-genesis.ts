// @asolaria/kernel — glyph-genesis
// D11:ASSUMED. Loads kernel/glyph-families.json and expands the declared
// `examples` for each family into a canonical Glyph registry. The 256-glyph
// phonetic census is still OPEN (see glyph-families.json.open_gaps[0]) — this
// module reports `declaredCount` and `censusGap = 256 - declaredCount` so
// downstream callers do not rubber-stamp a false coverage claim.
//
// Spec: plans/section-R-3-grammar-specification.md §Phonetics, §Families.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export type PhoneticClass = "consonant" | "vowel" | "tone";
export type BlastRadius = "device" | "instance" | "operation" | "colony";
export type Mood = "M-INDICATIVE" | "M-EYEWITNESS" | "M-SUBJUNCTIVE";
export type D11Level = "PROVEN" | "OBSERVED" | "INHERITED" | "ASSUMED";

export type FamilyName =
  | "dimension" | "proof" | "drift" | "shannon" | "op"
  | "profile" | "law" | "device" | "colony" | "portal"
  | "wave" | "event" | "mood" | "meta";

export interface FamilySpec {
  prefix: string;
  default_blast: BlastRadius | null;
  phonetic_class: PhoneticClass;
  role: string;
  examples: string[];
  constraints?: { min_blast?: BlastRadius };
  source?: string;
  notes?: string;
}

export interface Glyph {
  id: string;
  family: FamilyName;
  phonetic_class: PhoneticClass;
  default_blast: BlastRadius | null;
  min_blast?: BlastRadius;
}

export interface OperatorSpec {
  symbol: string;
  precedence: number;
  phonetic_class: PhoneticClass;
  role?: string;
}

export interface FamiliesDoc {
  name: string;
  schema_version: string;
  status: string;
  d11_level: string;
  operators: Record<string, OperatorSpec>;
  blast_radii: BlastRadius[];
  moods: Record<string, { d11: string; semantics: string }>;
  families: Record<FamilyName, FamilySpec>;
  violations: Record<string, string>;
  open_gaps: string[];
  references?: Record<string, string>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAMILIES_PATH = resolve(__dirname, "../../../kernel/glyph-families.json");

let cachedDoc: FamiliesDoc | null = null;
let cachedRegistry: Map<string, Glyph> | null = null;

export function loadFamiliesDoc(): FamiliesDoc {
  if (cachedDoc) return cachedDoc;
  const raw = readFileSync(FAMILIES_PATH, "utf-8");
  cachedDoc = JSON.parse(raw) as FamiliesDoc;
  return cachedDoc;
}

export function buildRegistry(): Map<string, Glyph> {
  if (cachedRegistry) return cachedRegistry;
  const doc = loadFamiliesDoc();
  const reg = new Map<string, Glyph>();
  for (const [familyName, spec] of Object.entries(doc.families) as [FamilyName, FamilySpec][]) {
    for (const example of spec.examples) {
      if (reg.has(example)) {
        throw new Error(`glyph-genesis: duplicate glyph id ${example} across families`);
      }
      reg.set(example, {
        id: example,
        family: familyName,
        phonetic_class: spec.phonetic_class,
        default_blast: spec.default_blast,
        min_blast: spec.constraints?.min_blast,
      });
    }
  }
  // Blast-radius tone tokens (DEVICE/INSTANCE/OPERATION/COLONY) are legal tones
  // but are not themselves glyphs; we surface them separately via TONE_IDS.
  cachedRegistry = reg;
  return reg;
}

export const TONE_IDS = new Set<string>([
  "DEVICE", "INSTANCE", "OPERATION", "COLONY",
  "M-INDICATIVE", "M-EYEWITNESS", "M-SUBJUNCTIVE",
]);

export const MOOD_IDS = new Set<string>([
  "M-INDICATIVE", "M-EYEWITNESS", "M-SUBJUNCTIVE",
]);

export const BLAST_IDS = new Set<BlastRadius>([
  "device", "instance", "operation", "colony",
]);

export function censusReport(): { declaredCount: number; censusGap: number; byFamily: Record<string, number> } {
  const reg = buildRegistry();
  const byFamily: Record<string, number> = {};
  for (const g of reg.values()) {
    byFamily[g.family] = (byFamily[g.family] || 0) + 1;
  }
  return {
    declaredCount: reg.size,
    censusGap: 256 - reg.size,
    byFamily,
  };
}

export function lookup(id: string): Glyph | undefined {
  return buildRegistry().get(id);
}

export function resetCache(): void {
  cachedDoc = null;
  cachedRegistry = null;
}
