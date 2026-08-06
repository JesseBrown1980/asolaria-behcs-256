// UPGRADE-4 · GNNFeedbackCadenceAdjuster
// Reads GNN-scored feedback on each kick's outcome and adjusts the next poll/kick interval.
// Reverse-gain scoring from 100K fanout: promote=+reward, demote=-reward, halt=-max.
// Cadence adapts: faster polls when work is flowing, slower when idle or when GNN says "leak".
//
// P1 upgrades (2026-04-19):
//   - Symmetric multipliers: speed-up 4/5 · slow-down 5/4 (exact inverse). Prior 1.5 biased toward max_ms.
//   - `verdict:"neutral"` support: delta=0, decay still applied, cadence untouched this tick by damper rule.
//   - Oscillation damper: when |score_pm| < 500, hold cadence (no multiplicative adjustment).
//
// 2026-08-06 integer rule: score is per-mille, multipliers are the exact rationals 4/5
// and 5/4, decay is 850 per-mille. No float anywhere in the decision path.

// INTEGER RULE (operator): integer arithmetic only, never float, so ternary can run.
// The multipliers were already exact rationals -- 0.8 = 4/5 and 1.25 = 5/4 -- so integers
// lose nothing: every single step reproduces the float result exactly (verified over the
// whole legal cadence range).
//
// CORRECTED CLAIM: an earlier draft of this comment said 5/4 composed with 4/5 is exactly
// the identity while the float pair only approximated it. That is FALSE and was caught by
// measurement: over ms = 5000..60000 the round-trip deviates by at most 1 ms in BOTH the
// integer and the float form, because an integer millisecond cannot hold ms*4/5 exactly.
// Integers win on determinism and platform-independence here, not on round-trip exactness.
//
// Score is per-mille throughout.
const SPEED_UP_NUM = 4, SPEED_UP_DEN = 5;      // was 0.8
const SLOW_DOWN_NUM = 5, SLOW_DOWN_DEN = 4;    // was 1.25, the exact inverse
const DAMPER_THRESHOLD_PM = 500;               // was 0.5
const SCORE_THRESHOLD_PM = 2000;               // was 2.0, the pre-existing contract

export class GNNFeedbackCadenceAdjuster {
  constructor(config = {}) {
    this.min_ms = config.min_ms ?? 5_000;
    this.max_ms = config.max_ms ?? 60_000;
    this.current_ms = config.initial_ms ?? 10_000;
    // decay as per-mille: 0.85 -> 850. Applied as an integer multiply then one divide,
    // rounded half away from zero so the decay is symmetric for + and - scores.
    this.decay_pm = config.decay_pm ?? Math.round((config.decay ?? 0.85) * 1000);
    this.score_pm = 0;
    this.history = [];
    this.dampers_skipped = 0;
  }

  onOutcome({ verdict, intent, is_reply = false } = {}) {
    // verdict: 'promote' | 'demote' | 'halt' | 'neutral' (from reverse-gain sieve)
    // intent:  'leak' | 'mask' | 'meta' (reveals whether counterpart is hiding)
    let delta_pm = 0;
    if (verdict === "promote") delta_pm = is_reply ? +2000 : +1000;
    else if (verdict === "demote") delta_pm = -500;
    else if (verdict === "halt")   delta_pm = -5000;
    else if (verdict === "neutral") delta_pm = 0; // explicit: no signal contribution
    // (unknown verdicts also contribute 0, but are flagged in history.delta_pm=0)

    if (intent === "leak") delta_pm += 100;
    else if (intent === "mask") delta_pm -= 300;

    // score_pm was an ACCUMULATOR under repeated float multiply -- the exact case where
    // drift compounds silently. One integer multiply, one divide, symmetric rounding.
    const sgn = this.score_pm < 0 ? -1 : 1;
    const decayed = sgn * Math.floor((Math.abs(this.score_pm) * this.decay_pm + 500) / 1000);
    this.score_pm = decayed + delta_pm;
    this.history.push({ at: new Date().toISOString(), verdict, intent, delta_pm, score_pm: this.score_pm });
    if (this.history.length > 128) this.history.shift();

    const damped = this._adjustCadence();
    return { score_pm: this.score_pm, next_interval_ms: this.current_ms, damped };
  }

  _adjustCadence() {
    // Oscillation damper: if score magnitude is low, do NOT multiplicatively adjust.
    // Still clamps to [min, max] so externally-mutated current_ms stays legal.
    if (Math.abs(this.score_pm) < DAMPER_THRESHOLD_PM) {
      this.current_ms = Math.max(this.min_ms, Math.min(this.max_ms, this.current_ms));
      this.dampers_skipped++;
      return true; // damped this tick
    }

    // Higher score = faster (things are flowing). Lower = slower (idle or leak).
    // Thresholds kept at ±2.0 (pre-existing contract). Multipliers now symmetric.
    if (this.score_pm > SCORE_THRESHOLD_PM) {
      const sped = Math.floor((this.current_ms * SPEED_UP_NUM + SPEED_UP_DEN - 1) / SPEED_UP_DEN);
      this.current_ms = Math.max(this.min_ms, sped);
    } else if (this.score_pm < -SCORE_THRESHOLD_PM) {
      const slowed = Math.floor((this.current_ms * SLOW_DOWN_NUM + SLOW_DOWN_DEN - 1) / SLOW_DOWN_DEN);
      this.current_ms = Math.min(this.max_ms, slowed);
    }
    // else hold (between thresholds, above damper band)
    this.current_ms = Math.max(this.min_ms, Math.min(this.max_ms, this.current_ms));
    return false;
  }

  nextIntervalMs() {
    return this.current_ms;
  }

  snapshot() {
    return {
      score_pm: this.score_pm,
      current_ms: this.current_ms,
      history_len: this.history.length,
      dampers_skipped: this.dampers_skipped,
      // factors as per-mille integers, not strings and not floats: 4/5 = 800, 5/4 = 1250,
      // both exact. The rational pair is also published so a reader can see it is exact.
      factors_pm: { speed_up_pm: 1000 * SPEED_UP_NUM / SPEED_UP_DEN, slow_down_pm: 1000 * SLOW_DOWN_NUM / SLOW_DOWN_DEN },
      factors_rational: { speed_up: [SPEED_UP_NUM, SPEED_UP_DEN], slow_down: [SLOW_DOWN_NUM, SLOW_DOWN_DEN] },
    };
  }
}
