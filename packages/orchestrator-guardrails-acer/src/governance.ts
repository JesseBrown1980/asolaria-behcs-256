// packages/orchestrator-guardrails-acer/src/governance.ts — M-governance
//
// M-acer/M-audit covered instant gate decisions; M-governance adds a
// persistent per-actor quota ledger so the colony can enforce fair
// allocation across repeated claims. Each actor accrues debt that decays
// over a configured period; claims exceeding the running allowance are
// throttled rather than hard-refused.
//
// Pure state machine — caller persists the ledger between invocations
// (JSON blob + atomic write are sufficient).

export interface ActorUsage {
  actor: string;
  window_start: string;
  window_end: string;
  claims_in_window: number;
  claim_log: Array<{ claim_name: string; at: string; cost: number }>;
}

export interface GovernanceLedger {
  version: "m-governance-v1";
  window_ms: number;
  soft_cap_per_actor: number;        // claims above this → throttle
  hard_cap_per_actor: number;         // claims above this → refuse
  updated_at: string;
  actors: Record<string, ActorUsage>;
}

export interface ClaimRequest {
  actor: string;
  claim_name: string;
  cost?: number;                     // default 1; lets caller bill expensive claims more
  at?: string;
}

export type GovernanceDecision = "allow" | "throttle" | "refuse";

export interface ClaimDecision {
  decision: GovernanceDecision;
  actor: string;
  claim_name: string;
  claims_in_window: number;
  soft_cap: number;
  hard_cap: number;
  ledger: GovernanceLedger;
  reason: string;
  glyph_sentence: string;
}

export function makeLedger(window_ms: number, soft_cap: number = 10, hard_cap: number = 20): GovernanceLedger {
  return {
    version: "m-governance-v1",
    window_ms,
    soft_cap_per_actor: soft_cap,
    hard_cap_per_actor: hard_cap,
    updated_at: new Date().toISOString(),
    actors: {},
  };
}

function sweepExpired(usage: ActorUsage, now: string, window_ms: number): ActorUsage {
  const cutoff = Date.parse(now) - window_ms;
  const live = usage.claim_log.filter(c => Date.parse(c.at) >= cutoff);
  const claims_in_window = live.reduce((sum, c) => sum + c.cost, 0);
  return {
    ...usage,
    window_start: new Date(cutoff).toISOString(),
    window_end: now,
    claims_in_window,
    claim_log: live,
  };
}

export function checkClaim(ledger: GovernanceLedger, req: ClaimRequest): ClaimDecision {
  const now = req.at ?? new Date().toISOString();
  const cost = req.cost ?? 1;

  const priorUsage = ledger.actors[req.actor] ?? {
    actor: req.actor, window_start: now, window_end: now, claims_in_window: 0, claim_log: [],
  };
  const swept = sweepExpired(priorUsage, now, ledger.window_ms);

  const projected = swept.claims_in_window + cost;
  let decision: GovernanceDecision;
  let reason: string;

  if (projected > ledger.hard_cap_per_actor) {
    decision = "refuse";
    reason = `projected=${projected} > hard_cap=${ledger.hard_cap_per_actor}`;
  } else if (projected > ledger.soft_cap_per_actor) {
    decision = "throttle";
    reason = `projected=${projected} > soft_cap=${ledger.soft_cap_per_actor} (will queue/backoff, still allowed once)`;
  } else {
    decision = "allow";
    reason = `within soft_cap (${projected}/${ledger.soft_cap_per_actor})`;
  }

  // Ledger is only updated when decision is allow or throttle
  const newUsage: ActorUsage = decision === "refuse" ? swept : {
    ...swept,
    claims_in_window: projected,
    claim_log: [...swept.claim_log, { claim_name: req.claim_name, at: now, cost }],
  };

  const newLedger: GovernanceLedger = {
    ...ledger,
    updated_at: now,
    actors: { ...ledger.actors, [req.actor]: newUsage },
  };

  return {
    decision,
    actor: req.actor,
    claim_name: req.claim_name,
    claims_in_window: newUsage.claims_in_window,
    soft_cap: ledger.soft_cap_per_actor,
    hard_cap: ledger.hard_cap_per_actor,
    ledger: newLedger,
    reason,
    glyph_sentence: `EVT-GOVERNANCE-CLAIM · actor=${req.actor} · decision=${decision} · usage=${newUsage.claims_in_window}/${ledger.soft_cap_per_actor}(soft)/${ledger.hard_cap_per_actor}(hard) @ M-${decision === "allow" ? "INDICATIVE" : "EYEWITNESS"} .`,
  };
}

export interface GovernanceSnapshot {
  window_ms: number;
  soft_cap: number;
  hard_cap: number;
  total_actors: number;
  over_soft: string[];        // actors currently over soft_cap
  over_hard: string[];        // actors currently over hard_cap
  top_users: Array<{ actor: string; claims_in_window: number }>;
  glyph_sentence: string;
}

export function snapshotLedger(ledger: GovernanceLedger): GovernanceSnapshot {
  const overSoft: string[] = [];
  const overHard: string[] = [];
  const all: Array<{ actor: string; claims_in_window: number }> = [];
  for (const [name, u] of Object.entries(ledger.actors)) {
    all.push({ actor: name, claims_in_window: u.claims_in_window });
    if (u.claims_in_window > ledger.hard_cap_per_actor) overHard.push(name);
    else if (u.claims_in_window > ledger.soft_cap_per_actor) overSoft.push(name);
  }
  all.sort((a, b) => b.claims_in_window - a.claims_in_window);
  return {
    window_ms: ledger.window_ms,
    soft_cap: ledger.soft_cap_per_actor,
    hard_cap: ledger.hard_cap_per_actor,
    total_actors: Object.keys(ledger.actors).length,
    over_soft: overSoft,
    over_hard: overHard,
    top_users: all.slice(0, 10),
    glyph_sentence: `EVT-GOVERNANCE-SNAPSHOT · actors=${Object.keys(ledger.actors).length} · over-soft=${overSoft.length} · over-hard=${overHard.length} @ M-INDICATIVE .`,
  };
}

// Force-sweep every actor (ops command for cleanup after window expires)
export function sweepLedger(ledger: GovernanceLedger, now: string = new Date().toISOString()): GovernanceLedger {
  const actors: Record<string, ActorUsage> = {};
  for (const [name, u] of Object.entries(ledger.actors)) {
    actors[name] = sweepExpired(u, now, ledger.window_ms);
  }
  return { ...ledger, updated_at: now, actors };
}
