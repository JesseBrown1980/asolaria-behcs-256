#!/usr/bin/env node
/**
 * omni-shannon.js
 *
 * Multi-agent omnidirectional Shannon consensus engine.
 *
 * Loads all sub-agent manifests under data/cubes/, then for each agent
 * applies its primary-dimension LENS to a question and produces a verdict.
 * Writes a vote record per agent + a tally + a consensus declaration to
 * data/cubes/jbd.qdd.shannon-orchestrator/votes.ndjson.
 *
 * The verdicts are deterministic heuristics derived from the agent's
 * primary dim — this engine does NOT call out to an LLM. The dim-as-lens
 * mapping is the whole "voting" insight: each agent sees the same question
 * through a different cube face.
 *
 * Usage:
 *   node tools/cube/omni-shannon.js <question_json_path> [vote_id]
 *
 * The question_json_path file is shaped like:
 * {
 *   "question_id": "Q-001",
 *   "question": "...",
 *   "context": { ... shape-free context ... },
 *   "candidates": [ { "id": "C1", "label": "...", "metadata": {...} }, ... ]
 * }
 *
 * Each agent's verdict is one of: PROCEED, PROCEED-AFTER-STEP-1,
 * NEEDS-CHANGE, HALT, REFUSED. Consensus = PROCEED iff zero
 * NEEDS-CHANGE/HALT/REFUSED across all agents in the wave.
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260406-asolaria';
const CUBES_DIR = path.join(ROOT, 'data/cubes');
const ORCH_VOTES = path.join(CUBES_DIR, 'jbd.qdd.shannon-orchestrator/votes.ndjson');

const now = () => new Date().toISOString();
const append = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirror(src) {
  const rel = path.relative(ROOT, src).replace(/\\/g, '/');
  const dest = path.join(D_DEST, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function loadAgents() {
  const out = [];
  if (!fs.existsSync(CUBES_DIR)) return out;
  for (const d of fs.readdirSync(CUBES_DIR)) {
    const mp = path.join(CUBES_DIR, d, 'manifest.json');
    if (fs.existsSync(mp)) {
      try { out.push(JSON.parse(fs.readFileSync(mp, 'utf8'))); } catch (_) {}
    }
  }
  return out;
}

// === Dim lens heuristics ===
// Each lens evaluates a (question, candidate) pair and returns
// { verdict, reason }. The default verdict is PROCEED unless the
// lens detects a relevant red flag.

const LENS = {
  D3_TARGET:   (q, c) => evidenceLens(q, c),
  D4_OBJECT:   (q, c) => diffLens(q, c),
  D5_LAYER:    (q, c) => layerLens(q, c),
  D6_GATE:     (q, c) => gateLens(q, c),
  D8_CHAIN:    (q, c) => chainLens(q, c),
  D9_RANK:     (q, c) => testLens(q, c),
  D11_PROOF:   (q, c) => proofLens(q, c),
  D12_ECHO:    (q, c) => simulationLens(q, c),
  D13_SPACE:   (q, c) => spaceLens(q, c),
  D15_DEVICE:  (q, c) => deviceLens(q, c),
  D16_SECURITY:(q, c) => securityLens(q, c),
  D17_NETWORK: (q, c) => networkLens(q, c),
  D18_SCHEDULE:(q, c) => scheduleLens(q, c),
  D19_BUDGET:  (q, c) => budgetLens(q, c),
  D21_HARDWARE:(q, c) => hardwareLens(q, c),
  D22_TRANSLATION:(q, c) => commsLens(q, c),
  D24_INTENT:  (q, c) => intentLens(q, c),

  // === Emergent dims added 2026-04-07 — "Boundary-Is-Data Rule" ===
  // Discovered during 192.168.0.1 cube tensor collapse, when direct probes
  // were walled at every layer and the cube had to switch from labeling-mode
  // to inference-mode. These three dims emerged because the analysis needed
  // them, and the cube is extensible by reflection. See:
  //   ~/.claude/projects/E--/memory/feedback_cube_as_inference_engine.md
  //   reports/cube-analysis/subnet-tensor-collapse-192-168-0-0-24.md
  // Liris bilaterally codified the same dims her side. Sister-rule to
  // Phase-Zero ground-truth-before-scoring: that rule is for when ground
  // truth IS accessible; THIS rule is for when ground truth is INaccessible
  // and the inaccessibility itself becomes the ground truth.

  // D26 INITIAL_TTL_FINGERPRINT (cube 101³ = 1030301)
  // The responding host's INITIAL TTL (back-implied from observed TTL +
  // hop count) is set by the OS family. Linux=64, Windows=128, Cisco=255,
  // BSD=64-or-128. Anomalous values (e.g. 65) indicate non-stock kernels —
  // embedded BSD, hardened Linux fork, custom networking stack.
  // Free signal on any ICMP/TCP/UDP response, strong device-class fingerprint.
  D26_INITIAL_TTL_FINGERPRINT: (q, c) => initialTtlFingerprintLens(q, c),

  // D30 ASYMMETRIC_REACHABILITY (cube 113³ = 1442897)
  // When tool A sees a port "open" and tool B against the same port sees
  // silence, the delta is NOT a bug — it is an ACL signature (source-IP
  // filter, version restriction, rate-limit). Cube must compute inter-tool
  // deltas as their own dimension.
  D30_ASYMMETRIC_REACHABILITY: (q, c) => asymmetricReachabilityLens(q, c),

  // D32 NEGATIVE_SPACE (cube 131³ = 2248091)
  // What's NOT there is data. Absence of expected protocols/ports/responses
  // is evidence about the system's intent. Most analytic systems weight
  // positive evidence; the cube must weight ABSENCE too. The biggest
  // contributor to the 192.168.0.0/24 verdict was D32.
  D32_NEGATIVE_SPACE: (q, c) => negativeSpaceLens(q, c),
};

function evidenceLens(q, c) {
  if (!c.metadata || !c.metadata.evidence_path) return { verdict: 'NEEDS-CHANGE', reason: 'no evidence_path on candidate; provide source artifacts' };
  return { verdict: 'PROCEED', reason: 'evidence_path present' };
}
function diffLens(q, c) {
  if (c.metadata && c.metadata.requires_diff && !c.metadata.diff_ready) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'diff not yet drafted; needs concrete file:line patch' };
  return { verdict: 'PROCEED', reason: 'object-level diff acceptable or not required' };
}
function layerLens(q, c) {
  if (c.metadata && c.metadata.touches === 'old_repo') return { verdict: 'HALT', reason: 'touches D:/projects/QDD/ebacmap (deprecated repo) — must use ebacmap-master' };
  return { verdict: 'PROCEED', reason: 'layer/repo selection clean' };
}
function gateLens(q, c) {
  if (c.metadata && c.metadata.bypasses_gate) return { verdict: 'REFUSED', reason: 'candidate bypasses an existing gate (test/permission/auth)' };
  return { verdict: 'PROCEED', reason: 'gates respected' };
}
function chainLens(q, c) {
  if (c.metadata && c.metadata.breaks_chain) return { verdict: 'NEEDS-CHANGE', reason: 'breaks an upstream chain dependency' };
  return { verdict: 'PROCEED', reason: 'chain dependencies preserved' };
}
function testLens(q, c) {
  if (c.metadata && c.metadata.test_status === 'fail') return { verdict: 'HALT', reason: 'tests fail on this candidate' };
  if (c.metadata && c.metadata.test_status === 'unknown') return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'tests not yet run; gate before merge' };
  return { verdict: 'PROCEED', reason: 'tests pass or N/A' };
}
function proofLens(q, c) {
  if (c.metadata && !c.metadata.proof_artifact) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'no proof artifact attached; capture before close' };
  return { verdict: 'PROCEED', reason: 'proof artifact attached' };
}
function simulationLens(q, c) {
  // simulation lens always proceeds unless candidate is flagged untestable
  if (c.metadata && c.metadata.simulatable === false) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'cannot be simulated; needs operator-witnessed test' };
  return { verdict: 'PROCEED', reason: 'simulation feasible' };
}
function spaceLens(q, c) {
  if (c.metadata && c.metadata.crosses_module_boundaries === 'unannotated') return { verdict: 'NEEDS-CHANGE', reason: 'crosses module boundaries without annotation; map dependencies first' };
  return { verdict: 'PROCEED', reason: 'spatial scope contained or annotated' };
}
function deviceLens(q, c) {
  if (c.metadata && c.metadata.touches_device && !c.metadata.operator_witnessed) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'touches device but no operator-witnessed window declared' };
  return { verdict: 'PROCEED', reason: 'device interaction acceptable' };
}
function securityLens(q, c) {
  if (c.metadata && c.metadata.touches_secrets) return { verdict: 'HALT', reason: 'touches secrets/credentials surface — operator-explicit only' };
  if (c.metadata && c.metadata.touches_sovereignty) return { verdict: 'REFUSED', reason: 'touches sovereignty USB — never auto' };
  return { verdict: 'PROCEED', reason: 'no security boundary crossed' };
}
function networkLens(q, c) {
  if (c.metadata && c.metadata.requires_external_creds && !c.metadata.creds_available) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'requires external credentials not yet provided (LIMS / Twilio / DO)' };
  return { verdict: 'PROCEED', reason: 'network/integration map clean' };
}
function scheduleLens(q, c) {
  if (c.metadata && c.metadata.blocked_by) return { verdict: 'PROCEED-AFTER-STEP-1', reason: `blocked by ${c.metadata.blocked_by}` };
  return { verdict: 'PROCEED', reason: 'no schedule blockers' };
}
function budgetLens(q, c) {
  if (c.metadata && c.metadata.scope_hours && c.metadata.scope_hours > 100) return { verdict: 'PROCEED-AFTER-STEP-1', reason: `scope ${c.metadata.scope_hours}h > 100h: confirm contract envelope` };
  return { verdict: 'PROCEED', reason: 'within standard budget envelope' };
}
function hardwareLens(q, c) {
  if (c.metadata && c.metadata.touches_hardware && !c.metadata.hardware_pid) return { verdict: 'NEEDS-CHANGE', reason: 'touches hardware without recording hardware PID' };
  return { verdict: 'PROCEED', reason: 'hardware identity captured or N/A' };
}
function commsLens(q, c) {
  if (c.metadata && c.metadata.requires_external_comm) return { verdict: 'PROCEED-AFTER-STEP-1', reason: 'needs external comms (slack/email) — drafts only, operator copies manually' };
  return { verdict: 'PROCEED', reason: 'no external comms required' };
}
function intentLens(q, c) {
  if (c.metadata && c.metadata.contradicts_jesse_directive) return { verdict: 'REFUSED', reason: 'contradicts an explicit operator directive' };
  return { verdict: 'PROCEED', reason: 'consistent with operator intent' };
}

// === Boundary-Is-Data lenses (D26 / D30 / D32) ===
// Added 2026-04-07 from cube tensor collapse on 192.168.0.0/24.
// These lenses operate on opaque-system characterization, where direct
// probes are blocked or empty and the cube must infer hidden state from
// boundary behavior. They are deliberately permissive in normal candidate
// evaluation (default PROCEED), and only fire NEEDS-CHANGE / HALT when the
// candidate explicitly claims a probe result that the rule's check
// invalidates. The bigger value of these lenses is that they make the
// dimensions ADDRESSABLE in the cube system at all — every future analysis
// can now reference D26/D30/D32 as first-class.

function initialTtlFingerprintLens(q, c) {
  // If the candidate claims a target OS family but the observed initial
  // TTL doesn't match, flag the contradiction.
  const m = c.metadata || {};
  if (m.observed_initial_ttl && m.claimed_os_family) {
    const expected = { linux: 64, windows: 128, cisco_ios: 255, bsd: 64 }[m.claimed_os_family.toLowerCase()];
    if (expected && m.observed_initial_ttl !== expected) {
      return { verdict: 'NEEDS-CHANGE', reason: `D26: claimed OS ${m.claimed_os_family} expects initial TTL ${expected}, observed ${m.observed_initial_ttl} — likely non-stock kernel (embedded BSD or hardened Linux fork)` };
    }
  }
  return { verdict: 'PROCEED', reason: 'D26: TTL fingerprint consistent or N/A' };
}

function asymmetricReachabilityLens(q, c) {
  // If two probe tools disagree on reachability for the same port/host,
  // that's an ACL signature, not a bug. Flag as NEEDS-CHANGE only if the
  // candidate ignores the asymmetry.
  const m = c.metadata || {};
  if (m.probe_results && Array.isArray(m.probe_results) && m.probe_results.length >= 2) {
    const states = new Set(m.probe_results.map(r => r.state));
    if (states.size > 1 && m.acl_hypothesis_documented !== true) {
      return { verdict: 'NEEDS-CHANGE', reason: 'D30: asymmetric reachability across probe tools (likely source-IP ACL); document the hypothesis before treating either result as ground truth' };
    }
  }
  return { verdict: 'PROCEED', reason: 'D30: probe results consistent or asymmetry already documented' };
}

function negativeSpaceLens(q, c) {
  // If a candidate's verdict relies only on positive findings and ignores
  // expected-but-absent signals, flag for negative-space review.
  const m = c.metadata || {};
  if (m.verdict_basis === 'positive_findings_only' && m.expected_signals_audited !== true) {
    return { verdict: 'NEEDS-CHANGE', reason: 'D32: verdict based only on positive findings; audit expected-but-absent signals before concluding (the boundary is data when the contents are opaque)' };
  }
  return { verdict: 'PROCEED', reason: 'D32: negative-space audit complete or not applicable' };
}

// === Main vote ===
// === Phase-0 ground-truth check ===
// Added 2026-04-06 per liris learning signal after c6 wizard-month-bug inversion.
// See feedback_ground_truth_check_before_scoring_candidates.md
// Cube ownership: D11_PROOF (29791). Runs BEFORE the dim-keyed scoring lenses.
// Returns: { state: 'VERIFY_AND_CLOSE'|'NEW_WORK_NEEDED'|'INDETERMINATE', evidence, confidence }
function groundTruthCheck(candidate) {
  const m = candidate.metadata || {};
  // (1) explicit signal in metadata
  if (m.already_done === true || m.already_shipped === true || m.merged === true) {
    return { state: 'VERIFY_AND_CLOSE', evidence: 'metadata flag', confidence: 1.0 };
  }
  // (2) staleness flag
  if (m.metadata_stale === true) {
    return { state: 'INDETERMINATE', evidence: 'metadata flagged stale', confidence: 0.3 };
  }
  // (3) commit-hash hint pointing at a fix
  if (m.fix_commit_hash) {
    return { state: 'VERIFY_AND_CLOSE', evidence: 'fix commit hash present: ' + m.fix_commit_hash, confidence: 0.9 };
  }
  // (4) we have no git/ground-truth access from inside the engine itself —
  //     the caller (cube-builder pipeline or operator) is responsible for
  //     populating the metadata. Mark INDETERMINATE so downstream knows.
  return { state: 'INDETERMINATE', evidence: 'no ground truth check performed; engine relies on populated metadata', confidence: 0.5 };
}

function vote(question, candidates) {
  const agents = loadAgents();
  const voteId = question.question_id || ('Q-' + Date.now());
  const wave = 1;
  const records = [];

  // open the vote
  ensureDir(path.dirname(ORCH_VOTES));
  append(ORCH_VOTES, {
    ts: now(),
    vote_id: voteId,
    wave,
    kind: 'vote_open',
    question: question.question,
    candidates: candidates.map(c => ({ id: c.id, label: c.label })),
    agent_count: agents.length,
  });

  // Phase 0: ground-truth check on every candidate before scoring
  for (const c of candidates) {
    const gt = groundTruthCheck(c);
    append(ORCH_VOTES, {
      ts: now(),
      vote_id: voteId,
      wave,
      kind: 'phase0_ground_truth',
      candidate_id: c.id,
      state: gt.state,
      evidence: gt.evidence,
      confidence: gt.confidence,
      cube: [29791, 6859], // D11 PROOF + D8 CHAIN
      dim: 'D11_PROOF',
    });
    // attach the result to the candidate so dim lenses can see it
    c.metadata = c.metadata || {};
    c.metadata.phase0_ground_truth = gt;
  }

  for (const agent of agents) {
    const dim = agent.cube_alignment && agent.cube_alignment.primary_dim;
    const lens = LENS[dim] || (() => ({ verdict: 'PROCEED', reason: 'no specific lens for ' + dim + ' — default proceed' }));
    for (const c of candidates) {
      const out = lens(question, c);
      const rec = {
        ts: now(),
        vote_id: voteId,
        wave,
        agent_id: agent.agent_id,
        cube: [agent.cube_alignment.primary_cube, 704969],
        dim,
        candidate_id: c.id,
        verdict: out.verdict,
        reason: out.reason,
      };
      append(ORCH_VOTES, rec);
      records.push(rec);
    }
  }

  // tally per candidate
  const tally = {};
  for (const c of candidates) {
    const cRecs = records.filter(r => r.candidate_id === c.id);
    const counts = { PROCEED: 0, 'PROCEED-AFTER-STEP-1': 0, 'NEEDS-CHANGE': 0, HALT: 0, REFUSED: 0 };
    for (const r of cRecs) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    const negative = counts['NEEDS-CHANGE'] + counts.HALT + counts.REFUSED;
    const conditions = cRecs.filter(r => r.verdict === 'PROCEED-AFTER-STEP-1').map(r => ({ agent: r.agent_id, dim: r.dim, condition: r.reason }));
    tally[c.id] = {
      counts,
      negative_count: negative,
      conditional_count: counts['PROCEED-AFTER-STEP-1'],
      consensus: negative === 0 ? (counts['PROCEED-AFTER-STEP-1'] === 0 ? 'WAVE-1-UNANIMOUS-PROCEED' : 'WAVE-1-PROCEED-WITH-CONDITIONS') : 'WAVE-1-NEEDS-WORK',
      conditions,
    };
  }

  append(ORCH_VOTES, {
    ts: now(),
    vote_id: voteId,
    wave,
    kind: 'vote_tally',
    tally,
  });

  // mirror
  mirror(ORCH_VOTES);

  return { vote_id: voteId, wave, agent_count: agents.length, candidate_count: candidates.length, tally };
}

function main() {
  const qPath = process.argv[2];
  if (!qPath) { console.error('usage: omni-shannon.js <question.json>'); process.exit(1); }
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const result = vote(q, q.candidates || []);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { vote, loadAgents, LENS };
