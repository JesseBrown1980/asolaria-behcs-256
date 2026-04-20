// UPGRADE-4 · GNNFeedbackCadenceAdjuster
// Reads GNN-scored feedback on each kick's outcome and adjusts the next poll/kick interval.
// Reverse-gain scoring from 100K fanout: promote=+reward, demote=-reward, halt=-max.
// Cadence adapts: faster polls when work is flowing, slower when idle or when GNN says "leak".
//
// P1 upgrades (2026-04-19):
//   - Symmetric multipliers: speed-up 0.8 · slow-down 1.25 (1/0.8). Prior 1.5 biased toward max_ms.
//   - `verdict:"neutral"` support: delta=0, decay still applied, cadence untouched this tick by damper rule.
//   - Oscillation damper: when |score| < 0.5, hold cadence (no multiplicative adjustment this tick).

const SPEED_UP_FACTOR = 0.8;
const SLOW_DOWN_FACTOR = 1 / SPEED_UP_FACTOR; // 1.25 (symmetric inverse)
const DAMPER_THRESHOLD = 0.5;

export class GNNFeedbackCadenceAdjuster {
  constructor(config = {}) {
    this.min_ms = config.min_ms ?? 5_000;
    this.max_ms = config.max_ms ?? 60_000;
    this.current_ms = config.initial_ms ?? 10_000;
    this.decay = config.decay ?? 0.85;
    this.score = 0;
    this.history = [];
    this.dampers_skipped = 0;
  }

  onOutcome({ verdict, intent, is_reply = false } = {}) {
    // verdict: 'promote' | 'demote' | 'halt' | 'neutral' (from reverse-gain sieve)
    // intent:  'leak' | 'mask' | 'meta' (reveals whether counterpart is hiding)
    let delta = 0;
    if (verdict === "promote") delta = is_reply ? +2.0 : +1.0;
    else if (verdict === "demote") delta = -0.5;
    else if (verdict === "halt")   delta = -5.0;
    else if (verdict === "neutral") delta = 0; // explicit: no signal contribution
    // (unknown verdicts also contribute 0, but are flagged in history.delta=0)

    if (intent === "leak") delta += 0.1;
    else if (intent === "mask") delta -= 0.3;

    this.score = this.score * this.decay + delta;
    this.history.push({ at: new Date().toISOString(), verdict, intent, delta, score: this.score });
    if (this.history.length > 128) this.history.shift();

    const damped = this._adjustCadence();
    return { score: this.score, next_interval_ms: this.current_ms, damped };
  }

  _adjustCadence() {
    // Oscillation damper: if score magnitude is low, do NOT multiplicatively adjust.
    // Still clamps to [min, max] so externally-mutated current_ms stays legal.
    if (Math.abs(this.score) < DAMPER_THRESHOLD) {
      this.current_ms = Math.max(this.min_ms, Math.min(this.max_ms, Math.round(this.current_ms)));
      this.dampers_skipped++;
      return true; // damped this tick
    }

    // Higher score = faster (things are flowing). Lower = slower (idle or leak).
    // Thresholds kept at ±2.0 (pre-existing contract). Multipliers now symmetric.
    if (this.score > 2.0) {
      this.current_ms = Math.max(this.min_ms, this.current_ms * SPEED_UP_FACTOR);
    } else if (this.score < -2.0) {
      this.current_ms = Math.min(this.max_ms, this.current_ms * SLOW_DOWN_FACTOR);
    }
    // else hold (between thresholds, above damper band)
    this.current_ms = Math.max(this.min_ms, Math.min(this.max_ms, Math.round(this.current_ms)));
    return false;
  }

  nextIntervalMs() {
    return this.current_ms;
  }

  snapshot() {
    return {
      score: this.score,
      current_ms: this.current_ms,
      history_len: this.history.length,
      dampers_skipped: this.dampers_skipped,
      factors: { speed_up: SPEED_UP_FACTOR, slow_down: SLOW_DOWN_FACTOR },
    };
  }
}
