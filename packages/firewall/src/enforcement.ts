// packages/firewall/src/enforcement.ts — L-002 firewall enforcement
//
// Composes L-001 ActiveBlocks with an ingress inspector. Given an
// incoming envelope + the current active-blocks registry, decide
// whether to allow or reject. Pure functions — daemon wires them
// into the /behcs/send receiver hook.

import { isBlocked, type ActiveBlock } from "./rules.ts";

export interface IngressInspection {
  allowed: boolean;
  blocking_rule_id: string | null;
  blocking_reason: string | null;
  scope_hit: "envelope" | "actor" | "target-host" | "subject" | null;
  glyph_sentence: string;
}

export interface InspectInput {
  envelope: {
    actor?: string;
    target?: string;
    verb?: string;
    body?: any;
    glyph_sentence?: string;
  };
  active_blocks: ActiveBlock[];
  now?: string;
  // Optional subject extractor — some envelopes carry the subject in body
  subject_extractor?: (env: any) => string | null;
}

const defaultSubjectExtractor = (env: any): string | null => {
  const b = env?.body ?? {};
  return b.subject_hilbert_pid || b.subject_permanent_name || b.scan_id || b.instance_sha256 || null;
};

export function inspect(input: InspectInput): IngressInspection {
  const env = input.envelope;
  const now = input.now ?? new Date().toISOString();
  const subject = (input.subject_extractor ?? defaultSubjectExtractor)(env);

  // Check actor-scoped blocks first (strongest)
  if (env.actor) {
    const actorBlock = isBlocked(input.active_blocks, { actor: env.actor, now });
    if (actorBlock) return buildDeny(actorBlock, "actor", now);
  }
  // Then subject-scoped
  if (subject) {
    const subjectBlock = isBlocked(input.active_blocks, { subject, now });
    if (subjectBlock) return buildDeny(subjectBlock, "subject", now);
  }
  // Envelope-scoped blocks use envelope.verb as subject per R01 default mapping
  if (env.verb) {
    const envBlock = isBlocked(input.active_blocks, { subject: env.verb, now });
    if (envBlock) return buildDeny(envBlock, "envelope", now);
  }

  return {
    allowed: true,
    blocking_rule_id: null,
    blocking_reason: null,
    scope_hit: null,
    glyph_sentence: `EVT-FIREWALL-ALLOW · actor=${env.actor ?? "?"} · verb=${env.verb ?? "?"} @ M-INDICATIVE .`,
  };
}

function buildDeny(b: ActiveBlock, scope_hit: IngressInspection["scope_hit"], now: string): IngressInspection {
  return {
    allowed: false,
    blocking_rule_id: b.rule_id,
    blocking_reason: b.reason,
    scope_hit,
    glyph_sentence: `EVT-FIREWALL-DENY · rule=${b.rule_id} · scope=${scope_hit} · subject=${b.subject.slice(0, 40)} · expires=${b.expires_at ?? "permanent"} @ M-EYEWITNESS .`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Block expiry sweep
// ──────────────────────────────────────────────────────────────────────

export function gcExpired(blocks: ActiveBlock[], now: string = new Date().toISOString()): { live: ActiveBlock[]; expired: ActiveBlock[] } {
  const live: ActiveBlock[] = [];
  const expired: ActiveBlock[] = [];
  for (const b of blocks) {
    if (b.expires_at && now > b.expires_at) expired.push(b);
    else live.push(b);
  }
  return { live, expired };
}
