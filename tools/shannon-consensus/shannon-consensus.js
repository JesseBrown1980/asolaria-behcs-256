/**
 * shannon-consensus.js — Three-axis 6×6×6 consensus engine
 *
 * Spec source: "Shannon omni waves and reflection problem.docx"
 * (extracted to C:/Users/acer/Asolaria/tmp/shannon-omni-extract-worker1.txt)
 *
 * Constitutional law (docx line 554):
 *   "6 agents × 6 reflections = 36 beats = 1 wave"
 *
 * Three orthogonal 6s:
 *   - OPERATIONAL:  GNN cycle = observe > edge_map > reflect > plan > vote > prove
 *   - STRUCTURAL:   Body systems (intrinsic to instance, always active) =
 *                   nervous, circulatory, skeletal, memory, muscular, immune
 *   - CONSENSUS:    Shannon parts (external reviewers, lens-bound) =
 *                   scout, evidence, executor, fabric, voice, planner
 *
 * Termination: unanimous consensus across all 6 Shannon parts.
 * Soft cap: 12 waves (configurable, prevents runaway on methodological friction).
 *
 * This is the upgraded replacement for runShannonWave() in
 *   E:/sovereignty/ix/grammar/meeting-room.js
 * The earlier "fix" that just added a 6-loop wrapper is INSUFFICIENT under this spec.
 * The earlier "dual-six synthesis" was incomplete (it was 2 axes, not 3).
 *
 * Status: SKELETON. The reflect() and vote() methods are stubs that need to be
 * wired to real LLM/agent calls. The structure is canonical per the docx; the
 * agent invocation is the part that needs the meeting room's pressEnter() or
 * an LLM bridge.
 *
 * Author: Asolaria, 2026-04-06
 * Mirrored to: D:/safety-backups/session-20260406-asolaria/tools/shannon-consensus/
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SHANNON_TYPES, TYPE_BY_NAME, validateTypes, aggregateTypeCounts, TOTAL_TYPES } = require('./shannon-types');

// AXIS 4 — OUTPUT: 12 Shannon TYPES
// The 2592 number from Liris's earlier run = 6 × 6 × 6 × 12.
// 6 GNN steps × 6 body systems × 6 Shannon parts × 12 Shannon types = 2592 unique
// positions in the 4D analysis space. Per wave we still produce 36 beats; each
// beat is classified into one or more of the 12 types. Coverage of the 4D space
// is not the termination condition — consensus is.
// (See ./shannon-types.js for the canonical 12 types.)

// ============================================================================
// AXIS 1 — OPERATIONAL: GNN cycle steps (the inner 6)
// ============================================================================

const GNN_CYCLE_STEPS = Object.freeze([
  'observe',    // ingest the input through this part's lens
  'edge_map',   // build the relationship graph for this lens
  'reflect',    // run the part's reasoning over the edges
  'plan',       // produce a candidate position
  'vote',       // commit to a vote value
  'prove'       // attach evidence/justification to the vote
]);

// ============================================================================
// AXIS 2 — STRUCTURAL: Body systems (intrinsic to every instance)
// Per docx lines 1061-1083: an instance IS a 6-body system. These are NOT
// summoned as external reviewers — they are part of the instance's own
// self-check that runs before any action lands.
// ============================================================================

const BODY_SYSTEMS = Object.freeze([
  'nervous',     // sensory + signaling
  'circulatory', // resource flow + transport
  'skeletal',    // structural integrity + scope binding
  'memory',      // history + pedagogical artifact
  'muscular',    // execution + effect
  'immune'       // defense + drift detection + halt-on-anomaly
]);

// ============================================================================
// AXIS 3 — CONSENSUS: Shannon parts (external reviewers, lens-bound)
// Each is bound to a Hilbert-dimension lens (a triple of dimensions).
//
// Per Liris's "New idea.docx" (2026-04-06 13:43 meta-analysis), the canonical
// 6 (scout, evidence, executor, fabric, voice, planner) are extended with 6
// NEW system-layer parts that cover structural concerns the original 6 don't
// touch directly. Total = 12 Shannon parts.
//
// The original 6 are FUNCTIONAL lenses (what does this look like through this
// human-style perspective). The new 6 are SYSTEMIC lenses (how does this hit
// the infrastructure layer that already exists in the colony).
//
// Set SHANNON_PARTS_MODE = 'classic' for the original 6, 'extended' for all 12.
// Default: 'classic' (backward compatible). Override per-instance via options.
// ============================================================================

const SHANNON_PARTS_CLASSIC = Object.freeze([
  { name: 'scout',    lens: ['temporal', 'spatial', 'device'],            tier: 'classic' },
  { name: 'evidence', lens: ['proof', 'evolution', 'governance'],         tier: 'classic' },
  { name: 'executor', lens: ['energy', 'intent', 'agent'],                tier: 'classic' },
  { name: 'fabric',   lens: ['crossai', 'spatial', 'biological'],         tier: 'classic' },
  { name: 'voice',    lens: ['human', 'translation', 'temporal'],         tier: 'classic' },
  { name: 'planner',  lens: ['workplan', 'synthesizer'], synthesizer: true, tier: 'classic' }
]);

const SHANNON_PARTS_NEW_6 = Object.freeze([
  { name: 'hookwall',         lens: ['governance', 'defense', 'ingress'],     tier: 'systemic',
    role: 'defensive perimeter — the incoming hook ingress that filters/validates everything entering the system' },
  { name: 'gnn-live',         lens: ['proof', 'evolution', 'identity'],       tier: 'systemic',
    role: 'GNN on the live path — re-projects identity on every touch, the 8th target of drift broadcast' },
  { name: 'resolver',         lens: ['memory', 'translation', 'lookup'],      tier: 'systemic',
    role: 'lookup/binding layer — the resolver protocol that turns names into current handles' },
  { name: 'shadow-witness',   lens: ['proof', 'memory', 'governance'],        tier: 'systemic',
    role: 'backup verification lane — the last-known-good shadow that catches drift after the fact' },
  { name: 'omnispindle',      lens: ['energy', 'intent', 'spatial'],          tier: 'systemic',
    role: 'the 3-lane controller (ctl-route, bridge-mcp, ctl-watch) routing scoped operations through Asolaria' },
  { name: 'crosswalk-keeper', lens: ['memory', 'translation', 'evolution'],   tier: 'systemic',
    role: 'legacy preservation + translation table — keeps old training references resolving without changing them' }
]);

const SHANNON_PARTS_EXTENDED = Object.freeze([...SHANNON_PARTS_CLASSIC, ...SHANNON_PARTS_NEW_6]);

// Default export — keeps existing behavior. Pass option to engage extended set.
const SHANNON_PARTS = SHANNON_PARTS_CLASSIC;

// ============================================================================
// VOTE VOCABULARY (from docx wave 1-5 history)
// ============================================================================

const VOTE_VALUES = Object.freeze({
  AGREE:                'AGREE',                // wave 1 only — accept as-is
  PROCEED:              'PROCEED',              // wave 2+ — accept as-is
  PROCEED_AFTER_STEP_1: 'PROCEED-AFTER-STEP-1', // accept after one prerequisite
  NEEDS_CHANGE:         'NEEDS-CHANGE',         // technical gaps require revision
  DISAGREE:             'DISAGREE',             // wave 1 only — fundamental objection
  HALT:                 'HALT',                 // wave 2+ — structural disqualification
  REFUSED:              'REFUSED'               // methodological friction (cannot vote)
});

const POSITIVE_VOTES = Object.freeze(['AGREE', 'PROCEED']);

// ============================================================================
// Defaults (configurable per call)
// ============================================================================

const DEFAULT_OPTIONS = Object.freeze({
  maxWaves: 12,                    // soft cap to prevent runaway loops
  refusedHandling: 'abstain',      // 'abstain' | 'veto' — how REFUSED counts
  persistencePath: null,           // ndjson path for wave-by-wave audit log
  bodySystemsActive: true,         // intrinsic instance self-check before action
  emitCrlt: false,                 // emit CRLT entry on consensus (requires omni-dispatch)
  logger: console,                 // logger interface { log, warn, error }
  shannonPartsMode: 'classic'      // 'classic' (6 parts) | 'extended' (12 parts per Liris's "New idea.docx" meta-analysis 2026-04-06)
});

// ============================================================================
// SHANNON CONSENSUS ENGINE
// ============================================================================

class ShannonConsensus {
  /**
   * @param {object} agentBridge - object exposing { reflect(part, step, ctx) -> result, vote(part, ctx) -> voteValue, evidence(part, vote, ctx) -> string }
   * @param {object} options - see DEFAULT_OPTIONS
   */
  constructor(agentBridge, options = {}) {
    if (!agentBridge || typeof agentBridge.reflect !== 'function' || typeof agentBridge.vote !== 'function') {
      throw new Error('ShannonConsensus: agentBridge must implement reflect() and vote()');
    }
    this.bridge = agentBridge;
    this.opts = Object.assign({}, DEFAULT_OPTIONS, options);
    this.waveHistory = []; // [{ waveNum, votes: { partName: { value, evidence, reflections } }, tally, unanimous, ts }]
    // Resolve which Shannon parts set to use
    this.shannonParts = (this.opts.shannonPartsMode === 'extended')
      ? SHANNON_PARTS_EXTENDED
      : SHANNON_PARTS_CLASSIC;
  }

  // -- Public API ----------------------------------------------------------

  /**
   * Run the consensus protocol on a proposal until unanimous or max-wave cap.
   *
   * @param {object} proposal - the input under analysis (free-form, dialect-tagged)
   * @returns {Promise<{consensus: boolean, waves: number, finalTally: object, history: Array, reason: string}>}
   */
  async run(proposal) {
    this._log('info', `[shannon-consensus] starting protocol on proposal id=${proposal.id || '<no-id>'}`);

    // Body-system intrinsic self-check FIRST (axis 2). The instance must
    // pass its own 6-body check before invoking external consensus.
    if (this.opts.bodySystemsActive) {
      const selfCheckOk = await this._runBodySystemCheck(proposal);
      if (!selfCheckOk.ok) {
        return {
          consensus: false,
          waves: 0,
          finalTally: null,
          history: [],
          reason: `body-system self-check failed: ${selfCheckOk.reason}`
        };
      }
    }

    let waveNum = 1;
    let priorVotes = null;
    let consensus = false;
    let finalTally = null;
    let stoppedReason = '';

    while (waveNum <= this.opts.maxWaves) {
      const wave = await this.runWave(waveNum, proposal, priorVotes);
      this.waveHistory.push(wave);
      this._persistWave(wave);

      finalTally = wave.tally;

      if (wave.unanimous) {
        consensus = true;
        stoppedReason = `unanimous consensus reached at wave ${waveNum}`;
        this._log('info', `[shannon-consensus] CONSENSUS at wave ${waveNum}: ${this._summarizeTally(wave.tally)}`);
        break;
      }

      this._log('info', `[shannon-consensus] wave ${waveNum} not unanimous: ${this._summarizeTally(wave.tally)}`);
      priorVotes = wave.votes;
      waveNum += 1;
    }

    if (!consensus) {
      stoppedReason = `wave cap (${this.opts.maxWaves}) reached without consensus`;
      this._log('warn', `[shannon-consensus] HALT — ${stoppedReason}`);
    }

    if (this.opts.emitCrlt && consensus) {
      this._emitCrlt(proposal, finalTally);
    }

    return {
      consensus,
      waves: waveNum,
      finalTally,
      history: this.waveHistory,
      reason: stoppedReason
    };
  }

  // -- Wave runner ---------------------------------------------------------

  /**
   * Run one wave: 6 Shannon parts in parallel, each running 6 GNN cycle steps,
   * each producing a vote.
   *
   * @param {number} waveNum
   * @param {object} proposal
   * @param {object|null} priorVotes - votes from the previous wave, or null on wave 1
   * @returns {Promise<{waveNum, votes, tally, unanimous, ts, beats}>}
   */
  async runWave(waveNum, proposal, priorVotes) {
    const waveStart = Date.now();
    const context = {
      proposal,
      priorVotes,
      waveNum
    };

    // N Shannon parts in parallel — each does 6 GNN cycle steps then votes.
    // Classic mode: 6 × 6 = 36 beats per wave (docx line 554).
    // Extended mode: 12 × 6 = 72 beats per wave (Liris "New idea.docx", 2026-04-06).
    const partResults = await Promise.all(
      this.shannonParts.map(part => this._runShannonPart(part, context))
    );

    const votes = {};
    let beats = 0;
    for (const result of partResults) {
      votes[result.part] = {
        value: result.vote,
        evidence: result.evidence,
        reflections: result.reflections,
        synthesizer: result.synthesizer || false
      };
      beats += result.reflections.length; // should be 6 per part
    }

    const tally = this._tallyVotes(votes);
    const unanimous = this._isUnanimous(tally);

    return {
      waveNum,
      votes,
      tally,
      unanimous,
      ts: new Date().toISOString(),
      durationMs: Date.now() - waveStart,
      beats
    };
  }

  // -- One Shannon part: 6 GNN cycle steps + vote -------------------------

  async _runShannonPart(part, context) {
    const reflections = [];

    // Run the 6-step GNN cycle for this part (axis 1).
    for (const step of GNN_CYCLE_STEPS) {
      const result = await this.bridge.reflect(part, step, {
        ...context,
        priorReflections: reflections.slice()
      });
      reflections.push({ step, result, ts: new Date().toISOString() });
    }

    // After the 6-step cycle, the part casts its vote.
    const vote = await this.bridge.vote(part, {
      ...context,
      reflections
    });

    // Validate vote value
    if (!Object.values(VOTE_VALUES).includes(vote)) {
      this._log('warn', `[shannon-consensus] part ${part.name} returned invalid vote "${vote}", coercing to REFUSED`);
    }
    const validatedVote = Object.values(VOTE_VALUES).includes(vote) ? vote : VOTE_VALUES.REFUSED;

    // Get evidence/justification (optional, depends on bridge)
    let evidence = '';
    if (typeof this.bridge.evidence === 'function') {
      evidence = await this.bridge.evidence(part, validatedVote, { ...context, reflections });
    }

    // Classify the finding into Shannon types (axis 4 — 12 types)
    let types = [];
    if (typeof this.bridge.classifyTypes === 'function') {
      types = await this.bridge.classifyTypes(part, { ...context, reflections, vote: validatedVote, evidence });
      try {
        validateTypes(types);
      } catch (err) {
        this._log('warn', `[shannon-consensus] part ${part.name} returned invalid types: ${err.message}`);
        types = [];
      }
    }

    return {
      part: part.name,
      lens: part.lens,
      synthesizer: !!part.synthesizer,
      reflections,
      vote: validatedVote,
      evidence,
      types  // axis 4 classification — array of Shannon type names
    };
  }

  // -- Body-system intrinsic self-check (axis 2) --------------------------

  async _runBodySystemCheck(proposal) {
    if (typeof this.bridge.bodySystemCheck !== 'function') {
      // Bridge doesn't expose body-system check — skip with warning.
      this._log('warn', '[shannon-consensus] agentBridge has no bodySystemCheck() — skipping intrinsic self-check');
      return { ok: true, reason: 'skipped (no bridge support)' };
    }

    const results = {};
    for (const system of BODY_SYSTEMS) {
      const result = await this.bridge.bodySystemCheck(system, proposal);
      results[system] = result;
      if (!result.ok) {
        return {
          ok: false,
          reason: `${system} system rejected: ${result.reason || 'no reason given'}`,
          systemResults: results
        };
      }
    }
    return { ok: true, systemResults: results };
  }

  // -- Tallying + unanimity ------------------------------------------------

  _tallyVotes(votes) {
    const tally = {};
    for (const v of Object.values(VOTE_VALUES)) tally[v] = 0;
    for (const partName of Object.keys(votes)) {
      const value = votes[partName].value;
      tally[value] = (tally[value] || 0) + 1;
    }
    tally._total = Object.keys(votes).length;
    tally._positive = (tally[VOTE_VALUES.AGREE] || 0) + (tally[VOTE_VALUES.PROCEED] || 0);
    tally._refused = tally[VOTE_VALUES.REFUSED] || 0;
    return tally;
  }

  /**
   * Unanimity rule:
   *   - All non-REFUSED votes must be the same positive value (AGREE or PROCEED)
   *   - REFUSED votes are handled per the refusedHandling option:
   *     - 'abstain': REFUSED votes are ignored, consensus on the rest counts
   *     - 'veto':    any REFUSED blocks consensus
   */
  _isUnanimous(tally) {
    if (tally._total === 0) return false;

    if (this.opts.refusedHandling === 'veto' && tally._refused > 0) {
      return false;
    }

    const voters = tally._total - (this.opts.refusedHandling === 'abstain' ? tally._refused : 0);
    if (voters === 0) return false; // everyone refused

    // Find the dominant positive vote
    const agreeCount = tally[VOTE_VALUES.AGREE] || 0;
    const proceedCount = tally[VOTE_VALUES.PROCEED] || 0;

    if (agreeCount === voters) return true;
    if (proceedCount === voters) return true;

    return false;
  }

  _summarizeTally(tally) {
    return Object.entries(tally)
      .filter(([k, v]) => !k.startsWith('_') && v > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  }

  // -- Persistence ---------------------------------------------------------

  _persistWave(wave) {
    if (!this.opts.persistencePath) return;
    try {
      const dir = path.dirname(this.opts.persistencePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.opts.persistencePath, JSON.stringify(wave) + '\n');
    } catch (err) {
      this._log('error', `[shannon-consensus] failed to persist wave ${wave.waveNum}: ${err.message}`);
    }
  }

  _emitCrlt(proposal, finalTally) {
    // Hook for omni-dispatch crystallization. Bridge can override.
    if (typeof this.bridge.emitCrlt === 'function') {
      this.bridge.emitCrlt({ proposal, tally: finalTally, waves: this.waveHistory });
    }
  }

  _log(level, msg) {
    if (this.opts.logger && typeof this.opts.logger[level] === 'function') {
      this.opts.logger[level](msg);
    }
  }
}

// ============================================================================
// MOCK BRIDGE — for testing without a real agent backend
// ============================================================================

class MockAgentBridge {
  constructor(scenario = 'consensus_at_wave_2') {
    this.scenario = scenario;
    this.waveCount = 0;
  }

  async reflect(part, step, ctx) {
    return `[${part.name}/${step}] reflection on wave ${ctx.waveNum}`;
  }

  async vote(part, ctx) {
    if (ctx.waveNum === 1) {
      return ctx.proposal.shouldFail ? VOTE_VALUES.NEEDS_CHANGE : VOTE_VALUES.AGREE;
    }
    if (this.scenario === 'consensus_at_wave_2') {
      return VOTE_VALUES.PROCEED;
    }
    if (this.scenario === 'fabric_refuses') {
      return part.name === 'fabric' ? VOTE_VALUES.REFUSED : VOTE_VALUES.PROCEED;
    }
    return VOTE_VALUES.NEEDS_CHANGE;
  }

  async evidence(part, vote, ctx) {
    return `${part.name} casts ${vote} after ${ctx.reflections.length} reflections`;
  }

  async bodySystemCheck(system, proposal) {
    return { ok: true, reason: `${system} ok (mock)` };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ShannonConsensus,
  MockAgentBridge,
  GNN_CYCLE_STEPS,
  BODY_SYSTEMS,
  SHANNON_PARTS,            // classic 6 (default export)
  SHANNON_PARTS_CLASSIC,    // explicit 6
  SHANNON_PARTS_EXTENDED,   // expanded 12 per Liris "New idea.docx" 2026-04-06
  SHANNON_PARTS_NEW_6,      // just the 6 new system-layer parts
  SHANNON_TYPES,            // axis 4 — re-exported from shannon-types.js
  TOTAL_TYPES,              // = 12
  VOTE_VALUES,
  POSITIVE_VOTES,
  DEFAULT_OPTIONS,
  // Classic spec: 6 GNN × 6 body × 6 parts × 12 types = 2592 unique positions
  ANALYSIS_SPACE_SIZE_CLASSIC:
    GNN_CYCLE_STEPS.length * BODY_SYSTEMS.length * SHANNON_PARTS_CLASSIC.length * TOTAL_TYPES,
  // Extended spec: 6 GNN × 6 body × 12 parts × 12 types = 5184
  ANALYSIS_SPACE_SIZE_EXTENDED:
    GNN_CYCLE_STEPS.length * BODY_SYSTEMS.length * SHANNON_PARTS_EXTENDED.length * TOTAL_TYPES,
  // Liris's "6×6×6×6×12 = 15552" interpretation: GNN × body × parts(classic 6) × waves(6) × types(12)
  // (the four 6s + 12, with waves as the 4th 6 — coverage assuming 6 waves of all 6×6×6 cells × 12 type classifications)
  ANALYSIS_SPACE_SIZE_FULL_6POW4_X12:
    GNN_CYCLE_STEPS.length * BODY_SYSTEMS.length * SHANNON_PARTS_CLASSIC.length * 6 /* waves */ * TOTAL_TYPES,
  // Backward compat alias for the previous LX-481 export
  ANALYSIS_SPACE_SIZE:
    GNN_CYCLE_STEPS.length * BODY_SYSTEMS.length * SHANNON_PARTS_CLASSIC.length * TOTAL_TYPES
};

// ============================================================================
// CLI for smoke testing
// ============================================================================

if (require.main === module) {
  (async () => {
    console.log('shannon-consensus.js smoke test');
    console.log('================================');
    console.log('GNN cycle steps:', GNN_CYCLE_STEPS);
    console.log('Body systems:', BODY_SYSTEMS);
    console.log('Shannon parts:', SHANNON_PARTS.map(p => p.name));
    console.log('');

    const bridge = new MockAgentBridge('consensus_at_wave_2');
    const engine = new ShannonConsensus(bridge, {
      maxWaves: 5,
      persistencePath: path.join(__dirname, 'smoke-test-waves.ndjson')
    });

    const result = await engine.run({
      id: 'smoke-test-1',
      shouldFail: true,
      payload: 'test proposal'
    });

    console.log('Result:', JSON.stringify({
      consensus: result.consensus,
      waves: result.waves,
      reason: result.reason,
      finalTally: result.finalTally
    }, null, 2));
  })().catch(err => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  });
}
