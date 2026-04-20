// UPGRADE-1 · PeerStateMachine
// Tracks each peer across states: DARK → PROBING → ALIVE → KICKED → RESPONDING → DRIFT → HALT
// Transitions driven by: bus message arrivals, keyboard-daemon health probes, reply-deadline timers.
// Replaces the old weak-kicker pattern (just POSTs without state tracking).

import { createHash } from "node:crypto";

export const STATES = Object.freeze({
  DARK:       "DARK",        // no signal; not responding
  PROBING:    "PROBING",     // health probe in flight
  ALIVE:      "ALIVE",       // keyboard daemon up; bus reachable
  KICKED:     "KICKED",      // physical kick typed; waiting on reply
  RESPONDING: "RESPONDING",  // reply verb observed within deadline
  DRIFT:      "DRIFT",       // reply diverges from expected (bilateral seal broke)
  HALT:       "HALT",        // U-006/U-007/U-008/U-010 predicate fired
});

const LEGAL_TRANSITIONS = {
  DARK:       new Set(["PROBING"]),
  PROBING:    new Set(["ALIVE", "DARK"]),
  ALIVE:      new Set(["KICKED", "DARK", "PROBING"]),
  KICKED:     new Set(["RESPONDING", "DRIFT", "HALT", "DARK"]),
  RESPONDING: new Set(["ALIVE", "KICKED", "DRIFT", "HALT"]),
  DRIFT:      new Set(["ALIVE", "HALT", "DARK"]),
  HALT:       new Set(["DARK"]),
};

export class PeerStateMachine {
  constructor(peer_id, initialState = STATES.DARK) {
    this.peer_id = peer_id;
    this.state = initialState;
    this.history = [];
    this.last_transition_ts = new Date().toISOString();
    this.kick_deadline_iso = null;
    this.last_kick_sha256 = null;
    this.strikes = 0;
  }

  transition(next, reason = "") {
    const allowed = LEGAL_TRANSITIONS[this.state];
    if (!allowed || !allowed.has(next)) {
      return { ok: false, rejected: `${this.state}→${next} illegal`, current: this.state };
    }
    const prev = this.state;
    this.state = next;
    this.last_transition_ts = new Date().toISOString();
    this.history.push({ at: this.last_transition_ts, from: prev, to: next, reason });
    if (this.history.length > 256) this.history.shift();
    return { ok: true, from: prev, to: next };
  }

  onKick(kickText, deadlineMs = 180000) {
    this.last_kick_sha256 = createHash("sha256").update(kickText).digest("hex");
    this.kick_deadline_iso = new Date(Date.now() + deadlineMs).toISOString();
    return this.transition(STATES.KICKED, `kick-sha=${this.last_kick_sha256.slice(0,16)}`);
  }

  onReply(replyVerb) {
    this.strikes = 0;
    return this.transition(STATES.RESPONDING, `reply-verb=${replyVerb}`);
  }

  onDrift(diffSummary) {
    this.strikes++;
    return this.transition(STATES.DRIFT, `diff=${diffSummary} strikes=${this.strikes}`);
  }

  onHaltPredicate(predicate) {
    return this.transition(STATES.HALT, `predicate=${predicate}`);
  }

  isOverdue(now = Date.now()) {
    if (this.state !== STATES.KICKED) return false;
    if (!this.kick_deadline_iso) return false;
    return now > Date.parse(this.kick_deadline_iso);
  }

  snapshot() {
    return {
      peer_id: this.peer_id,
      state: this.state,
      last_transition_ts: this.last_transition_ts,
      kick_deadline_iso: this.kick_deadline_iso,
      last_kick_sha256: this.last_kick_sha256,
      strikes: this.strikes,
      history_len: this.history.length,
    };
  }
}
