// @asolaria/kernel — grammar types + validator
// D11:ASSUMED. R.3 sketch fleshed out into runnable zod types plus the
// 10-violation validator. The validator is INTENTIONALLY conservative:
// unknown glyphs, scope-lift-into-colony without operator_witness, and
// `META-PROOF-OF-CLOSURE` failing under `M-INDICATIVE` all escalate.
//
// Spec: plans/section-R-3-grammar-specification.md §Violations (V1..V10).

import { buildRegistry, TONE_IDS, MOOD_IDS, BLAST_IDS, lookup, type Glyph, type BlastRadius, type Mood } from "./glyph-genesis.ts";
import type { Phrase, Sentence } from "./parser.ts";

// Runtime-free schema shape. A future zod/valibot wrapper can bind these.
export const PHONETIC_CLASSES = ["consonant", "vowel", "tone"] as const;
export const FAMILY_NAMES = [
  "dimension", "proof", "drift", "shannon", "op",
  "profile", "law", "device", "colony", "portal",
  "wave", "event", "mood", "meta",
] as const;
export const BLAST_RADII = ["device", "instance", "operation", "colony"] as const;
export const MOODS = ["M-INDICATIVE", "M-EYEWITNESS", "M-SUBJUNCTIVE"] as const;

export type ViolationSubtype =
  | "unknown_glyph"
  | "family_ambiguity"
  | "arity_mismatch"
  | "requires_braces"
  | "double_mood"
  | "colony_lift_unwitnessed"
  | "cross_host_privesc"
  | "closure_broken"
  | "blast_too_narrow"
  | "mood_proof_mismatch";

export interface Diagnostic {
  subtype: ViolationSubtype;
  message: string;
  glyph?: string;
  emit_event: "EVT-GRAMMAR-VIOLATION";
  halt?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  effective_blast: BlastRadius;
  mood: Mood;
  atoms: string[];
}

const BLAST_ORDER: Record<BlastRadius, number> = {
  device: 0, instance: 1, operation: 2, colony: 3,
};

function collectAtoms(p: Phrase, out: string[]): void {
  switch (p.kind) {
    case "atom": out.push(p.glyph); return;
    case "concat": collectAtoms(p.left, out); collectAtoms(p.right, out); return;
    case "nest": collectAtoms(p.inner, out); return;
    case "modify": collectAtoms(p.base, out); return;
    case "lift": collectAtoms(p.inner, out); return;
    case "pipe": collectAtoms(p.src, out); collectAtoms(p.dst, out); return;
  }
}

function scopeFromAtoms(atoms: Glyph[]): BlastRadius {
  let widest: BlastRadius = "device";
  for (const g of atoms) {
    const b = g.default_blast;
    if (!b) continue;
    if (BLAST_ORDER[b] > BLAST_ORDER[widest]) widest = b;
  }
  return widest;
}

function countLifts(p: Phrase): number {
  switch (p.kind) {
    case "atom": return 0;
    case "lift": return 1 + countLifts(p.inner);
    case "concat": return countLifts(p.left) + countLifts(p.right);
    case "nest": return countLifts(p.inner);
    case "modify": return countLifts(p.base);
    case "pipe": return countLifts(p.src) + countLifts(p.dst);
  }
}

function countConcatsAtRoot(p: Phrase): number {
  if (p.kind !== "concat") return 0;
  return 1 + countConcatsAtRoot(p.left) + countConcatsAtRoot(p.right);
}

export function validate(sentence: Sentence): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const reg = buildRegistry();
  const atomIds: string[] = [];
  collectAtoms(sentence.phrase, atomIds);

  // V1: unknown_glyph
  const resolved: Glyph[] = [];
  for (const id of atomIds) {
    const g = lookup(id);
    if (!g) {
      diagnostics.push({
        subtype: "unknown_glyph",
        message: `token '${id}' not present in glyph registry`,
        glyph: id,
        emit_event: "EVT-GRAMMAR-VIOLATION",
      });
    } else {
      resolved.push(g);
    }
  }

  // V5: double_mood — count mood tones in the original stack
  const moodTones = sentence.tones.filter((t) => MOOD_IDS.has(t));
  if (moodTones.length > 1) {
    diagnostics.push({
      subtype: "double_mood",
      message: `sentence has ${moodTones.length} mood tones (${moodTones.join(", ")}); exactly one allowed`,
      emit_event: "EVT-GRAMMAR-VIOLATION",
    });
  }

  // V3: arity_mismatch — OP-MORPH requires a PROF-* operand somewhere
  if (atomIds.includes("OP-MORPH")) {
    const hasProfile = resolved.some((g) => g.family === "profile");
    if (!hasProfile) {
      diagnostics.push({
        subtype: "arity_mismatch",
        message: `OP-MORPH requires a PROF-* operand`,
        glyph: "OP-MORPH",
        emit_event: "EVT-GRAMMAR-VIOLATION",
      });
    }
  }

  // V4: requires_braces — two same-family profiles concat'd under one mood tone
  // Conservative heuristic: if root is concat with two PROF-* atoms and sentence
  // carries a mood tone but no braces, demand braces.
  const rootConcats = countConcatsAtRoot(sentence.phrase);
  if (rootConcats > 0 && moodTones.length > 0) {
    const profileAtoms = resolved.filter((g) => g.family === "profile");
    const hasNest = containsNest(sentence.phrase);
    if (profileAtoms.length >= 2 && !hasNest) {
      diagnostics.push({
        subtype: "requires_braces",
        message: `concat of multiple PROF-* atoms under one mood tone is ambiguous; add braces`,
        emit_event: "EVT-GRAMMAR-VIOLATION",
      });
    }
  }

  // V9: blast_too_narrow — LAW or META narrowed below colony
  for (const g of resolved) {
    if (g.min_blast) {
      const narrowing = effectiveBlastFor(g, sentence);
      if (BLAST_ORDER[narrowing] < BLAST_ORDER[g.min_blast]) {
        diagnostics.push({
          subtype: "blast_too_narrow",
          message: `${g.id} (${g.family}) narrowed to @${narrowing.toUpperCase()}; family floor is @${g.min_blast.toUpperCase()}`,
          glyph: g.id,
          emit_event: "EVT-GRAMMAR-VIOLATION",
        });
      }
    }
  }

  // V6: colony_lift_unwitnessed — ^ raising to colony without operator_witness
  const lifts = countLifts(sentence.phrase);
  const lifting = lifts > 0;
  if (lifting) {
    const raiseTo = raisedBlast(resolved, lifts);
    if (raiseTo === "colony" && !sentence.operator_witness) {
      // Exception: family_floor already colony (LAW, META) — lift is a no-op
      const alreadyColonyFamily = resolved.some((g) => g.min_blast === "colony");
      if (!alreadyColonyFamily) {
        diagnostics.push({
          subtype: "colony_lift_unwitnessed",
          message: `^ scope-lift to @COLONY requires operator_witness`,
          emit_event: "EVT-GRAMMAR-VIOLATION",
        });
        diagnostics.push({
          subtype: "colony_lift_unwitnessed",
          message: `also emitted: DRIFT-PROFILE-BLAST-RADIUS-VIOLATION`,
          emit_event: "EVT-GRAMMAR-VIOLATION",
        });
      }
    }
  }

  // V10: mood_proof_mismatch — M-INDICATIVE on a phrase touching PROOF-ASSUMED
  //                            without an inner OP-DOWNGRADE
  if (sentence.mood === "M-INDICATIVE") {
    const touchesAssumed = atomIds.includes("PROOF-ASSUMED");
    const hasDowngrade = atomIds.includes("OP-DOWNGRADE");
    if (touchesAssumed && !hasDowngrade) {
      diagnostics.push({
        subtype: "mood_proof_mismatch",
        message: `M-INDICATIVE on phrase referencing PROOF-ASSUMED without OP-DOWNGRADE`,
        emit_event: "EVT-GRAMMAR-VIOLATION",
      });
    }
  }

  // V8: closure_broken — META-PROOF-OF-CLOSURE must parse under M-INDICATIVE
  if (atomIds.includes("META-PROOF-OF-CLOSURE") && sentence.mood !== "M-INDICATIVE") {
    diagnostics.push({
      subtype: "closure_broken",
      message: `META-PROOF-OF-CLOSURE must be asserted under M-INDICATIVE; got ${sentence.mood}`,
      emit_event: "EVT-GRAMMAR-VIOLATION",
      halt: true,
    });
  }

  // V7 cross_host_privesc and V2 family_ambiguity are resolution-time checks
  // that depend on the wider runtime (host map + cross-family symbol table).
  // The kernel surfaces hooks; the polymorphic-runtime enforces at dispatch.

  const effective_blast = scopeFromAtoms(resolved);
  return {
    ok: diagnostics.filter((d) => d.subtype !== "closure_broken" || d.halt !== true).length === 0 && diagnostics.length === 0,
    diagnostics,
    effective_blast,
    mood: sentence.mood,
    atoms: atomIds,
  };
}

function containsNest(p: Phrase): boolean {
  switch (p.kind) {
    case "nest": return true;
    case "concat": return containsNest(p.left) || containsNest(p.right);
    case "modify": return containsNest(p.base);
    case "lift": return containsNest(p.inner);
    case "pipe": return containsNest(p.src) || containsNest(p.dst);
    case "atom": return false;
  }
}

function effectiveBlastFor(g: Glyph, sentence: Sentence): BlastRadius {
  // Explicit blast tone in sentence.tones wins (lowercased match)
  for (const t of sentence.tones) {
    const lower = t.toLowerCase();
    if (BLAST_IDS.has(lower as BlastRadius)) return lower as BlastRadius;
  }
  return (g.default_blast ?? "operation");
}

function raisedBlast(atoms: Glyph[], lifts: number): BlastRadius {
  // R.3 §Blast Radius example: `A^` on an instance-default glyph becomes
  // colony-scoped. Interpretation: `^` is a max-widening operator (to colony)
  // rather than a strict one-level-wider lift. The one-level-wider prose in
  // R.3 is harmonized by reading it as "lift to the next permitted colony
  // boundary," which in practice is always colony. D11:ASSUMED.
  if (lifts > 0) return "colony";
  return scopeFromAtoms(atoms);
}

function findInnerMoodTones(p: Phrase, out: string[]): void {
  if (p.kind === "modify") {
    if (MOOD_IDS.has(p.tone)) out.push(p.tone);
    findInnerMoodTones(p.base, out);
  } else if (p.kind === "concat") {
    findInnerMoodTones(p.left, out);
    findInnerMoodTones(p.right, out);
  } else if (p.kind === "nest") {
    findInnerMoodTones(p.inner, out);
  } else if (p.kind === "lift") {
    findInnerMoodTones(p.inner, out);
  } else if (p.kind === "pipe") {
    findInnerMoodTones(p.src, out);
    findInnerMoodTones(p.dst, out);
  }
}
