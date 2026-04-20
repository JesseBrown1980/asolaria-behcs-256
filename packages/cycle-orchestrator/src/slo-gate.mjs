// UPGRADE-5 · SLOGate
// Evaluates halt predicates on every tick; trips HALT if any fires.
// Predicates (from 100K-fanout spec + extended audit):
//   U-006-mem             mem_free_mb < 200 for 30s consecutive
//   U-007-err-10pct       error_rate > 0.1 over 60s window (min 5 samples) OR 1.0 with >=3
//   U-008-op-halt         OP-HALT verb observed on bus from any peer (exact whitelist)
//   U-010-schema-drift    verb uses unknown schema version
//   U-009-law-violation   >= 3 law violations in 60s
//   U-011-peer-flap       peer transitions >= 5 in 30s
//   U-012-quorum-split    bilateral quorum diverged on an artifact
//   U-013-cadence-floor   cadence < 5000ms sustained for 30s
//   U-014-state-file-staleness  state-file age > 120s
//
// P0 fix — OP-HALT detection no longer triggered by any payload mentioning "-HALT".
// Use exact whitelist + narrow regex for emit events.

const OP_HALT_WHITELIST = new Set(["OP-HALT", "EVT-HALT"]);
const OP_HALT_REGEX = /^EVT-[A-Z-]+-HALT-EMIT$/;

export class SLOGate {
  constructor(config = {}) {
    // tunables
    this.mem_threshold_mb = config.mem_threshold_mb ?? 200;
    this.mem_duration_ms = config.mem_duration_ms ?? 30_000;
    this.err_rate_threshold = config.err_rate_threshold ?? 0.10;
    this.err_window_ms = config.err_window_ms ?? 60_000;
    this.err_min_samples = config.err_min_samples ?? 5;
    this.err_full_saturation_min = config.err_full_saturation_min ?? 3;
    this.law_window_ms = config.law_window_ms ?? 60_000;
    this.law_threshold = config.law_threshold ?? 3;
    this.flap_window_ms = config.flap_window_ms ?? 30_000;
    this.flap_threshold = config.flap_threshold ?? 5;
    this.cadence_floor_ms = config.cadence_floor_ms ?? 5_000;
    this.cadence_floor_duration_ms = config.cadence_floor_duration_ms ?? 30_000;
    this.state_file_stale_ms = config.state_file_stale_ms ?? 120_000;

    // internal state
    this._low_mem_since_ms = null;
    this._err_events = [];        // array of {ts_ms, is_error: bool}
    this._op_halt_seen = false;
    this._schema_drift_seen = false;
    this._law_events = [];        // array of {ts_ms, kind}
    this._peer_flaps = new Map(); // peer_id -> array of {ts_ms, state}
    this._quorum_split = false;   // latched
    this._split_artifact = null;
    this._fast_cadence_since_ms = null;
    this._last_cadence_ms = null;
    this._state_file_age_ms = null;
    this._last_eval = null;
  }

  // -------------------- observers --------------------

  observeMem(free_mb) {
    const now = Date.now();
    if (free_mb < this.mem_threshold_mb) {
      if (!this._low_mem_since_ms) this._low_mem_since_ms = now;
    } else {
      this._low_mem_since_ms = null;
    }
  }

  observeEvent({ is_error }) {
    const now = Date.now();
    this._err_events.push({ ts_ms: now, is_error: Boolean(is_error) });
    const cutoff = now - this.err_window_ms;
    while (this._err_events.length && this._err_events[0].ts_ms < cutoff) this._err_events.shift();
  }

  observeVerb(verb) {
    if (typeof verb !== "string") return;
    if (OP_HALT_WHITELIST.has(verb) || OP_HALT_REGEX.test(verb)) {
      this._op_halt_seen = true;
    }
  }

  observeSchemaDrift(flag = true) {
    this._schema_drift_seen = Boolean(flag);
  }

  observeLawViolation(kind) {
    const now = Date.now();
    this._law_events.push({ ts_ms: now, kind: kind ?? "unknown" });
    const cutoff = now - this.law_window_ms;
    while (this._law_events.length && this._law_events[0].ts_ms < cutoff) this._law_events.shift();
  }

  observePeerFlap(peer_id, state) {
    if (!peer_id) return;
    const now = Date.now();
    if (!this._peer_flaps.has(peer_id)) this._peer_flaps.set(peer_id, []);
    const arr = this._peer_flaps.get(peer_id);
    arr.push({ ts_ms: now, state: state ?? "unknown" });
    const cutoff = now - this.flap_window_ms;
    while (arr.length && arr[0].ts_ms < cutoff) arr.shift();
  }

  observeQuorumSplit(artifact) {
    this._quorum_split = true;
    this._split_artifact = artifact ?? null;
  }

  observeCadenceFloor(ms) {
    const now = Date.now();
    this._last_cadence_ms = ms;
    if (typeof ms === "number" && ms < this.cadence_floor_ms) {
      if (!this._fast_cadence_since_ms) this._fast_cadence_since_ms = now;
    } else {
      this._fast_cadence_since_ms = null;
    }
  }

  observeStateFileAge(ms) {
    this._state_file_age_ms = typeof ms === "number" ? ms : null;
  }

  // -------------------- evaluate --------------------

  evaluate() {
    const now = Date.now();

    // U-007 — recompute with trimmed window
    const cutoff = now - this.err_window_ms;
    while (this._err_events.length && this._err_events[0].ts_ms < cutoff) this._err_events.shift();

    // U-011 — trim per-peer flap history
    for (const [peer, arr] of this._peer_flaps.entries()) {
      const flap_cutoff = now - this.flap_window_ms;
      while (arr.length && arr[0].ts_ms < flap_cutoff) arr.shift();
      if (!arr.length) this._peer_flaps.delete(peer);
    }

    // U-009 — trim law window
    const law_cutoff = now - this.law_window_ms;
    while (this._law_events.length && this._law_events[0].ts_ms < law_cutoff) this._law_events.shift();

    const predicates = {
      "U-006-mem": Boolean(this._low_mem_since_ms && (now - this._low_mem_since_ms >= this.mem_duration_ms)),
      "U-007-err-10pct": (() => {
        const total = this._err_events.length;
        if (total === 0) return false;
        const errs = this._err_events.filter(e => e.is_error).length;
        const ratio = errs / total;
        // full saturation shortcut: all-errors with >=3 samples
        if (ratio === 1.0 && total >= this.err_full_saturation_min) return true;
        if (total < this.err_min_samples) return false;
        return ratio > this.err_rate_threshold;
      })(),
      "U-008-op-halt": this._op_halt_seen,
      "U-010-schema-drift": this._schema_drift_seen,
      "U-009-law-violation": this._law_events.length >= this.law_threshold,
      "U-011-peer-flap": (() => {
        for (const arr of this._peer_flaps.values()) {
          if (arr.length >= this.flap_threshold) return true;
        }
        return false;
      })(),
      "U-012-quorum-split": this._quorum_split,
      "U-013-cadence-floor": Boolean(
        this._fast_cadence_since_ms &&
        (now - this._fast_cadence_since_ms >= this.cadence_floor_duration_ms)
      ),
      "U-014-state-file-staleness": Boolean(
        typeof this._state_file_age_ms === "number" &&
        this._state_file_age_ms > this.state_file_stale_ms
      ),
    };

    const any = Object.values(predicates).some(Boolean);
    const tripped = Object.entries(predicates).filter(([, v]) => v).map(([k]) => k);
    this._last_eval = { any_fired: any, tripped_predicates: tripped, evaluated_at: new Date().toISOString() };
    return this._last_eval;
  }

  // -------------------- reset API --------------------

  reset(predicate_name) {
    if (!predicate_name) {
      return this.clearAll();
    }
    switch (predicate_name) {
      case "U-006-mem":
      case "U-006":
        this._low_mem_since_ms = null;
        break;
      case "U-007-err-10pct":
      case "U-007":
        this._err_events = [];
        break;
      case "U-008-op-halt":
      case "U-008":
        this._op_halt_seen = false;
        break;
      case "U-010-schema-drift":
      case "U-010":
        this._schema_drift_seen = false;
        break;
      case "U-009-law-violation":
      case "U-009":
        this._law_events = [];
        break;
      case "U-011-peer-flap":
      case "U-011":
        this._peer_flaps.clear();
        break;
      case "U-012-quorum-split":
      case "U-012":
        this._quorum_split = false;
        this._split_artifact = null;
        break;
      case "U-013-cadence-floor":
      case "U-013":
        this._fast_cadence_since_ms = null;
        this._last_cadence_ms = null;
        break;
      case "U-014-state-file-staleness":
      case "U-014":
        this._state_file_age_ms = null;
        break;
      default:
        return { ok: false, reason: `unknown predicate ${predicate_name}` };
    }
    return { ok: true, reset: predicate_name };
  }

  clearAll() {
    this._low_mem_since_ms = null;
    this._err_events = [];
    this._op_halt_seen = false;
    this._schema_drift_seen = false;
    this._law_events = [];
    this._peer_flaps.clear();
    this._quorum_split = false;
    this._split_artifact = null;
    this._fast_cadence_since_ms = null;
    this._last_cadence_ms = null;
    this._state_file_age_ms = null;
    this._last_eval = null;
    return { ok: true, reset: "ALL" };
  }

  snapshot() {
    return {
      last_eval: this._last_eval,
      mem_low_since_ms: this._low_mem_since_ms,
      err_window_samples: this._err_events.length,
      op_halt_seen: this._op_halt_seen,
      schema_drift_seen: this._schema_drift_seen,
      law_events: this._law_events.length,
      peer_flap_peers: this._peer_flaps.size,
      quorum_split: this._quorum_split,
      split_artifact: this._split_artifact,
      fast_cadence_since_ms: this._fast_cadence_since_ms,
      last_cadence_ms: this._last_cadence_ms,
      state_file_age_ms: this._state_file_age_ms,
    };
  }
}
