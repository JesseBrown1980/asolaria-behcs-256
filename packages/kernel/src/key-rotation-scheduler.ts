// packages/kernel/src/key-rotation-scheduler.ts — K-002 ed25519 rotation planner
//
// Scans the ed25519 registry and emits rotation-needed events for keys
// that have exceeded their max-age or match an opt-in rotation policy.
// Pure — produces plan objects the caller persists into the behcs trail
// or dashboards. Does NOT rotate (that is an explicit, cosign-gated
// operation that requires witness).

export interface Ed25519KeyEntry {
  key_id: string;
  owner_glyph: string;
  public_key_b64: string;
  d11_level: string;
  created_at: string;
  rotated_at: string | null;
  usage: string[];
  binding_class: string;
  host_device: string;
  notes?: string;
}

export interface Ed25519Registry {
  version: string;
  updated_at: string;
  keys: Ed25519KeyEntry[];
}

export interface RotationPolicy {
  max_age_days: number;               // rotate if age exceeds this
  force_rotate_if_bootstrap: boolean; // true → bootstrap keys always go to rotation plan
  warn_days_before: number;           // pre-warn this many days before max_age
}

export const DEFAULT_POLICY: RotationPolicy = {
  max_age_days: 365,
  force_rotate_if_bootstrap: false,
  warn_days_before: 30,
};

export type RotationVerdict = "fresh" | "warn" | "rotate-now" | "rotated-recent";

export interface KeyRotationCandidate {
  key_id: string;
  owner_glyph: string;
  host_device: string;
  verdict: RotationVerdict;
  age_days: number;
  days_to_rotation: number | null;  // null when already-rotate-now
  reason: string;
}

export interface RotationPlan {
  checked_at: string;
  policy: RotationPolicy;
  total_keys: number;
  candidates_fresh: number;
  candidates_warn: number;
  candidates_rotate_now: number;
  candidates_rotated_recent: number;
  candidates: KeyRotationCandidate[];
  glyph_sentence: string;
}

function daysSince(iso: string, now: string): number {
  return (Date.parse(now) - Date.parse(iso)) / (1000 * 60 * 60 * 24);
}

export function planRotation(registry: Ed25519Registry, policy: RotationPolicy = DEFAULT_POLICY, now: string = new Date().toISOString()): RotationPlan {
  const candidates: KeyRotationCandidate[] = [];
  let fresh = 0, warn = 0, rot = 0, rotRecent = 0;

  for (const k of registry.keys) {
    const effectiveAgeBase = k.rotated_at ?? k.created_at;
    const age = daysSince(effectiveAgeBase, now);

    const isBootstrap = (k.notes ?? "").toLowerCase().includes("bootstrap") || k.usage.includes("bootstrap");
    const forcedByBootstrap = policy.force_rotate_if_bootstrap && isBootstrap;

    if (k.rotated_at && daysSince(k.rotated_at, now) < policy.warn_days_before) {
      candidates.push({
        key_id: k.key_id, owner_glyph: k.owner_glyph, host_device: k.host_device,
        verdict: "rotated-recent", age_days: Math.round(age * 10) / 10,
        days_to_rotation: policy.max_age_days - age,
        reason: `rotated ${Math.round(daysSince(k.rotated_at, now))}d ago (grace period active)`,
      });
      rotRecent++;
      continue;
    }

    if (age >= policy.max_age_days || forcedByBootstrap) {
      candidates.push({
        key_id: k.key_id, owner_glyph: k.owner_glyph, host_device: k.host_device,
        verdict: "rotate-now", age_days: Math.round(age * 10) / 10,
        days_to_rotation: null,
        reason: forcedByBootstrap
          ? `bootstrap key (policy force-rotate) age=${Math.round(age)}d`
          : `age ${Math.round(age)}d exceeds max_age ${policy.max_age_days}d`,
      });
      rot++;
    } else if (age >= policy.max_age_days - policy.warn_days_before) {
      candidates.push({
        key_id: k.key_id, owner_glyph: k.owner_glyph, host_device: k.host_device,
        verdict: "warn", age_days: Math.round(age * 10) / 10,
        days_to_rotation: Math.round(policy.max_age_days - age),
        reason: `within warn window — ${Math.round(policy.max_age_days - age)}d remaining`,
      });
      warn++;
    } else {
      candidates.push({
        key_id: k.key_id, owner_glyph: k.owner_glyph, host_device: k.host_device,
        verdict: "fresh", age_days: Math.round(age * 10) / 10,
        days_to_rotation: Math.round(policy.max_age_days - age),
        reason: "fresh",
      });
      fresh++;
    }
  }

  return {
    checked_at: now,
    policy,
    total_keys: registry.keys.length,
    candidates_fresh: fresh,
    candidates_warn: warn,
    candidates_rotate_now: rot,
    candidates_rotated_recent: rotRecent,
    candidates,
    glyph_sentence: `EVT-KEY-ROTATION-PLAN · total=${registry.keys.length} · fresh=${fresh} · warn=${warn} · rotate-now=${rot} · recent=${rotRecent} @ M-INDICATIVE .`,
  };
}

// Builds a human-readable report string for ops use (stable sort by verdict priority)
export function renderRotationReport(plan: RotationPlan): string {
  const priority: Record<RotationVerdict, number> = {
    "rotate-now": 0, "warn": 1, "rotated-recent": 2, "fresh": 3,
  };
  const sorted = [...plan.candidates].sort((a, b) => priority[a.verdict] - priority[b.verdict] || a.key_id.localeCompare(b.key_id));
  const lines: string[] = [];
  lines.push(`KEY ROTATION REPORT · checked_at=${plan.checked_at}`);
  lines.push(`policy: max_age=${plan.policy.max_age_days}d · warn_before=${plan.policy.warn_days_before}d · bootstrap_force=${plan.policy.force_rotate_if_bootstrap}`);
  lines.push(`total=${plan.total_keys} · fresh=${plan.candidates_fresh} · warn=${plan.candidates_warn} · rotate-now=${plan.candidates_rotate_now} · rotated-recent=${plan.candidates_rotated_recent}`);
  lines.push("");
  for (const c of sorted) {
    const flag = c.verdict === "rotate-now" ? "!!" : c.verdict === "warn" ? " W" : c.verdict === "rotated-recent" ? " R" : "  ";
    lines.push(`${flag} ${c.key_id.padEnd(32)} age=${c.age_days}d  ${c.verdict.padEnd(16)} ${c.reason}`);
  }
  lines.push("");
  lines.push(plan.glyph_sentence);
  return lines.join("\n");
}
