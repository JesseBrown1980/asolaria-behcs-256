// packages/firewall/src/rule-scheduler.ts — L-005 time-windowed rule scheduler
//
// L-004 generates rule PROPOSALS; L-005 schedules them as time-windowed
// ActiveBlocks that auto-expire or auto-renew. Operators use this to
// apply "refuse for 1 hour then re-evaluate" patterns without hand-
// writing expiry timestamps each time.
//
// Pure state machine — maintains a list of scheduled entries; tick()
// promotes/expires/renews based on the current time.

import type { ActiveBlock } from "./rules.ts";
import type { RuleProposal } from "./rule-proposals.ts";

export interface ScheduledRule {
  rule_id: string;
  subject: string;
  scope: ActiveBlock["scope"];
  reason: string;
  scheduled_at: string;
  activates_at: string;           // ISO — when this rule should become an ActiveBlock
  expires_at: string;              // ISO — when it should be removed
  renew_policy: "none" | "auto-renew-if-still-offending" | "auto-renew-fixed";
  renew_duration_ms?: number;     // for auto-renew-fixed
  status: "pending" | "active" | "expired" | "renewed";
}

export interface SchedulerState {
  scheduled: ScheduledRule[];
  now: string;
}

export interface TickResult {
  promoted_to_active: ScheduledRule[];
  newly_expired: ScheduledRule[];
  newly_renewed: ScheduledRule[];
  still_pending: ScheduledRule[];
  active_blocks: ActiveBlock[];
  glyph_sentence: string;
}

export function schedule(
  proposal: RuleProposal,
  options: {
    now?: string;
    activate_after_ms?: number;    // delay before activation (default immediate)
    duration_ms?: number;          // how long to stay active (default 1h)
    renew_policy?: ScheduledRule["renew_policy"];
    renew_duration_ms?: number;
  } = {},
): ScheduledRule {
  const now = options.now ?? new Date().toISOString();
  const activateDelay = options.activate_after_ms ?? 0;
  const duration = options.duration_ms ?? 3600_000;
  const activates = new Date(Date.parse(now) + activateDelay).toISOString();
  const expires = new Date(Date.parse(activates) + duration).toISOString();

  const scopeFromKind: Record<RuleProposal["kind"], ActiveBlock["scope"]> =
    { "actor-block": "actor", "verb-block": "envelope", "subject-block": "subject" };

  return {
    rule_id: proposal.suggested_rule_id,
    subject: proposal.subject,
    scope: scopeFromKind[proposal.kind],
    reason: proposal.suggested_reason,
    scheduled_at: now,
    activates_at: activates,
    expires_at: expires,
    renew_policy: options.renew_policy ?? "none",
    renew_duration_ms: options.renew_duration_ms ?? duration,
    status: activateDelay === 0 ? "active" : "pending",
  };
}

export function tick(state: SchedulerState, offendersStillActive: (subject: string) => boolean = () => false): TickResult {
  const promoted: ScheduledRule[] = [];
  const expired: ScheduledRule[] = [];
  const renewed: ScheduledRule[] = [];
  const pending: ScheduledRule[] = [];
  const activeBlocks: ActiveBlock[] = [];
  const now = state.now;
  const nowMs = Date.parse(now);

  for (const r of state.scheduled) {
    const actMs = Date.parse(r.activates_at);
    const expMs = Date.parse(r.expires_at);

    if (r.status === "expired") {
      // Already expired — skip (caller should have pruned)
      continue;
    }

    if (nowMs < actMs) {
      pending.push(r);
      continue;
    }

    if (nowMs >= expMs) {
      // Past expiry — check renew policy
      if (r.renew_policy === "auto-renew-fixed") {
        const newActivates = now;
        const newExpires = new Date(nowMs + (r.renew_duration_ms ?? 3600_000)).toISOString();
        const renewedRule: ScheduledRule = { ...r, activates_at: newActivates, expires_at: newExpires, status: "renewed" };
        renewed.push(renewedRule);
        activeBlocks.push(toActiveBlock(renewedRule));
      } else if (r.renew_policy === "auto-renew-if-still-offending" && offendersStillActive(r.subject)) {
        const newActivates = now;
        const newExpires = new Date(nowMs + (r.renew_duration_ms ?? 3600_000)).toISOString();
        const renewedRule: ScheduledRule = { ...r, activates_at: newActivates, expires_at: newExpires, status: "renewed" };
        renewed.push(renewedRule);
        activeBlocks.push(toActiveBlock(renewedRule));
      } else {
        expired.push({ ...r, status: "expired" });
      }
      continue;
    }

    // nowMs in [activates, expires) — active
    if (r.status === "pending") {
      const promotedRule: ScheduledRule = { ...r, status: "active" };
      promoted.push(promotedRule);
      activeBlocks.push(toActiveBlock(promotedRule));
    } else {
      activeBlocks.push(toActiveBlock(r));
    }
  }

  return {
    promoted_to_active: promoted,
    newly_expired: expired,
    newly_renewed: renewed,
    still_pending: pending,
    active_blocks: activeBlocks,
    glyph_sentence: `EVT-FIREWALL-SCHEDULER-TICK · now=${now} · active=${activeBlocks.length} · promoted=${promoted.length} · expired=${expired.length} · renewed=${renewed.length} · pending=${pending.length} @ M-INDICATIVE .`,
  };
}

function toActiveBlock(r: ScheduledRule): ActiveBlock {
  return {
    rule_id: r.rule_id,
    subject: r.subject,
    scope: r.scope,
    reason: r.reason,
    created_at: r.activates_at,
    expires_at: r.expires_at,
  };
}

// Apply tick result back onto the scheduler, dropping expired
export function applyTick(state: SchedulerState, result: TickResult): SchedulerState {
  const expiredIds = new Set(result.newly_expired.map(r => r.rule_id));
  const promotedMap = new Map(result.promoted_to_active.map(r => [r.rule_id, r]));
  const renewedMap = new Map(result.newly_renewed.map(r => [r.rule_id, r]));

  const newScheduled: ScheduledRule[] = [];
  for (const r of state.scheduled) {
    if (expiredIds.has(r.rule_id)) continue;       // drop
    if (promotedMap.has(r.rule_id)) { newScheduled.push(promotedMap.get(r.rule_id)!); continue; }
    if (renewedMap.has(r.rule_id)) { newScheduled.push(renewedMap.get(r.rule_id)!); continue; }
    newScheduled.push(r);
  }
  return { ...state, scheduled: newScheduled };
}

export interface SchedulerSummary {
  total: number;
  pending: number;
  active: number;
  expired_this_tick: number;
  renewed_this_tick: number;
  glyph_sentence: string;
}

export function summarize(state: SchedulerState, tickResult?: TickResult): SchedulerSummary {
  const tot = state.scheduled.length;
  const p = state.scheduled.filter(r => r.status === "pending").length;
  const a = state.scheduled.filter(r => r.status === "active" || r.status === "renewed").length;
  return {
    total: tot,
    pending: p,
    active: a,
    expired_this_tick: tickResult?.newly_expired.length ?? 0,
    renewed_this_tick: tickResult?.newly_renewed.length ?? 0,
    glyph_sentence: `EVT-SCHEDULER-SUMMARY · total=${tot} · pending=${p} · active=${a} @ M-INDICATIVE .`,
  };
}
